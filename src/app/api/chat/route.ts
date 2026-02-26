import { createGroq } from '@ai-sdk/groq';
import { streamText } from 'ai';

// Inisialisasi koneksi ke Groq
const groq = createGroq({
    apiKey: process.env.GROQ_API_KEY,
});

export async function POST(req: Request) {
    try {
        const { messages } = await req.json();

        // Memanggil model Llama 3 untuk respons super cepat
        const result = await streamText({
            model: groq('llama-3.3-70b-versatile'),
            messages,
        });

        // Mengirimkan jawaban dalam bentuk aliran teks (streaming)
        return result.toDataStreamResponse();
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Internal Server Error';
        return new Response(
            JSON.stringify({ error: errorMessage }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }
}