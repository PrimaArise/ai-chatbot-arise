'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import toast, { Toaster } from 'react-hot-toast';
import { Lock, Eye, EyeOff, CheckCircle, AlertTriangle } from 'lucide-react';
import { useRouter } from 'next/navigation';

type PageState = 'verifying' | 'valid' | 'invalid' | 'success';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [pageState, setPageState] = useState<PageState>('verifying');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Supabase menyematkan token di URL hash: #access_token=xxx&type=recovery
    // onAuthStateChange akan mendeteksi event PASSWORD_RECOVERY secara otomatis
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        // Token valid — tampilkan form
        setPageState('valid');
      } else if (event === 'SIGNED_IN') {
        // Bisa masuk jika sudah login sebelumnya
        setPageState('valid');
      }
    });

    // Fallback: jika tidak ada token hash, tandai invalid setelah 3 detik
    const timeout = setTimeout(() => {
      setPageState(prev => prev === 'verifying' ? 'invalid' : prev);
    }, 3000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password.length < 8) {
      toast.error('Password minimal 8 karakter');
      return;
    }
    if (password !== confirmPassword) {
      toast.error('Password tidak sama');
      return;
    }

    setIsLoading(true);

    // Update password via Supabase — token sudah diverifikasi di session
    const { error } = await supabase.auth.updateUser({ password });

    setIsLoading(false);

    if (error) {
      toast.error(error.message || 'Gagal memperbarui password');
      return;
    }

    setPageState('success');
    // Auto redirect ke login setelah 3 detik
    setTimeout(() => router.push('/login'), 3000);
  };

  // ── State: Sedang memverifikasi token ──
  if (pageState === 'verifying') {
    return (
      <div className="flex min-h-screen bg-neutral-950 text-neutral-100 items-center justify-center p-4">
        <div className="text-center">
          <div className="h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-neutral-400 text-sm">Memverifikasi link reset password...</p>
        </div>
      </div>
    );
  }

  // ── State: Token tidak valid / kadaluarsa / tidak ada ──
  if (pageState === 'invalid') {
    return (
      <div className="flex min-h-dvh bg-neutral-950 text-neutral-100 items-center justify-center p-4 font-sans">
        <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 shadow-2xl rounded-3xl p-5 sm:p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center mx-auto mb-5">
            <AlertTriangle size={28} />
          </div>
          <h1 className="text-xl font-bold text-white mb-2">Link Tidak Valid</h1>
          <p className="text-neutral-400 text-sm leading-relaxed mb-6">
            Link reset password ini sudah <span className="text-neutral-200">kadaluarsa</span> atau sudah pernah digunakan.
            Silakan minta link baru.
          </p>
          <button
            onClick={() => router.push('/forgot-password')}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-xl font-semibold text-sm transition-all cursor-pointer"
          >
            Minta Link Baru
          </button>
        </div>
      </div>
    );
  }

  // ── State: Berhasil ganti password ──
  if (pageState === 'success') {
    return (
      <div className="flex min-h-dvh bg-neutral-950 text-neutral-100 items-center justify-center p-4 font-sans">
        <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 shadow-2xl rounded-3xl p-5 sm:p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-green-500/10 border border-green-500/20 text-green-400 flex items-center justify-center mx-auto mb-5">
            <CheckCircle size={28} />
          </div>
          <h1 className="text-xl font-bold text-white mb-2">Password Berhasil Diubah!</h1>
          <p className="text-neutral-400 text-sm leading-relaxed">
            Kamu akan diarahkan ke halaman login dalam beberapa detik...
          </p>
          <div className="mt-4 h-1 bg-neutral-800 rounded-full overflow-hidden">
            <div className="h-full bg-green-500 rounded-full animate-[width_3s_ease-in-out]" style={{ animation: 'progress 3s linear forwards' }} />
          </div>
        </div>
      </div>
    );
  }

  // ── State: Form ganti password (token valid) ──
  return (
    <div className="flex min-h-dvh bg-neutral-950 text-neutral-100 items-start sm:items-center justify-center p-4 font-sans overflow-y-auto">
      <Toaster position="top-center" toastOptions={{ style: { background: '#262626', color: '#fff', border: '1px solid #404040' } }} />

      <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 shadow-2xl rounded-3xl p-5 sm:p-8 my-4">
        <div className="mb-5 sm:mb-7">
          <h1 className="text-xl sm:text-2xl font-bold text-white mb-1 tracking-tight">Buat Password Baru</h1>
          <p className="text-neutral-400 text-xs sm:text-sm leading-relaxed">
            Masukkan password baru kamu. Minimal 8 karakter.
          </p>
        </div>

        <form onSubmit={handleReset} className="space-y-5">
          {/* Password Baru */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-neutral-300">Password Baru</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-neutral-500">
                <Lock size={18} />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                required
                minLength={8}
                placeholder="Minimal 8 karakter"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-10 p-3 bg-neutral-950 border border-neutral-800 rounded-xl text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-sm"
              />
              <button type="button" onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-neutral-500 hover:text-neutral-300 cursor-pointer">
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {/* Password strength indicator */}
            {password.length > 0 && (
              <div className="flex gap-1 mt-1">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${
                    password.length >= [8, 10, 12, 16][i]
                      ? ['bg-red-500', 'bg-yellow-500', 'bg-blue-500', 'bg-green-500'][i]
                      : 'bg-neutral-800'
                  }`} />
                ))}
              </div>
            )}
          </div>

          {/* Konfirmasi Password */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-neutral-300">Konfirmasi Password</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-neutral-500">
                <Lock size={18} />
              </div>
              <input
                type={showConfirm ? 'text' : 'password'}
                required
                placeholder="Ulangi password baru"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={`w-full pl-10 pr-10 p-3 bg-neutral-950 border rounded-xl text-neutral-100 placeholder-neutral-600 focus:outline-none focus:ring-1 transition-all text-sm ${
                  confirmPassword && confirmPassword !== password
                    ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
                    : confirmPassword && confirmPassword === password
                    ? 'border-green-500 focus:border-green-500 focus:ring-green-500'
                    : 'border-neutral-800 focus:border-blue-500 focus:ring-blue-500'
                }`}
              />
              <button type="button" onClick={() => setShowConfirm(!showConfirm)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-neutral-500 hover:text-neutral-300 cursor-pointer">
                {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {confirmPassword && confirmPassword !== password && (
              <p className="text-xs text-red-400">Password tidak sama</p>
            )}
          </div>

          <button
            type="submit"
            disabled={isLoading || password.length < 8 || password !== confirmPassword}
            className="w-full mt-2 bg-white hover:bg-neutral-200 text-black py-3 rounded-xl font-semibold text-sm transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {isLoading ? (
              <div className="h-5 w-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <Lock size={16} />
                Simpan Password Baru
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
