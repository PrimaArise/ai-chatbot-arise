import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase-server';
import { GoogleGenAI } from '@google/genai';

// Helper: generate embedding
async function generateEmbedding(text: string): Promise<number[]> {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
    const embResponse = await ai.models.embedContent({
        model: 'gemini-embedding-2',
        contents: text,
    });
    const embedding: number[] = embResponse.embeddings?.[0]?.values ?? [];
    if (embedding.length === 0) throw new Error('Embedding kosong dari Gemini.');
    return embedding;
}

// ================= GET /api/documents =================
export async function GET() {
    try {
        const supabase = await getSupabaseServer();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const docs = await prisma.$queryRaw<{ id: string; content: string; createdAt: Date; userId: string; source: string }[]>`
            SELECT id, content, "createdAt", "userId", source
            FROM "Document"
            WHERE "userId" = ${user.id}
            ORDER BY source ASC, "createdAt" DESC
        `;

        return NextResponse.json(docs);
    } catch (error) {
        console.error('[GET /api/documents] Error:', error);
        return NextResponse.json({ error: 'Gagal mengambil data.' }, { status: 500 });
    }
}

// ================= POST /api/documents =================
// Tambah chunk manual ke grup tertentu, generate embedding otomatis
export async function POST(req: Request) {
    try {
        const supabase = await getSupabaseServer();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await req.json() as { content?: string; source?: string };
        const content = body.content?.trim();
        const source = body.source?.trim() || 'manual-input';

        if (!content) {
            return NextResponse.json({ error: 'Konten tidak boleh kosong.' }, { status: 400 });
        }

        // Cek duplikasi
        const existing = await prisma.$queryRaw<{ id: string }[]>`
            SELECT id FROM "Document"
            WHERE content = ${content} AND "userId" = ${user.id}
            LIMIT 1
        `;
        if (existing.length > 0) {
            return NextResponse.json({ error: 'Chunk dengan konten yang sama sudah ada.' }, { status: 409 });
        }

        const embedding = await generateEmbedding(content);
        const vectorString = `[${embedding.join(',')}]`;

        await prisma.$executeRaw`
            INSERT INTO "Document" (id, content, embedding, "createdAt", "userId", source)
            VALUES (
                gen_random_uuid()::text,
                ${content},
                ${vectorString}::vector(3072),
                NOW(),
                ${user.id},
                ${source}
            )
        `;

        return NextResponse.json({
            success: true,
            message: `Chunk berhasil ditambahkan ke grup "${source}".`,
        });
    } catch (error) {
        console.error('[POST /api/documents] Error:', error);
        return NextResponse.json({ error: 'Gagal menambahkan chunk.', detail: String(error) }, { status: 500 });
    }
}

// ================= PATCH /api/documents =================
// Mode 1: ?id=xxx            → edit konten chunk (re-embed)
// Mode 2: ?renameGroup=name  → rename semua chunk dalam grup
export async function PATCH(req: Request) {
    try {
        const supabase = await getSupabaseServer();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');
        const renameGroup = searchParams.get('renameGroup');

        // ── Mode rename grup ──
        if (renameGroup) {
            const body = await req.json() as { newSource?: string };
            const newSource = body.newSource?.trim();
            if (!newSource) {
                return NextResponse.json({ error: 'Nama grup baru tidak boleh kosong.' }, { status: 400 });
            }
            if (newSource === renameGroup) {
                return NextResponse.json({ error: 'Nama grup sama dengan sebelumnya.' }, { status: 400 });
            }

            // Cek konflik nama
            const conflict = await prisma.$queryRaw<{ cnt: bigint }[]>`
                SELECT COUNT(*)::bigint as cnt FROM "Document"
                WHERE source = ${newSource} AND "userId" = ${user.id}
            `;
            if (Number(conflict[0]?.cnt ?? 0) > 0) {
                return NextResponse.json({
                    error: `Nama grup "${newSource}" sudah digunakan. Pilih nama lain.`,
                }, { status: 409 });
            }

            const res = await prisma.$queryRaw<{ cnt: bigint }[]>`
                WITH upd AS (
                    UPDATE "Document" SET source = ${newSource}
                    WHERE source = ${renameGroup} AND "userId" = ${user.id}
                    RETURNING id
                ) SELECT COUNT(*)::bigint as cnt FROM upd
            `;
            const count = Number(res[0]?.cnt ?? 0);

            if (count === 0) {
                return NextResponse.json({
                    error: 'Tidak ada chunk yang bisa direname.',
                }, { status: 403 });
            }

            return NextResponse.json({
                success: true,
                message: `Grup "${renameGroup}" berhasil direname menjadi "${newSource}" (${count} chunk diperbarui).`,
                oldSource: renameGroup,
                newSource,
                count,
            });
        }

        // ── Mode edit konten chunk (by id) ──
        if (!id) {
            return NextResponse.json({ error: 'Missing id or renameGroup parameter.' }, { status: 400 });
        }

        const body = await req.json();
        const newContent: string = body.content?.trim();
        if (!newContent) {
            return NextResponse.json({ error: 'Konten tidak boleh kosong.' }, { status: 400 });
        }

        const existing = await prisma.$queryRaw<{ id: string; userId: string }[]>`
            SELECT id, "userId" FROM "Document" WHERE id = ${id} LIMIT 1
        `;
        if (!existing || existing.length === 0) {
            return NextResponse.json({ error: 'Chunk tidak ditemukan.' }, { status: 404 });
        }
        if (existing[0].userId !== user.id) {
            return NextResponse.json({ error: 'Chunk ini bukan milik Anda.' }, { status: 403 });
        }

        const embedding = await generateEmbedding(newContent);
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
        return NextResponse.json({ error: 'Gagal memperbarui.', detail: String(error) }, { status: 500 });
    }
}

// ================= DELETE /api/documents =================
// Mode 1: ?id=xxx        → hapus satu chunk
// Mode 2: ?source=xxx    → hapus seluruh grup
// Mode 3: body {ids:[]}  → bulk delete
export async function DELETE(req: Request) {
    try {
        const supabase = await getSupabaseServer();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { searchParams } = new URL(req.url);
        const singleId = searchParams.get('id');
        const sourceGroup = searchParams.get('source');

        // ── Mode hapus per grup/source ──
        if (sourceGroup) {
            const res = await prisma.$queryRaw<{ cnt: bigint }[]>`
                WITH del AS (
                    DELETE FROM "Document"
                    WHERE source = ${sourceGroup} AND "userId" = ${user.id}
                    RETURNING id
                ) SELECT COUNT(*)::bigint as cnt FROM del
            `;
            const deleted = Number(res[0]?.cnt ?? 0);
            return NextResponse.json({
                success: true,
                deleted,
                message: `${deleted} chunk dari grup "${sourceGroup}" berhasil dihapus.`,
            });
        }

        // ── Mode bulk ──
        if (!singleId) {
            let body: { ids?: string[] } = {};
            try { body = await req.json(); } catch { /* ignore */ }
            const ids: string[] = Array.isArray(body.ids) ? body.ids.filter(Boolean) : [];
            if (ids.length === 0) {
                return NextResponse.json({ error: 'Missing id or ids parameter' }, { status: 400 });
            }

            const idsLiteral = ids.map(id => `'${id.replace(/'/g, "''")}'`).join(',');
            const deleted = await prisma.$executeRawUnsafe(
                `DELETE FROM "Document" WHERE id = ANY(ARRAY[${idsLiteral}]::text[]) AND "userId" = '${user.id.replace(/'/g, "''")}'`
            );

            return NextResponse.json({
                success: true,
                deleted,
                message: `${deleted} chunk berhasil dihapus.`,
            });
        }

        // ── Mode single ──
        const rows = await prisma.$queryRaw<{ userId: string }[]>`
            SELECT "userId" FROM "Document" WHERE id = ${singleId} LIMIT 1
        `;
        if (!rows || rows.length === 0) return NextResponse.json({ error: 'Chunk tidak ditemukan.' }, { status: 404 });
        if (rows[0].userId !== user.id) return NextResponse.json({ error: 'Chunk ini bukan milik Anda.' }, { status: 403 });

        await prisma.$executeRaw`DELETE FROM "Document" WHERE id = ${singleId}`;
        return NextResponse.json({ success: true, message: `Chunk ${singleId} berhasil dihapus.` });

    } catch (error) {
        console.error('[DELETE /api/documents] Error:', error);
        return NextResponse.json({ error: 'Gagal menghapus chunk.' }, { status: 500 });
    }
}
