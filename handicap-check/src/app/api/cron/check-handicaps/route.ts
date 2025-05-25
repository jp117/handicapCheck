import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'
    
    // Step 1: Get MTech data and process tee times
    console.log('📊 Fetching MTech data...')
    const mtechResponse = await fetch(`${baseUrl}/api/cron/check-handicaps/mtech`)
    if (!mtechResponse.ok) {
      throw new Error('MTech data fetch failed')
    }
    const mtechData = await mtechResponse.json()
    
    // Step 2: Get USGA posts from Gmail
    console.log('📧 Fetching USGA posts...')
    let postedGHINs: string[] = []
    try {
      const usgaResponse = await fetch(`${baseUrl}/api/cron/check-handicaps/usga`)
      if (usgaResponse.ok) {
        const usgaData = await usgaResponse.json()
        postedGHINs = usgaData.postedGHINs || []
      } else {
        console.warn('USGA fetch failed, continuing without posted GHINs')
      }
    } catch (error) {
      console.warn('USGA fetch error, continuing without posted GHINs:', error)
    }
    
    // Step 3: Process database operations and send email
    console.log('💾 Processing database and sending email...')
    const processResponse = await fetch(`${baseUrl}/api/cron/check-handicaps/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        postedGHINs,
        date: mtechData.date
      })
    })
    
    if (!processResponse.ok) {
      throw new Error('Database processing failed')
    }
    const processData = await processResponse.json()

    return NextResponse.json({ 
      success: true,
      steps: {
        mtech: { success: true, teeTimes: mtechData.teeTimes?.length || 0, soloPlayers: mtechData.soloPlayers?.length || 0 },
        usga: { success: postedGHINs.length >= 0, postedCount: postedGHINs.length },
        process: { success: true, menNoPost: processData.menNoPost, womenNoPost: processData.womenNoPost, emailSent: processData.emailSent }
      },
      date: mtechData.date
    })
  } catch (error) {
    console.error('Error running handicap check:', error)
    return NextResponse.json({ 
      error: 'Failed to run handicap check',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
} 