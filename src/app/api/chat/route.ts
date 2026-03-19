import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { groq } from '@ai-sdk/groq';
import { streamText, smoothStream } from 'ai';

// Paksa agar selalu dipanggil secara dinamis (tidak di-cache) untuk membantu streaming
export const dynamic = 'force-dynamic';

// GET: Mengambil history chat berdasarkan chatId
export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const chatId = searchParams.get('chatId');

        if (!chatId) return NextResponse.json([]);

        const messages = await prisma.message.findMany({
            where: { chatId: chatId },
            orderBy: { createdAt: 'asc' },
        });

        // Mapping format internal ke format yang dimengerti useChat
        return NextResponse.json(messages);
    } catch (error) {
        console.error('Error fetching messages:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

// POST: Menangani chat dengan AI dan menyimpan history ke database
export async function POST(req: Request) {
    try {
        const { chatId, messages } = await req.json();

        if (!chatId || !messages || !Array.isArray(messages)) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const lastUserMessage = messages[messages.length - 1];

        // 1. Pastikan Chat session sudah ada
        await prisma.chat.upsert({
            where: { id: chatId },
            update: {},
            create: {
                id: chatId,
                title: lastUserMessage.content.substring(0, 50) || 'New Chat',
            },
        });

        // 2. Simpan pesan user ke database
        await prisma.message.create({
            data: {
                chatId: chatId,
                content: lastUserMessage.content,
                role: 'user',
            },
        });

        // 3. Panggil AI dengan Groq
        const result = streamText({
            // Pilih model yang sangat cepat
            model: groq('llama-3.3-70b-versatile'),
            messages: messages,
            experimental_transform: smoothStream(),
            // Opsional: Suhu sedikit diturunkan agar generasinya lebih stabil
            temperature: 0.7,
            onFinish: async ({ text }) => {
                // 4. Simpan jawaban AI ke database setelah selesai streaming
                try {
                    await prisma.message.create({
                        data: {
                            chatId: chatId,
                            content: text,
                            role: 'assistant',
                        },
                    });
                } catch (e) {
                    console.error('Gagal menyimpan pesan AI:', e);
                }
            },
        });

        // Kembalikan streaming response ke frontend
        return result.toDataStreamResponse();
    } catch (error) {
        console.error('Error in Chat API:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}