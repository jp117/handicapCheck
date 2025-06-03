import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
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

    const roundsPosted = teeTimes.filter(t => t.posting_status === 'posted').length;
    const unexcusedNoPost = teeTimes.filter(t => t.posting_status === 'unexcused_no_post').length;
    const denominator = roundsPosted + unexcusedNoPost;

    // Calculate stats
    const stats = {
      roundsPlayed: teeTimes.length,
      roundsPosted,
      unexcusedNoPost,
      postPercentage: denominator > 0 
        ? Math.round((roundsPosted / denominator) * 100)
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