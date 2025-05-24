import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

interface TeeTimeRecord {
  member_number: string;
  time: string;
  date: string;
  name: string;
}

interface TeeTimeInsert {
  date: string;
  golfer_id: string;
  tee_time: string;
  posting_status: 'posted' | 'excused_no_post' | 'unexcused_no_post';
  excuse_reason: string | null;
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Helper to normalize dates to YYYY-MM-DD
function normalizeDate(str: string): string {
  const [month, day, year] = str.split(/[\/-]/).map(s => s.trim());
  if (!year || !month || !day) return '';
  return `${year.padStart(4, '20')}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { 
      teeTimes, 
      teeTimeGroups, 
      postedGHINs = [], 
      date 
    }: {
      teeTimes: TeeTimeRecord[];
      teeTimeGroups: Record<string, TeeTimeRecord[]>;
      postedGHINs: string[];
      date: string;
    } = body;

    if (!teeTimes || !date) {
      return NextResponse.json({ error: 'Missing required data' }, { status: 400 });
    }

    console.log(`Processing ${teeTimes.length} tee times for ${date}...`);

    // Batch fetch all golfers to reduce DB calls
    const memberNumbers = [...new Set(teeTimes.map(t => t.member_number.trim()))];
    console.log(`Batch fetching ${memberNumbers.length} unique golfers...`);
    
    const { data: golfers, error: golfersError } = await supabase
      .from('golfers')
      .select('id, member_number, ghin_number')
      .in('member_number', memberNumbers);
    
    if (golfersError) throw golfersError;

    // Create a lookup map
    const golferMap = new Map();
    golfers?.forEach(g => {
      golferMap.set(g.member_number.toLowerCase(), g);
    });

    // Fetch existing tee times for this date
    console.log('Fetching existing tee times...');
    const { data: existingTeeTimes, error: fetchExistingError } = await supabase
      .from('tee_times')
      .select('id, date, golfer_id, tee_time, posting_status')
      .eq('date', date);
    if (fetchExistingError) throw fetchExistingError;

    const unmatchedMemberNumbers: string[] = [];
    const teeTimeInserts: TeeTimeInsert[] = [];

    // Process tee times
    console.log('Processing tee times for database insertion...');
    for (const teeTime of teeTimes) {
      const golfer = golferMap.get(teeTime.member_number.trim().toLowerCase());
      if (!golfer) {
        unmatchedMemberNumbers.push(teeTime.member_number);
        continue;
      }

      const golferId = golfer.id;
      const rosterGhin = golfer.ghin_number ? String(golfer.ghin_number).trim() : '';

      // Check if this is a solo round
      const key = `${teeTime.date}-${teeTime.time}`;
      const isSoloRound = teeTimeGroups[key]?.length === 1;

      // Check if a tee_time already exists for this date, golfer, and tee_time
      const existing = existingTeeTimes?.find(
        t => t.golfer_id === golferId && t.tee_time === teeTime.time
      );
      if (existing && existing.posting_status === 'posted') {
        continue;
      }

      // Determine posting status
      let posting_status: 'posted' | 'excused_no_post' | 'unexcused_no_post';
      let excuse_reason: string | null = null;
      if (rosterGhin && postedGHINs.includes(rosterGhin)) {
        posting_status = 'posted';
      } else if (isSoloRound) {
        posting_status = 'excused_no_post';
        excuse_reason = 'solo';
      } else {
        posting_status = 'unexcused_no_post';
      }

      teeTimeInserts.push({
        date: normalizeDate(teeTime.date),
        golfer_id: golferId,
        tee_time: teeTime.time,
        posting_status,
        excuse_reason
      });
    }

    // Batch insert with error handling
    console.log(`Inserting ${teeTimeInserts.length} tee times...`);
    let insertedCount = 0;
    let skippedCount = 0;
    let excusedInserted = 0;
    let unexcusedInserted = 0;

    // Process in chunks to avoid overwhelming the database
    const chunkSize = 50;
    for (let i = 0; i < teeTimeInserts.length; i += chunkSize) {
      const chunk = teeTimeInserts.slice(i, i + chunkSize);
      for (const insert of chunk) {
        const { error } = await supabase
          .from('tee_times')
          .upsert(insert, {
            onConflict: 'date,golfer_id,tee_time',
            ignoreDuplicates: false
          });

        if (error) {
          console.error('Error inserting tee time:', error);
          skippedCount++;
        } else {
          insertedCount++;
          if (insert.posting_status === 'excused_no_post') {
            excusedInserted++;
          } else if (insert.posting_status === 'unexcused_no_post') {
            unexcusedInserted++;
          }
        }
      }
    }

    console.log(`Completed: ${insertedCount} inserted, ${skippedCount} skipped`);

    return NextResponse.json({
      success: true,
      stats: {
        total: teeTimes.length,
        inserted: insertedCount,
        skipped: skippedCount,
        excused: excusedInserted,
        unexcused: unexcusedInserted,
        unmatched: unmatchedMemberNumbers.length
      },
      unmatched: unmatchedMemberNumbers
    });

  } catch (error) {
    console.error('Error processing data:', error);
    return NextResponse.json(
      { error: 'Failed to process data', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
} 