import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    let date = searchParams.get('date')
    
    // Default to today if no date provided
    if (!date) {
      const today = new Date()
      date = today.toISOString().slice(0, 10)
    }

    console.log(`Starting orchestrated load-old-data for date: ${date}`)

    // Get the base URL for internal API calls
    const baseUrl = process.env.NEXTAUTH_URL || `https://${process.env.VERCEL_URL}` || 'http://localhost:3000'

    let mtechData, usgaData, finalResult;

    try {
      // Step 1: Fetch MTech tee time data
      console.log('Step 1: Fetching MTech data...')
      const mtechResponse = await fetch(`${baseUrl}/api/load-old-data/mtech?date=${date}`)
      if (!mtechResponse.ok) {
        throw new Error(`MTech step failed: ${mtechResponse.status} ${mtechResponse.statusText}`)
      }
      mtechData = await mtechResponse.json()
      
      if (!mtechData.success) {
        throw new Error(`MTech step failed: ${mtechData.error}`)
      }
      
      console.log(`Step 1 complete: Found ${mtechData.totalTeeTimes} tee times`)
      
    } catch (error) {
      console.error('Step 1 (MTech) failed:', error)
      return NextResponse.json({
        error: 'Failed to fetch tee time data',
        step: 'mtech',
        details: error instanceof Error ? error.message : 'Unknown error'
      }, { status: 500 })
    }

    try {
      // Step 2: Fetch USGA posted data
      console.log('Step 2: Fetching USGA posts...')
      const usgaResponse = await fetch(`${baseUrl}/api/load-old-data/usga?date=${date}`)
      if (!usgaResponse.ok) {
        throw new Error(`USGA step failed: ${usgaResponse.status} ${usgaResponse.statusText}`)
      }
      usgaData = await usgaResponse.json()
      
      if (!usgaData.success) {
        console.warn('USGA step had issues, continuing with empty posted list:', usgaData.error)
        usgaData = { success: true, postedGHINs: [], totalPosted: 0 }
      }
      
      console.log(`Step 2 complete: Found ${usgaData.totalPosted} posted GHIN numbers`)
      
    } catch (error) {
      console.warn('Step 2 (USGA) failed, continuing without posted data:', error)
      // Don't fail the entire process if USGA data unavailable
      usgaData = { success: true, postedGHINs: [], totalPosted: 0 }
    }

    try {
      // Step 3: Process and insert data
      console.log('Step 3: Processing and inserting tee times...')
      const processResponse = await fetch(`${baseUrl}/api/load-old-data/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teeTimes: mtechData.teeTimes,
          teeTimeGroups: mtechData.teeTimeGroups,
          postedGHINs: usgaData.postedGHINs,
          date: date
        })
      })
      
      if (!processResponse.ok) {
        throw new Error(`Process step failed: ${processResponse.status} ${processResponse.statusText}`)
      }
      
      finalResult = await processResponse.json()
      
      if (!finalResult.success) {
        throw new Error(`Process step failed: ${finalResult.error}`)
      }
      
      console.log(`Step 3 complete: Inserted ${finalResult.stats.inserted} tee times`)
      
    } catch (error) {
      console.error('Step 3 (Process) failed:', error)
      return NextResponse.json({
        error: 'Failed to process and insert data',
        step: 'process',
        details: error instanceof Error ? error.message : 'Unknown error',
        partialData: {
          mtechTeeTimes: mtechData?.totalTeeTimes || 0,
          usgaPosts: usgaData?.totalPosted || 0
        }
      }, { status: 500 })
    }

    // Success! Return comprehensive results
    console.log(`Orchestration complete for ${date}`)
    
    return NextResponse.json({
      success: true,
      date,
      steps: {
        mtech: { success: true, teeTimes: mtechData.totalTeeTimes },
        usga: { success: true, posts: usgaData.totalPosted },
        process: { success: true, inserted: finalResult.stats.inserted }
      },
      stats: finalResult.stats,
      unmatched: finalResult.unmatched
    })

  } catch (error) {
    console.error('Orchestration error:', error)
    return NextResponse.json(
      { 
        error: 'Orchestration failed', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    )
  }
}