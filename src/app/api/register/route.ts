import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { prisma } from '@/lib/prisma';

// ============================================================
// POST /api/register
// Body: { email, password }
// ============================================================
export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { email, password } = body as {
            email: string;
            password: string;
        };

        if (!email || !password) {
            return NextResponse.json({ error: 'Email dan password diperlukan.' }, { status: 400 });
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

        // 💾 Simpan user di Prisma
        await prisma.$executeRaw`
            INSERT INTO "User" (id, email, password, role, "createdAt")
            VALUES (${data.user.id}, ${data.user.email ?? email}, 'supabase-auth-managed', 'user', NOW())
            ON CONFLICT (id) DO NOTHING
        `;

        return NextResponse.json({
            success: true,
            message: '✅ Pendaftaran berhasil! Silakan login.',
        });
    } catch (error) {
        console.error('[POST /api/register] Error:', error);
        return NextResponse.json({ error: 'Terjadi kesalahan server.' }, { status: 500 });
    }
}
