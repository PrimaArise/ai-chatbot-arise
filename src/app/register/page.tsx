'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import toast, { Toaster } from 'react-hot-toast';
import { UserPlus, Mail, Lock, Check, X } from 'lucide-react';
import Link from 'next/link';

export default function RegisterPage() {
    const router = useRouter();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
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

        const { error } = await supabase.auth.signUp({
            email,
            password,
        });

        setIsLoading(false);

        if (error) {
            toast.error(error.message);
            return;
        }

        toast.success('Pendaftaran berhasil! Silakan login sekarang.');
        setTimeout(() => {
            router.push('/login');
        }, 1500);
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
                    
                    <div className="space-y-1.5">
                        <label className="text-sm font-medium text-neutral-300">Password</label>
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-neutral-500">
                                <Lock size={18} />
                            </div>
                            <input 
                                type="password" 
                                required
                                minLength={10}
                                placeholder="Min. 10 karakter dg Angka & Kapital"
                                onChange={(e) => setPassword(e.target.value)} 
                                className="w-full pl-10 p-3 bg-neutral-950 border border-neutral-800 rounded-xl text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-sm"
                            />
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

                    <button 
                        type="submit" 
                        disabled={isLoading || !email || password.length < 10 || confirmPassword.length < 10}
                        className="w-full mt-6 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-semibold text-sm transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed border border-blue-500 cursor-pointer"
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