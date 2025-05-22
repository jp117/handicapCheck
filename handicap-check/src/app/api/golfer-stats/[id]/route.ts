import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    const { data: teeTimes, error } = await supabase
      .from('tee_times')
      .select('*')
      .eq('golfer_id', id)
      .order('date', { ascending: false })

    if (error) throw error

    // Calculate stats
    const stats = {
      roundsPlayed: teeTimes.length,
      roundsPosted: teeTimes.filter(t => t.posting_status === 'posted').length,
      unexcusedNoPost: teeTimes.filter(t => t.posting_status === 'unexcused_no_post').length,
      postPercentage: teeTimes.length > 0 
        ? Math.round((teeTimes.filter(t => t.posting_status === 'posted').length / teeTimes.length) * 100)
        : 0,
      dateRange: { start: startDate, end: endDate }
    }

    return NextResponse.json(stats)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'An error occurred' },
      { status: 500 }
    )
  }
} 