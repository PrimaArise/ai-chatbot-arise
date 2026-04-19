'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import toast, { Toaster } from 'react-hot-toast';
import { LogIn, Mail, Lock } from 'lucide-react';
import Link from 'next/link';

export default function LoginPage() {
    const router = useRouter();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
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

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        const { error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        setIsLoading(false);

        if (error) {
            toast.error(error.message);
            return;
        }

        toast.success("Login berhasil!");
        router.push('/chat');
    };

    return (
        <div className="flex min-h-screen bg-neutral-950 text-neutral-100 items-center justify-center p-4 font-sans">
            <Toaster position="top-center" toastOptions={{ style: { background: '#262626', color: '#fff', border: '1px solid #404040' } }} />
            
            <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 shadow-2xl rounded-3xl p-8 transition-all">
                <div className="text-center mb-8">
                    <h1 className="text-2xl font-bold text-white mb-2 tracking-tight">AI Chatbot Arise</h1>
                    <p className="text-neutral-400 text-sm">Selamat datang kembali! Silakan login untuk melanjutkan.</p>
                </div>

                <form onSubmit={handleLogin} className="space-y-5">
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
                                placeholder="••••••••"
                                onChange={(e) => setPassword(e.target.value)} 
                                className="w-full pl-10 p-3 bg-neutral-950 border border-neutral-800 rounded-xl text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-sm"
                            />
                        </div>
                    </div>

                    <button 
                        type="submit" 
                        disabled={isLoading || !email || !password}
                        className="w-full mt-6 bg-white hover:bg-neutral-200 text-black py-3 rounded-xl font-semibold text-sm transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed cursor-pointer"
                    >
                        {isLoading ? (
                            <div className="h-5 w-5 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
                        ) : (
                            <>
                                <LogIn size={18} />
                                Login
                            </>
                        )}
                    </button>
                </form>

                <p className="text-sm text-neutral-500 text-center mt-8">
                    Belum memiliki akun?{' '}
                    <Link href="/register" className="text-white hover:text-blue-400 font-medium transition-colors underline underline-offset-4 decoration-neutral-700 hover:decoration-blue-400">
                        Daftar sekarang
                    </Link>
                </p>
            </div>
        </div>
    );
}