import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { google } from 'googleapis'
import nodemailer from 'nodemailer'
import { isTeeTimeExcluded } from '@/lib/exclusions'
import * as XLSX from 'xlsx'
import { gmail_v1 } from 'googleapis'
import { parse as csvParse } from 'csv-parse/sync'

interface NoPostPlayer {
  name: string;
  member_number: string;
  ghin_number: string;
  gender: string;
  email: string;
  [key: string]: unknown;
}

interface TeeTimeRecord {
  member_number: string;
  time: string;
  date: string;
  name: string;
}

interface TeeTimeInsert {
  date: string;
  golfer_id: string;
  tee_time: string;
  posting_status: 'posted' | 'excused_no_post' | 'unexcused_no_post';
  excuse_reason: string | null;
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Helper to normalize dates to YYYY-MM-DD
function normalizeDate(str: string): string {
  const [month, day, year] = str.split(/[\/-]/).map(s => s.trim());
  if (!year || !month || !day) return '';
  return `${year.padStart(4, '20')}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

async function getMTechData(dateStr: string, normalizedDate: string) {
  const apiKey = process.env.MTECH_API_KEY
  const response = await fetch(
    `https://www.clubmtech.com/cmtapi/teetimes/?apikey=${apiKey}&TheDate=${dateStr}`
  )
  const data = await response.text()
  const teeTimesRaw = data.split('\n').slice(1) // Skip header row
  
  // Parse CSV data using the same logic as load-old-data
  const records = csvParse(teeTimesRaw.join('\n'), {
    columns: false,
    skip_empty_lines: true,
    trim: true
  });

  // Fetch exclusions for this date
  const { data: exclusions, error: exError } = await supabase
    .from('excluded_dates')
    .select('*')
    .eq('date', normalizedDate)
  if (exError) throw new Error('Failed to fetch exclusions')

  // Parse and filter tee times using the same logic as load-old-data
  const teeTimes = (records as string[][])
    .filter((cols: string[]) => cols.length >= 5 && (cols[4]?.trim() || cols[5]?.trim()))
    .filter((cols: string[]) => normalizeDate(cols[0].trim()) === normalizedDate)
    .filter((cols: string[]) => !isTeeTimeExcluded(cols[1], exclusions))
    .map((cols: string[]) => ({
      member_number: (cols[5]?.trim() || cols[4]?.trim()).replace(/\r/g, ''),
      time: cols[1].trim(),
      date: cols[0].trim(),
      name: cols[2]?.trim()
    }));

  // Group tee times by date and time to identify solo rounds
  const teeTimeGroups = teeTimes.reduce((groups, teeTime) => {
    const key = `${teeTime.date}-${teeTime.time}`;
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(teeTime);
    return groups;
  }, {} as Record<string, TeeTimeRecord[]>);

  return { teeTimeRecords: teeTimes, teeTimeGroups }
}

async function getGmailClient() {
  // Fetch the refresh token for the admin user
  const { data: user, error } = await supabase
    .from('users')
    .select('gmail_refresh_token, email')
    .eq('email', 'nhcchandicapcheck@gmail.com')
    .single()
  if (error || !user?.gmail_refresh_token) throw new Error('No refresh token found for admin user')

  const oAuth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.NEXTAUTH_URL
  )
  oAuth2Client.setCredentials({ refresh_token: user.gmail_refresh_token })
  return google.gmail({ version: 'v1', auth: oAuth2Client })
}

async function getUSGAPosts(date: Date, gmail: ReturnType<typeof google.gmail>) {
  // Find the email for the day after the given date
  const nextDay = new Date(date)
  nextDay.setDate(nextDay.getDate() + 1)
  const after = nextDay.toISOString().split('T')[0]
  const before = new Date(nextDay.getTime() + 86400000).toISOString().split('T')[0]
  const searchQuery = `from:reporting@ghin.com subject:"Auto-Generated Scheduled Report - Played / Posted Report (Player Rounds)" after:${after} before:${before}`
  
  console.log(`Searching Gmail for USGA reports: ${searchQuery}`)
  
  const response = await gmail.users.messages.list({
    userId: 'me',
    q: searchQuery
  })
  
  if (!response.data.messages?.length) {
    console.log('No USGA email found for date')
    return []
  }
  
  const message = await gmail.users.messages.get({
    userId: 'me',
    id: response.data.messages[0].id!
  })

  // Find the XLSX attachment
  const parts = message.data.payload?.parts || []
  const xlsxFilenames = parts
    .filter((part): part is gmail_v1.Schema$MessagePart & { filename: string } => 
      Boolean(part.filename?.endsWith('.xlsx')))
    .map(part => part.filename)
  
  const xlsxPart = parts.find(
    (part): part is gmail_v1.Schema$MessagePart & { filename: string; body: { attachmentId: string } } => 
      Boolean(part.filename?.endsWith('.xlsx') && 
              part.filename.toLowerCase().includes('played') && 
              part.body?.attachmentId)
  )
  
  if (!xlsxPart) {
    console.error('No XLSX attachment found in USGA email. XLSX filenames found:', xlsxFilenames)
    return []
  }

  console.log(`Found XLSX attachment: ${xlsxPart.filename}`)

  // Download the attachment
  const attachmentData = await gmail.users.messages.attachments.get({
    userId: 'me',
    messageId: message.data.id!,
    id: xlsxPart.body.attachmentId
  })
  const buffer = Buffer.from(attachmentData.data.data!, 'base64')

  // Parse the XLSX file
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 })

  // Find the header row and column indices
  const header = rows[0] as string[]
  const ghinIdx = header.findIndex(h => String(h).toLowerCase().includes('ghin'))
  const postedIdx = header.findIndex(h => String(h).toLowerCase().includes('total posted on date played'))
  
  if (ghinIdx === -1 || postedIdx === -1) {
    console.error('Could not find GHIN or posted columns in XLSX')
    return []
  }

  // Collect GHIN numbers where posted > 0
  const postedGHINs = (rows.slice(1) as (string | number)[][])
    .filter(row => row[ghinIdx] && Number(row[postedIdx]) > 0)
    .map(row => String(row[ghinIdx]).trim())

  console.log(`Found ${postedGHINs.length} posted GHIN numbers`)
  return postedGHINs
}

async function processAndInsertTeeTimeData(
  teeTimeRecords: TeeTimeRecord[], 
  teeTimeGroups: Record<string, TeeTimeRecord[]>,
  postedGHINs: string[], 
  normalizedDate: string
) {
  console.log(`Processing ${teeTimeRecords.length} tee times for ${normalizedDate}...`)

  // Batch fetch all golfers to reduce DB calls
  const memberNumbers = [...new Set(teeTimeRecords.map(t => t.member_number.trim()))]
  console.log(`Batch fetching ${memberNumbers.length} unique golfers...`)
  
  const { data: golfers, error: golfersError } = await supabase
    .from('golfers')
    .select('id, member_number, ghin_number')
    .in('member_number', memberNumbers)
  
  if (golfersError) throw golfersError

  // Create a lookup map - only include golfers WITH GHIN numbers
  const golferMap = new Map()
  golfers?.forEach(g => {
    // Only add golfers who have GHIN numbers to the map
    if (g.ghin_number && g.ghin_number.toString().trim() !== '') {
      golferMap.set(g.member_number.toLowerCase(), g)
    } else {
      console.log(`Skipping golfer ${g.member_number} - no GHIN number in database`)
    }
  })

  // Fetch existing tee times for this date
  console.log('Fetching existing tee times...')
  const { data: existingTeeTimes, error: fetchExistingError } = await supabase
    .from('tee_times')
    .select('id, date, golfer_id, tee_time, posting_status')
    .eq('date', normalizedDate)
  if (fetchExistingError) throw fetchExistingError

  const unmatchedMemberNumbers: string[] = []
  const teeTimeInserts: TeeTimeInsert[] = []

  // Process tee times
  console.log('Processing tee times for database insertion...')
  for (const teeTime of teeTimeRecords) {
    const golfer = golferMap.get(teeTime.member_number.trim().toLowerCase())
    if (!golfer) {
      unmatchedMemberNumbers.push(teeTime.member_number)
      continue
    }

    const golferId = golfer.id
    const rosterGhin = golfer.ghin_number ? String(golfer.ghin_number).trim() : ''

    // Check if this is a solo round
    const key = `${teeTime.date}-${teeTime.time}`
    const isSoloRound = teeTimeGroups[key]?.length === 1

    // Check if a tee_time already exists for this date, golfer, and tee_time
    const existing = existingTeeTimes?.find(
      t => t.golfer_id === golferId && t.tee_time === teeTime.time
    )
    if (existing && existing.posting_status === 'posted') {
      continue
    }

    // Determine posting status
    let posting_status: 'posted' | 'excused_no_post' | 'unexcused_no_post'
    let excuse_reason: string | null = null
    if (rosterGhin && postedGHINs.includes(rosterGhin)) {
      posting_status = 'posted'
    } else if (isSoloRound) {
      posting_status = 'excused_no_post'
      excuse_reason = 'solo'
    } else {
      posting_status = 'unexcused_no_post'
    }

    teeTimeInserts.push({
      date: normalizedDate,
      golfer_id: golferId,
      tee_time: teeTime.time,
      posting_status,
      excuse_reason
    })
  }

  // Batch insert with error handling
  console.log(`Inserting ${teeTimeInserts.length} tee times...`)
  let insertedCount = 0
  let skippedCount = 0
  let excusedInserted = 0
  let unexcusedInserted = 0

  // Process in chunks to avoid overwhelming the database
  const chunkSize = 50
  for (let i = 0; i < teeTimeInserts.length; i += chunkSize) {
    const chunk = teeTimeInserts.slice(i, i + chunkSize)
    for (const insert of chunk) {
      const { error } = await supabase
        .from('tee_times')
        .upsert(insert, {
          onConflict: 'date,golfer_id,tee_time',
          ignoreDuplicates: false
        })

      if (error) {
        console.error('Error inserting tee time:', error)
        skippedCount++
      } else {
        insertedCount++
        if (insert.posting_status === 'excused_no_post') {
          excusedInserted++
        } else if (insert.posting_status === 'unexcused_no_post') {
          unexcusedInserted++
        }
      }
    }
  }

  console.log(`Completed: ${insertedCount} inserted, ${skippedCount} skipped`)

  return {
    stats: {
      total: teeTimeRecords.length,
      inserted: insertedCount,
      skipped: skippedCount,
      excused: excusedInserted,
      unexcused: unexcusedInserted,
      unmatched: unmatchedMemberNumbers.length
    },
    unmatched: unmatchedMemberNumbers
  }
}

async function sendNoPostEmail(menNoPost: NoPostPlayer[], womenNoPost: NoPostPlayer[], date: string) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD
    }
  })

  // Use the original date format (MM-DD-YY) for Excel NO_POST_DATE column
  const excelDate = date // date is already in MM-DD-YY format

  // Create Excel workbooks for men and women
  const createExcelAttachment = (players: NoPostPlayer[], sheetName: string) => {
    const workbook = XLSX.utils.book_new()
    
    // Create data with proper columns
    const data = [
      ['Last Name', 'MemberNo', 'Email', 'NO_POST_DATE'], // Header row - changed "Name" to "Last Name"
      ...players.map(player => [
        player.name, // Name (first + middle + last + suffix)
        player.member_number, // MemberNo
        player.email || '', // Email
        excelDate // NO_POST_DATE (yesterday's date in MM-DD-YY format)
      ])
    ]
    
    const worksheet = XLSX.utils.aoa_to_sheet(data)
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)
    
    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
  }

  const attachments = []
  
  if (menNoPost.length > 0) {
    const menExcel = createExcelAttachment(menNoPost, 'Men Non-Posters')
    attachments.push({
      filename: `Men_NonPosters_${date}.xlsx`,
      content: menExcel,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    })
  }
  
  if (womenNoPost.length > 0) {
    const womenExcel = createExcelAttachment(womenNoPost, 'Women Non-Posters')
    attachments.push({
      filename: `Women_NonPosters_${date}.xlsx`,
      content: womenExcel,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    })
  }

  const emailText = `Non-Posters Report for ${date}

Men who did not post: ${menNoPost.length}
Women who did not post: ${womenNoPost.length}

Please see attached Excel files for detailed lists.`

  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: 'john.paradise117@gmail.com',
    subject: `Non-Posters Report for ${date}`,
    text: emailText,
    attachments: attachments
  })
}

export async function GET() {
  try {
    console.log('🚀 Starting handicap check cron job...')
    
    // Check environment variables first
    const requiredEnvVars = [
      'NEXT_PUBLIC_SUPABASE_URL', 
      'SUPABASE_SERVICE_ROLE_KEY',
      'MTECH_API_KEY',
      'GOOGLE_CLIENT_ID',
      'GOOGLE_CLIENT_SECRET',
      'EMAIL_USER',
      'EMAIL_PASSWORD'
    ]
    
    const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar])
    if (missingEnvVars.length > 0) {
      console.error('❌ Missing environment variables:', missingEnvVars)
      return NextResponse.json({ 
        error: 'Missing environment variables',
        missing: missingEnvVars
      }, { status: 500 })
    }
    
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    
    const dateStr = yesterday.toLocaleDateString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: '2-digit'
    }).replace(/\//g, '-')
    
    // Convert to normalized date format (YYYY-MM-DD) for database query
    const normalizedDate = yesterday.toISOString().slice(0, 10)
    
    console.log('📅 Processing date:', dateStr, '(yesterday), normalized:', normalizedDate)
    
    // Step 1: Get MTech data and process tee times
    console.log('📊 Fetching MTech data...')
    const { teeTimeRecords, teeTimeGroups } = await getMTechData(dateStr, normalizedDate)

    console.log('✅ MTech data processed:', teeTimeRecords.length, 'tee times after exclusion filtering')
    
    // Step 2: Get USGA posts from Gmail
    console.log('📧 Fetching USGA posts...')
    let postedGHINs: string[] = []
    try {
      const gmail = await getGmailClient()
      postedGHINs = await getUSGAPosts(yesterday, gmail)
      console.log('✅ USGA data fetched:', postedGHINs.length, 'posted GHINs')
    } catch (error) {
      console.warn('⚠️ USGA fetch error, continuing without posted GHINs:', error)
    }
    
    // Step 3: Process and insert tee time data into database
    console.log('💾 Processing and inserting tee time data...')
    const processResult = await processAndInsertTeeTimeData(
      teeTimeRecords,
      teeTimeGroups,
      postedGHINs,
      normalizedDate
    )
    
    console.log('✅ Database processing completed:', processResult.stats)
    
    // Step 4: Query database for non-posters (after the data has been inserted/updated)
    console.log('📋 Querying for final non-posters...')
    
    // First, get all unexcused non-posters for the date
    const { data: teeTimesData, error: queryError } = await supabase
      .from('tee_times')
      .select('id, date, tee_time, posting_status, excuse_reason, golfer_id')
      .eq('date', normalizedDate)
      .eq('posting_status', 'unexcused_no_post')

    if (queryError) {
      console.error('❌ Database query error:', queryError)
      throw new Error(`Failed to fetch non-posters: ${queryError.message}`)
    }

    console.log('✅ Found', teeTimesData?.length || 0, 'final non-posters')

    if (!teeTimesData || teeTimesData.length === 0) {
      console.log('✅ No non-posters found, skipping email')
      
      return NextResponse.json({ 
        success: true,
        steps: {
          mtech: { success: true, teeTimes: teeTimeRecords.length },
          usga: { success: postedGHINs.length >= 0, postedCount: postedGHINs.length },
          process: { success: true, stats: processResult.stats },
          report: { success: true, menNoPost: 0, womenNoPost: 0, emailSent: false }
        },
        date: dateStr,
        timestamp: new Date().toISOString()
      })
    }

    // Get unique golfer IDs from the tee times
    const golferIds = [...new Set(teeTimesData.map(t => t.golfer_id))]
    
    // Fetch golfer details for these IDs
    const { data: golfersData, error: golfersError } = await supabase
      .from('golfers')
      .select('id, first_name, middle_name, last_name, suffix, member_number, ghin_number, gender, email')
      .in('id', golferIds)

    if (golfersError) {
      console.error('❌ Golfers query error:', golfersError)
      throw new Error(`Failed to fetch golfer details: ${golfersError.message}`)
    }

    // Create a golfer lookup map
    const golferMap = new Map()
    golfersData?.forEach(golfer => {
      golferMap.set(golfer.id, golfer)
    })

    // Transform the data to match NoPostPlayer interface
    const nonPostPlayers: NoPostPlayer[] = teeTimesData.map((teeTime) => {
      const golfer = golferMap.get(teeTime.golfer_id)
      
      if (!golfer) {
        console.warn(`Golfer not found for ID: ${teeTime.golfer_id}`)
        return null
      }
      
      // Skip golfers without GHIN numbers - they can't post scores
      if (!golfer.ghin_number || golfer.ghin_number.toString().trim() === '') {
        console.log(`Skipping golfer ${golfer.first_name} ${golfer.last_name} - no GHIN number`)
        return null
      }
      
      // Construct full name from first_name, middle_name, last_name, and suffix
      const nameParts = [
        golfer.first_name,
        golfer.middle_name,
        golfer.last_name
      ].filter(Boolean) // Remove any null/undefined/empty parts
      
      const fullName = nameParts.join(' ') + (golfer.suffix ? ` ${golfer.suffix}` : '')
      
      return {
        name: fullName.trim(),
        member_number: golfer.member_number,
        ghin_number: golfer.ghin_number || '',
        gender: golfer.gender || '',
        email: golfer.email || '',
        tee_time: teeTime.tee_time,
        date: teeTime.date
      }
    }).filter(Boolean) as NoPostPlayer[] // Remove any null entries

    // Separate by gender
    const menNoPost = nonPostPlayers.filter(player => player.gender === 'M')
    const womenNoPost = nonPostPlayers.filter(player => player.gender === 'F')

    console.log('✅ Final non-posters by gender:', menNoPost.length, 'men,', womenNoPost.length, 'women')

    // Step 5: Send email with results
    await sendNoPostEmail(menNoPost, womenNoPost, dateStr)

    console.log('🎉 Handicap check cron job completed successfully!')
    return NextResponse.json({ 
      success: true,
      steps: {
        mtech: { success: true, teeTimes: teeTimeRecords.length },
        usga: { success: postedGHINs.length >= 0, postedCount: postedGHINs.length },
        process: { success: true, stats: processResult.stats },
        report: { success: true, menNoPost: menNoPost.length, womenNoPost: womenNoPost.length, emailSent: true }
      },
      date: dateStr,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('💥 Handicap check cron job failed:', error)
    return NextResponse.json({ 
      error: 'Failed to run handicap check',
      details: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
} 