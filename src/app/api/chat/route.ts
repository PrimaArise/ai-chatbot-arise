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
 * Threshold cosine distance untuk RAG retrieval.
 * Nilai lebih kecil = lebih ketat (hanya chunk yang sangat mirip).
 * Range: 0.0 (identik) → 2.0 (berlawanan). Praktis: < 0.42 = relevan.
 */
const RAG_DISTANCE_THRESHOLD = 0.42;

/**
 * Jumlah chunk RAG yang diambil (top-k).
 */
const RAG_TOP_K = 5;

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
 * Mengubah teks pertanyaan menjadi embedding vektor via Gemini,
 * lalu mencari top-k dokumen milik user yang paling mirip di pgvector Supabase.
 *
 * @returns { context, citations } — teks konteks untuk system prompt + metadata chunk untuk UI
 */
async function retrieveRelevantContext(
    messages: { role: string; content: string }[],
    userId: string
): Promise<{ context: string; citations: ChunkCitation[] }> {
    try {
        // Ambil RAG_QUERY_WINDOW pesan user terakhir sebagai query embedding
        const recentUserMessages = messages
            .filter(m => m.role === 'user')
            .slice(-RAG_QUERY_WINDOW)
            .map(m => m.content)
            .join('\n');

        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
        const embResponse = await ai.models.embedContent({
            model: 'gemini-embedding-2',
            contents: recentUserMessages,
        });
        const embedding: number[] = embResponse.embeddings?.[0]?.values ?? [];
        if (embedding.length === 0) throw new Error('Embedding kosong');
        const vectorString = `[${embedding.join(',')}]`;

        // RAG Pattern 3: cari di dokumen pribadi user + semua dokumen global (admin)
        const docs = await prisma.$queryRaw<{ content: string; distance: number }[]>`
            SELECT content, (embedding <=> ${vectorString}::vector(3072)) AS distance
            FROM "Document"
            WHERE ("userId" = ${userId} OR "isGlobal" = true)
              AND (embedding <=> ${vectorString}::vector(3072)) < ${RAG_DISTANCE_THRESHOLD}
            ORDER BY distance ASC
            LIMIT ${RAG_TOP_K}
        `;

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
   → Jawab HANYA berdasarkan KONTEKS PENGETAHUAN di bawah ini.
   → DILARANG menambahkan informasi dari pengetahuan umum atau training data Anda.
   → Jawab secara natural dan profesional.

4. PERTANYAAN DI LUAR DOKUMEN (tidak ada jawaban dalam konteks):
   → Tolak dengan sopan: "Maaf, saya hanya dapat menjawab berdasarkan dokumen yang tersedia. Pertanyaan Anda berada di luar cakupan informasi saya."
   → JANGAN mencoba menjawab dari pengetahuan umum.

PENTING: Jangan pernah menyebut kata "dokumen", "konteks", atau "referensi" kepada pengguna. Jawab secara natural.
PENTING BAHASA: Deteksi bahasa dari pesan terakhir user dan SELALU jawab dalam bahasa yang SAMA. Jika Indonesia → Indonesia, jika English → English, ikuti bahasa apapun yang user gunakan.

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
   → Tidak ditemukan informasi relevan dalam basis pengetahuan.
   → Balas: "Maaf, saya tidak menemukan informasi terkait hal tersebut. Silakan tanyakan sesuatu yang berkaitan dengan topik yang tersedia."
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