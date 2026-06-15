'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Halaman ini berfungsi sebagai redirect otomatis ke /chat.
// Akses ke /dashboard akan langsung diarahkan tanpa menampilkan konten.
export default function DashboardPage() {
    const router = useRouter();
    useEffect(() => { router.replace('/chat'); }, [router]);
    return (
        <div className="min-h-dvh bg-neutral-950 flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
        </div>
    );
}
