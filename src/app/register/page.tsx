'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import toast, { Toaster } from 'react-hot-toast';
import { UserPlus, Mail, Lock, Check, X, Shield, Eye, EyeOff } from 'lucide-react';
import Link from 'next/link';

export default function RegisterPage() {
    const router = useRouter();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    // ===== Admin OTP =====
    const [wantAdmin, setWantAdmin] = useState(false);
    const [otpSent, setOtpSent] = useState(false);
    const [otpCode, setOtpCode] = useState('');
    const [otpVerified, setOtpVerified] = useState(false);
    const [isSendingOtp, setIsSendingOtp] = useState(false);

    useEffect(() => {
        const checkAlreadyLoggedIn = async () => {
            const { data } = await supabase.auth.getUser();
            if (data.user) {
                router.push('/chat');
            }
        };
        checkAlreadyLoggedIn();
    }, [router]);

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();

        // Validasi: Minimal 10 karakter, harus mengandung huruf kapital dan angka
        const passwordRegex = /^(?=.*[0-9])(?=.*[A-Z]).{10,}$/;
        if (!passwordRegex.test(password)) {
            toast.error('Password minimal 10 karakter, harus mengandung angka dan huruf kapital!');
            return;
        }

        if (password !== confirmPassword) {
            toast.error('Password dan Konfirmasi Password tidak cocok!');
            return;
        }

        setIsLoading(true);

        try {
            // Daftar via server-side API (bukan langsung Supabase)
            // agar verifikasi admin email dilakukan di server (aman)
            const res = await fetch('/api/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password, otp: otpVerified ? otpCode : undefined }),
            });

            const result = await res.json();

            if (!res.ok) {
                toast.error(result.error || 'Pendaftaran gagal.');
                return;
            }

            toast.success(result.message || 'Pendaftaran berhasil! Silakan login.');
            setTimeout(() => {
                router.push('/login');
            }, 1500);
        } catch {
            toast.error('Gagal terhubung ke server. Coba lagi.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex min-h-screen bg-neutral-950 text-neutral-100 items-center justify-center p-4 font-sans">
            <Toaster position="top-center" toastOptions={{ style: { background: '#262626', color: '#fff', border: '1px solid #404040' } }} />

            <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 shadow-2xl rounded-3xl p-8 transition-all">
                <div className="text-center mb-8">
                    <h1 className="text-2xl font-bold text-white mb-2 tracking-tight">Buat Akun AI Arise</h1>
                    <p className="text-neutral-400 text-sm">Daftar secara gratis dan mulai percakapan masa depan Anda.</p>
                </div>

                <form onSubmit={handleRegister} className="space-y-5">
                    {/* Email */}
                    <div className="space-y-1.5">
                        <label className="text-sm font-medium text-neutral-300">Email Address</label>
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-neutral-500">
                                <Mail size={18} />
                            </div>
                            <input
                                type="email"
                                required
                                placeholder="nama@email.com"
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full pl-10 p-3 bg-neutral-950 border border-neutral-800 rounded-xl text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-sm"
                            />
                        </div>
                    </div>

                    {/* Password */}
                    <div className="space-y-1.5">
                        <label className="text-sm font-medium text-neutral-300">Password</label>
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-neutral-500">
                                <Lock size={18} />
                            </div>
                            <input
                                type={showPassword ? "text" : "password"}
                                required
                                minLength={10}
                                placeholder="Min. 10 karakter dg Angka & Kapital"
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full pl-10 pr-10 p-3 bg-neutral-950 border border-neutral-800 rounded-xl text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-sm"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute inset-y-0 right-0 pr-3 flex items-center text-neutral-500 hover:text-neutral-300 transition-colors cursor-pointer"
                            >
                                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                        {/* Indikator Validasi Password */}
                        <div className="flex flex-col gap-1.5 mt-2 pt-1">
                            <div className={`flex items-center gap-2 text-xs transition-colors ${password.length >= 10 ? 'text-green-500' : 'text-neutral-500'}`}>
                                {password.length >= 10 ? <Check size={14} /> : <X size={14} />}
                                <span>Minimal 10 karakter</span>
                            </div>
                            <div className={`flex items-center gap-2 text-xs transition-colors ${/[0-9]/.test(password) ? 'text-green-500' : 'text-neutral-500'}`}>
                                {/[0-9]/.test(password) ? <Check size={14} /> : <X size={14} />}
                                <span>Mengandung angka (0-9)</span>
                            </div>
                            <div className={`flex items-center gap-2 text-xs transition-colors ${/[A-Z]/.test(password) ? 'text-green-500' : 'text-neutral-500'}`}>
                                {/[A-Z]/.test(password) ? <Check size={14} /> : <X size={14} />}
                                <span>Mengandung huruf kapital (A-Z)</span>
                            </div>
                        </div>
                    </div>

                    {/* Konfirmasi Password */}
                    <div className="space-y-1.5">
                        <label className="text-sm font-medium text-neutral-300">Konfirmasi Password</label>
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-neutral-500">
                                <Lock size={18} />
                            </div>
                            <input
                                type="password"
                                required
                                minLength={10}
                                placeholder="Ulangi password Anda"
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                className="w-full pl-10 p-3 bg-neutral-950 border border-neutral-800 rounded-xl text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-sm"
                            />
                        </div>
                        {/* Indikator Password Match */}
                        <div className="flex flex-col gap-1.5 mt-2 pt-1">
                            <div className={`flex items-center gap-2 text-xs transition-colors ${password.length > 0 && confirmPassword === password ? 'text-green-500' : 'text-neutral-500'}`}>
                                {password.length > 0 && confirmPassword === password ? <Check size={14} /> : <X size={14} />}
                                <span>Password cocok</span>
                            </div>
                        </div>
                    </div>

                    {/* ─── Toggle Admin + OTP ─── */}
                    <div className={`rounded-xl border p-4 transition-all ${
                        wantAdmin ? 'border-amber-500/40 bg-amber-500/5' : 'border-neutral-800 bg-neutral-950/50'
                    }`}>
                        {/* Toggle */}
                        <button
                            type="button"
                            onClick={() => {
                                setWantAdmin(v => !v);
                                setOtpSent(false);
                                setOtpCode('');
                                setOtpVerified(false);
                            }}
                            className="flex items-center justify-between w-full cursor-pointer"
                        >
                            <div className="flex items-center gap-2.5">
                                <Shield size={16} className={wantAdmin ? 'text-amber-400' : 'text-neutral-500'} />
                                <span className={`text-sm font-medium ${wantAdmin ? 'text-amber-300' : 'text-neutral-400'}`}>
                                    Daftar sebagai Admin
                                </span>
                            </div>
                            <div className={`relative w-10 h-5 rounded-full transition-colors ${wantAdmin ? 'bg-amber-500' : 'bg-neutral-700'}`}>
                                <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${wantAdmin ? 'translate-x-5' : 'translate-x-0.5'}`} />
                            </div>
                        </button>

                        {wantAdmin && (
                            <div className="mt-3 pt-3 border-t border-amber-500/20 space-y-3">
                                {otpVerified ? (
                                    <div className="flex items-center gap-2 text-green-400 text-xs font-medium">
                                        <Check size={14} />
                                        OTP Terverifikasi — Anda akan terdaftar sebagai Admin
                                    </div>
                                ) : !otpSent ? (
                                    <>
                                        <p className="text-xs text-amber-400/80">
                                            Kirim permintaan ke admin. Kode OTP akan dikirim ke email pengelola sistem.
                                        </p>
                                        <button
                                            type="button"
                                            onClick={async () => {
                                                if (!email.trim()) { return; }
                                                setIsSendingOtp(true);
                                                const res = await fetch('/api/promote-request-register', {
                                                    method: 'POST',
                                                    headers: { 'Content-Type': 'application/json' },
                                                    body: JSON.stringify({ email }),
                                                });
                                                const result = await res.json();
                                                setIsSendingOtp(false);
                                                if (res.ok) { setOtpSent(true); toast.success('Kode OTP dikirim ke admin!'); }
                                                else { toast.error(result.error || 'Gagal mengirim OTP.'); }
                                            }}
                                            disabled={isSendingOtp || !email.trim()}
                                            className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 rounded-lg text-xs font-medium transition-all cursor-pointer disabled:opacity-50"
                                        >
                                            {isSendingOtp
                                                ? <div className="h-3 w-3 border border-amber-400 border-t-transparent rounded-full animate-spin" />
                                                : <Shield size={12} />}
                                            Kirim OTP ke Admin
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <p className="text-xs text-green-400">✅ OTP dikirim ke admin. Minta kodenya dan masukkan di bawah.</p>
                                        <input
                                            type="text"
                                            inputMode="numeric"
                                            maxLength={6}
                                            placeholder="Masukkan 6 digit kode..."
                                            value={otpCode}
                                            onChange={e => setOtpCode(e.target.value.replace(/\D/g, ''))}
                                            className="w-full px-3 py-2 bg-neutral-900 border border-neutral-700 focus:border-amber-500/50 rounded-lg text-sm text-center text-neutral-200 placeholder-neutral-600 outline-none transition-colors tracking-widest font-mono"
                                        />
                                        <div className="flex gap-2">
                                            <button
                                                type="button"
                                                onClick={() => { setOtpSent(false); setOtpCode(''); }}
                                                className="flex-1 py-2 px-3 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-neutral-400 rounded-lg text-xs transition-all cursor-pointer"
                                            >
                                                Kirim Ulang
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (otpCode.length === 6) {
                                                        setOtpVerified(true);
                                                        toast.success('Kode OTP diterima! Lanjutkan pendaftaran.');
                                                    } else {
                                                        toast.error('Kode harus 6 digit.');
                                                    }
                                                }}
                                                disabled={otpCode.length !== 6}
                                                className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 rounded-lg text-xs font-medium transition-all cursor-pointer disabled:opacity-50"
                                            >
                                                <Shield size={12} />
                                                Verifikasi
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading || !email || password.length < 10 || confirmPassword.length < 10 || (wantAdmin && !otpVerified)}
                        className="w-full mt-2 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-semibold text-sm transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed border border-blue-500 cursor-pointer"
                    >
                        {isLoading ? (
                            <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        ) : (
                            <>
                                {wantAdmin && otpVerified ? <Shield size={18} className="text-amber-300" /> : <UserPlus size={18} />}
                                {wantAdmin && otpVerified ? 'Daftar sebagai Admin' : 'Daftar Sekarang'}
                            </>
                        )}
                    </button>
                </form>

                <p className="text-sm text-neutral-500 text-center mt-8">
                    Sudah memiliki akun?{' '}
                    <Link href="/login" className="text-white hover:text-blue-400 font-medium transition-colors underline underline-offset-4 decoration-neutral-700 hover:decoration-blue-400">
                        Masuk di sini
                    </Link>
                </p>
            </div>
        </div>
    );
}