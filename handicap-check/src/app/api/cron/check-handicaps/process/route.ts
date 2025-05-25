import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import nodemailer from 'nodemailer'

interface NoPostPlayer {
  name: string;
  memberNumber: string;
  [key: string]: unknown;
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function sendNoPostEmail(menNoPost: NoPostPlayer[], womenNoPost: NoPostPlayer[], date: string) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD
    }
  })

  const menReport = menNoPost.map(p => `${p.name} (${p.memberNumber})`).join('\n')
  const womenReport = womenNoPost.map(p => `${p.name} (${p.memberNumber})`).join('\n')

  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: 'john.paradise117@gmail.com',
    subject: `Non-Posters for ${date}`,
    text: `Men who did not post:\n${menReport}\n\nWomen who did not post:\n${womenReport}`
  })
}

export async function POST(request: Request) {
  try {
    const { postedGHINs, date } = await request.json()
    
    if (!date) {
      return NextResponse.json({ error: 'Date is required' }, { status: 400 })
    }

    // 1. Query database for non-posters
    const { data: menNoPost, error: menError } = await supabase
      .from('tee_times')
      .select('*')
      .eq('date', date)
      .eq('status', 'pending')
      .not('ghin_number', 'in', postedGHINs.length > 0 ? postedGHINs : [''])
      .eq('gender', 'M')

    const { data: womenNoPost, error: womenError } = await supabase
      .from('tee_times')
      .select('*')
      .eq('date', date)
      .eq('status', 'pending')
      .not('ghin_number', 'in', postedGHINs.length > 0 ? postedGHINs : [''])
      .eq('gender', 'F')

    if (menError || womenError) {
      throw new Error('Failed to fetch no-post data')
    }

    // 2. Send email with results
    await sendNoPostEmail(
      menNoPost as NoPostPlayer[], 
      womenNoPost as NoPostPlayer[], 
      date
    )

    return NextResponse.json({ 
      success: true,
      menNoPost: menNoPost?.length || 0,
      womenNoPost: womenNoPost?.length || 0,
      emailSent: true
    })
  } catch (error) {
    console.error('Error processing handicap check:', error)
    return NextResponse.json({ error: 'Failed to process handicap check' }, { status: 500 })
  }
} 