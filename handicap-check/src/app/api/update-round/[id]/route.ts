import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { posting_status, excuse_reason } = await request.json()

    const { data, error } = await supabase
      .from('tee_times')
      .update({
        posting_status,
        excuse_reason: posting_status === 'excused_no_post' ? excuse_reason : null,
        updated_at: new Date().toISOString()
      })
      .eq('id', params.id)
      .select()
      .single()

    if (error) {
      console.error('Error updating round:', error)
      return NextResponse.json(
        { error: 'Failed to update round', details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Unexpected error in update-round API:', error)
    return NextResponse.json(
      { error: 'Failed to update round', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
} 