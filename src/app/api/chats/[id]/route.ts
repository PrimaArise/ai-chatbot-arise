import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';

// DELETE: Menghapus chat beserta pesannya (cascade diatur di schema)
export async function DELETE(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        if (!id) {
            return NextResponse.json({ error: 'Chat ID is required' }, { status: 400 });
        }

        await prisma.chat.delete({
            where: { id: id },
        });

        return NextResponse.json({ message: 'Chat deleted successfully' });
    } catch (error) {
        console.error('Error deleting chat:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

// PATCH: Mengubah judul chat
export async function PATCH(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await req.json();
        const { title } = body;

        if (!id || !title) {
            return NextResponse.json({ error: 'Chat ID and title are required' }, { status: 400 });
        }

        const updatedChat = await prisma.chat.update({
            where: { id: id },
            data: { title: title },
        });

        return NextResponse.json(updatedChat);
    } catch (error) {
        console.error('Error updating chat:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
