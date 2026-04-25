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
// Body: { targetRole: 'admin'|'user', verifyEmail?: string }
// - Demote ke 'user' : tidak perlu verifikasi
// - Promote ke 'admin': harus cocok dengan ADMIN_INVITE_EMAIL
// ============================================================
export async function PATCH(req: Request) {
    try {
        const supabase = await getSupabaseServer();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await req.json() as { targetRole?: string; verifyEmail?: string };
        const { targetRole, verifyEmail } = body;

        if (targetRole !== 'admin' && targetRole !== 'user') {
            return NextResponse.json({ error: 'targetRole harus "admin" atau "user".' }, { status: 400 });
        }

        // Promote ke admin: wajib verifikasi email
        if (targetRole === 'admin') {
            const validEmail = process.env.ADMIN_INVITE_EMAIL;
            if (!validEmail || verifyEmail?.trim() !== validEmail.trim()) {
                return NextResponse.json({ error: 'Email verifikasi admin tidak valid.' }, { status: 403 });
            }
        }

        // Update role di database
        await prisma.$executeRaw`UPDATE "User" SET role = ${targetRole} WHERE id = ${user.id}`;

        return NextResponse.json({
            success: true,
            role: targetRole,
            message: targetRole === 'admin'
                ? '✅ Role berhasil diubah menjadi Admin.'
                : '✅ Role berhasil diubah menjadi User.',
        });
    } catch (error) {
        console.error('[PATCH /api/me] Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
