import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const OTP_EXPIRE_MINUTES = 10;

// ============================================================
// POST /api/promote-request-register
// Dipakai saat REGISTRASI (belum login) — kirim OTP ke admin
// Body: { email: string }  ← email calon user yang mendaftar
// ============================================================
export async function POST(req: Request) {
    try {
        const body = await req.json() as { email?: string };
        const email = body.email?.trim().toLowerCase();

        if (!email) {
            return NextResponse.json({ error: 'Email tidak boleh kosong.' }, { status: 400 });
        }

        const adminEmail = process.env.ADMIN_INVITE_EMAIL;
        if (!adminEmail) {
            return NextResponse.json({ error: 'Konfigurasi admin email tidak ditemukan.' }, { status: 500 });
        }

        // Invalidate OTP lama untuk email ini (userId dipakai sebagai identifier sementara)
        await prisma.$executeRaw`
            UPDATE "PromoteToken" SET used = true
            WHERE "userId" = ${email} AND used = false
        `;

        // Generate OTP 6 digit
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + OTP_EXPIRE_MINUTES * 60 * 1000);

        // Simpan ke database (userId = email calon pendaftar sebagai identifier sementara)
        await prisma.$executeRaw`
            INSERT INTO "PromoteToken" (id, "userId", otp, "expiresAt", used, "createdAt")
            VALUES (gen_random_uuid()::text, ${email}, ${otp}, ${expiresAt}, false, NOW())
        `;

        // Kirim email ke admin
        const fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
        await resend.emails.send({
            from: fromEmail,
            to: adminEmail,
            subject: '🔐 Permintaan Daftar sebagai Admin — AI Arise',
            html: `
                <!DOCTYPE html>
                <html>
                <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0a0a0a; color: #e5e5e5; margin: 0; padding: 40px 20px;">
                    <div style="max-width: 480px; margin: 0 auto; background: #171717; border: 1px solid #262626; border-radius: 16px; padding: 32px;">
                        <div style="margin-bottom: 24px;">
                            <span style="background: #f59e0b22; border: 1px solid #f59e0b44; color: #fbbf24; padding: 4px 12px; border-radius: 999px; font-size: 12px; font-weight: 600;">REGISTRASI ADMIN</span>
                        </div>
                        <h1 style="font-size: 22px; font-weight: 700; margin: 0 0 8px; color: #fff;">Permintaan Daftar sebagai Admin</h1>
                        <p style="color: #737373; font-size: 14px; margin: 0 0 24px; line-height: 1.6;">
                            Email <strong style="color: #e5e5e5;">${email}</strong> sedang mendaftar dan meminta akses sebagai <strong style="color: #fbbf24;">Admin</strong> di sistem AI Arise.
                        </p>
                        <p style="color: #737373; font-size: 13px; margin: 0 0 16px;">Jika Anda menyetujui, berikan kode OTP berikut kepada calon admin tersebut:</p>
                        <div style="background: #0a0a0a; border: 1px solid #404040; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 24px;">
                            <div style="font-size: 36px; font-weight: 800; letter-spacing: 12px; color: #fbbf24; font-family: monospace;">${otp}</div>
                            <div style="font-size: 12px; color: #525252; margin-top: 8px;">Berlaku selama ${OTP_EXPIRE_MINUTES} menit</div>
                        </div>
                        <p style="color: #525252; font-size: 12px; margin: 0; line-height: 1.6;">
                            ⚠️ Jangan berikan kode ini jika Anda tidak mengenali pendaftar tersebut.<br>
                            Kode otomatis kedaluwarsa pada <strong>${expiresAt.toLocaleString('id-ID')}</strong>.
                        </p>
                    </div>
                </body>
                </html>
            `,
        });

        return NextResponse.json({
            success: true,
            message: `Kode OTP dikirim ke admin. Minta kode tersebut dan masukkan di bawah. Berlaku ${OTP_EXPIRE_MINUTES} menit.`,
        });
    } catch (error) {
        console.error('[POST /api/promote-request-register] Error:', error);
        return NextResponse.json({ error: 'Gagal mengirim OTP. Coba lagi.', detail: String(error) }, { status: 500 });
    }
}
