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
 * Dijaga ketat agar chunk yang tidak relevan tidak lolos sebagai "konteks".
 * (diturunkan dari 0.72 → 0.62 untuk mencegah bocor jawaban dari pengetahuan umum)
 */
const RAG_FALLBACK_THRESHOLD = 0.62;

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
        const { context: ragContext, citations, isStrictMatch } = kbExists
            ? await retrieveRelevantContext(rawMessages, user.id)
            : { context: '', citations: [], isStrictMatch: false };

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
            // ✅ MODE AKTIF: KB ada + konteks relevan ditemukan
            // isStrictMatch=false berarti chunk dari fallback (kurang relevan) → prompt lebih waspada
            const strictnessNote = isStrictMatch
                ? '' // pass 1: high confidence
                : '\n⚠️ PERINGATAN INTERNAL: Konteks yang ditemukan mungkin kurang relevan (fallback match). Tetap larang penggunaan pengetahuan umum — gunakan kalimat penolakan jika tidak yakin.\n';

            systemPrompt = `Anda adalah Arise, asisten khusus berbasis dokumen. Tugas Anda HANYA menjawab berdasarkan dokumen yang disediakan.
${strictnessNote}
⛔ LARANGAN MUTLAK — TIDAK ADA PENGECUALIAN:
- DILARANG KERAS menggunakan pengetahuan training model untuk menjawab pertanyaan substantif.
- DILARANG membuat inferensi, asumsi, atau menambahkan informasi dari luar konteks dokumen.
- DILARANG menjawab pertanyaan di luar dokumen walaupun Anda "tahu" jawabannya.

✅ KALIMAT PENOLAKAN RESMI (gunakan persis ini bila informasi tidak ada di dokumen):
"Maaf, saya tidak menemukan informasi mengenai hal tersebut dalam basis pengetahuan yang tersedia."

✅ YANG DIIZINKAN:
1. Sapaan / small talk ("halo", "selamat pagi", dll.)
   → Balas ramah, jelaskan fungsi Anda secara singkat.
2. Pertanyaan tentang sistem Arise ("kamu siapa?", "kamu bisa apa?")
   → Jawab HANYA berdasarkan INFORMASI SISTEM di bawah.
3. Pertanyaan yang jawabannya ADA di KONTEKS DOKUMEN
   → Jawab berdasarkan dokumen. Gabungkan semua referensi relevan. Jangan sebut kata "referensi" atau "dokumen" kepada user.
4. Pertanyaan lain (apapun topiknya) yang jawabannya TIDAK ada di dokumen
   → Wajib gunakan KALIMAT PENOLAKAN RESMI di atas. Tidak ada pengecualian.

PENTING BAHASA: Deteksi bahasa dari pesan terakhir user. Selalu balas dalam bahasa yang sama (Indonesia → Indonesia, English → English).

=== INFORMASI SISTEM AI ARISE (SELALU TERSEDIA) ===
${BUILT_IN_KNOWLEDGE}
=== AKHIR INFORMASI SISTEM ===

=== KONTEKS DOKUMEN USER ===
${ragContext}
=== AKHIR KONTEKS DOKUMEN ===`;

        } else if (kbExists && !ragContext) {
            // ⚠️ MODE AKTIF: KB ada TAPI tidak ada konteks relevan untuk pertanyaan ini
            systemPrompt = `Anda adalah Arise, asisten khusus berbasis dokumen.

⛔ LARANGAN MUTLAK: Sistem pencarian tidak menemukan dokumen yang relevan dengan pertanyaan ini.
ANDA HARUS menolak menjawab pertanyaan substantif — TIDAK ADA PENGECUALIAN.
DILARANG KERAS menggunakan pengetahuan training model untuk menjawab, walaupun Anda "tahu" jawabannya.

✅ KALIMAT PENOLAKAN RESMI (gunakan persis ini):
"Maaf, saya tidak menemukan informasi mengenai hal tersebut dalam basis pengetahuan yang tersedia. Coba tanyakan dengan kata kunci yang berbeda."

✅ SATU-SATUNYA PENGECUALIAN YANG DIIZINKAN:
1. Sapaan / small talk → balas ramah, jelaskan fungsi Anda.
2. Pertanyaan tentang sistem Arise → jawab HANYA dari INFORMASI SISTEM di bawah.
3. Semua hal lain → gunakan KALIMAT PENOLAKAN RESMI di atas.

PENTING BAHASA: Deteksi bahasa dari pesan terakhir user. Selalu balas dalam bahasa yang sama.

=== INFORMASI SISTEM AI ARISE (SELALU TERSEDIA) ===
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