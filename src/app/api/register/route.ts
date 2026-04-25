import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { prisma } from '@/lib/prisma';

// ============================================================
// POST /api/register
// Body: { email, password, isAdmin?, adminVerifyEmail? }
// ============================================================
export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { email, password, isAdmin, adminVerifyEmail } = body as {
            email: string;
            password: string;
            isAdmin?: boolean;
            adminVerifyEmail?: string;
        };

        if (!email || !password) {
            return NextResponse.json({ error: 'Email dan password diperlukan.' }, { status: 400 });
        }

        // 🛡️ Validasi admin: cek email verifikasi terhadap env var
        let role = 'user';
        if (isAdmin) {
            const validAdminEmail = process.env.ADMIN_INVITE_EMAIL;
            if (!validAdminEmail || adminVerifyEmail?.trim() !== validAdminEmail.trim()) {
                return NextResponse.json({
                    error: 'Email verifikasi admin tidak valid. Akses ditolak.',
                }, { status: 403 });
            }
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
