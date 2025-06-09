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

// GET - List all users
export async function GET() {
  try {
    const isAdmin = await checkAdminPermission()
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const { data: users, error } = await supabase
      .from('users')
      .select('id, email, name, is_admin, is_approved, created_at, updated_at')
      .order('email')

    if (error) {
      console.error('Error fetching users:', error)
      return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
    }

    return NextResponse.json(users)
  } catch (error) {
    console.error('Error in GET /api/admin/users:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT - Update user permissions
export async function PUT(request: Request) {
  try {
    const isAdmin = await checkAdminPermission()
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const { id, is_admin, is_approved } = await request.json()

    if (!id) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 })
    }

    const updateData: { is_admin?: boolean; is_approved?: boolean } = {}
    if (typeof is_admin === 'boolean') updateData.is_admin = is_admin
    if (typeof is_approved === 'boolean') updateData.is_approved = is_approved

    const { data, error } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating user:', error)
      return NextResponse.json({ error: 'Failed to update user' }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error in PUT /api/admin/users:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE - Delete user
export async function DELETE(request: Request) {
  try {
    const isAdmin = await checkAdminPermission()
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const { id } = await request.json()

    if (!id) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 })
    }

    const { error } = await supabase
      .from('users')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting user:', error)
      return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in DELETE /api/admin/users:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
} 