import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase-server';

// helper to get the authenticated user or return Unauthorized
async function authenticateUser() {
    const supabase = await getSupabaseServer();
    const { data: { user }, error } = await supabase.auth.getUser();
    
    if (error || !user) {
        return null;
    }
    return user;
}

// ================= GET =================
export async function GET(req: Request) {
    try {
        const user = await authenticateUser();

        if (!user) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const chats = await prisma.chat.findMany({
            where: { userId: user.id },
            orderBy: { createdAt: 'desc' },
        });

        return NextResponse.json(chats);
    } catch (error) {
        console.error('GET /api/session error:', error);
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500 }
        );
    }
}

// ================= DELETE =================
export async function DELETE(req: Request) {
    try {
        const user = await authenticateUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');

        if (!id) return NextResponse.json({ error: 'ID param is required' }, { status: 400 });

        const chat = await prisma.chat.findUnique({ where: { id } });

        if (!chat || chat.userId !== user.id) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        await prisma.chat.delete({ where: { id } });

        return NextResponse.json({ message: 'Deleted' });
    } catch (error) {
        console.error('DELETE /api/session error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

// ================= PATCH =================
export async function PATCH(req: Request) {
    try {
        const user = await authenticateUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');

        if (!id) return NextResponse.json({ error: 'ID param is required' }, { status: 400 });

        const chat = await prisma.chat.findUnique({ where: { id } });

        if (!chat || chat.userId !== user.id) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const body = await req.json();
        const title = body?.title?.trim();

        if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 400 });

        const updated = await prisma.chat.update({
            where: { id },
            data: { title },
        });

        return NextResponse.json(updated);
    } catch (error) {
        console.error('PATCH /api/session error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
