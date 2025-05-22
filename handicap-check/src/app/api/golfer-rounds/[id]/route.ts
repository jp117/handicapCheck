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
  console.log('Fetching tee times for golfer:', params.id)
  
  try {
    // Get tee times for the golfer
    const { data: teeTimes, error } = await supabase
      .from('tee_times')
      .select('id, date, tee_time, posting_status, excuse_reason')
      .eq('golfer_id', params.id)
      .order('date', { ascending: false })
      .limit(20)

    if (error) {
      console.error('Supabase error fetching tee times:', error)
      return NextResponse.json({ 
        error: 'Failed to fetch tee times', 
        details: error.message,
        code: error.code 
      }, { status: 500 })
    }

    console.log('Tee times fetched:', teeTimes)
    return NextResponse.json(teeTimes)
  } catch (error) {
    console.error('Unexpected error in golfer-rounds API:', error)
    return NextResponse.json({ 
      error: 'Failed to fetch golfer tee times',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
} 