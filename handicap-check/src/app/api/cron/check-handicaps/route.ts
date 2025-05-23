import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { google } from 'googleapis'
import nodemailer from 'nodemailer'
import { isTeeTimeExcluded } from '@/lib/exclusions'

interface TeeTimeRow {
  [key: string]: string;
}

interface SoloPlayer extends TeeTimeRow {
  status: 'excused';
  excuseReason: 'solo';
}

interface NoPostPlayer {
  name: string;
  memberNumber: string;
  [key: string]: unknown;
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

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

async function getMTechData(date: string) {
  const apiKey = process.env.MTECH_API_KEY
  const response = await fetch(
    `https://www.clubmtech.com/cmtapi/teetimes/?apikey=${apiKey}&TheDate=${date}`
  )
  const data = await response.text()
  return data.split('\n').slice(1).map(row => {
    const columns = row.split(',');
    return {
      0: columns[0] || '',
      1: columns[1] || '',
      2: columns[2] || '',
      // Add more columns as needed
    } as TeeTimeRow;
  });
}

async function checkSoloPlayers(teeTimes: TeeTimeRow[]) {
  const timeGroups = new Map<string, TeeTimeRow[]>()
  
  // Group players by tee time
  teeTimes.forEach(time => {
    const timeStr = time[1] // Assuming time is in second column
    if (!timeGroups.has(timeStr)) {
      timeGroups.set(timeStr, [])
    }
    timeGroups.get(timeStr)?.push(time)
  })

  // Mark solo players as excused
  const soloPlayers: SoloPlayer[] = []
  for (const players of timeGroups.values()) {
    if (players.length === 1) {
      soloPlayers.push({
        ...players[0],
        status: 'excused',
        excuseReason: 'solo'
      })
    }
  }

  return soloPlayers
}

async function getUSGAPosts(date: Date, gmail: ReturnType<typeof google.gmail>) {
  const nextDay = new Date(date)
  nextDay.setDate(nextDay.getDate() + 1)
  const searchQuery = `from:reporting@ghin.com subject:"Auto-Generated Scheduled Report - Played / Posted Report (Player Rounds)" after:${nextDay.toISOString().split('T')[0]} before:${new Date(nextDay.getTime() + 86400000).toISOString().split('T')[0]}`
  const response = await gmail.users.messages.list({
    userId: 'me',
    q: searchQuery
  })
  if (!response.data.messages?.length) return []
  await gmail.users.messages.get({
    userId: 'me',
    id: response.data.messages[0].id!
  })
  // TODO: Parse the XLSX attachment and return posted GHIN numbers
  return []
}

async function sendNoPostEmail(menNoPost: NoPostPlayer[], womenNoPost: NoPostPlayer[], date: string) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD
    }
  })

  const menReport = menNoPost.map(p => `${p.name} (${p.memberNumber})`).join('\n')
  const womenReport = womenNoPost.map(p => `${p.name} (${p.memberNumber})`).join('\n')

  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: 'john.paradise117@gmail.com',
    subject: `Non-Posters for ${date}`,
    text: `Men who did not post:\n${menReport}\n\nWomen who did not post:\n${womenReport}`
  })
}

export async function GET() {
  try {
    const today = new Date()
    const dateStr = today.toLocaleDateString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: '2-digit'
    }).replace(/\//g, '-')

    // 1. Get MTech data
    let teeTimes = await getMTechData(dateStr)

    // Fetch exclusions for this date
    const { data: exclusions, error: exError } = await supabase
      .from('excluded_dates')
      .select('*')
      .eq('date', today.toISOString().slice(0, 10))
    if (exError) throw new Error('Failed to fetch exclusions')

    // Filter out tee times that are excluded
    teeTimes = teeTimes.filter(row => {
      // row[1] is assumed to be the tee time string
      return !isTeeTimeExcluded(row[1], exclusions)
    })
    
    // 2. Check for solo players
    await checkSoloPlayers(teeTimes)
    
    // 3. Get Gmail client using refresh token
    const gmail = await getGmailClient()
    
    // 4. Get USGA posts
    const postedGHINs = await getUSGAPosts(today, gmail)
    
    // 5. Update database
    const { data: menNoPost, error: menError } = await supabase
      .from('tee_times')
      .select('*')
      .eq('date', dateStr)
      .eq('status', 'pending')
      .not('ghin_number', 'in', postedGHINs)
      .eq('gender', 'M')

    const { data: womenNoPost, error: womenError } = await supabase
      .from('tee_times')
      .select('*')
      .eq('date', dateStr)
      .eq('status', 'pending')
      .not('ghin_number', 'in', postedGHINs)
      .eq('gender', 'F')

    if (menError || womenError) {
      throw new Error('Failed to fetch no-post data')
    }

    // 6. Send email
    await sendNoPostEmail(menNoPost as NoPostPlayer[], womenNoPost as NoPostPlayer[], dateStr)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error running handicap check:', error)
    return NextResponse.json({ error: 'Failed to run handicap check' }, { status: 500 })
  }
} 