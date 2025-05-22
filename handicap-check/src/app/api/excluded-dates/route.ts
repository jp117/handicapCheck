import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET: List all excluded dates/times
export async function GET() {
  const { data, error } = await supabase
    .from('excluded_dates')
    .select('*')
    .order('date', { ascending: true })
    .order('start_time', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST: Add a new exclusion
export async function POST(req: Request) {
  const body = await req.json()
  const { date, start_time, end_time, reason } = body
  if (!date) return NextResponse.json({ error: 'Date is required' }, { status: 400 })
  const { data, error } = await supabase
    .from('excluded_dates')
    .insert([{ date, start_time, end_time, reason }])
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE: Remove an exclusion by id
export async function DELETE(req: Request) {
  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 })
  const { error } = await supabase
    .from('excluded_dates')
    .delete()
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
} 