import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { google } from 'googleapis'
import * as XLSX from 'xlsx'
import { isTeeTimeExcluded } from '@/lib/exclusions'
import { parse as csvParse } from 'csv-parse/sync'
import { gmail_v1 } from 'googleapis'

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

async function getGmailClient() {
  const { data: user, error } = await supabase
    .from('users')
    .select('gmail_refresh_token, email')
    .eq('email', 'nhcchandicapcheck@gmail.com')
    .single()
  if (error || !user?.gmail_refresh_token) throw new Error('No refresh token found for admin user')

  const oAuth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.NEXTAUTH_URL
  )
  oAuth2Client.setCredentials({ refresh_token: user.gmail_refresh_token })
  return google.gmail({ version: 'v1', auth: oAuth2Client })
}

async function getUSGAPosts(date: Date, gmail: ReturnType<typeof google.gmail>) {
  // Find the email for the day after the given date
  const nextDay = new Date(date)
  nextDay.setDate(nextDay.getDate() + 1)
  const after = nextDay.toISOString().split('T')[0]
  const before = new Date(nextDay.getTime() + 86400000).toISOString().split('T')[0]
  const searchQuery = `from:reporting@ghin.com subject:"Auto-Generated Scheduled Report - Played / Posted Report (Player Rounds)" after:${after} before:${before}`
  const response = await gmail.users.messages.list({
    userId: 'me',
    q: searchQuery
  })
  if (!response.data.messages?.length) return []
  const message = await gmail.users.messages.get({
    userId: 'me',
    id: response.data.messages[0].id!
  })

  // Find the XLSX attachment
  const parts = message.data.payload?.parts || []
  const xlsxFilenames = parts
    .filter((part): part is gmail_v1.Schema$MessagePart & { filename: string } => 
      Boolean(part.filename?.endsWith('.xlsx')))
    .map(part => part.filename)
  const xlsxPart = parts.find(
    (part): part is gmail_v1.Schema$MessagePart & { filename: string; body: { attachmentId: string } } => 
      Boolean(part.filename?.endsWith('.xlsx') && 
              part.filename.toLowerCase().includes('played') && 
              part.body?.attachmentId)
  )
  if (!xlsxPart) {
    console.error('No XLSX attachment found in USGA email. XLSX filenames found:', xlsxFilenames)
    return { error: 'No XLSX attachment found in USGA email', xlsxFilenames }
  }

  // Download the attachment
  const attachmentData = await gmail.users.messages.attachments.get({
    userId: 'me',
    messageId: message.data.id!,
    id: xlsxPart.body.attachmentId
  })
  const buffer = Buffer.from(attachmentData.data.data!, 'base64')

  // Parse the XLSX file
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 })

  // Find the header row and column indices
  const header = rows[0] as string[]
  const ghinIdx = header.findIndex(h => String(h).toLowerCase().includes('ghin'))
  const postedIdx = header.findIndex(h => String(h).toLowerCase().includes('total posted on date played'))
  if (ghinIdx === -1 || postedIdx === -1) {
    console.error('Could not find GHIN or posted columns in XLSX')
    return []
  }

  // Collect GHIN numbers where posted > 0
  const postedGHINs = (rows.slice(1) as (string | number)[][])
    .filter(row => row[ghinIdx] && Number(row[postedIdx]) > 0)
    .map(row => String(row[ghinIdx]).trim())

  return postedGHINs
}

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
  // Accepts M/D/YYYY or MM/DD/YYYY and returns YYYY-MM-DD
  const [month, day, year] = str.split(/[\/-]/).map(s => s.trim());
  if (!year || !month || !day) return '';
  return `${year.padStart(4, '20')}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

export async function GET(request: Request) {
  try {
    // Get date from query param, default to today
    const { searchParams } = new URL(request.url)
    let date = searchParams.get('date')
    let dateObj: Date
    let formattedDate: string
    if (!date) {
      dateObj = new Date()
      formattedDate = dateObj.toLocaleDateString('en-US', {
        month: '2-digit',
        day: '2-digit',
        year: '2-digit'
      }).replace(/\//g, '-')
      date = dateObj.toISOString().slice(0, 10)
    } else {
      // Accept YYYY-MM-DD, convert to M-D-YYYY for MTech
      const [yyyy, mm, dd] = date.split('-')
      dateObj = new Date(`${yyyy}-${mm}-${dd}`)
      formattedDate = `${parseInt(mm)}-${parseInt(dd)}-${yyyy}`
    }

    // 1. Get MTech data for the date
    const teeTimesRaw = await getMTechData(formattedDate)

    // Use csv-parse to handle commas in quoted fields
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

    const normalizedRequestedDate = date; // already in YYYY-MM-DD

    // Fetch posted GHINs for this date
    const gmail = await getGmailClient();
    let postedGHINs = await getUSGAPosts(dateObj, gmail);
    if (!Array.isArray(postedGHINs)) postedGHINs = [];
    postedGHINs = postedGHINs.map(g => String(g).trim());

    // Parse tee times from MTech data
    const teeTimes = (records as string[][])
      .filter((cols: string[]) => cols.length >= 5 && (cols[4]?.trim() || cols[5]?.trim()))
      .filter((cols: string[]) => normalizeDate(cols[0].trim()) === normalizedRequestedDate)
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

    const unmatchedMemberNumbers: string[] = [];
    const { data: existingTeeTimes, error: fetchExistingError } = await supabase
      .from('tee_times')
      .select('id, date, golfer_id, tee_time, posting_status')
      .eq('date', date);
    if (fetchExistingError) throw fetchExistingError;

    const teeTimeInserts = await Promise.all(
      teeTimes.map(async (teeTime) => {
        // Look up golfer by member number and get their GHIN from the DB
        const { data: golfer, error: golferError } = await supabase
          .from('golfers')
          .select('id, ghin_number')
          .ilike('member_number', teeTime.member_number.trim())
          .single();
        if (golferError || !golfer) {
          unmatchedMemberNumbers.push(teeTime.member_number);
          return null;
        }
        const golferId = golfer.id;
        const rosterGhin = golfer.ghin_number ? String(golfer.ghin_number).trim() : '';

        // Check if this is a solo round
        const key = `${teeTime.date}-${teeTime.time}`;
        const isSoloRound = teeTimeGroups[key].length === 1;

        // Check if a tee_time already exists for this date, golfer, and tee_time
        const existing = existingTeeTimes?.find(
          t => t.golfer_id === golferId && t.tee_time === teeTime.time
        );
        if (existing && existing.posting_status === 'posted') {
          return null;
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

        return {
          date: teeTime.date,
          golfer_id: golferId,
          tee_time: teeTime.time,
          posting_status,
          excuse_reason
        } as TeeTimeInsert;
      })
    );

    // Filter out null values and normalize date for DB insert (YYYY-MM-DD)
    const validTeeTimeInserts = teeTimeInserts
      .filter((insert): insert is TeeTimeInsert => insert !== null)
      .map(t => ({
        ...t,
        date: normalizeDate(t.date)
      }));

    // Insert each tee time individually to avoid batch failure on unique violation
    let insertedCount = 0;
    let skippedCount = 0;
    let excusedInserted = 0;
    let unexcusedInserted = 0;

    for (const insert of validTeeTimeInserts) {
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
    console.error('Error loading old data:', error);
    return NextResponse.json(
      { error: 'Failed to load old data' },
      { status: 500 }
    );
  }
}