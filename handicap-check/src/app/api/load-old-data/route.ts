import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { google } from 'googleapis'
import * as XLSX from 'xlsx'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function getGmailClient() {
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

async function getUSGAPosts(date: Date, gmail: any) {
  // Find the email for the day after the given date
  const nextDay = new Date(date)
  nextDay.setDate(nextDay.getDate() + 1)
  const after = nextDay.toISOString().split('T')[0]
  const before = new Date(nextDay.getTime() + 86400000).toISOString().split('T')[0]
  const searchQuery = `from:reporting@ghin.com subject:"Auto-Generated Scheduled Report - Played / Posted Report (Player Rounds)" after:${after} before:${before}`
  const response = await gmail.users.messages.list({
    userId: 'me',
    q: searchQuery
  })
  if (!response.data.messages?.length) return []
  const message = await gmail.users.messages.get({
    userId: 'me',
    id: response.data.messages[0].id!
  })

  // Find the XLSX attachment
  const parts = message.data.payload.parts || []
  const xlsxFilenames = parts.filter((part: any) => part.filename && part.filename.endsWith('.xlsx')).map((part: any) => part.filename)
  const xlsxPart = parts.find(
    (part: any) => part.filename && part.filename.endsWith('.xlsx') && part.filename.toLowerCase().includes('played')
  )
  if (!xlsxPart) {
    console.error('No XLSX attachment found in USGA email. XLSX filenames found:', xlsxFilenames)
    return { error: 'No XLSX attachment found in USGA email', xlsxFilenames }
  }

  // Download the attachment
  const attachmentData = await gmail.users.messages.attachments.get({
    userId: 'me',
    messageId: message.data.id!,
    id: xlsxPart.body.attachmentId
  })
  const buffer = Buffer.from(attachmentData.data.data, 'base64')

  // Parse the XLSX file
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 })

  // Find the header row and column indices
  const header = rows[0] as any[]
  const ghinIdx = header.findIndex((h: any) => String(h).toLowerCase().includes('ghin'))
  const postedIdx = header.findIndex((h: any) => String(h).toLowerCase().includes('total posted on date played'))
  if (ghinIdx === -1 || postedIdx === -1) {
    console.error('Could not find GHIN or posted columns in XLSX')
    return []
  }

  // Collect GHIN numbers where posted > 0
  const postedGHINs = (rows.slice(1) as any[][])
    .filter(row => row[ghinIdx] && Number(row[postedIdx]) > 0)
    .map(row => String(row[ghinIdx]).trim())

  return postedGHINs
}

async function getMTechData(date: string) {
  const apiKey = process.env.MTECH_API_KEY
  const response = await fetch(
    `https://www.clubmtech.com/cmtapi/teetimes/?apikey=${apiKey}&TheDate=${date}`
  )
  const data = await response.text()
  return data.split('\n').slice(1) // Skip header row
}

async function getGolferIdByMemberNumber(member_number: string): Promise<string | null> {
  const { data: golfer } = await supabase
    .from('golfers')
    .select('id')
    .eq('member_number', member_number)
    .single();
  return golfer ? golfer.id : null;
}

export async function GET(request: Request) {
  try {
    // Get date from query param, default to today
    const { searchParams } = new URL(request.url)
    let date = searchParams.get('date')
    let dateObj: Date
    let formattedDate: string
    if (!date) {
      dateObj = new Date()
      formattedDate = dateObj.toLocaleDateString('en-US', {
        month: '2-digit',
        day: '2-digit',
        year: '2-digit'
      }).replace(/\//g, '-')
      date = dateObj.toISOString().slice(0, 10)
    } else {
      // Accept YYYY-MM-DD, convert to M-D-YYYY for MTech
      const [yyyy, mm, dd] = date.split('-')
      dateObj = new Date(`${yyyy}-${mm}-${dd}`)
      formattedDate = `${parseInt(mm)}-${parseInt(dd)}-${yyyy}`
    }

    // 1. Get MTech data for the date
    const teeTimesRaw = await getMTechData(formattedDate)

    // MTech data has no header row; use fixed indices
    // 0: TeeDate, 1: TeeTime, 2: MemberName, 3: GHIN, 4: MemberNo
    const teeTimes = teeTimesRaw
      .map(row => row.split(','))
      .filter(cols => cols.length > 4 && cols[4].trim())
      .map(cols => ({
        member_number: cols[4].trim(),
        time: cols[1].trim(),
        date: cols[0].trim()
      }))

    // Look up golfer IDs and prepare upserts
    const unmatchedMemberNumbers: string[] = []
    // Fetch existing tee_times for this date
    const { data: existingTeeTimes, error: fetchExistingError } = await supabase
      .from('tee_times')
      .select('id, date, golfer_id, tee_time, posting_status')
      .eq('date', date)
    if (fetchExistingError) {
      throw fetchExistingError
    }
    const teeTimeInserts = await Promise.all(
      teeTimes.map(async (teeTime) => {
        const golferId = await getGolferIdByMemberNumber(teeTime.member_number)
        if (!golferId) {
          console.log(`No golfer found for member number: ${teeTime.member_number}`)
          unmatchedMemberNumbers.push(teeTime.member_number)
          return null
        } else {
          console.log(`Matched golfer for member number: ${teeTime.member_number} -> ${golferId}`)
        }
        // Check if a tee_time already exists for this date, golfer, and tee_time
        const existing = existingTeeTimes?.find(
          t => t.golfer_id === golferId && t.tee_time === teeTime.time
        )
        if (existing && (existing.posting_status === 'posted' || existing.posting_status === 'excused_no_post')) {
          // Do not overwrite posted or excused_no_post
          return null
        }
        return {
          date: teeTime.date,
          golfer_id: golferId,
          tee_time: teeTime.time,
          posting_status: 'unexcused_no_post'
        }
      })
    )
    const validTeeTimeInserts = teeTimeInserts.filter(insert => insert !== null)

    // Upsert tee times
    let upserted = 0
    if (validTeeTimeInserts.length > 0) {
      const { error } = await supabase
        .from('tee_times')
        .upsert(validTeeTimeInserts, {
          onConflict: 'date,golfer_id,tee_time',
          ignoreDuplicates: false
        })
      if (error) {
        throw error
      }
      upserted = validTeeTimeInserts.length
    }

    // 3. Get Gmail client and USGA posts for the date
    const gmail = await getGmailClient()
    const postedGHINs = await getUSGAPosts(dateObj, gmail)

    // 4. Update tee_times for this date and posted GHINs
    let updatedRounds = 0
    let postedGHINsArray: string[] = []
    if (Array.isArray(postedGHINs) && postedGHINs.length > 0) {
      postedGHINsArray = postedGHINs
      // Find all golfers with these GHINs
      const { data: golfers, error: golfersError } = await supabase
        .from('golfers')
        .select('id, ghin_number')
        .in('ghin_number', postedGHINsArray)
      if (golfersError) {
        throw golfersError
      }
      const golferIds = golfers.map(g => g.id)
      // Update tee_times for this date and these golfer_ids
      const { error: updateError, data: updatedData } = await supabase
        .from('tee_times')
        .update({ posting_status: 'posted' })
        .eq('date', date)
        .in('golfer_id', golferIds)
        .select('id')
      if (updateError) {
        throw updateError
      }
      updatedRounds = updatedData ? updatedData.length : 0
    } else if (postedGHINs && typeof postedGHINs === 'object' && 'error' in postedGHINs) {
      // If postedGHINs is an error object, return it in the response
      return NextResponse.json({ success: false, ...postedGHINs, teeTimesLoaded: teeTimes.length, teeTimesInserted: upserted, unmatchedMemberNumbers })
    }

    return NextResponse.json({ success: true, teeTimesLoaded: teeTimes.length, teeTimesInserted: upserted, updatedRounds, unmatchedMemberNumbers, postedGHINs: postedGHINsArray })
  } catch (error) {
    console.error('Error loading old data:', error)
    return NextResponse.json({ error: 'Failed to load old data' }, { status: 500 })
  }
} 