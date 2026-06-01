'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import toast, { Toaster } from 'react-hot-toast';
import { UserPlus, Mail, Lock, Check, X, Eye, EyeOff } from 'lucide-react';
import Link from 'next/link';

export default function RegisterPage() {
    const router = useRouter();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);

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
            const res = await fetch('/api/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
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
        <div className="flex min-h-dvh bg-neutral-950 text-neutral-100 items-start sm:items-center justify-center p-4 font-sans overflow-y-auto">
            <Toaster position="top-center" toastOptions={{ style: { background: '#262626', color: '#fff', border: '1px solid #404040' } }} />

            <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 shadow-2xl rounded-3xl p-5 sm:p-8 my-4 transition-all">
                <div className="text-center mb-5 sm:mb-7">
                    <h1 className="text-xl sm:text-2xl font-bold text-white mb-1 tracking-tight">Buat Akun AI Arise</h1>
                    <p className="text-neutral-400 text-xs sm:text-sm">Daftar secara gratis dan mulai percakapan masa depan Anda.</p>
                </div>

                <form onSubmit={handleRegister} className="space-y-3 sm:space-y-4">
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
                        <div className="flex flex-row flex-wrap gap-x-3 gap-y-1 mt-1">
                            <div className={`flex items-center gap-1 text-[10px] sm:text-xs transition-colors ${password.length >= 10 ? 'text-green-500' : 'text-neutral-500'}`}>
                                {password.length >= 10 ? <Check size={11} /> : <X size={11} />}
                                <span>10+ karakter</span>
                            </div>
                            <div className={`flex items-center gap-1 text-[10px] sm:text-xs transition-colors ${/[0-9]/.test(password) ? 'text-green-500' : 'text-neutral-500'}`}>
                                {/[0-9]/.test(password) ? <Check size={11} /> : <X size={11} />}
                                <span>Angka</span>
                            </div>
                            <div className={`flex items-center gap-1 text-[10px] sm:text-xs transition-colors ${/[A-Z]/.test(password) ? 'text-green-500' : 'text-neutral-500'}`}>
                                {/[A-Z]/.test(password) ? <Check size={11} /> : <X size={11} />}
                                <span>Kapital</span>
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
                        <div className="flex items-center gap-1 mt-1 text-[10px] sm:text-xs transition-colors">
                            <span className={password.length > 0 && confirmPassword === password ? 'text-green-500' : 'text-neutral-500'}>
                                {password.length > 0 && confirmPassword === password ? <Check size={11} className="inline mr-1" /> : <X size={11} className="inline mr-1" />}
                                Password cocok
                            </span>
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading || !email || password.length < 10 || confirmPassword.length < 10}
                        className="w-full mt-2 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-semibold text-sm transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed border border-blue-500 cursor-pointer"
                    >
                        {isLoading ? (
                            <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        ) : (
                            <>
                                <UserPlus size={18} />
                                Daftar Sekarang
                            </>
                        )}
                    </button>
                </form>

                <p className="text-xs sm:text-sm text-neutral-500 text-center mt-5 sm:mt-7">
                    Sudah memiliki akun?{' '}
                    <Link href="/login" className="text-white hover:text-blue-400 font-medium transition-colors underline underline-offset-4 decoration-neutral-700 hover:decoration-blue-400">
                        Masuk di sini
                    </Link>
                </p>
            </div>
        </div>
    );
}