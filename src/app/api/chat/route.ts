import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { groq } from '@ai-sdk/groq';
import { streamText, smoothStream, generateText, CoreMessage, createDataStream, JSONValue } from 'ai';
import { getSupabaseServer } from '@/lib/supabase-server';
import { GoogleGenAI } from '@google/genai';
import { checkRateLimit } from '@/lib/rate-limit';

// ============================================================
// CONFIG
// ============================================================

/**
 * Jumlah maksimum pesan yang dikirim ke LLM.
 * Pesan lebih lama dipotong untuk mencegah token bloat.
 * Selalu pertahankan pesan pertama (konteks awal) + N pesan terakhir.
 */
const MAX_HISTORY_MESSAGES = 10;

/**
 * Threshold cosine distance untuk RAG retrieval (pass 1 — strict).
 * Dinaikkan dari 0.42 → 0.55 agar pertanyaan yang diparafrase / sinonim
 * tetap menangkap chunk yang relevan.
 */
const RAG_DISTANCE_THRESHOLD = 0.55;

/**
 * Threshold fallback (pass 2) — digunakan bila pass 1 tidak menemukan hasil.
 * Lebih longgar agar pertanyaan pendek / ambigu masih dapat konteks.
 */
const RAG_FALLBACK_THRESHOLD = 0.72;

/**
 * Jumlah chunk RAG yang diambil (top-k).
 * Dinaikkan 5 → 8 agar informasi yang tersebar di banyak chunk tetap tercakup.
 */
const RAG_TOP_K = 8;

/**
 * Jumlah pesan user terakhir yang digabung sebagai query RAG.
 * Membantu ketika pertanyaan singkat tapi konteks ada di pesan sebelumnya.
 */
const RAG_QUERY_WINDOW = 3;

// ============================================================
// HELPERS
// ============================================================

/**
 * Mengecek apakah user ini punya akses ke knowledge base:
 * dokumen milik sendiri ATAU dokumen global yang di-upload admin.
 */
async function hasKnowledgeBase(userId: string): Promise<boolean> {
    const count = await prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*) as count FROM "Document"
        WHERE "userId" = ${userId} OR "isGlobal" = true
    `;
    return Number(count[0]?.count ?? 0) > 0;
}

/**
 * Memotong array messages agar tidak melebihi MAX_HISTORY_MESSAGES.
 * Strategi: ambil pesan pertama (biasanya konteks awal) + N pesan terakhir.
 * Ini mencegah token bloat saat percakapan panjang.
 */
function trimMessages(messages: CoreMessage[]): CoreMessage[] {
    if (messages.length <= MAX_HISTORY_MESSAGES) return messages;

    // Selalu sertakan pesan pertama agar konteks awal tidak hilang
    const first = messages[0];
    const recent = messages.slice(-(MAX_HISTORY_MESSAGES - 1));

    // Hindari duplikat jika pesan pertama sudah masuk di recent
    if (recent[0]?.content === first.content && recent[0]?.role === first.role) {
        return recent;
    }

    return [first, ...recent];
}

/**
 * Metadata tiap chunk yang dikembalikan ke frontend untuk ditampilkan sebagai citation.
 * Index signature diperlukan agar tipe ini kompatibel dengan JSONValue (untuk writeData).
 */
interface ChunkCitation {
    index: number;
    snippet: string;
    distance: number;
    [key: string]: unknown;
}

/**
 * Expand + rephrase query user menjadi kalimat yang lebih deskriptif
 * agar embedding-nya lebih dekat ke embedding chunk dokumen.
 * Teknik ini dikenal sebagai Query Expansion / HyDE-lite.
 */
async function expandQuery(rawQuery: string): Promise<string> {
    try {
        const { text } = await generateText({
            model: groq('llama-3.3-70b-versatile'),
            system: `You are a search query optimizer. Your task is to rewrite and expand a user's question into a more detailed, information-rich search query that will better match relevant document chunks.

Rules:
- Rewrite the query to be more descriptive and include synonyms/related terms
- Keep it in the SAME language as the original question
- Output ONLY the expanded query, nothing else
- Maximum 3 sentences
- Do NOT answer the question, just expand/rephrase it for search purposes`,
            prompt: `Original question: "${rawQuery}"\n\nExpanded search query:`,
        });
        return text.trim() || rawQuery;
    } catch {
        // Fallback to original query if expansion fails
        return rawQuery;
    }
}

/**
 * Embed teks menggunakan Gemini embedding-2.
 */
async function embedText(text: string): Promise<number[]> {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
    const embResponse = await ai.models.embedContent({
        model: 'gemini-embedding-2',
        contents: text,
    });
    const values = embResponse.embeddings?.[0]?.values ?? [];
    if (values.length === 0) throw new Error('Embedding kosong');
    return values;
}

/**
 * Mengubah teks pertanyaan menjadi embedding vektor via Gemini,
 * lalu mencari top-k dokumen milik user yang paling mirip di pgvector Supabase.
 *
 * Strategi dua-pass:
 *  Pass 1 (strict)  — threshold RAG_DISTANCE_THRESHOLD (0.55)
 *  Pass 2 (fallback) — threshold RAG_FALLBACK_THRESHOLD (0.72) bila pass 1 kosong
 *
 * @returns { context, citations } — teks konteks untuk system prompt + metadata chunk untuk UI
 */
async function retrieveRelevantContext(
    messages: { role: string; content: string }[],
    userId: string
): Promise<{ context: string; citations: ChunkCitation[] }> {
    try {
        // Ambil RAG_QUERY_WINDOW pesan user terakhir sebagai query
        const recentUserMessages = messages
            .filter(m => m.role === 'user')
            .slice(-RAG_QUERY_WINDOW)
            .map(m => m.content)
            .join('\n');

        // 🔍 Expand query sebelum embed — lebih banyak sinyal semantik
        const expandedQuery = await expandQuery(recentUserMessages);
        console.log('[RAG] Expanded query:', expandedQuery.substring(0, 120));

        // Embed query yang sudah diperluas
        const embedding = await embedText(expandedQuery);
        const vectorString = `[${embedding.join(',')}]`;

        // ── Pass 1: strict threshold ──
        let docs = await prisma.$queryRaw<{ content: string; distance: number }[]>`
            SELECT content, (embedding <=> ${vectorString}::vector(3072)) AS distance
            FROM "Document"
            WHERE ("userId" = ${userId} OR "isGlobal" = true)
              AND (embedding <=> ${vectorString}::vector(3072)) < ${RAG_DISTANCE_THRESHOLD}
            ORDER BY distance ASC
            LIMIT ${RAG_TOP_K}
        `;

        // ── Pass 2: fallback — jika pass 1 kosong, coba threshold lebih longgar ──
        if (!docs || docs.length === 0) {
            console.log('[RAG] Pass 1 kosong, mencoba fallback threshold', RAG_FALLBACK_THRESHOLD);
            docs = await prisma.$queryRaw<{ content: string; distance: number }[]>`
                SELECT content, (embedding <=> ${vectorString}::vector(3072)) AS distance
                FROM "Document"
                WHERE ("userId" = ${userId} OR "isGlobal" = true)
                  AND (embedding <=> ${vectorString}::vector(3072)) < ${RAG_FALLBACK_THRESHOLD}
                ORDER BY distance ASC
                LIMIT ${RAG_TOP_K}
            `;
        }

        if (!docs || docs.length === 0) {
            return { context: '', citations: [] };
        }

        const context = docs
            .map((doc, i) => `[Referensi ${i + 1}]\n${doc.content}`)
            .join('\n\n');

        // Siapkan metadata citation untuk ditampilkan di UI
        const citations: ChunkCitation[] = docs.map((doc, i) => ({
            index: i + 1,
            snippet: doc.content.substring(0, 180).trim() + (doc.content.length > 180 ? '…' : ''),
            distance: Math.round(doc.distance * 10000) / 10000,
        }));

        return { context, citations };
    } catch (err) {
        console.error('[RAG] Gagal mengambil konteks:', err);
        return { context: '', citations: [] };
    }
}


export const dynamic = 'force-dynamic';

// ================= GET =================
export async function GET(req: Request) {
    try {
        const supabase = await getSupabaseServer();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) return NextResponse.json([], { status: 401 });

        const { searchParams } = new URL(req.url);
        const chatId = searchParams.get('chatId');

        if (!chatId) return NextResponse.json([]);

        const chat = await prisma.chat.findUnique({ where: { id: chatId } });

        if (!chat || chat.userId !== user.id) {
            return NextResponse.json([], { status: 403 });
        }

        const messages = await prisma.message.findMany({
            where: { chatId },
            orderBy: { createdAt: 'asc' },
        });

        return NextResponse.json(messages);
    } catch (error) {
        console.error('GET /api/chat error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

// ================= POST =================
export async function POST(req: Request) {
    try {
        const supabase = await getSupabaseServer();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // ⏱️ Rate limiting: 20 request per menit per user
        const rl = checkRateLimit(user.id);
        if (!rl.allowed) {
            const seconds = Math.ceil(rl.resetInMs / 1000);
            return NextResponse.json(
                { error: `Terlalu banyak permintaan. Coba lagi dalam ${seconds} detik.` },
                { status: 429, headers: { 'Retry-After': String(seconds) } }
            );
        }

        const body = await req.json();
        const { chatId, messages: rawMessages, kbEnabled = true } = body;

        if (!chatId) {
            console.error("Missing chatId in request:", body);
            return NextResponse.json({ error: 'Missing chatId' }, { status: 400 });
        }

        const lastUserMessage = rawMessages[rawMessages.length - 1];

        // 🔒 Trim history untuk mencegah token bloat sebelum dikirim ke LLM
        const messages = trimMessages(rawMessages);

        // Karena Supabase Auth tidak secara otomatis membuat baris User di schema Prisma (public.User),
        // Kita paksa pendaftaran lazily di sini untuk mencegah error Foreign Key Constraint P2003
        await prisma.user.upsert({
            where: { id: user.id },
            update: {},
            create: {
                id: user.id,
                email: user.email || 'no-email@supabase.local',
                password: 'supabase-auth-managed'
            }
        });

        const isNewChat = rawMessages.length === 1;

        // 🔥 Backend tetap kontrol userId
        await prisma.chat.upsert({
            where: { id: chatId },
            update: {},
            create: {
                id: chatId,
                title: (lastUserMessage?.content || 'Obrolan Baru').slice(0, 50),
                userId: user.id,
            },
        });

        // 🔥 Fitur Judul Cerdas (Berjalan diam-diam di background)
        if (isNewChat && lastUserMessage?.content) {
            generateText({
                model: groq('llama-3.3-70b-versatile'),
                system: 'Anda adalah asisten perangkum. Buatlah judul super singkat (maksimal 3 kata) yang mencerminkan inti topik dari pesan pengguna. Jangan gunakan tanda kutip, titik, atau gaya kutipan.',
                prompt: lastUserMessage.content,
            }).then(async ({ text }) => {
                await prisma.chat.update({
                    where: { id: chatId },
                    data: { title: text.trim() }
                });
            }).catch(err => console.error('Gagal membuat judul AI:', err));
        }

    await prisma.message.create({
        data: {
            chatId,
            content: lastUserMessage.content,
            role: 'user',
        },
    });

        // 🔀 KB Toggle — baca flag dari frontend (default: true = aktif)
        const useKB = kbEnabled !== false;

        // 🧠 Cek apakah knowledge base user ini sudah berisi dokumen (hanya kalau KB aktif)
        const kbExists = useKB && await hasKnowledgeBase(user.id);

        // 🔍 Ambil konteks relevan dari knowledge base user ini via RAG
        const { context: ragContext, citations } = kbExists
            ? await retrieveRelevantContext(rawMessages, user.id)
            : { context: '', citations: [] };

        // 📋 Bangun system prompt berdasarkan mode
        let systemPrompt: string;

        if (!useKB) {
            // 🟢 MODE BEBAS: Knowledge Base dimatikan oleh user — AI bebas menjawab
            systemPrompt = `Anda adalah AI chatbot bernama Arise, asisten cerdas yang siap membantu.
Anda dapat menjawab pertanyaan apapun dari pengetahuan umum Anda secara bebas, akurat, dan membantu.
Jawab secara natural, ramah, dan profesional.
PENTING BAHASA: Deteksi bahasa dari pesan terakhir user dan SELALU jawab dalam bahasa yang SAMA. Jika Indonesia → Indonesia, jika English → English.`;

        } else if (kbExists && ragContext) {
            // ✅ MODE AKTIF: KB ada + konteks relevan ditemukan
            systemPrompt = `Anda adalah AI chatbot bernama Arise yang dirancang untuk menjawab pertanyaan berdasarkan dokumen yang tersedia.

ATURAN PERILAKU — IKUTI DENGAN TEPAT:

1. SMALL TALK (sapaan, basa-basi seperti "halo", "hai", "selamat pagi"):
   → Balas dengan ramah dan jelaskan fungsi Anda secara singkat.
   → Contoh: "Halo! Saya AI chatbot yang siap membantu menjawab pertanyaan berdasarkan dokumen yang tersedia. Silakan ajukan pertanyaan Anda."

2. META QUESTION (pertanyaan tentang diri Anda seperti "kamu apa?", "siapa kamu?", "kamu bisa apa?"):
   → Jelaskan fungsi Anda secara umum tanpa menyebut nama perusahaan spesifik.
   → Contoh: "Saya adalah AI chatbot yang membantu menjawab pertanyaan berdasarkan dokumen yang telah diberikan kepada saya."

3. PERTANYAAN SESUAI DOKUMEN:
   → Jawab berdasarkan KONTEKS PENGETAHUAN di bawah ini.
   → Gunakan SELURUH informasi yang relevan dari konteks — jangan hanya ambil sebagian.
   → Jika jawaban tersebar di beberapa referensi, GABUNGKAN semuanya menjadi jawaban yang komprehensif.
   → Jawab secara natural dan profesional — jangan sebut "referensi" atau "dokumen" kepada pengguna.

4. PERTANYAAN DI LUAR DOKUMEN:
   → Jika BENAR-BENAR tidak ada informasi relevan dalam konteks, tolak dengan sopan:
      "Maaf, saya tidak menemukan informasi terkait hal tersebut dalam basis pengetahuan saya."
   → JANGAN menambahkan informasi dari pengetahuan umum Anda.

PENTING BAHASA: Deteksi bahasa dari pesan terakhir user dan SELALU jawab dalam bahasa yang SAMA. Jika Indonesia → Indonesia, jika English → English.

=== KONTEKS PENGETAHUAN ===
${ragContext}
=== AKHIR KONTEKS ===`;

        } else if (kbExists && !ragContext) {
            // ⚠️ MODE AKTIF: KB ada TAPI tidak ada konteks relevan untuk pertanyaan ini
            systemPrompt = `Anda adalah AI chatbot bernama Arise yang dirancang untuk menjawab pertanyaan berdasarkan dokumen yang tersedia.

ATURAN PERILAKU:

1. SMALL TALK (sapaan, basa-basi seperti "halo", "hai", "selamat pagi"):
   → Balas dengan ramah dan jelaskan fungsi Anda.
   → "Halo! Saya AI chatbot yang siap membantu menjawab pertanyaan berdasarkan dokumen yang tersedia. Silakan ajukan pertanyaan Anda."

2. META QUESTION (pertanyaan tentang diri Anda seperti "kamu apa?", "siapa kamu?"):
   → "Saya adalah AI chatbot yang membantu menjawab pertanyaan berdasarkan dokumen yang telah diberikan kepada saya."

3. SEMUA PERTANYAAN LAINNYA:
   → Informasi spesifik untuk pertanyaan ini tidak ditemukan dalam basis pengetahuan.
   → Balas dengan jujur: "Saya tidak menemukan informasi spesifik mengenai hal tersebut dalam basis pengetahuan saya. Apakah Anda bisa memberikan lebih detail atau mencoba menanyakan dengan kata-kata yang berbeda?"
   → JANGAN menjawab dari pengetahuan umum.

PENTING BAHASA: Deteksi bahasa dari pesan terakhir user dan SELALU jawab dalam bahasa yang SAMA.`;

        } else {
            // 🔓 MODE STANDBY: KB kosong — belum ada dokumen diupload
            systemPrompt = `Anda adalah AI chatbot bernama Arise.
Saat ini belum ada dokumen yang dikonfigurasi.
Untuk pertanyaan apapun, sampaikan: "Sistem saya belum memiliki dokumen yang dikonfigurasi. Silakan hubungi administrator untuk mengatur basis pengetahuan terlebih dahulu."
Untuk sapaan/small talk, jawab ramah dan jelaskan situasi ini.
PENTING BAHASA: Deteksi bahasa dari pesan terakhir user dan SELALU jawab dalam bahasa yang SAMA.`;
        }

        // Buat data stream yang mengirim citations SEBELUM teks AI dimulai,
        // lalu gabungkan dengan streamText sehingga useChat().data dapat membacanya.
        const dataStream = createDataStream({
            execute(writer) {
                // 📎 Kirim metadata citations ke frontend sebagai data chunk
                if (citations.length > 0) {
                    writer.writeData({ type: 'rag_citations', citations } as unknown as JSONValue);
                }

                const result = streamText({
                    model: groq('llama-3.3-70b-versatile'),
                    system: systemPrompt,
                    messages,
                    experimental_transform: smoothStream({ delayInMs: 20 }),
                    onFinish: async ({ text }) => {
                        try {
                            await prisma.message.create({
                                data: {
                                    chatId,
                                    content: text,
                                    role: 'assistant',
                                },
                            });
                        } catch (dbErr) {
                            console.error("Error saving assistant message:", dbErr);
                        }
                    },
                    onError: (err) => {
                        console.error("Error groq AI stream:", err);
                    }
                });

                result.mergeIntoDataStream(writer, { sendUsage: false });
            },
            onError: (err) => {
                console.error("createDataStream error:", err);
                return err instanceof Error ? err.message : String(err);
            }
        });

        return new Response(dataStream, {
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
    } catch (error) {
        console.error("POST /api/chat error:", error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}