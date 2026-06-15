import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { getSupabaseServer } from '@/lib/supabase-server';

// ============================================================
// CONFIG
// ============================================================
const MAX_TOKENS = 400;
const OVERLAP_TOKENS = 80;

// ============================================================
// TOKEN COUNTER
// Estimasi token: 1 token ≈ 4 karakter (pendekatan umum untuk bahasa Inggris/Indonesia)
// ============================================================
function countTokens(text: string): number {
    return Math.ceil(text.length / 4);
}

// ============================================================
// INTERFACE
// ============================================================
interface ChunkResult {
    text: string;    // Isi chunk (termasuk judul section)
    section: string; // Judul section asal
    source: string;  // Nama file asal
}

// ============================================================
// STEP 1: SPLIT BERDASARKAN SECTION
// Mengenali heading Markdown (##, ###) dan penomoran (1., 2., dst.)
// ============================================================
function splitBySection(text: string): { title: string; content: string }[] {
    // Regex: pisahkan di awal baris yang dimulai heading/nomor
    const parts = text.split(/\n(?=#{1,3}\s|\d+\.\s)/);

    return parts
        .map(part => {
            const trimmed = part.trim();
            if (!trimmed) return null;

            const lines = trimmed.split('\n');
            const firstLine = lines[0].trim();

            // Cek apakah baris pertama adalah heading/nomor
            const isHeading = /^#{1,3}\s/.test(firstLine) || /^\d+\.\s/.test(firstLine);
            const title = isHeading
                ? firstLine.replace(/^#+\s*/, '').replace(/^\d+\.\s*/, '').trim()
                : '';

            return { title, content: trimmed };
        })
        .filter((s): s is { title: string; content: string } => s !== null && s.content.length > 0);
}

// ============================================================
// STEP 2: SPLIT BERDASARKAN TOKEN (fallback untuk section besar)
// Menggunakan sliding window dengan overlap
// ============================================================
function splitByTokens(text: string, sectionTitle: string): string[] {
    const words = text.split(/\s+/);
    const chunks: string[] = [];
    let current: string[] = [];

    // Prefix judul di setiap sub-chunk agar embedding tetap aware terhadap konteks
    const titlePrefix = sectionTitle ? `[${sectionTitle}]\n` : '';

    for (const word of words) {
        current.push(word);
        const currentText = titlePrefix + current.join(' ');

        if (countTokens(currentText) >= MAX_TOKENS) {
            chunks.push(currentText.trim());

            // Hitung berapa kata yang perlu dipertahankan sebagai overlap
            const overlapCharTarget = OVERLAP_TOKENS * 4;
            const overlapWords: string[] = [];
            let overlapChars = 0;

            for (let i = current.length - 1; i >= 0; i--) {
                overlapChars += current[i].length + 1;
                overlapWords.unshift(current[i]);
                if (overlapChars >= overlapCharTarget) break;
            }

            current = overlapWords;
        }
    }

    // Simpan sisa kata yang belum masuk chunk
    if (current.length > 0) {
        const remaining = (titlePrefix + current.join(' ')).trim();
        if (remaining.length > 0) chunks.push(remaining);
    }

    return chunks;
}

// ============================================================
// MAIN CHUNKER
// Pipeline: Load → Split Section → Token Split (jika perlu) → Output + Metadata
// ============================================================
function chunkDocument(text: string, source: string = 'unknown'): ChunkResult[] {
    const finalChunks: ChunkResult[] = [];
    const sections = splitBySection(text);

    for (const section of sections) {
        const { title, content } = section;
        // Tambahkan judul section ke dalam teks yang di-embed agar relevansi lebih akurat
        const contentWithTitle = title ? `[${title}]\n${content}` : content;

        if (countTokens(contentWithTitle) <= MAX_TOKENS) {
            // Section cukup kecil → simpan langsung sebagai 1 chunk
            finalChunks.push({
                text: contentWithTitle,
                section: title,
                source,
            });
        } else {
            // Section terlalu besar → pecah lagi berdasarkan token dengan overlap
            const subChunks = splitByTokens(content, title);
            for (const chunk of subChunks) {
                finalChunks.push({
                    text: chunk,
                    section: title,
                    source,
                });
            }
        }
    }

    // Fallback: jika tidak ada section terdeteksi, chunk seluruh teks by token
    if (finalChunks.length === 0 && text.trim().length > 0) {
        const fallbackChunks = splitByTokens(text.trim(), '');
        for (const chunk of fallbackChunks) {
            finalChunks.push({ text: chunk, section: '', source });
        }
    }

    return finalChunks;
}

// ============================================================
// EMBEDDING via Gemini gemini-embedding-2 (3072 dimensi)
// ============================================================
async function generateEmbedding(text: string): Promise<number[]> {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
    const response = await ai.models.embedContent({
        model: 'gemini-embedding-2',
        contents: text,
    });
    const values = response.embeddings?.[0]?.values;
    if (!values) throw new Error('[Embedding] Respons embedding kosong dari Gemini.');
    return values;
}

// ============================================================
// INGEST PIPELINE
// ============================================================
async function ingestDocument(rawText: string, source: string, userId: string): Promise<{ chunks: ChunkResult[]; inserted: number; skipped: number }> {
    const chunks = chunkDocument(rawText, source);
    const CONCURRENCY = 5; // max parallel Gemini API calls

    let inserted = 0;
    let skipped = 0;

    // Helper: proses satu chunk (embed + insert)
    async function processChunk(chunk: ChunkResult): Promise<'inserted' | 'skipped'> {
        const embedding = await generateEmbedding(chunk.text);
        const vectorString = `[${embedding.join(',')}]`;
        const rowsAffected = await prisma.$executeRaw`
            INSERT INTO "Document" (id, content, embedding, "createdAt", "userId", source)
            SELECT
                gen_random_uuid()::text,
                ${chunk.text},
                ${vectorString}::vector(3072),
                NOW(),
                ${userId},
                ${source}
            WHERE NOT EXISTS (
                SELECT 1 FROM "Document"
                WHERE content = ${chunk.text}
                  AND "userId" = ${userId}
            )
        `;
        return rowsAffected > 0 ? 'inserted' : 'skipped';
    }

    // Proses dalam batch paralel (concurrency = CONCURRENCY)
    for (let i = 0; i < chunks.length; i += CONCURRENCY) {
        const batch = chunks.slice(i, i + CONCURRENCY);
        const results = await Promise.allSettled(batch.map(c => processChunk(c)));
        for (const r of results) {
            if (r.status === 'fulfilled') {
                if (r.value === 'inserted') inserted++;
                else skipped++;
            } else {
                // Jika satu chunk gagal embed, lewati tapi jangan crash keseluruhan
                console.warn('[ingest] chunk gagal diproses:', r.reason);
                skipped++;
            }
        }
    }

    return { chunks, inserted, skipped };
}


// ============================================================
// POST /api/ingest
// Menerima:
//   - multipart/form-data : file (.txt, .md, .pdf)
//   - application/json    : { content: string, source?: string }
// ============================================================
export async function POST(req: Request) {
    try {
        // Auth: hanya user yang sudah login yang bisa mengingest dokumen
        const supabase = await getSupabaseServer();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized. Silakan login terlebih dahulu.' }, { status: 401 });
        }
        const userId = user.id;

        const contentType = req.headers.get('content-type') || '';
        let rawText = '';
        let source = 'manual-input';

        if (contentType.includes('multipart/form-data')) {
            const formData = await req.formData();
            const file = formData.get('file') as File | null;

            if (!file) {
                return NextResponse.json({ error: 'Tidak ada file yang dikirim.' }, { status: 400 });
            }

            source = file.name;
            const fileName = file.name.toLowerCase();
            const arrayBuffer = await file.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);

            if (fileName.endsWith('.pdf')) {
                try {
                    // eslint-disable-next-line @typescript-eslint/no-require-imports
                    const pdfParse = require('pdf-parse/lib/pdf-parse.js') as (
                        buf: Buffer,
                        opts?: Record<string, unknown>
                    ) => Promise<{ text: string }>;
                    const pdfData = await pdfParse(buffer, { max: 0 });
                    rawText = pdfData.text?.trim() || '';
                    if (!rawText) {
                        return NextResponse.json(
                            { error: 'PDF tidak memiliki teks yang bisa diekstrak. Kemungkinan PDF berisi gambar/scan. Coba konversi ke format .txt atau .md terlebih dahulu.' },
                            { status: 400 }
                        );
                    }
                } catch (pdfErr) {
                    console.error('[PDF Parse Error]', pdfErr);
                    return NextResponse.json(
                        {
                            error: 'Gagal membaca file PDF.',
                            detail: 'File PDF mungkin corrupt, terproteksi password, atau formatnya tidak kompatibel. Coba konversi ke .txt atau .md terlebih dahulu.',
                        },
                        { status: 400 }
                    );
                }
            } else if (fileName.endsWith('.txt') || fileName.endsWith('.md')) {
                rawText = buffer.toString('utf-8');
            } else {
                return NextResponse.json(
                    { error: 'Format file tidak didukung. Gunakan .pdf, .txt, atau .md' },
                    { status: 400 }
                );
            }


        } else {
            // JSON body
            const jsonBody = await req.json() as { content?: string; source?: string };
            rawText = jsonBody.content || '';
            source = jsonBody.source || 'manual-input';
        }

        // ── Proses rawText (berlaku untuk semua path) ──
        if (!rawText.trim()) {
            return NextResponse.json(
                { error: 'Konten dokumen kosong atau tidak berhasil diekstrak.' },
                { status: 400 }
            );
        }

        const result = await ingestDocument(rawText, source, userId);

        const skipMsg = result.skipped > 0 ? ` (${result.skipped} duplikat dilewati)` : '';
        return NextResponse.json({
            success: true,
            message: `Berhasil mengindeks ${result.inserted} chunk dari "${source}" ke knowledge base${skipMsg}.`,
            chunks: result.chunks.map(c => ({
                section: c.section || '(no section)',
                preview: c.text.substring(0, 80) + '...',
                tokens: countTokens(c.text),
            })),
            inserted: result.inserted,
            skipped: result.skipped,
        });

    } catch (error) {
        console.error('[Ingest] Error:', error);
        return NextResponse.json(
            { error: 'Gagal mengindeks dokumen.', detail: String(error) },
            { status: 500 }
        );
    }
}
