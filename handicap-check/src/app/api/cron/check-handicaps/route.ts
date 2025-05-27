import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { google } from 'googleapis'
import nodemailer from 'nodemailer'
import { isTeeTimeExcluded } from '@/lib/exclusions'
import * as XLSX from 'xlsx'
import { gmail_v1 } from 'googleapis'

interface NoPostPlayer {
  name: string;
  member_number: string;
  ghin_number: string;
  gender: string;
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

async function getMTechData(date: string) {
  const apiKey = process.env.MTECH_API_KEY
  const response = await fetch(
    `https://www.clubmtech.com/cmtapi/teetimes/?apikey=${apiKey}&TheDate=${date}`
  )
  const data = await response.text()
  
  // Parse CSV data into structured records
  const lines = data.split('\n').slice(1).filter(line => line.trim()) // Remove header and empty lines
  const teeTimeRecords: TeeTimeRecord[] = []
  const teeTimeGroups: Record<string, TeeTimeRecord[]> = {}
  
  for (const line of lines) {
    const columns = line.split(',')
    if (columns.length >= 3 && columns[0] && columns[1] && columns[2]) {
      const record: TeeTimeRecord = {
        member_number: columns[0].trim(),
        time: columns[1].trim(),
        date: date, // Use the input date
        name: columns[2].trim()
      }
      
      teeTimeRecords.push(record)
      
      // Group by date-time for solo player detection
      const key = `${record.date}-${record.time}`
      if (!teeTimeGroups[key]) {
        teeTimeGroups[key] = []
      }
      teeTimeGroups[key].push(record)
    }
  }
  
  return { teeTimeRecords, teeTimeGroups }
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

  // Create a lookup map
  const golferMap = new Map()
  golfers?.forEach(g => {
    golferMap.set(g.member_number.toLowerCase(), g)
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

  const menReport = menNoPost.map(p => `${p.name} (${p.member_number})`).join('\n')
  const womenReport = womenNoPost.map(p => `${p.name} (${p.member_number})`).join('\n')

  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: 'john.paradise117@gmail.com',
    subject: `Non-Posters for ${date}`,
    text: `Men who did not post:\n${menReport}\n\nWomen who did not post:\n${womenReport}`
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
    const { teeTimeRecords, teeTimeGroups } = await getMTechData(dateStr)

    // Fetch exclusions for this date
    const { data: exclusions, error: exError } = await supabase
      .from('excluded_dates')
      .select('*')
      .eq('date', normalizedDate)
    if (exError) throw new Error('Failed to fetch exclusions')

    // Filter out tee times that are excluded
    const filteredTeeTimeRecords = teeTimeRecords.filter(record => {
      return !isTeeTimeExcluded(record.time, exclusions)
    })
    
    console.log('✅ MTech data processed:', filteredTeeTimeRecords.length, 'tee times after exclusion filtering')
    
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
      filteredTeeTimeRecords,
      teeTimeGroups,
      postedGHINs,
      normalizedDate
    )
    
    console.log('✅ Database processing completed:', processResult.stats)
    
    // Step 4: Query database for non-posters (after the data has been inserted/updated)
    console.log('📋 Querying for final non-posters...')
    
    const { data: finalNonPosters, error: queryError } = await supabase
      .from('tee_times')
      .select(`
        id,
        date,
        tee_time,
        posting_status,
        excuse_reason,
        golfers!inner(
          id,
          name,
          member_number,
          ghin_number,
          gender
        )
      `)
      .eq('date', normalizedDate)
      .eq('posting_status', 'unexcused_no_post')

    if (queryError) {
      console.error('❌ Database query error:', queryError)
      throw new Error(`Failed to fetch non-posters: ${queryError.message}`)
    }

    console.log('✅ Found', finalNonPosters?.length || 0, 'final non-posters')

    // Transform the data to match NoPostPlayer interface
    const nonPostPlayers: NoPostPlayer[] = (finalNonPosters || []).map((teeTime) => {
      const golfer = (teeTime as unknown as { 
        golfers: { 
          name: string; 
          member_number: string; 
          ghin_number: string | null; 
          gender: string; 
        }[];
        tee_time: string;
        date: string;
      }).golfers[0]
      
      return {
        name: golfer.name,
        member_number: golfer.member_number,
        ghin_number: golfer.ghin_number || '',
        gender: golfer.gender || '',
        tee_time: (teeTime as unknown as { tee_time: string }).tee_time,
        date: (teeTime as unknown as { date: string }).date
      }
    })

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
        mtech: { success: true, teeTimes: filteredTeeTimeRecords.length },
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