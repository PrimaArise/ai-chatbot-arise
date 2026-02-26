'use client';

import { useChat } from '@ai-sdk/react';

export default function Home() {
  // Menggunakan fungsi bawaan Vercel AI SDK untuk mengelola pesan
  const { messages, input, handleInputChange, handleSubmit } = useChat();

  return (
    <div className="flex flex-col w-full max-w-2xl py-24 mx-auto stretch font-sans">
      <header className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-50">
          AI Chatbot Telco
        </h1>
        <p className="text-zinc-500">Zero-Latency Experience with Groq</p>
      </header>

      {/* Area Pesan Chat */}
      <div className="flex-1 space-y-4 mb-20 px-4">
        {messages.map(m => (
          <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] p-4 rounded-2xl ${m.role === 'user'
              ? 'bg-zinc-900 text-white dark:bg-zinc-50 dark:text-black'
              : 'bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100'
              }`}>
              <p className="text-sm font-semibold mb-1">
                {m.role === 'user' ? 'You' : 'AI Assistant'}
              </p>
              <div className="whitespace-pre-wrap">{m.content}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Form Input */}
      <form onSubmit={handleSubmit} className="fixed bottom-0 w-full max-w-2xl p-4 bg-white/80 dark:bg-black/80 backdrop-blur-md">
        <input
          className="w-full p-4 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-transparent focus:outline-none focus:ring-2 focus:ring-zinc-500 transition-all"
          value={input}
          placeholder="Tanyakan sesuatu..."
          onChange={handleInputChange}
        />
      </form>
    </div>
  );
}