import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

interface Golfer {
  id: string;
  first_name: string;
  middle_name?: string;
  last_name: string;
  suffix?: string;
}

interface TransformedGolfer {
  id: string;
  name: string;
}

// Log the environment variables (without the actual values)
console.log('Supabase URL exists:', !!process.env.NEXT_PUBLIC_SUPABASE_URL)
console.log('Service role key exists:', !!process.env.SUPABASE_SERVICE_ROLE_KEY)

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const query = searchParams.get('q')

  console.log('Search query:', query)

  if (!query) {
    return NextResponse.json([])
  }

  try {
    // First, check if we can connect to Supabase
    const { error: testError } = await supabase
      .from('golfers')
      .select('count')
      .limit(1)
      .maybeSingle()

    if (testError) {
      console.error('Supabase connection error:', testError)
      return NextResponse.json(
        { error: 'Database connection error', details: testError.message },
        { status: 500 }
      )
    }

    console.log('Supabase connection successful')

    const { data, error } = await supabase
      .from('golfers')
      .select('id, first_name, middle_name, last_name, suffix')
      .or(`first_name.ilike.%${query}%,middle_name.ilike.%${query}%,last_name.ilike.%${query}%,suffix.ilike.%${query}%`)
      .order('last_name')
      .limit(10)

    if (error) {
      console.error('Error searching golfers:', error)
      return NextResponse.json(
        { error: 'Search failed', details: error.message },
        { status: 500 }
      )
    }

    // Transform the data to match the expected interface
    const transformedData: TransformedGolfer[] = (data as Golfer[]).map(golfer => {
      const nameParts = [
        golfer.first_name,
        golfer.middle_name,
        golfer.last_name
      ].filter(Boolean) // Remove any null/undefined/empty parts
      
      const fullName = nameParts.join(' ') + (golfer.suffix ? ` ${golfer.suffix}` : '')
      
      return {
        id: golfer.id,
        name: fullName.trim()
      }
    })

    console.log('Search results:', transformedData)
    return NextResponse.json(transformedData)
  } catch (error) {
    console.error('Unexpected error in search-golfers API:', error)
    return NextResponse.json(
      { error: 'Unexpected error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
} 