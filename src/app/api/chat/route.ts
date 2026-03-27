import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { groq } from '@ai-sdk/groq';
import { streamText, smoothStream } from 'ai';

// Menonaktifkan sistem cache bawaan Next.js agar aliran teks (streaming) tidak tertahan
export const dynamic = 'force-dynamic';

// ============================================================================
// [GET] ROUTE: MENGAMBIL RIWAYAT CHAT
// Fungsi ini otomatis dipanggil saat halaman dimuat untuk memunculkan pesan lama
// ============================================================================
export async function GET(req: Request) {
    try {
        // Mengekstrak ID Obrolan saat ini dari parameter URL (?chatId=...)
        const { searchParams } = new URL(req.url);
        const chatId = searchParams.get('chatId');

        // Jika ID kosong, kembalikan ruang kosong
        if (!chatId) return NextResponse.json([]);

        // Mencari semua pesan terkait di Supabase, dan diurutkan dari yang paling awal (asc)
        const messages = await prisma.message.findMany({
            where: { chatId: chatId },
            orderBy: { createdAt: 'asc' },
        });

        return NextResponse.json(messages);
    } catch (error) {
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

// ============================================================================
// [POST] ROUTE: MENGIRIM PESAN KE AI DAN MENYIMPAN KE DATABASE
// Fungsi ini dipanggil ketika user menekan enter atau memencet tombol pesawat kertas
// ============================================================================
export async function POST(req: Request) {
    try {
        // Membaca pesan yang dikirim oleh antarmuka browser
        const { chatId, messages } = await req.json();

        // Keamanan: Tolak jika data tidak sesuai format
        if (!chatId || !messages || !Array.isArray(messages)) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // Pesan yang baru saja diketik posisinya pasti paling terakhir di dalam susunan Array
        const lastUserMessage = messages[messages.length - 1];

        // Tahap 1: Registrasi Ruang Obrolan
        // Memastikan judul ruangan ini ada di database supaya muncul di Sidebar kiri
        await prisma.chat.upsert({
            where: { id: chatId },
            update: {}, // Jika ruang obrolan sudah ada, biarkan apa adanya
            create: {
                id: chatId,
                title: lastUserMessage.content.substring(0, 50) || 'New Chat',
            },
        });

        // Tahap 2: Arsipkan Pesan Pengguna
        // Menyimpan apa yang diketik manusia ke dalam Database
        await prisma.message.create({
            data: {
                chatId: chatId,
                content: lastUserMessage.content,
                role: 'user',
            },
        });

        // Tahap 3: Menghubungi Mesin Groq AI
        // Menggunakan library streamText agar teks dikirim sepotong-demi-sepotong secara real-time
        const result = streamText({
            model: groq('llama-3.3-70b-versatile'),
            messages: messages,
            // smoothStream memastikan ketikan munculnya kata-per-kata seperti layaknya manusia mengetik
            experimental_transform: smoothStream({ delayInMs: 20, chunking: 'word' }),
            temperature: 0.7,
            onFinish: async ({ text }) => {
                // Tahap 4: Arsipkan Pesan AI
                // Setelah AI tuntas bicara sampai akhir, barulah seluruh kata-katanya disimpan permanen ke Database
                try {
                    await prisma.message.create({
                        data: {
                            chatId: chatId,
                            content: text,
                            role: 'assistant',
                        },
                    });
                } catch (e) {
                    // Berjalan di latar belakang sehingga abaikan log
                }
            },
        });

        // Tahap 5: Kirimkan balasan ke layar pengguna
        return result.toDataStreamResponse();
    } catch (error) {
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}