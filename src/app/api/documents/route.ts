import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase-server';

// ================= GET /api/documents =================
// Mengembalikan semua document/chunk yang tersimpan di knowledge base
export async function GET() {
    try {
        const supabase = await getSupabaseServer();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        // Query raw karena kolom embedding type Unsupported tidak bisa di-select biasa
        const docs = await prisma.$queryRaw<{ id: string; content: string; createdAt: Date }[]>`
            SELECT id, content, "createdAt"
            FROM "Document"
            ORDER BY "createdAt" DESC
        `;

        return NextResponse.json(docs);
    } catch (error) {
        console.error('[GET /api/documents] Error:', error);
        return NextResponse.json({ error: 'Gagal mengambil data.' }, { status: 500 });
    }
}

// ================= DELETE /api/documents?id=xxx =================
// Menghapus satu chunk dari knowledge base berdasarkan id
export async function DELETE(req: Request) {
    try {
        const supabase = await getSupabaseServer();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');

        if (!id) return NextResponse.json({ error: 'Missing id parameter' }, { status: 400 });

        await prisma.$executeRaw`DELETE FROM "Document" WHERE id = ${id}`;

        return NextResponse.json({ success: true, message: `Chunk ${id} berhasil dihapus.` });
    } catch (error) {
        console.error('[DELETE /api/documents] Error:', error);
        return NextResponse.json({ error: 'Gagal menghapus chunk.' }, { status: 500 });
    }
}
