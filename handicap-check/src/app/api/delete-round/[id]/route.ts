import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function DELETE(request: any, { params }: any) {
  const { id } = params;
  if (!id) {
    return NextResponse.json({ error: 'Missing round ID' }, { status: 400 });
  }
  const { error } = await supabase
    .from('tee_times')
    .delete()
    .eq('id', id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
} 