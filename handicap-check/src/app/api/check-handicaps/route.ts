import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import axios from 'axios'
import { google } from 'googleapis'
import { OAuth2Client } from 'google-auth-library'
import { parseGHINData } from '@/lib/ghin'
import { parse } from 'csv-parse/sync'
import NextAuth from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'

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

async function getGolferIdByMemberNumber(member_number: string): Promise<string | null> {
  const { data: golfer } = await supabase
    .from('golfers')
    .select('id')
    .eq('member_number', member_number)
    .single();

  return golfer ? golfer.id : null;
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
    
    // Transform CSV records to use only MemberNo for lookup
    const teeTimes = records
      .filter((record: any) => record && record.MemberNo && record.TeeTime)
      .map((record: any) => ({
        member_number: record.MemberNo.trim(),
        time: record.TeeTime,
        date: record.TeeDate
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
    
    // Process each tee time and get golfer records by member_number
    const teeTimeInserts = await Promise.all(
      teeTimes.map(async (teeTime: any) => {
        const golferId = await getGolferIdByMemberNumber(teeTime.member_number)
        if (!golferId) {
          // Optionally: log or skip this row
          return null;
        }
        return {
          date: teeTime.date,
          golfer_id: golferId,
          tee_time: teeTime.time,
          posting_status: 'unexcused_no_post'
        }
      })
    )
    
    // Filter out any null inserts and store in Supabase
    const validTeeTimeInserts = teeTimeInserts.filter(insert => insert !== null)
    console.log('Number of tee time inserts:', validTeeTimeInserts.length)
    
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
    
    // Get the final state of all tee times for this date with golfer information
    const { data: finalTeeTimes, error: fetchError } = await supabase
      .from('tee_times')
      .select(`
        *,
        golfer:golfers (
          id,
          first_name,
          middle_name,
          last_name,
          suffix,
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

export default NextAuth({
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: 'openid email profile'
        }
      }
    })
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      // Here you can upsert the user into your Supabase users table if you want
      // You can also check if the user is an admin, etc.
      return true
    },
    async session({ session, token, user }) {
      // You can add custom fields to the session here
      return session
    }
  }
})