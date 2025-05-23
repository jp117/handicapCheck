import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import axios from 'axios'
import { parse } from 'csv-parse/sync'

interface TeeTimeRecord {
  MemberNo: string;
  TeeTime: string;
  TeeDate: string;
}

interface TeeTimeInsert {
  date: string;
  golfer_id: string;
  tee_time: string;
  posting_status: 'unexcused_no_post';
}

interface GolferInfo {
  id: string;
  first_name: string;
  middle_name?: string;
  last_name: string;
  suffix?: string;
  ghin_number?: string;
  email?: string;
  gender?: 'M' | 'F';
  member_number?: string;
}

interface TeeTimeWithGolfer extends TeeTimeInsert {
  golfer: GolferInfo;
}

interface TeeTime {
  member_number: string;
  time: string;
  date: string;
}

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
      .filter((record: TeeTimeRecord) => record && record.MemberNo && record.TeeTime)
      .map((record: TeeTimeRecord) => ({
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
      teeTimes.map(async (teeTime: TeeTime) => {
        const golferId = await getGolferIdByMemberNumber(teeTime.member_number)
        if (!golferId) {
          return null;
        }
        return {
          date: teeTime.date,
          golfer_id: golferId,
          tee_time: teeTime.time,
          posting_status: 'unexcused_no_post'
        } as TeeTimeInsert
      })
    )
    
    // Filter out any null inserts and store in Supabase
    const validTeeTimeInserts = teeTimeInserts.filter((insert): insert is TeeTimeInsert => insert !== null)
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
      teeTimes: finalTeeTimes as TeeTimeWithGolfer[]
    })
  } catch (error) {
    console.error('Error checking handicaps:', error)
    return NextResponse.json(
      { error: 'Failed to check handicaps' },
      { status: 500 }
    )
  }
}