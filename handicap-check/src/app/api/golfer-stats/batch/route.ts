import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface GolferStat {
  id: string;
  member_number: string;
  name: string;
  postPercentage: number;
}

interface NotFoundGolfer {
  member_number: string;
  status: 'not_in_db';
}

interface BatchResponse {
  found: GolferStat[];
  notFound: NotFoundGolfer[];
}

export async function POST(request: Request) {
  try {
    const { memberNumbers } = await request.json();
    if (!Array.isArray(memberNumbers) || memberNumbers.length === 0) {
      return NextResponse.json({ error: 'No member numbers provided' }, { status: 400 });
    }
    
    // Fetch golfers by member number
    const { data: golfers, error: golfersError } = await supabase
      .from('golfers')
      .select('id, member_number, first_name, middle_name, last_name, suffix')
      .in('member_number', memberNumbers);
    if (golfersError) throw golfersError;
    
    // Track which member numbers were found
    const foundMemberNumbers = new Set(golfers.map(g => g.member_number));
    const notFoundMemberNumbers = memberNumbers.filter(num => !foundMemberNumbers.has(num));
    
    // For each golfer, fetch their tee_times and calculate posting %
    const foundResults: GolferStat[] = [];
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
      
      // Construct full name using the same logic as the email system
      const nameParts = [
        golfer.first_name,
        golfer.middle_name,
        golfer.last_name
      ].filter(Boolean) // Remove any null/undefined/empty parts
      
      const fullName = nameParts.join(' ') + (golfer.suffix ? ` ${golfer.suffix}` : '')
      
      foundResults.push({
        id: golfer.id,
        member_number: golfer.member_number,
        name: fullName.trim(),
        postPercentage,
      });
    }
    
    // Create not found results
    const notFoundResults: NotFoundGolfer[] = notFoundMemberNumbers.map(num => ({
      member_number: num,
      status: 'not_in_db' as const
    }));
    
    const response: BatchResponse = {
      found: foundResults,
      notFound: notFoundResults
    };
    
    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'An error occurred' }, { status: 500 });
  }
} 