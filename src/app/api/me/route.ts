import { NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase-server';
import { prisma } from '@/lib/prisma';

// ============================================================
// GET /api/me
// Mengembalikan data user yang sedang login: { id, email, role }
// ============================================================
export async function GET() {
    try {
        const supabase = await getSupabaseServer();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Ambil role dari tabel User kita (bukan dari Supabase Auth)
        const dbUsers = await prisma.$queryRaw<{ role: string }[]>`
            SELECT role FROM "User" WHERE id = ${user.id} LIMIT 1
        `;

        const role = dbUsers?.[0]?.role ?? 'user';

        return NextResponse.json({
            id: user.id,
            email: user.email,
            role,
        });
    } catch (error) {
        console.error('[GET /api/me] Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

// ============================================================
// PATCH /api/me
// Body: { targetRole: 'user' }
// Hanya untuk DEMOTE ke user — promote ke admin via /api/promote-request + /api/promote-verify
// ============================================================
export async function PATCH(req: Request) {
    try {
        const supabase = await getSupabaseServer();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await req.json() as { targetRole?: string };
        const { targetRole } = body;

        // Hanya izinkan demote ke 'user'
        if (targetRole !== 'user') {
            return NextResponse.json(
                { error: 'Untuk promote ke admin, gunakan fitur OTP melalui panel Role.' },
                { status: 400 }
            );
        }

        await prisma.$executeRaw`UPDATE "User" SET role = 'user' WHERE id = ${user.id}`;

        return NextResponse.json({
            success: true,
            role: 'user',
            message: '✅ Role berhasil diubah menjadi User.',
        });
    } catch (error) {
        console.error('[PATCH /api/me] Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
