import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isTeeTimeExcluded } from '@/lib/exclusions'

interface TeeTimeRow {
  [key: string]: string;
}

interface SoloPlayer extends TeeTimeRow {
  status: 'excused';
  excuseReason: 'solo';
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
  return data.split('\n').slice(1).map(row => {
    const columns = row.split(',');
    return {
      0: columns[0] || '',
      1: columns[1] || '',
      2: columns[2] || '',
      // Add more columns as needed
    } as TeeTimeRow;
  });
}

function checkSoloPlayers(teeTimes: TeeTimeRow[]) {
  const timeGroups = new Map<string, TeeTimeRow[]>()
  
  // Group players by tee time
  teeTimes.forEach(time => {
    const timeStr = time[1] // Assuming time is in second column
    if (!timeGroups.has(timeStr)) {
      timeGroups.set(timeStr, [])
    }
    timeGroups.get(timeStr)?.push(time)
  })

  // Mark solo players as excused
  const soloPlayers: SoloPlayer[] = []
  for (const players of timeGroups.values()) {
    if (players.length === 1) {
      soloPlayers.push({
        ...players[0],
        status: 'excused',
        excuseReason: 'solo'
      })
    }
  }

  return soloPlayers
}

export async function GET() {
  try {
    const today = new Date()
    const dateStr = today.toLocaleDateString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: '2-digit'
    }).replace(/\//g, '-')

    // 1. Get MTech data
    let teeTimes = await getMTechData(dateStr)

    // 2. Fetch exclusions for this date
    const { data: exclusions, error: exError } = await supabase
      .from('excluded_dates')
      .select('*')
      .eq('date', today.toISOString().slice(0, 10))
    if (exError) throw new Error('Failed to fetch exclusions')

    // 3. Filter out tee times that are excluded
    teeTimes = teeTimes.filter(row => {
      // row[1] is assumed to be the tee time string
      return !isTeeTimeExcluded(row[1], exclusions)
    })
    
    // 4. Check for solo players
    const soloPlayers = checkSoloPlayers(teeTimes)

    return NextResponse.json({ 
      success: true, 
      teeTimes,
      soloPlayers,
      date: dateStr
    })
  } catch (error) {
    console.error('Error fetching MTech data:', error)
    return NextResponse.json({ error: 'Failed to fetch MTech data' }, { status: 500 })
  }
} 