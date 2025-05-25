import { NextResponse } from 'next/server'

export async function GET() {
  try {
    console.log('🧪 Testing cron job manually...')
    
    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'
    
    const response = await fetch(`${baseUrl}/api/cron/check-handicaps`, {
      headers: {
        'User-Agent': 'Manual-Test'
      }
    })
    
    const responseText = await response.text()
    let responseData
    
    try {
      responseData = JSON.parse(responseText)
    } catch {
      responseData = { rawResponse: responseText }
    }
    
    return NextResponse.json({
      success: response.ok,
      status: response.status,
      statusText: response.statusText,
      data: responseData,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Test cron failed:', error)
    return NextResponse.json({
      error: 'Test failed',
      details: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
} 