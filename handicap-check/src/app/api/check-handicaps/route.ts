import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import axios from 'axios'
import { google } from 'googleapis'
import { OAuth2Client } from 'google-auth-library'
import { parseGHINData } from '@/lib/ghin'
import { parse } from 'csv-parse/sync'

interface TeeTime {
  name: string
  time: string
  ghin_number?: string
}

interface GHINScore {
  name: string
  score: number
  date: string
  ghin_number?: string
}

interface GolferInfo {
  first_name: string
  last_name: string
  ghin_number?: string
  email?: string
  gender?: 'M' | 'F'
  member_number?: string
}

// Initialize OAuth2 client
const oauth2Client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
)

oauth2Client.setCredentials({
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN
})

async function getOrCreateGolfer(name: string, ghin_number?: string): Promise<string> {
  // Normalize name
  const nameParts = name.split(' ')
    .map(part => part.replace(/,/g, '').replace(/\./g, '').trim())
    .filter(part => part.length > 0);

  const firstName = nameParts[0].toLowerCase().trim();
  const lastName = nameParts.slice(1).join(' ').toLowerCase().trim();

  // 1. Try to find by GHIN number if provided
  if (ghin_number) {
    const { data: ghinGolfer } = await supabase
      .from('golfers')
      .select('id')
      .eq('ghin_number', ghin_number)
      .single();
    if (ghinGolfer) {
      return ghinGolfer.id;
    }
  }

  // 2. Try to find by lowercased, trimmed first and last name
  const { data: nameGolfer } = await supabase
    .from('golfers')
    .select('id, ghin_number')
    .ilike('first_name', firstName)
    .ilike('last_name', lastName)
    .single();
  if (nameGolfer) {
    // If found by name but missing GHIN, update it
    if (ghin_number && !nameGolfer.ghin_number) {
      await supabase
        .from('golfers')
        .update({ ghin_number })
        .eq('id', nameGolfer.id);
    }
    return nameGolfer.id;
  }

  // 3. Create new golfer
  const { data: newGolfer, error } = await supabase
    .from('golfers')
    .insert({
      first_name: firstName,
      last_name: lastName,
      ghin_number: ghin_number || null
    })
    .select('id')
    .single();
  if (error) {
    throw error;
  }
  console.log('Created new golfer:', firstName, lastName, ghin_number);
  return newGolfer.id;
}

export async function POST(request: Request) {
  try {
    const { date } = await request.json()
    
    // Format date for MTech API (M-D-YYYY - no leading zeros)
    const [year, month, day] = date.split('-')
    const formattedDate = `${parseInt(month)}-${parseInt(day)}-${year}`
    
    // Get MTech data
    const apiKey = process.env.MTECH_API_KEY
    if (!apiKey) {
      throw new Error('MTECH_API_KEY environment variable is not set')
    }
    
    const url = `https://www.clubmtech.com/cmtapi/teetimes/?apikey=${apiKey}&TheDate=${formattedDate}`
    const mtechResponse = await axios.get(url, {
      headers: {
        'Accept': 'text/csv'
      }
    })
    
    // Parse CSV response
    const records = parse(mtechResponse.data, {
      columns: true,
      skip_empty_lines: true,
      trim: true
    })
    
    // Transform CSV records to TeeTime objects
    const teeTimes: TeeTime[] = records
      .filter((record: any) => record && record.MemberName)
      .map((record: any) => ({
        name: record.MemberName.split('-')[0].trim(),
        time: record.TeeTime,
        ghin_number: record.GHIN || undefined
      }))
    
    console.log('Number of tee times from CSV:', teeTimes.length)
    
    if (teeTimes.length === 0) {
      return NextResponse.json({
        date,
        totalGolfers: 0,
        postedScores: 0,
        teeTimes: []
      })
    }
    
    // Process each tee time and get/create golfer records
    const teeTimeInserts = await Promise.all(
      teeTimes.map(async (teeTime) => {
        if (!teeTime.name) return null
        const golferId = await getOrCreateGolfer(teeTime.name, teeTime.ghin_number)
        return {
          date,
          golfer_id: golferId,
          tee_time: teeTime.time,
          posting_status: 'unexcused_no_post'
        }
      })
    )
    
    // Filter out any null inserts and store in Supabase
    const validTeeTimeInserts = teeTimeInserts.filter(insert => insert !== null)
    console.log('Number of tee time inserts:', validTeeTimeInserts.length)
    
    // Check for existing tee times
    const { data: existingTeeTimes, error: existingError } = await supabase
      .from('tee_times')
      .select('id, golfer_id, tee_time')
      .eq('date', date)
    
    if (existingError) {
      throw existingError
    }
    
    console.log('Number of existing tee times:', existingTeeTimes?.length)
    
    // Store tee times in Supabase
    const { error: teeTimeError } = await supabase
      .from('tee_times')
      .upsert(validTeeTimeInserts, { 
        onConflict: 'date,golfer_id,tee_time',
        ignoreDuplicates: false
      })
    
    if (teeTimeError) {
      throw teeTimeError
    }
    
    // Get GHIN data from Gmail
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client })
    const emailDate = new Date(date)
    emailDate.setDate(emailDate.getDate() + 1) // Look for email from next day
    
    const searchQuery = `from:reporting@ghin.com subject:"Auto-Generated Scheduled Report - Played / Posted Report (Player Rounds)" after:${emailDate.toISOString().split('T')[0]} before:${new Date(emailDate.getTime() + 86400000).toISOString().split('T')[0]}`
    
    const messages = await gmail.users.messages.list({
      userId: 'me',
      q: searchQuery
    })
    
    let ghinData: GHINScore[] = []
    if (messages.data.messages && messages.data.messages.length > 0) {
      const messageId = messages.data.messages[0].id
      if (messageId) {
        ghinData = await parseGHINData(gmail, messageId, 'me')
        
        // Update posting status for golfers who posted their scores
        const { error: updateError } = await supabase
          .from('tee_times')
          .update({ posting_status: 'posted' })
          .eq('date', date)
          .in('golfer_id', await Promise.all(
            ghinData.map(async (score) => {
              const golferId = await getOrCreateGolfer(score.name, score.ghin_number)
              return golferId
            })
          ))
        
        if (updateError) {
          throw updateError
        }
      }
    }
    
    // Get the final state of all tee times for this date with golfer information
    const { data: finalTeeTimes, error: fetchError } = await supabase
      .from('tee_times')
      .select(`
        *,
        golfer:golfers (
          id,
          first_name,
          last_name,
          ghin_number,
          email,
          gender,
          member_number
        )
      `)
      .eq('date', date)
    
    if (fetchError) {
      throw fetchError
    }
    
    return NextResponse.json({
      date,
      totalGolfers: finalTeeTimes.length,
      postedScores: ghinData.length,
      teeTimes: finalTeeTimes
    })
  } catch (error) {
    console.error('Error checking handicaps:', error)
    return NextResponse.json(
      { error: 'Failed to check handicaps' },
      { status: 500 }
    )
  }
} 