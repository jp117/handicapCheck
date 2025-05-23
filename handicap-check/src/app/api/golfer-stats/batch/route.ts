import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(request: Request) {
  try {
    const { memberNumbers } = await request.json();
    if (!Array.isArray(memberNumbers) || memberNumbers.length === 0) {
      return NextResponse.json({ error: 'No member numbers provided' }, { status: 400 });
    }
    // Fetch golfers by member number
    const { data: golfers, error: golfersError } = await supabase
      .from('golfers')
      .select('id, member_number, first_name, last_name, suffix')
      .in('member_number', memberNumbers);
    if (golfersError) throw golfersError;
    // For each golfer, fetch their tee_times and calculate posting %
    const results = [];
    for (const golfer of golfers) {
      const { data: teeTimes, error: teeTimesError } = await supabase
        .from('tee_times')
        .select('posting_status')
        .eq('golfer_id', golfer.id);
      if (teeTimesError) continue;
      const roundsPosted = teeTimes.filter(t => t.posting_status === 'posted').length;
      const unexcusedNoPost = teeTimes.filter(t => t.posting_status === 'unexcused_no_post').length;
      const denominator = roundsPosted + unexcusedNoPost;
      const postPercentage = denominator > 0 ? Math.round((roundsPosted / denominator) * 100) : 0;
      results.push({
        id: golfer.id,
        member_number: golfer.member_number,
        name: [golfer.first_name, golfer.last_name, golfer.suffix].filter(Boolean).join(' '),
        postPercentage,
      });
    }
    return NextResponse.json(results);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'An error occurred' }, { status: 500 });
  }
} 