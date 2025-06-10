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

// GET - List all golfers
export async function GET(request: Request) {
  try {
    const isAdmin = await checkAdminPermission()
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')
    const findDuplicateGhin = searchParams.get('duplicateGhin') === 'true'
    const findDuplicateMember = searchParams.get('duplicateMember') === 'true'
    const missingEmail = searchParams.get('missingEmail') === 'true'
    const missingGhin = searchParams.get('missingGhin') === 'true'
    const missingMember = searchParams.get('missingMember') === 'true'

    // Handle missing data filters
    if (missingEmail) {
      const { data: missingEmailGolfers, error } = await supabase
        .from('golfers')
        .select('id, first_name, middle_name, last_name, suffix, email, gender, member_number, ghin_number, created_at, updated_at')
        .or('email.is.null,email.eq.')
        .order('last_name')
        .order('first_name')
        .limit(500) // Higher limit for missing data queries

      if (error) {
        console.error('Error fetching golfers with missing emails:', error)
        return NextResponse.json({ error: 'Failed to fetch golfers' }, { status: 500 })
      }

      return NextResponse.json(missingEmailGolfers)
    }

    if (missingGhin) {
      const { data: missingGhinGolfers, error } = await supabase
        .from('golfers')
        .select('id, first_name, middle_name, last_name, suffix, email, gender, member_number, ghin_number, created_at, updated_at')
        .or('ghin_number.is.null,ghin_number.eq.')
        .order('last_name')
        .order('first_name')
        .limit(500) // Higher limit for missing data queries

      if (error) {
        console.error('Error fetching golfers with missing GHIN numbers:', error)
        return NextResponse.json({ error: 'Failed to fetch golfers' }, { status: 500 })
      }

      return NextResponse.json(missingGhinGolfers)
    }

    if (missingMember) {
      const { data: missingMemberGolfers, error } = await supabase
        .from('golfers')
        .select('id, first_name, middle_name, last_name, suffix, email, gender, member_number, ghin_number, created_at, updated_at')
        .or('member_number.is.null,member_number.eq.')
        .order('last_name')
        .order('first_name')
        .limit(500) // Higher limit for missing data queries

      if (error) {
        console.error('Error fetching golfers with missing member numbers:', error)
        return NextResponse.json({ error: 'Failed to fetch golfers' }, { status: 500 })
      }

      return NextResponse.json(missingMemberGolfers)
    }

    // Handle duplicate detection
    if (findDuplicateGhin) {
      const { data: duplicates, error } = await supabase
        .from('golfers')
        .select('id, first_name, middle_name, last_name, suffix, email, gender, member_number, ghin_number, created_at, updated_at')
        .not('ghin_number', 'is', null)
        .neq('ghin_number', '')
        .order('ghin_number')
        .order('last_name')

      if (error) {
        console.error('Error fetching golfers for GHIN duplicates:', error)
        return NextResponse.json({ error: 'Failed to fetch golfers' }, { status: 500 })
      }

      // Group by GHIN number and filter for duplicates
      const ghinGroups = duplicates.reduce((acc: Record<string, typeof duplicates>, golfer) => {
        const ghin = golfer.ghin_number?.toString().trim()
        if (ghin) {
          if (!acc[ghin]) acc[ghin] = []
          acc[ghin].push(golfer)
        }
        return acc
      }, {})

      const duplicateGolfers = Object.values(ghinGroups)
        .filter(group => group.length > 1)
        .flat()

      return NextResponse.json(duplicateGolfers)
    }

    if (findDuplicateMember) {
      const { data: duplicates, error } = await supabase
        .from('golfers')
        .select('id, first_name, middle_name, last_name, suffix, email, gender, member_number, ghin_number, created_at, updated_at')
        .not('member_number', 'is', null)
        .neq('member_number', '')
        .order('member_number')
        .order('last_name')

      if (error) {
        console.error('Error fetching golfers for member number duplicates:', error)
        return NextResponse.json({ error: 'Failed to fetch golfers' }, { status: 500 })
      }

      // Group by member number and filter for duplicates
      const memberGroups = duplicates.reduce((acc: Record<string, typeof duplicates>, golfer) => {
        const memberNum = golfer.member_number?.toString().trim()
        if (memberNum) {
          if (!acc[memberNum]) acc[memberNum] = []
          acc[memberNum].push(golfer)
        }
        return acc
      }, {})

      const duplicateGolfers = Object.values(memberGroups)
        .filter(group => group.length > 1)
        .flat()

      return NextResponse.json(duplicateGolfers)
    }

    // Regular search functionality
    let query = supabase
      .from('golfers')
      .select('id, first_name, middle_name, last_name, suffix, email, gender, member_number, ghin_number, created_at, updated_at')

    if (search) {
      query = query.or(`first_name.ilike.%${search}%,middle_name.ilike.%${search}%,last_name.ilike.%${search}%,member_number.ilike.%${search}%,email.ilike.%${search}%`)
    }

    const { data: golfers, error } = await query
      .order('last_name')
      .order('first_name')
      .limit(100)

    if (error) {
      console.error('Error fetching golfers:', error)
      return NextResponse.json({ error: 'Failed to fetch golfers' }, { status: 500 })
    }

    return NextResponse.json(golfers)
  } catch (error) {
    console.error('Error in GET /api/admin/golfers:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST - Create new golfer
export async function POST(request: Request) {
  try {
    const isAdmin = await checkAdminPermission()
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const { first_name, middle_name, last_name, suffix, email, gender, member_number, ghin_number } = await request.json()

    if (!first_name || !last_name) {
      return NextResponse.json({ error: 'First name and last name are required' }, { status: 400 })
    }

    const golferData = {
      first_name: first_name.trim(),
      middle_name: middle_name?.trim() || null,
      last_name: last_name.trim(),
      suffix: suffix?.trim() || null,
      email: email?.trim() || null,
      gender: gender || null,
      member_number: member_number?.trim() || null,
      ghin_number: ghin_number?.trim() || null
    }

    const { data, error } = await supabase
      .from('golfers')
      .insert(golferData)
      .select()
      .single()

    if (error) {
      console.error('Error creating golfer:', error)
      return NextResponse.json({ error: 'Failed to create golfer' }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error in POST /api/admin/golfers:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT - Update golfer
export async function PUT(request: Request) {
  try {
    const isAdmin = await checkAdminPermission()
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const { id, first_name, middle_name, last_name, suffix, email, gender, member_number, ghin_number } = await request.json()

    if (!id) {
      return NextResponse.json({ error: 'Golfer ID is required' }, { status: 400 })
    }

    if (!first_name || !last_name) {
      return NextResponse.json({ error: 'First name and last name are required' }, { status: 400 })
    }

    const updateData = {
      first_name: first_name.trim(),
      middle_name: middle_name?.trim() || null,
      last_name: last_name.trim(),
      suffix: suffix?.trim() || null,
      email: email?.trim() || null,
      gender: gender || null,
      member_number: member_number?.trim() || null,
      ghin_number: ghin_number?.trim() || null
    }

    const { data, error } = await supabase
      .from('golfers')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating golfer:', error)
      return NextResponse.json({ error: 'Failed to update golfer' }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error in PUT /api/admin/golfers:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE - Delete golfer
export async function DELETE(request: Request) {
  try {
    const isAdmin = await checkAdminPermission()
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const { id } = await request.json()

    if (!id) {
      return NextResponse.json({ error: 'Golfer ID is required' }, { status: 400 })
    }

    const { error } = await supabase
      .from('golfers')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting golfer:', error)
      return NextResponse.json({ error: 'Failed to delete golfer' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in DELETE /api/admin/golfers:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
} 