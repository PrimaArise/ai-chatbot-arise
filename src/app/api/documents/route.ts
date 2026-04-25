import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase-server';
import { GoogleGenAI } from '@google/genai';

// ================= GET /api/documents =================
// Admin   : semua dokumen (global + milik semua user)
// User    : dokumen milik sendiri + semua dokumen global
export async function GET() {
    try {
        const supabase = await getSupabaseServer();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        // Ambil role user dari Prisma
        const roleRows = await prisma.$queryRaw<{ role: string }[]>`
            SELECT role FROM "User" WHERE id = ${user.id} LIMIT 1
        `;
        const isAdmin = roleRows?.[0]?.role === 'admin';

        let docs: { id: string; content: string; createdAt: Date; userId: string; isGlobal: boolean }[];

        if (isAdmin) {
            // Admin: lihat semua dokumen semua user
            docs = await prisma.$queryRaw`
                SELECT id, content, "createdAt", "userId", "isGlobal"
                FROM "Document"
                ORDER BY "isGlobal" DESC, "createdAt" DESC
            `;
        } else {
            // User biasa: lihat dokumen pribadi + dokumen global
            docs = await prisma.$queryRaw`
                SELECT id, content, "createdAt", "userId", "isGlobal"
                FROM "Document"
                WHERE "userId" = ${user.id} OR "isGlobal" = true
                ORDER BY "isGlobal" DESC, "createdAt" DESC
            `;
        }

        return NextResponse.json(docs);
    } catch (error) {
        console.error('[GET /api/documents] Error:', error);
        return NextResponse.json({ error: 'Gagal mengambil data.' }, { status: 500 });
    }
}

// ================= PATCH /api/documents?id=xxx =================
// Mengedit konten chunk dan otomatis re-generate embedding
// Global chunk hanya bisa diedit admin
export async function PATCH(req: Request) {
    try {
        const supabase = await getSupabaseServer();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const roleRows = await prisma.$queryRaw<{ role: string }[]>`
            SELECT role FROM "User" WHERE id = ${user.id} LIMIT 1
        `;
        const isAdmin = roleRows?.[0]?.role === 'admin';

        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');
        if (!id) return NextResponse.json({ error: 'Missing id parameter' }, { status: 400 });

        const body = await req.json();
        const newContent: string = body.content?.trim();
        if (!newContent) return NextResponse.json({ error: 'Konten tidak boleh kosong.' }, { status: 400 });

        // Cek kepemilikan + status global
        const existing = await prisma.$queryRaw<{ id: string; userId: string; isGlobal: boolean }[]>`
            SELECT id, "userId", "isGlobal" FROM "Document" WHERE id = ${id} LIMIT 1
        `;
        if (!existing || existing.length === 0) {
            return NextResponse.json({ error: 'Chunk tidak ditemukan.' }, { status: 404 });
        }

        const chunk = existing[0];
        // Global chunk: hanya admin yang bisa edit
        if (chunk.isGlobal && !isAdmin) {
            return NextResponse.json({ error: 'Hanya admin yang dapat mengedit dokumen global.' }, { status: 403 });
        }
        // Pribadi: hanya pemilik (atau admin) yang bisa edit
        if (!chunk.isGlobal && chunk.userId !== user.id && !isAdmin) {
            return NextResponse.json({ error: 'Chunk ini bukan milik Anda.' }, { status: 403 });
        }

        // Re-generate embedding dari konten baru
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
        const embResponse = await ai.models.embedContent({
            model: 'gemini-embedding-2',
            contents: newContent,
        });
        const embedding: number[] = embResponse.embeddings?.[0]?.values ?? [];
        if (embedding.length === 0) {
            return NextResponse.json({ error: 'Gagal menghasilkan embedding baru.' }, { status: 500 });
        }
        const vectorString = `[${embedding.join(',')}]`;

        await prisma.$executeRaw`
            UPDATE "Document"
            SET content = ${newContent},
                embedding = ${vectorString}::vector(3072)
            WHERE id = ${id}
        `;

        return NextResponse.json({
            success: true,
            message: 'Chunk berhasil diperbarui dan embedding di-regenerasi.',
            id,
        });
    } catch (error) {
        console.error('[PATCH /api/documents] Error:', error);
        return NextResponse.json({ error: 'Gagal memperbarui chunk.', detail: String(error) }, { status: 500 });
    }
}

// ================= DELETE /api/documents =================
// Aturan kepemilikan:
//   - Dokumen GLOBAL  : hanya admin yang boleh hapus
//   - Dokumen PRIBADI : pemilik atau admin
// Mode:
//   1. Single: DELETE /api/documents?id=xxx
//   2. Bulk:   DELETE /api/documents  body: { ids: string[] }
export async function DELETE(req: Request) {
    try {
        const supabase = await getSupabaseServer();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const roleRows = await prisma.$queryRaw<{ role: string }[]>`
            SELECT role FROM "User" WHERE id = ${user.id} LIMIT 1
        `;
        const isAdmin = roleRows?.[0]?.role === 'admin';

        const { searchParams } = new URL(req.url);
        const singleId = searchParams.get('id');

        // Helper: cek apakah user boleh menghapus chunk tertentu
        async function canDelete(chunkId: string): Promise<{ allowed: boolean; reason?: string }> {
            const rows = await prisma.$queryRaw<{ userId: string; isGlobal: boolean }[]>`
                SELECT "userId", "isGlobal" FROM "Document" WHERE id = ${chunkId} LIMIT 1
            `;
            if (!rows || rows.length === 0) return { allowed: false, reason: 'Chunk tidak ditemukan.' };
            const chunk = rows[0];
            if (chunk.isGlobal && !isAdmin) return { allowed: false, reason: 'Hanya admin yang dapat menghapus dokumen global.' };
            if (!chunk.isGlobal && chunk.userId !== user!.id && !isAdmin) return { allowed: false, reason: 'Chunk ini bukan milik Anda.' };
            return { allowed: true };
        }

        // ── Mode bulk (body JSON dengan array ids) ──
        if (!singleId) {
            let body: { ids?: string[] } = {};
            try { body = await req.json(); } catch { /* ignore */ }

            const ids: string[] = Array.isArray(body.ids) ? body.ids.filter(Boolean) : [];
            if (ids.length === 0) {
                return NextResponse.json({ error: 'Missing id or ids parameter' }, { status: 400 });
            }

            let deleted = 0;
            const errors: string[] = [];
            for (const id of ids) {
                const { allowed, reason } = await canDelete(id);
                if (!allowed) { errors.push(`${id}: ${reason}`); continue; }
                await prisma.$executeRaw`DELETE FROM "Document" WHERE id = ${id}`;
                deleted++;
            }

            return NextResponse.json({
                success: true,
                deleted,
                skipped: errors.length,
                message: `${deleted} chunk berhasil dihapus.${errors.length > 0 ? ` ${errors.length} dilewati.` : ''}`,
            });
        }

        // ── Mode single ──
        const { allowed, reason } = await canDelete(singleId);
        if (!allowed) return NextResponse.json({ error: reason }, { status: 403 });

        await prisma.$executeRaw`DELETE FROM "Document" WHERE id = ${singleId}`;
        return NextResponse.json({ success: true, message: `Chunk ${singleId} berhasil dihapus.` });
    } catch (error) {
        console.error('[DELETE /api/documents] Error:', error);
        return NextResponse.json({ error: 'Gagal menghapus chunk.' }, { status: 500 });
    }
}

