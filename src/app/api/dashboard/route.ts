import { NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase-server';
import { prisma } from '@/lib/prisma';

// ============================================================
// GET /api/dashboard
// Mengembalikan statistik untuk Dashboard
// Admin: statistik seluruh sistem
// User: statistik akun sendiri
// ============================================================
export async function GET() {
    try {
        const supabase = await getSupabaseServer();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        // Ambil role
        const roleRows = await prisma.$queryRaw<{ role: string }[]>`
            SELECT role FROM "User" WHERE id = ${user.id} LIMIT 1
        `;
        const isAdmin = roleRows?.[0]?.role === 'admin';

        // Statistik user sendiri
        const [chatsResult, messagesResult, chunksResult] = await Promise.all([
            prisma.$queryRaw<{ count: bigint }[]>`
                SELECT COUNT(*) as count FROM "Chat" WHERE "userId" = ${user.id}
            `,
            prisma.$queryRaw<{ count: bigint }[]>`
                SELECT COUNT(*) as count FROM "Message" m
                JOIN "Chat" c ON m."chatId" = c.id
                WHERE c."userId" = ${user.id}
            `,
            prisma.$queryRaw<{ count: bigint }[]>`
                SELECT COUNT(*) as count FROM "Document"
                WHERE "userId" = ${user.id} OR "isGlobal" = true
            `,
        ]);

        const totalChats = Number(chatsResult[0]?.count ?? 0);
        const totalMessages = Number(messagesResult[0]?.count ?? 0);
        const totalChunks = Number(chunksResult[0]?.count ?? 0);
        const avgMsgPerChat = totalChats > 0 ? (totalMessages / totalChats).toFixed(1) : '0';

        // Aktivitas 7 hari terakhir (jumlah pesan per hari)
        const activityRows = await prisma.$queryRaw<{ day: string; count: bigint }[]>`
            SELECT DATE(m."createdAt" AT TIME ZONE 'Asia/Jakarta') as day, COUNT(*) as count
            FROM "Message" m
            JOIN "Chat" c ON m."chatId" = c.id
            WHERE c."userId" = ${user.id}
              AND m."createdAt" > NOW() - INTERVAL '7 days'
            GROUP BY day
            ORDER BY day ASC
        `;
        const activity = activityRows.map(r => ({ day: r.day, count: Number(r.count) }));

        // Admin-only stats
        let adminStats = null;
        if (isAdmin) {
            const [usersResult, globalChunksResult, totalChunksAllResult] = await Promise.all([
                prisma.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*) as count FROM "User"`,
                prisma.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*) as count FROM "Document" WHERE "isGlobal" = true`,
                prisma.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*) as count FROM "Document"`,
            ]);
            adminStats = {
                totalUsers: Number(usersResult[0]?.count ?? 0),
                globalChunks: Number(globalChunksResult[0]?.count ?? 0),
                totalChunksAll: Number(totalChunksAllResult[0]?.count ?? 0),
            };
        }

        return NextResponse.json({
            totalChats,
            totalMessages,
            totalChunks,
            avgMsgPerChat,
            activity,
            adminStats,
            isAdmin,
        });
    } catch (error) {
        console.error('[GET /api/dashboard] Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
