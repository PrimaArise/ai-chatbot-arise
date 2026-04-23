import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string }>;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

/**
 * Membagi teks panjang menjadi chunks kecil (~400 kata per chunk).
 * Overlap 50 kata antar chunk agar konteks tidak hilang di batas potongan.
 */
function chunkText(text: string, chunkSize = 400, overlapSize = 50): string[] {
    const words = text.split(/\s+/);
    const chunks: string[] = [];

    for (let i = 0; i < words.length; i += chunkSize - overlapSize) {
        const chunk = words.slice(i, i + chunkSize).join(' ');
        if (chunk.trim().length > 0) {
            chunks.push(chunk.trim());
        }
        if (i + chunkSize >= words.length) break;
    }

    return chunks;
}

/**
 * Menghasilkan embedding vektor dari teks menggunakan Gemini text-embedding-004.
 * Mengembalikan array float 768-dimensi.
 */
async function generateEmbedding(text: string): Promise<number[]> {
    const model = genAI.getGenerativeModel({ model: 'text-embedding-004' });
    const result = await model.embedContent(text);
    return result.embedding.values;
}

/**
 * Menyimpan chunks teks ke database pgvector setelah di-embed via Gemini.
 */
async function ingestChunks(content: string): Promise<string[]> {
    const chunks = chunkText(content);
    console.log(`[Ingest] Memproses ${chunks.length} chunk...`);

    const insertedPreviews: string[] = [];

    for (const chunk of chunks) {
        const embedding = await generateEmbedding(chunk);
        const vectorString = `[${embedding.join(',')}]`;

        await prisma.$executeRaw`
            INSERT INTO "Document" (id, content, embedding, "createdAt")
            VALUES (
                gen_random_uuid()::text,
                ${chunk},
                ${vectorString}::vector,
                NOW()
            )
        `;

        insertedPreviews.push(chunk.substring(0, 60) + '...');
    }

    return insertedPreviews;
}

// ================= POST /api/ingest =================
// Menerima:
//   - application/json : { content: string }  → teks langsung
//   - multipart/form-data : file (.txt, .md, .pdf) → diekstrak teksnya dulu
export async function POST(req: Request) {
    try {
        const contentType = req.headers.get('content-type') || '';
        let rawText = '';

        if (contentType.includes('multipart/form-data')) {
            // ── File upload mode ──────────────────────────────────────────
            const formData = await req.formData();
            const file = formData.get('file') as File | null;

            if (!file) {
                return NextResponse.json({ error: 'Tidak ada file yang dikirim.' }, { status: 400 });
            }

            const fileName = file.name.toLowerCase();
            const arrayBuffer = await file.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);

            if (fileName.endsWith('.pdf')) {
                // Ekstrak teks dari PDF
                const pdfData = await pdfParse(buffer);
                rawText = pdfData.text;
            } else if (fileName.endsWith('.txt') || fileName.endsWith('.md')) {
                rawText = buffer.toString('utf-8');
            } else {
                return NextResponse.json(
                    { error: 'Format file tidak didukung. Gunakan .pdf, .txt, atau .md' },
                    { status: 400 }
                );
            }
        } else {
            // ── JSON mode (plain text) ────────────────────────────────────
            const body = await req.json();
            rawText = body.content || '';
        }

        if (!rawText.trim()) {
            return NextResponse.json(
                { error: 'Konten dokumen kosong atau tidak berhasil diekstrak.' },
                { status: 400 }
            );
        }

        const insertedPreviews = await ingestChunks(rawText);

        return NextResponse.json({
            success: true,
            message: `Berhasil mengindeks ${insertedPreviews.length} chunk ke knowledge base.`,
            chunks: insertedPreviews,
        });
    } catch (error) {
        console.error('[Ingest] Error:', error);
        return NextResponse.json(
            { error: 'Gagal mengindeks dokumen.', detail: String(error) },
            { status: 500 }
        );
    }
}
