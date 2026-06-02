import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { groq } from '@ai-sdk/groq';
import { streamText, smoothStream, generateText, CoreMessage, createDataStream, JSONValue } from 'ai';
import { getSupabaseServer } from '@/lib/supabase-server';
import { GoogleGenAI } from '@google/genai';
import { checkRateLimit } from '@/lib/rate-limit';
import { BUILT_IN_KNOWLEDGE } from '@/data/system-knowledge';

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
 * Sengaja dibiarkan cukup longgar agar pertanyaan informal/colloquial yang topiknya
 * ada di KB tetap bisa menemukan chunk relevan.
 * Gatekeeper utama ada di system prompt (LLM mengevaluasi sendiri relevansi konteks),
 * bukan di threshold ini.
 */
const RAG_FALLBACK_THRESHOLD = 0.68;

/**
 * Jumlah chunk RAG yang diambil (top-k).
 * Dikurangi 8 → 5: chunk ke-6,7,8 yang jauh dari query menambah noise
 * dan meningkatkan risiko hallucination pada model.
 */
const RAG_TOP_K = 5;

/**
 * Jumlah pesan user terakhir yang digabung sebagai query RAG.
 * Dikurangi 3 → 2: lebih fokus ke pertanyaan terkini,
 * mengurangi drift topik dari konteks percakapan sebelumnya.
 */
const RAG_QUERY_WINDOW = 2;

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
        WHERE "userId" = ${userId}
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
            // ⚡ Model kecil cukup untuk query expansion — hemat TPD 70B untuk chat utama
            model: groq('llama-3.1-8b-instant'),
            system: `You are a search query optimizer for a RAG document retrieval system.
Your task is to rewrite a user's question into a rich, technical search query that maximizes the chance of matching relevant document chunks — especially when the user uses informal, colloquial, or non-technical language.

Rules:
- Translate informal/colloquial terms to their formal/technical equivalents (e.g., "kebobolan" → "kerentanan keamanan, data breach, serangan siber"; "lemot" → "performa lambat, bottleneck")
- Include synonyms, related technical terms, and broader/narrower concepts
- Keep the query in the SAME language as the original question
- Output ONLY the expanded query — no explanation, no bullet points, just the query text
- Maximum 3 sentences
- Do NOT answer the question, only expand/rephrase it for document search purposes`,
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
): Promise<{ context: string; citations: ChunkCitation[]; isStrictMatch: boolean }> {
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
            WHERE "userId" = ${userId}
              AND (embedding <=> ${vectorString}::vector(3072)) < ${RAG_DISTANCE_THRESHOLD}
            ORDER BY distance ASC
            LIMIT ${RAG_TOP_K}
        `;

        // isStrictMatch = true jika chunks berasal dari pass 1 (threshold ketat)
        let isStrictMatch = docs.length > 0;

        // ── Pass 2: fallback — jika pass 1 kosong, coba threshold lebih longgar ──
        if (!docs || docs.length === 0) {
            console.log('[RAG] Pass 1 kosong, mencoba fallback threshold', RAG_FALLBACK_THRESHOLD);
            docs = await prisma.$queryRaw<{ content: string; distance: number }[]>`
                SELECT content, (embedding <=> ${vectorString}::vector(3072)) AS distance
                FROM "Document"
                WHERE "userId" = ${userId}
                  AND (embedding <=> ${vectorString}::vector(3072)) < ${RAG_FALLBACK_THRESHOLD}
                ORDER BY distance ASC
                LIMIT ${RAG_TOP_K}
            `;
            isStrictMatch = false; // fallback = kemungkinan kurang relevan
        }

        if (!docs || docs.length === 0) {
            return { context: '', citations: [], isStrictMatch: false };
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

        console.log(`[RAG] ${docs.length} chunk ditemukan (isStrictMatch=${isStrictMatch}, top distance=${docs[0]?.distance?.toFixed(4)})`);
        return { context, citations, isStrictMatch };
    } catch (err) {
        console.error('[RAG] Gagal mengambil konteks:', err);
        return { context: '', citations: [], isStrictMatch: false };
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
            const jam = Math.ceil(rl.resetInMs / (1000 * 60 * 60));
            return NextResponse.json(
                { error: `Batas pesan harian tercapai (20 pesan/hari). Kuota akan reset dalam ${jam} jam.` },
                { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.resetInMs / 1000)) } }
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
                // ⚡ Model kecil cukup untuk generate judul — hemat TPD 70B
                model: groq('llama-3.1-8b-instant'),
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
        const { context: ragContext, citations, isStrictMatch } = kbExists
            ? await retrieveRelevantContext(rawMessages, user.id)
            : { context: '', citations: [], isStrictMatch: false };

        // 🌡️ Temperature adaptif:
        //   KB ON  → 0.3 (cukup strict untuk factual, tidak freeze di Groq seperti 0.1)
        //   KB OFF → 0.7 (natural, kreatif, cocok untuk percakapan bebas)
        const chatTemperature = useKB ? 0.3 : 0.7;

        // 📋 Bangun system prompt berdasarkan mode
        let systemPrompt: string;

        if (!useKB) {
            // 🟢 MODE BEBAS: Knowledge Base dimatikan — AI bebas menjawab + selalu punya built-in knowledge
            systemPrompt = `Anda adalah AI chatbot bernama Arise, asisten cerdas yang siap membantu.
Anda dapat menjawab pertanyaan apapun dari pengetahuan umum Anda secara bebas, akurat, dan membantu.
Jawab secara natural, ramah, dan profesional.
PENTING BAHASA: Deteksi bahasa dari pesan terakhir user dan SELALU jawab dalam bahasa yang SAMA. Jika Indonesia → Indonesia, jika English → English.

=== INFORMASI SISTEM AI ARISE (SELALU TERSEDIA) ===
${BUILT_IN_KNOWLEDGE}
=== AKHIR INFORMASI SISTEM ===`;

        } else if (kbExists && ragContext) {
            // ✅ MODE AKTIF: KB ada + konteks ditemukan (strict atau fallback)
            // Strategi: LLM sendiri yang mengevaluasi apakah konteks cukup menjawab pertanyaan.
            // Jika tidak cukup → wajib gunakan kalimat penolakan, bukan menjawab dari pengetahuan umum.
            const fallbackNote = isStrictMatch
                ? ''
                : '\n[CATATAN INTERNAL: Konteks di bawah ditemukan lewat pencarian luas (fallback). Evaluasi dengan cermat apakah konteks ini benar-benar menjawab pertanyaan user sebelum merespons.]\n';

            systemPrompt = `Anda adalah Arise, asisten berbasis dokumen. Anda menjawab pertanyaan HANYA berdasarkan dokumen yang tersedia.
${fallbackNote}
⛔ LARANGAN KERAS — TIDAK ADA PENGECUALIAN:
- DILARANG menggunakan pengetahuan training model untuk menjawab pertanyaan substantif.
- DILARANG menambahkan fakta, data, angka, atau informasi yang tidak ada dalam KONTEKS DOKUMEN di bawah.
- DILARANG KERAS menyebut nama produk, merek, brand, software, atau contoh spesifik yang TIDAK tercantum secara eksplisit di dokumen,
  walaupun Anda mengetahui jawabannya dari pengetahuan umum.
- Jika dokumen menyebut suatu KONSEP (misalnya: "antivirus", "firewall", "enkripsi") tapi tidak memberi contoh spesifik →
  JANGAN tambahkan contoh dari pengetahuan Anda. Cukup sampaikan apa yang ada di dokumen, lalu gunakan kalimat penolakan untuk bagian yang tidak ada.
- Riwayat percakapan sebelumnya BUKAN sumber fakta — hanya KONTEKS DOKUMEN yang menjadi acuan.

✅ CARA MERESPONS:
1. Sapaan / small talk ("halo", "selamat pagi", dll.)
   → Balas ramah, jelaskan fungsi Anda secara singkat.
2. Pertanyaan tentang sistem Arise ("kamu siapa?", "kamu bisa apa?")
   → Jawab berdasarkan INFORMASI SISTEM di bawah.
3. Pertanyaan yang dapat dijawab dari KONTEKS DOKUMEN
   → Cek apakah konteks berisi informasi yang secara EKSPLISIT menjawab pertanyaan.
   → Jika ya: jawab hanya dari isi dokumen. Jangan sebut "dokumen" atau "referensi" kepada user.
   → Jika TIDAK ada di konteks: gunakan kalimat penolakan.
   → Jika konteks ada tapi TIDAK cukup (misalnya hanya menyebut konsep tanpa detail/contoh yang ditanyakan):
      → Sampaikan apa yang ada di dokumen, lalu tambahkan kalimat penolakan untuk bagian yang tidak ada.

✅ KALIMAT PENOLAKAN (gunakan jika konteks tidak cukup menjawab):
"Maaf, dokumen tidak menyebutkan informasi spesifik mengenai hal tersebut."

PENTING BAHASA: Deteksi bahasa dari pesan terakhir user. Selalu balas dalam bahasa yang sama.

=== INFORMASI SISTEM AI ARISE ===
${BUILT_IN_KNOWLEDGE}
=== AKHIR INFORMASI SISTEM ===

=== KONTEKS DOKUMEN USER ===
${ragContext}
=== AKHIR KONTEKS DOKUMEN ===`;

        } else if (kbExists && !ragContext) {
            // ⚠️ MODE AKTIF: KB ada TAPI sistem pencarian tidak menemukan dokumen relevan sama sekali
            systemPrompt = `Anda adalah Arise, asisten berbasis dokumen.

⛔ PENTING: Sistem pencarian dokumen tidak menemukan konteks yang relevan untuk pertanyaan ini.
DILARANG menjawab pertanyaan substantif dari pengetahuan umum model — gunakan kalimat penolakan.

✅ CARA MERESPONS:
1. Sapaan / small talk → balas ramah, jelaskan fungsi Anda.
2. Pertanyaan tentang sistem Arise → jawab dari INFORMASI SISTEM di bawah.
3. Pertanyaan lain apapun → gunakan kalimat penolakan berikut:
   "Maaf, saya tidak menemukan informasi mengenai hal tersebut dalam basis pengetahuan yang tersedia. Coba tanyakan dengan kata kunci yang berbeda."

PENTING BAHASA: Deteksi bahasa dari pesan terakhir user. Selalu balas dalam bahasa yang sama.

=== INFORMASI SISTEM AI ARISE ===
${BUILT_IN_KNOWLEDGE}
=== AKHIR INFORMASI SISTEM ===`;

        } else {
            // 🔓 MODE STANDBY: KB aktif tapi kosong — belum ada dokumen diupload
            systemPrompt = `Anda adalah AI chatbot bernama Arise.
Basis pengetahuan pengguna saat ini kosong (belum ada dokumen yang diunggah).
Untuk pertanyaan teknis tentang Arise, gunakan INFORMASI SISTEM di bawah.
Untuk pertanyaan lain di luar informasi sistem: "Basis pengetahuan Anda masih kosong. Silakan upload dokumen terlebih dahulu di panel Kostumisasi AI."
PENTING BAHASA: Deteksi bahasa dari pesan terakhir user dan SELALU jawab dalam bahasa yang SAMA.

=== INFORMASI SISTEM AI ARISE (SELALU TERSEDIA) ===
${BUILT_IN_KNOWLEDGE}
=== AKHIR INFORMASI SISTEM ===`;
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
                    temperature: chatTemperature, // 0.1 = KB aktif (strict), 0.7 = KB nonaktif (natural)
                    maxRetries: 2, // auto-retry saat Groq mengembalikan empty output atau transient error
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
                        const msg = err instanceof Error ? err.message : String(err);
                        console.error("[streamText] Groq error:", msg);
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