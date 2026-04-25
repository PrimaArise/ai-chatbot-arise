'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { BarChart2, MessageSquare, FileText, Users, Globe, TrendingUp, ArrowLeft, Shield, User, RefreshCw } from 'lucide-react';

type Activity = { day: string; count: number };
type Stats = {
    totalChats: number;
    totalMessages: number;
    totalChunks: number;
    avgMsgPerChat: string;
    activity: Activity[];
    isAdmin: boolean;
    adminStats: { totalUsers: number; globalChunks: number; totalChunksAll: number } | null;
};

export default function DashboardPage() {
    const router = useRouter();
    const [stats, setStats] = useState<Stats | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');

    const fetchStats = async () => {
        setIsLoading(true);
        try {
            const { data } = await supabase.auth.getUser();
            if (!data.user) { router.push('/login'); return; }
            const res = await fetch('/api/dashboard');
            if (!res.ok) throw new Error('Gagal mengambil data');
            setStats(await res.json());
        } catch {
            setError('Gagal memuat statistik.');
        }
        setIsLoading(false);
    };

    useEffect(() => { fetchStats(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const maxActivity = stats ? Math.max(...stats.activity.map(a => a.count), 1) : 1;

    const formatDay = (day: string) => {
        const d = new Date(day);
        return d.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' });
    };

    return (
        <div className="min-h-screen bg-neutral-950 text-neutral-100 font-sans p-4 sm:p-8">
            <div className="max-w-5xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => router.push('/chat')}
                            className="p-2 hover:bg-neutral-800 rounded-lg text-neutral-400 hover:text-white transition-colors cursor-pointer"
                        >
                            <ArrowLeft size={20} />
                        </button>
                        <div>
                            <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
                                <BarChart2 size={24} className="text-blue-400" />
                                Dashboard
                            </h1>
                            <p className="text-sm text-neutral-500 mt-0.5">Statistik penggunaan AI Arise</p>
                        </div>
                    </div>
                    <button
                        onClick={fetchStats}
                        disabled={isLoading}
                        className="flex items-center gap-2 px-3 py-2 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded-lg text-sm text-neutral-300 cursor-pointer transition-colors disabled:opacity-50"
                    >
                        <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
                        Refresh
                    </button>
                </div>

                {isLoading && !stats ? (
                    <div className="flex items-center justify-center py-32">
                        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500" />
                    </div>
                ) : error ? (
                    <div className="text-center py-32 text-neutral-500">{error}</div>
                ) : stats ? (
                    <div className="space-y-6">
                        {/* Role Badge */}
                        <div className="flex items-center gap-2">
                            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border ${stats.isAdmin ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' : 'bg-neutral-800 border-neutral-700 text-neutral-400'}`}>
                                {stats.isAdmin ? <Shield size={12} /> : <User size={12} />}
                                {stats.isAdmin ? 'Admin' : 'User'}
                            </div>
                            <span className="text-xs text-neutral-600">Statistik akun Anda</span>
                        </div>

                        {/* Stat Cards */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                            {[
                                { label: 'Total Chat', value: stats.totalChats, icon: MessageSquare, color: 'blue' },
                                { label: 'Total Pesan', value: stats.totalMessages, icon: TrendingUp, color: 'green' },
                                { label: 'Chunk KB', value: stats.totalChunks, icon: FileText, color: 'purple' },
                                { label: 'Rata-rata Pesan/Chat', value: stats.avgMsgPerChat, icon: BarChart2, color: 'orange' },
                            ].map(({ label, value, icon: Icon, color }) => (
                                <div key={label} className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5">
                                    <div className={`w-9 h-9 rounded-xl mb-3 flex items-center justify-center ${
                                        color === 'blue' ? 'bg-blue-500/15 text-blue-400' :
                                        color === 'green' ? 'bg-green-500/15 text-green-400' :
                                        color === 'purple' ? 'bg-purple-500/15 text-purple-400' :
                                        'bg-orange-500/15 text-orange-400'
                                    }`}>
                                        <Icon size={18} />
                                    </div>
                                    <p className="text-2xl font-bold text-white">{value}</p>
                                    <p className="text-xs text-neutral-500 mt-1">{label}</p>
                                </div>
                            ))}
                        </div>

                        {/* Admin Stats */}
                        {stats.isAdmin && stats.adminStats && (
                            <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-5">
                                <h2 className="text-sm font-semibold text-amber-400 mb-4 flex items-center gap-2">
                                    <Shield size={14} /> Statistik Admin — Seluruh Sistem
                                </h2>
                                <div className="grid grid-cols-3 gap-4">
                                    {[
                                        { label: 'Total User', value: stats.adminStats.totalUsers, icon: Users },
                                        { label: 'Dokumen Global', value: stats.adminStats.globalChunks, icon: Globe },
                                        { label: 'Total Semua Chunk', value: stats.adminStats.totalChunksAll, icon: FileText },
                                    ].map(({ label, value, icon: Icon }) => (
                                        <div key={label} className="text-center">
                                            <Icon size={20} className="text-amber-400/60 mx-auto mb-2" />
                                            <p className="text-xl font-bold text-white">{value}</p>
                                            <p className="text-xs text-neutral-500 mt-1">{label}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Activity Chart */}
                        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5">
                            <h2 className="text-sm font-semibold text-neutral-300 mb-5">Aktivitas 7 Hari Terakhir</h2>
                            {stats.activity.length === 0 ? (
                                <p className="text-center text-neutral-600 py-8 text-sm">Belum ada aktivitas dalam 7 hari terakhir.</p>
                            ) : (
                                <div className="flex items-end justify-between gap-2 h-36">
                                    {/* Fill to 7 days */}
                                    {Array.from({ length: 7 }).map((_, i) => {
                                        const dateStr = new Date(Date.now() - (6 - i) * 86400000).toISOString().split('T')[0];
                                        const found = stats.activity.find(a => a.day === dateStr);
                                        const count = found?.count ?? 0;
                                        const heightPct = maxActivity > 0 ? (count / maxActivity) * 100 : 0;
                                        return (
                                            <div key={dateStr} className="flex-1 flex flex-col items-center gap-2">
                                                <span className="text-[10px] text-neutral-600">{count > 0 ? count : ''}</span>
                                                <div className="w-full bg-neutral-800 rounded-t-md relative overflow-hidden" style={{ height: '80px' }}>
                                                    <div
                                                        className="absolute bottom-0 w-full bg-blue-500/70 rounded-t-md transition-all duration-700"
                                                        style={{ height: `${Math.max(heightPct, count > 0 ? 5 : 0)}%` }}
                                                    />
                                                </div>
                                                <span className="text-[9px] text-neutral-600 text-center leading-tight">
                                                    {formatDay(dateStr)}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                ) : null}
            </div>
        </div>
    );
}
