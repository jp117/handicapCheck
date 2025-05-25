import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { google } from 'googleapis'

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

async function getUSGAPosts(date: Date, gmail: ReturnType<typeof google.gmail>) {
  const nextDay = new Date(date)
  nextDay.setDate(nextDay.getDate() + 1)
  const searchQuery = `from:reporting@ghin.com subject:"Auto-Generated Scheduled Report - Played / Posted Report (Player Rounds)" after:${nextDay.toISOString().split('T')[0]} before:${new Date(nextDay.getTime() + 86400000).toISOString().split('T')[0]}`
  
  const response = await gmail.users.messages.list({
    userId: 'me',
    q: searchQuery
  })
  
  if (!response.data.messages?.length) return []
  
  // TODO: Parse the XLSX attachment and return posted GHIN numbers
  // For now, return empty array until XLSX parsing is implemented
  return []
}

export async function GET() {
  try {
    const today = new Date()
    
    // 1. Get Gmail client using refresh token
    const gmail = await getGmailClient()
    
    // 2. Get USGA posts
    const postedGHINs = await getUSGAPosts(today, gmail)

    return NextResponse.json({ 
      success: true, 
      postedGHINs,
      date: today.toISOString().slice(0, 10)
    })
  } catch (error) {
    console.error('Error fetching USGA posts:', error)
    return NextResponse.json({ error: 'Failed to fetch USGA posts' }, { status: 500 })
  }
} 