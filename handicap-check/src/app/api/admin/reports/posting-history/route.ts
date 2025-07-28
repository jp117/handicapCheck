import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Helper function to check if user is admin
async function checkAdminPermission() {
  const session = await getServerSession()
  if (!session?.user?.email) {
    return false
  }

  const { data: user } = await supabase
    .from('users')
    .select('is_admin')
    .eq('email', session.user.email)
    .single()

  return user?.is_admin || false
}

interface TeeTimeGolfer {
  id: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  suffix: string | null;
  member_number: string | null;
  ghin_number: string | null;
  gender: string;
}

interface TeeTimeData {
  golfer_id: string;
  date: string;
  tee_time: string;
  posting_status: string;
  excuse_reason: string | null;
  golfer: TeeTimeGolfer | null;
}

interface GolferStatsData {
  golfer: TeeTimeGolfer;
  rounds: TeeTimeData[];
  posted: number;
  unexcused: number;
  excused: number;
}

interface PostingHistoryReport {
  golfer_id: string;
  golfer_name: string;
  member_number: string | null;
  ghin_number: string | null;
  total_rounds: number;
  posted_rounds: number;
  unexcused_no_post: number;
  excused_no_post: number;
  posting_percentage: number;
  last_round_date: string | null;
  recent_activity: {
    date: string;
    tee_time: string;
    posting_status: string;
    excuse_reason?: string | null;
  }[];
}

// GET - Fetch posting history report
export async function GET(request: Request) {
  try {
    const isAdmin = await checkAdminPermission()
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const search = searchParams.get('search') // Search by name or member number
    const minRounds = searchParams.get('minRounds') // Minimum rounds to include
    const gender = searchParams.get('gender') // Filter by gender: 'M', 'F', or null for all
    const format = searchParams.get('format') // 'json' or 'csv'

    // First, let's check the total count
    let countQuery = supabase
      .from('tee_times')
      .select('*', { count: 'exact', head: true })
    
    if (startDate) {
      countQuery = countQuery.gte('date', startDate)
    }
    if (endDate) {
      countQuery = countQuery.lte('date', endDate)
    }

    const { count: totalCount } = await countQuery

    // Fetch all data using pagination since Supabase limits to 1000 records
    const allTeeTimesData: TeeTimeData[] = []
    let currentOffset = 0
    const batchSize = 1000

    while (currentOffset < (totalCount || 0)) {
      let batchQuery = supabase
        .from('tee_times')
        .select(`
          golfer_id,
          date,
          tee_time,
          posting_status,
          excuse_reason,
          golfer:golfers (
            id,
            first_name,
            middle_name,
            last_name,
            suffix,
            member_number,
            ghin_number,
            gender
          )
        `)
        .order('date', { ascending: false })
        .range(currentOffset, currentOffset + batchSize - 1)

      // Apply date filters if provided
      if (startDate) {
        batchQuery = batchQuery.gte('date', startDate)
      }
      if (endDate) {
        batchQuery = batchQuery.lte('date', endDate)
      }

      const { data: batchData, error: batchError } = await batchQuery

      if (batchError) {
        console.error('Error fetching batch:', batchError)
        return NextResponse.json({ error: 'Failed to fetch tee times' }, { status: 500 })
      }

      if (batchData && batchData.length > 0) {
        allTeeTimesData.push(...(batchData as unknown as TeeTimeData[]))
      }

      // If we got less than the batch size, we've reached the end
      if (!batchData || batchData.length < batchSize) {
        break
      }

      currentOffset += batchSize
    }

    const teeTimesData = allTeeTimesData

    // Filter by gender after fetching if needed (since filtering on related fields in Supabase can be tricky)
    let filteredTeeTimesData = teeTimesData
    if (gender && teeTimesData) {
      filteredTeeTimesData = teeTimesData.filter((teeTime: TeeTimeData) => 
        teeTime.golfer && teeTime.golfer.gender === gender
      )
    }

    // Exclude golfers without GHIN numbers since they can't post scores
    filteredTeeTimesData = filteredTeeTimesData.filter((teeTime: TeeTimeData) => 
      teeTime.golfer && teeTime.golfer.ghin_number && teeTime.golfer.ghin_number.trim() !== ''
    )

    // Group by golfer and calculate statistics
    const golferStats = new Map<string, GolferStatsData>()

    filteredTeeTimesData?.forEach((teeTime: TeeTimeData) => {
      if (!teeTime.golfer) return

      const golferId = teeTime.golfer_id
      if (!golferStats.has(golferId)) {
        golferStats.set(golferId, {
          golfer: teeTime.golfer,
          rounds: [],
          posted: 0,
          unexcused: 0,
          excused: 0
        })
      }

      const stats = golferStats.get(golferId)!
      stats.rounds.push(teeTime)

      if (teeTime.posting_status === 'posted') {
        stats.posted++
      } else if (teeTime.posting_status === 'unexcused_no_post') {
        stats.unexcused++
      } else if (teeTime.posting_status === 'excused_no_post') {
        stats.excused++
      }
    })

    // Convert to report format
    let reportData: PostingHistoryReport[] = Array.from(golferStats.entries()).map(([golferId, stats]) => {
      const golfer = stats.golfer
      const totalRounds = stats.posted + stats.unexcused + stats.excused
      const postingPercentage = stats.posted + stats.unexcused > 0 
        ? Math.round((stats.posted / (stats.posted + stats.unexcused)) * 100)
        : 0

      // Build golfer name
      const nameParts = [
        golfer.first_name,
        golfer.middle_name,
        golfer.last_name
      ].filter(Boolean)
      const golferName = nameParts.join(' ') + (golfer.suffix ? ` ${golfer.suffix}` : '')

      // Get recent activity (last 5 rounds)
      const recentActivity = stats.rounds
        .slice(0, 5)
        .map(round => ({
          date: round.date,
          tee_time: round.tee_time,
          posting_status: round.posting_status,
          excuse_reason: round.excuse_reason
        }))

      return {
        golfer_id: golferId,
        golfer_name: golferName.trim(),
        member_number: golfer.member_number,
        ghin_number: golfer.ghin_number,
        total_rounds: totalRounds,
        posted_rounds: stats.posted,
        unexcused_no_post: stats.unexcused,
        excused_no_post: stats.excused,
        posting_percentage: postingPercentage,
        last_round_date: stats.rounds.length > 0 ? stats.rounds[0].date : null,
        recent_activity: recentActivity
      }
    })

    // Apply filters
    if (search) {
      const searchLower = search.toLowerCase()
      reportData = reportData.filter(golfer => 
        golfer.golfer_name.toLowerCase().includes(searchLower) ||
        golfer.member_number?.toLowerCase().includes(searchLower)
      )
    }

    if (minRounds) {
      const minRoundsNum = parseInt(minRounds)
      reportData = reportData.filter(golfer => golfer.total_rounds >= minRoundsNum)
    }

    // Sort by posting percentage (worst first) then by total rounds (most first)
    reportData.sort((a, b) => {
      if (a.posting_percentage !== b.posting_percentage) {
        return a.posting_percentage - b.posting_percentage
      }
      return b.total_rounds - a.total_rounds
    })

    // Handle CSV export
    if (format === 'csv') {
      const csvHeaders = [
        'Name',
        'Member Number',
        'GHIN Number',
        'Total Rounds',
        'Posted Rounds',
        'Unexcused No Post',
        'Excused No Post',
        'Posting Percentage',
        'Last Round Date'
      ]

      const csvRows = reportData.map(golfer => [
        golfer.golfer_name,
        golfer.member_number || '',
        golfer.ghin_number || '',
        golfer.total_rounds.toString(),
        golfer.posted_rounds.toString(),
        golfer.unexcused_no_post.toString(),
        golfer.excused_no_post.toString(),
        `${golfer.posting_percentage}%`,
        golfer.last_round_date || ''
      ])

      const csvContent = [csvHeaders, ...csvRows]
        .map(row => row.map(cell => `"${cell}"`).join(','))
        .join('\n')

      return new NextResponse(csvContent, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': 'attachment; filename="posting-history-report.csv"'
        }
      })
    }

    // Handle detailed CSV export with individual unexcused no post dates
    if (format === 'csv-detailed') {
      // First, determine the maximum number of unexcused dates any golfer has
      let maxUnexcusedDates = 0
      const golferUnexcusedData = new Map<string, string[]>()
      
      reportData.forEach(golfer => {
        const golferData = golferStats.get(golfer.golfer_id)
        if (golferData) {
          // Get all unexcused no post rounds
          const unexcusedRounds = golferData.rounds.filter(round => 
            round.posting_status === 'unexcused_no_post'
          )
          
          // Sort by date descending and extract just the dates
          const unexcusedDates = unexcusedRounds
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            .map(round => round.date)
          
          golferUnexcusedData.set(golfer.golfer_id, unexcusedDates)
          maxUnexcusedDates = Math.max(maxUnexcusedDates, unexcusedDates.length)
        }
      })

      // Create dynamic headers
      const csvHeaders = ['Name', 'Member Number']
      for (let i = 1; i <= maxUnexcusedDates; i++) {
        csvHeaders.push(`Unexcused Date ${i}`)
      }

      const csvRows: string[][] = []
      
      reportData.forEach(golfer => {
        const unexcusedDates = golferUnexcusedData.get(golfer.golfer_id) || []
        
        const row = [
          golfer.golfer_name,
          golfer.member_number || ''
        ]
        
        // Add all unexcused dates, padding with empty strings if needed
        for (let i = 0; i < maxUnexcusedDates; i++) {
          row.push(unexcusedDates[i] || '')
        }
        
        csvRows.push(row)
      })

      const csvContent = [csvHeaders, ...csvRows]
        .map(row => row.map(cell => `"${cell}"`).join(','))
        .join('\n')

      return new NextResponse(csvContent, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': 'attachment; filename="posting-history-detailed-report.csv"'
        }
      })
    }

    // Calculate summary statistics
    const totalGolfers = reportData.length
    const totalRounds = reportData.reduce((sum, golfer) => sum + golfer.total_rounds, 0)
    const totalPosted = reportData.reduce((sum, golfer) => sum + golfer.posted_rounds, 0)
    const totalUnexcused = reportData.reduce((sum, golfer) => sum + golfer.unexcused_no_post, 0)
    const overallPostingPercentage = totalPosted + totalUnexcused > 0 
      ? Math.round((totalPosted / (totalPosted + totalUnexcused)) * 100)
      : 0

    const poorPerformers = reportData.filter(g => g.posting_percentage < 80 && g.total_rounds >= 5).length
    const goodPerformers = reportData.filter(g => g.posting_percentage >= 90 && g.total_rounds >= 5).length

    return NextResponse.json({
      summary: {
        totalGolfers,
        totalRounds,
        totalPosted,
        totalUnexcused,
        overallPostingPercentage,
        poorPerformers,
        goodPerformers,
        dateRange: {
          startDate: startDate || 'All time',
          endDate: endDate || 'Present'
        }
      },
      golfers: reportData
    })

  } catch (error) {
    console.error('Error in GET /api/admin/reports/posting-history:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
} 