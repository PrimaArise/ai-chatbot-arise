import { NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase-server';
import { prisma } from '@/lib/prisma';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const OTP_EXPIRE_MINUTES = 10;

// ============================================================
// POST /api/promote-request
// Membuat OTP 6 digit dan mengirim email ke ADMIN_INVITE_EMAIL
// ============================================================
export async function POST() {
    try {
        const supabase = await getSupabaseServer();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        // Cek apakah sudah admin
        const roleRows = await prisma.$queryRaw<{ role: string }[]>`
            SELECT role FROM "User" WHERE id = ${user.id} LIMIT 1
        `;
        if (roleRows?.[0]?.role === 'admin') {
            return NextResponse.json({ error: 'Anda sudah menjadi admin.' }, { status: 400 });
        }

        const adminEmail = process.env.ADMIN_INVITE_EMAIL;
        if (!adminEmail) {
            return NextResponse.json({ error: 'Konfigurasi admin email tidak ditemukan.' }, { status: 500 });
        }

        // Invalidate semua OTP lama untuk user ini
        await prisma.$executeRaw`
            UPDATE "PromoteToken" SET used = true
            WHERE "userId" = ${user.id} AND used = false
        `;

        // Generate OTP 6 digit
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + OTP_EXPIRE_MINUTES * 60 * 1000);

        // Simpan ke database
        await prisma.$executeRaw`
            INSERT INTO "PromoteToken" (id, "userId", otp, "expiresAt", used, "createdAt")
            VALUES (gen_random_uuid()::text, ${user.id}, ${otp}, ${expiresAt}, false, NOW())
        `;

        // Kirim email ke admin
        const fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
        await resend.emails.send({
            from: fromEmail,
            to: adminEmail,
            subject: '🔐 Permintaan Promosi ke Admin — AI Arise',
            html: `
                <!DOCTYPE html>
                <html>
                <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0a0a0a; color: #e5e5e5; margin: 0; padding: 40px 20px;">
                    <div style="max-width: 480px; margin: 0 auto; background: #171717; border: 1px solid #262626; border-radius: 16px; padding: 32px;">
                        <div style="margin-bottom: 24px;">
                            <span style="background: #f59e0b22; border: 1px solid #f59e0b44; color: #fbbf24; padding: 4px 12px; border-radius: 999px; font-size: 12px; font-weight: 600;">PERMINTAAN ADMIN</span>
                        </div>
                        <h1 style="font-size: 22px; font-weight: 700; margin: 0 0 8px; color: #fff;">Permintaan Promosi ke Admin</h1>
                        <p style="color: #737373; font-size: 14px; margin: 0 0 24px; line-height: 1.6;">
                            Akun <strong style="color: #e5e5e5;">${user.email}</strong> meminta untuk dipromosikan menjadi <strong style="color: #fbbf24;">Admin</strong> di sistem AI Arise.
                        </p>
                        <p style="color: #737373; font-size: 13px; margin: 0 0 16px;">Jika Anda menyetujui permintaan ini, berikan kode OTP berikut kepada pengguna tersebut:</p>
                        <div style="background: #0a0a0a; border: 1px solid #404040; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 24px;">
                            <div style="font-size: 36px; font-weight: 800; letter-spacing: 12px; color: #fbbf24; font-family: monospace;">${otp}</div>
                            <div style="font-size: 12px; color: #525252; margin-top: 8px;">Berlaku selama ${OTP_EXPIRE_MINUTES} menit</div>
                        </div>
                        <p style="color: #525252; font-size: 12px; margin: 0; line-height: 1.6;">
                            ⚠️ Jangan berikan kode ini jika Anda tidak mengenali pengguna tersebut.<br>
                            Kode akan otomatis kedaluwarsa pada <strong>${expiresAt.toLocaleString('id-ID')}</strong>.
                        </p>
                    </div>
                </body>
                </html>
            `,
        });

        return NextResponse.json({
            success: true,
            message: `Kode OTP telah dikirim ke email admin. Minta kode tersebut dan masukkan di bawah. Berlaku ${OTP_EXPIRE_MINUTES} menit.`,
        });
    } catch (error) {
        console.error('[POST /api/promote-request] Error:', error);
        return NextResponse.json({ error: 'Gagal mengirim email OTP. Coba lagi.', detail: String(error) }, { status: 500 });
    }
}
