import { NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase-server';
import { prisma } from '@/lib/prisma';

// ============================================================
// POST /api/promote-verify
// Verifikasi OTP dan promote user ke admin
// Body: { otp: string }
// ============================================================
export async function POST(req: Request) {
    try {
        const supabase = await getSupabaseServer();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await req.json() as { otp?: string };
        const otp = body.otp?.trim();

        if (!otp || otp.length !== 6) {
            return NextResponse.json({ error: 'Kode OTP harus 6 digit.' }, { status: 400 });
        }

        // Cari token valid: userId cocok, OTP cocok, belum dipakai, belum expired
        const tokens = await prisma.$queryRaw<{ id: string; expiresAt: Date }[]>`
            SELECT id, "expiresAt" FROM "PromoteToken"
            WHERE "userId" = ${user.id}
              AND otp = ${otp}
              AND used = false
              AND "expiresAt" > NOW()
            ORDER BY "createdAt" DESC
            LIMIT 1
        `;

        if (!tokens || tokens.length === 0) {
            return NextResponse.json({
                error: 'Kode OTP tidak valid atau sudah kedaluwarsa. Minta kode baru.',
            }, { status: 403 });
        }

        const tokenId = tokens[0].id;

        // Tandai token sebagai sudah dipakai
        await prisma.$executeRaw`
            UPDATE "PromoteToken" SET used = true WHERE id = ${tokenId}
        `;

        // Promote user ke admin
        await prisma.$executeRaw`
            UPDATE "User" SET role = 'admin' WHERE id = ${user.id}
        `;

        return NextResponse.json({
            success: true,
            role: 'admin',
            message: '✅ Selamat! Anda sekarang menjadi Admin.',
        });
    } catch (error) {
        console.error('[POST /api/promote-verify] Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
