import { NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase-server';
import { getRateLimitStatus } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const supabase = await getSupabaseServer();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const status = getRateLimitStatus(user.id);
        return NextResponse.json(status);
    } catch (error) {
        console.error('GET /api/rate-limit error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
