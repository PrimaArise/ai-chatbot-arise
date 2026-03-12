import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';

// GET: Mengambil daftar riwayat obrolan
export async function GET() {
    try {
        const chats = await prisma.chat.findMany({
            orderBy: { createdAt: 'desc' },
        });

        return NextResponse.json(chats);
    } catch (error) {
        console.error('Error fetching chats:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
