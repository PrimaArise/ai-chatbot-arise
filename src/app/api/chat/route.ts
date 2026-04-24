import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { groq } from '@ai-sdk/groq';
import { streamText, smoothStream, generateText } from 'ai';
import { getSupabaseServer } from '@/lib/supabase-server';
import { GoogleGenAI } from '@google/genai';
/**
 * Mengecek apakah ada dokumen yang sudah diindeks di knowledge base.
 * Digunakan untuk menentukan apakah AI harus berjalan dalam strict RAG mode.
 */
async function hasKnowledgeBase(): Promise<boolean> {
    const count = await prisma.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*) as count FROM "Document"`;
    return Number(count[0]?.count ?? 0) > 0;
}

/**
 * Mengubah teks pertanyaan menjadi embedding vektor via Gemini,
 * lalu mencari top-k dokumen yang paling mirip di pgvector Supabase.
 * Hanya mengembalikan hasil dengan similarity score yang cukup relevan (distance < 0.5).
 */
async function retrieveRelevantContext(query: string, topK = 5): Promise<string> {
    try {
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
        const embResponse = await ai.models.embedContent({
            model: 'gemini-embedding-2',
            contents: query,
        });
        const embedding: number[] = embResponse.embeddings?.[0]?.values ?? [];
        if (embedding.length === 0) throw new Error('Embedding kosong');
        const vectorString = `[${embedding.join(',')}]`;

        // Cosine similarity search dengan threshold distance < 0.5
        const docs = await prisma.$queryRaw<{ content: string; distance: number }[]>`
            SELECT content, (embedding <=> ${vectorString}::vector(3072)) AS distance
            FROM "Document"
            WHERE (embedding <=> ${vectorString}::vector(3072)) < 0.5
            ORDER BY distance ASC
            LIMIT ${topK}
        `;

        if (!docs || docs.length === 0) return '';

        const context = docs
            .map((doc, i) => `[Referensi ${i + 1}]\n${doc.content}`)
            .join('\n\n');

        return context;
    } catch (err) {
        console.error('[RAG] Gagal mengambil konteks:', err);
        return '';
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

        const body = await req.json();
        const { chatId, messages } = body;

        if (!chatId) {
            console.error("Missing chatId in request:", body);
            return NextResponse.json({ error: 'Missing chatId' }, { status: 400 });
        }

        const lastUserMessage = messages[messages.length - 1];

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

        const isNewChat = messages.length === 1;

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

        // 🧠 Cek apakah knowledge base sudah berisi dokumen
        const kbExists = await hasKnowledgeBase();

        // 🔍 Ambil konteks relevan dari knowledge base via RAG
        const ragContext = kbExists
            ? await retrieveRelevantContext(lastUserMessage.content)
            : '';

        // 📋 Bangun system prompt dengan 4-behavior logic
        let systemPrompt: string;

        if (kbExists && ragContext) {
            // ✅ MODE AKTIF: KB ada + konteks relevan ditemukan
            // → Handle semua 4 behavior dalam 1 prompt
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

=== KONTEKS PENGETAHUAN ===
${ragContext}
=== AKHIR KONTEKS ===`;

        } else if (kbExists && !ragContext) {
            // ⚠️ MODE AKTIF: KB ada TAPI tidak ada konteks relevan untuk pertanyaan ini
            // → Handle small talk & meta question, tolak sisanya
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
   → JANGAN menjawab dari pengetahuan umum.`;

        } else {
            // 🔓 MODE STANDBY: KB kosong — belum ada dokumen diupload
            systemPrompt = `Anda adalah AI chatbot bernama Arise.
Saat ini belum ada dokumen yang dikonfigurasi.
Untuk pertanyaan apapun, sampaikan: "Sistem saya belum memiliki dokumen yang dikonfigurasi. Silakan hubungi administrator untuk mengatur basis pengetahuan terlebih dahulu."
Untuk sapaan/small talk, jawab ramah dan jelaskan situasi ini.`;
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

        return result.toDataStreamResponse();
    } catch (error) {
        console.error("POST /api/chat error:", error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}