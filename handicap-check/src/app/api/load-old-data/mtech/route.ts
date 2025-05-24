import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { parse as csvParse } from 'csv-parse/sync'
import { isTeeTimeExcluded } from '@/lib/exclusions'

interface TeeTimeRecord {
  member_number: string;
  time: string;
  date: string;
  name: string;
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function getMTechData(date: string) {
  const apiKey = process.env.MTECH_API_KEY
  const response = await fetch(
    `https://www.clubmtech.com/cmtapi/teetimes/?apikey=${apiKey}&TheDate=${date}`
  )
  const data = await response.text()
  return data.split('\n').slice(1) // Skip header row
}

// Helper to normalize dates to YYYY-MM-DD
function normalizeDate(str: string): string {
  const [month, day, year] = str.split(/[\/-]/).map(s => s.trim());
  if (!year || !month || !day) return '';
  return `${year.padStart(4, '20')}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const date = searchParams.get('date')
    
    if (!date) {
      return NextResponse.json({ error: 'Date parameter required' }, { status: 400 })
    }

    // Convert YYYY-MM-DD to M-D-YYYY for MTech API
    const [yyyy, mm, dd] = date.split('-')
    const formattedDate = `${parseInt(mm)}-${parseInt(dd)}-${yyyy}`

    console.log(`Fetching MTech data for ${formattedDate}...`)

    // Get MTech data
    const teeTimesRaw = await getMTechData(formattedDate)

    // Parse CSV data
    const records = csvParse(teeTimesRaw.join('\n'), {
      columns: false,
      skip_empty_lines: true,
      trim: true
    });

    // Fetch exclusions for this date
    const { data: exclusions, error: exError } = await supabase
      .from('excluded_dates')
      .select('*')
      .eq('date', date)
    if (exError) throw exError

    // Parse and filter tee times
    const teeTimes = (records as string[][])
      .filter((cols: string[]) => cols.length >= 5 && (cols[4]?.trim() || cols[5]?.trim()))
      .filter((cols: string[]) => normalizeDate(cols[0].trim()) === date)
      .filter((cols: string[]) => !isTeeTimeExcluded(cols[1], exclusions))
      .map((cols: string[]) => ({
        member_number: (cols[5]?.trim() || cols[4]?.trim()).replace(/\r/g, ''),
        time: cols[1].trim(),
        date: cols[0].trim(),
        name: cols[2]?.trim()
      }));

    // Group tee times by date and time to identify solo rounds
    const teeTimeGroups = teeTimes.reduce((groups, teeTime) => {
      const key = `${teeTime.date}-${teeTime.time}`;
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(teeTime);
      return groups;
    }, {} as Record<string, TeeTimeRecord[]>);

    console.log(`Found ${teeTimes.length} tee times for ${date}`)

    return NextResponse.json({
      success: true,
      date,
      teeTimes,
      teeTimeGroups,
      totalTeeTimes: teeTimes.length
    });

  } catch (error) {
    console.error('Error fetching MTech data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch MTech data', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
} 