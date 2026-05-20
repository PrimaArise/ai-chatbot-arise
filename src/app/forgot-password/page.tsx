'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import toast, { Toaster } from 'react-hot-toast';
import { Mail, ArrowLeft, Send } from 'lucide-react';
import Link from 'next/link';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSent, setIsSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setIsLoading(true);

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      // Setelah klik link di email, user akan diarahkan ke halaman ini
      // Token one-time cryptographic disematkan di URL hash oleh Supabase
      redirectTo: `${window.location.origin}/reset-password`,
    });

    setIsLoading(false);

    if (error) {
      toast.error(error.message || 'Gagal mengirim email. Coba lagi.');
      return;
    }

    setIsSent(true);
  };

  return (
    <div className="flex min-h-dvh bg-neutral-950 text-neutral-100 items-start sm:items-center justify-center p-4 font-sans overflow-y-auto">
      <Toaster position="top-center" toastOptions={{ style: { background: '#262626', color: '#fff', border: '1px solid #404040' } }} />

      <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 shadow-2xl rounded-3xl p-5 sm:p-8 my-4 transition-all">
        {/* Back to Login */}
        <Link href="/login" className="inline-flex items-center gap-2 text-sm text-neutral-500 hover:text-neutral-300 transition-colors mb-6 group">
          <ArrowLeft size={16} className="group-hover:-translate-x-0.5 transition-transform" />
          Kembali ke Login
        </Link>

        {isSent ? (
          // ── State: Email terkirim ──
          <div className="text-center py-4">
            <div className="w-16 h-16 rounded-full bg-green-500/10 border border-green-500/20 text-green-400 flex items-center justify-center mx-auto mb-5">
              <Mail size={28} />
            </div>
            <h1 className="text-xl font-bold text-white mb-2">Cek Email Kamu!</h1>
            <p className="text-neutral-400 text-sm leading-relaxed mb-4">
              Kami telah mengirimkan link reset password ke{' '}
              <span className="text-white font-medium">{email}</span>.
            </p>
            <p className="text-neutral-600 text-xs leading-relaxed">
              Link hanya berlaku <span className="text-neutral-400">1 jam</span> dan hanya bisa digunakan{' '}
              <span className="text-neutral-400">sekali</span>. Tidak ada email? Cek folder spam.
            </p>
            <button
              onClick={() => { setIsSent(false); setEmail(''); }}
              className="mt-6 text-sm text-blue-400 hover:text-blue-300 transition-colors underline underline-offset-4"
            >
              Kirim ulang ke email lain
            </button>
          </div>
        ) : (
          // ── State: Form input email ──
          <>
            <div className="mb-7">
              <h1 className="text-2xl font-bold text-white mb-2 tracking-tight">Lupa Password?</h1>
              <p className="text-neutral-400 text-sm leading-relaxed">
                Masukkan email akun kamu dan kami akan mengirimkan link untuk reset password.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
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
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 p-3 bg-neutral-950 border border-neutral-800 rounded-xl text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-sm"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading || !email.trim()}
                className="w-full mt-2 bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-700 disabled:text-neutral-500 text-white py-3 rounded-xl font-semibold text-sm transition-all shadow-lg flex items-center justify-center gap-2 disabled:cursor-not-allowed cursor-pointer"
              >
                {isLoading ? (
                  <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <Send size={16} />
                    Kirim Link Reset Password
                  </>
                )}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
