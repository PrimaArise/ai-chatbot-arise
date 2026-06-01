'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Dashboard telah dihapus dari aplikasi.
// Halaman ini hanya me-redirect ke /chat.
export default function DashboardPage() {
    const router = useRouter();
    useEffect(() => { router.replace('/chat'); }, [router]);
    return (
        <div className="min-h-dvh bg-neutral-950 flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
        </div>
    );
}
