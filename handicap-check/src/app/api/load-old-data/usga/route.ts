import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { google } from 'googleapis'
import * as XLSX from 'xlsx'
import { gmail_v1 } from 'googleapis'

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
    return { error: 'No XLSX attachment found in USGA email', xlsxFilenames }
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

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const date = searchParams.get('date')
    
    if (!date) {
      return NextResponse.json({ error: 'Date parameter required' }, { status: 400 })
    }

    const dateObj = new Date(date)
    console.log(`Fetching USGA posts for ${date}...`)

    let postedGHINs: string[] = [];
    try {
      const gmail = await getGmailClient();
      const posts = await getUSGAPosts(dateObj, gmail);
      postedGHINs = Array.isArray(posts) ? posts.map(g => String(g).trim()) : [];
    } catch (error) {
      console.warn('Failed to fetch USGA posts:', error);
      // Don't throw - return empty array and let the process continue
      postedGHINs = [];
    }

    return NextResponse.json({
      success: true,
      date,
      postedGHINs,
      totalPosted: postedGHINs.length
    });

  } catch (error) {
    console.error('Error fetching USGA data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch USGA data', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
} 