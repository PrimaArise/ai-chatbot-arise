import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { groq } from '@ai-sdk/groq';
import { streamText, smoothStream, generateText } from 'ai';
import { getSupabaseServer } from '@/lib/supabase-server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

/**
 * Mengubah teks pertanyaan menjadi embedding vektor via Gemini,
 * lalu mencari top-k dokumen yang paling mirip di pgvector Supabase.
 */
async function retrieveRelevantContext(query: string, topK = 3): Promise<string> {
    try {
        const model = genAI.getGenerativeModel({ model: 'text-embedding-004' });
        const result = await model.embedContent(query);
        const embedding = result.embedding.values;
        const vectorString = `[${embedding.join(',')}]`;

        // Cosine similarity search menggunakan operator <=> (cosine distance)
        const docs = await prisma.$queryRaw<{ content: string; distance: number }[]>`
            SELECT content, (embedding <=> ${vectorString}::vector) AS distance
            FROM "Document"
            ORDER BY distance ASC
            LIMIT ${topK}
        `;

        if (!docs || docs.length === 0) return '';

        // Gabungkan semua chunk relevan menjadi blok konteks
        const context = docs
            .map((doc, i) => `[Dokumen ${i + 1}]\n${doc.content}`)
            .join('\n\n');

        return context;
    } catch (err) {
        console.error('[RAG] Gagal mengambil konteks:', err);
        return ''; // Fallback tanpa konteks — bot tetap menjawab seperti biasa
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

        // 🧠 Ambil konteks relevan dari knowledge base via RAG
        const ragContext = await retrieveRelevantContext(lastUserMessage.content);

        // Bangun system prompt: jika ada dokumen relevan, tambahkan sebagai konteks
        const systemPrompt = ragContext
            ? `Anda adalah asisten AI bernama Arise yang cerdas dan membantu.
Jawab pertanyaan pengguna BERDASARKAN konteks dokumen di bawah ini. 
Jika jawabannya tidak ada dalam dokumen, katakan dengan jujur bahwa Anda tidak menemukan informasi relevan dalam basis pengetahuan Anda, namun tetap coba bantu sebisa mungkin.
Jangan menyebutkan kata "dokumen" secara eksplisit kepada pengguna — jawab saja secara natural.

=== KONTEKS PENGETAHUAN ===
${ragContext}
=== AKHIR KONTEKS ===`
            : `Anda adalah asisten AI bernama Arise yang cerdas dan membantu. Jawab pertanyaan pengguna dengan akurat dan ringkas.`;

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