import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  console.log('Fetching stats for golfer:', params.id)
  
  try {
    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    console.log('Date range:', { startDate, endDate })

    // Build the query
    let query = supabase
      .from('tee_times')
      .select('posting_status')
      .eq('golfer_id', params.id)

    // Add date filters if provided
    if (startDate) {
      query = query.gte('date', startDate)
    }
    if (endDate) {
      query = query.lte('date', endDate)
    }

    const { data: teeTimes, error } = await query

    if (error) {
      console.error('Supabase error fetching tee times:', error)
      return NextResponse.json({ 
        error: 'Failed to fetch tee times', 
        details: error.message,
        code: error.code 
      }, { status: 500 })
    }

    console.log('Tee times fetched:', teeTimes)

    // Calculate stats
    const roundsPlayed = teeTimes.length
    const roundsPosted = teeTimes.filter(teeTime => teeTime.posting_status === 'posted').length
    const unexcusedNoPost = teeTimes.filter(teeTime => teeTime.posting_status === 'unexcused_no_post').length
    const postPercentage = roundsPlayed > 0 
      ? Math.round((roundsPosted / (roundsPlayed + unexcusedNoPost)) * 100)
      : 0

    const stats = {
      roundsPlayed,
      roundsPosted,
      unexcusedNoPost,
      postPercentage,
      dateRange: {
        start: startDate,
        end: endDate
      }
    }

    console.log('Calculated stats:', stats)
    return NextResponse.json(stats)
  } catch (error) {
    console.error('Unexpected error in golfer-stats API:', error)
    return NextResponse.json({ 
      error: 'Failed to fetch golfer stats',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
} 