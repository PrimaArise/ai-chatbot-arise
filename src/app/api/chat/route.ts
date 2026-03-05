import { streamText } from 'ai';
import { groq } from '@ai-sdk/groq';

export async function POST(req: Request) {
    const { messages } = await req.json();

    const result = await streamText({
        model: groq('llama-3.3-70b-versatile'),
        messages,
    });

    return result.toDataStreamResponse();
}