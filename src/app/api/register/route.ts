import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { prisma } from '@/lib/prisma';

// ============================================================
// POST /api/register
// Body: { email, password, otp? }
// - Tanpa otp → role: user
// - Dengan otp valid → role: admin (setelah verifikasi OTP)
// - Email = ADMIN_INVITE_EMAIL → auto admin (untuk owner)
// ============================================================
export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { email, password, otp } = body as {
            email: string;
            password: string;
            otp?: string;
        };

        if (!email || !password) {
            return NextResponse.json({ error: 'Email dan password diperlukan.' }, { status: 400 });
        }

        // 🛡️ Tentukan role
        let role = 'user';
        const adminEmail = process.env.ADMIN_INVITE_EMAIL?.trim().toLowerCase();

        if (adminEmail && email.trim().toLowerCase() === adminEmail) {
            // Owner/pemilik sistem → otomatis admin
            role = 'admin';
        } else if (otp?.trim()) {
            // Ada OTP → verifikasi terhadap PromoteToken (userId = email pendaftar)
            const emailKey = email.trim().toLowerCase();
            const tokens = await prisma.$queryRaw<{ id: string }[]>`
                SELECT id FROM "PromoteToken"
                WHERE "userId" = ${emailKey}
                  AND otp = ${otp.trim()}
                  AND used = false
                  AND "expiresAt" > NOW()
                ORDER BY "createdAt" DESC
                LIMIT 1
            `;

            if (!tokens || tokens.length === 0) {
                return NextResponse.json({
                    error: 'Kode OTP tidak valid atau sudah kedaluwarsa. Minta kode baru dari admin.',
                }, { status: 403 });
            }

            // Tandai token terpakai
            await prisma.$executeRaw`
                UPDATE "PromoteToken" SET used = true WHERE id = ${tokens[0].id}
            `;
            role = 'admin';
        }

        // 📝 Daftarkan user via Supabase Auth (server-side, anon key)
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );

        const { data, error } = await supabase.auth.signUp({ email, password });

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 400 });
        }

        if (!data.user) {
            return NextResponse.json({ error: 'Pendaftaran gagal — user tidak ditemukan.' }, { status: 400 });
        }

        // 💾 Simpan user di Prisma dengan role yang sesuai
        await prisma.$executeRaw`
            INSERT INTO "User" (id, email, password, role, "createdAt")
            VALUES (${data.user.id}, ${data.user.email ?? email}, 'supabase-auth-managed', ${role}, NOW())
            ON CONFLICT (id) DO UPDATE SET role = ${role}
        `;

        return NextResponse.json({
            success: true,
            role,
            message: role === 'admin'
                ? '✅ Pendaftaran admin berhasil! Silakan login.'
                : '✅ Pendaftaran berhasil! Silakan login.',
        });
    } catch (error) {
        console.error('[POST /api/register] Error:', error);
        return NextResponse.json({ error: 'Terjadi kesalahan server.' }, { status: 500 });
    }
}
