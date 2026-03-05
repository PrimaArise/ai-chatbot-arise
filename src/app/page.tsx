'use client';

import { useChat } from '@ai-sdk/react';
// 1. Tambahkan import useEffect dan useRef dari React
import { useEffect, useRef } from 'react';

export default function Home() {
  const { messages, input, handleInputChange, handleSubmit } = useChat();

  // 2. Buat referensi untuk elemen paling bawah
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 3. Efek untuk auto-scroll setiap kali 'messages' berubah
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="flex flex-col h-screen bg-neutral-950 text-neutral-100 font-sans">
      <header className="py-5 text-center border-b border-neutral-800 bg-neutral-900/50">
        <h1 className="text-2xl font-bold tracking-tight text-white">AI Chatbot Arise</h1>
        <p className="text-neutral-400 text-sm mt-1">Tanyakan apa saja kepada saya</p>
      </header>

      {/* Area Chat */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 w-full max-w-3xl mx-auto space-y-6">
        {messages.length === 0 && (
          <div className="h-full flex items-center justify-center text-neutral-500 text-sm">
            Kirim pesan pertama Anda untuk memulai percakapan...
          </div>
        )}

        {messages.map(m => (
          <div
            key={m.id}
            className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] sm:max-w-[75%] p-4 rounded-2xl ${m.role === 'user'
                  ? 'bg-blue-600 text-white rounded-br-sm shadow-md'
                  : 'bg-neutral-800 text-neutral-200 rounded-bl-sm border border-neutral-700 shadow-sm'
                }`}
            >
              <span className="text-[11px] font-bold opacity-50 block mb-1 uppercase tracking-wider">
                {m.role === 'user' ? 'Anda' : 'AI Assistant'}
              </span>
              <p className="leading-relaxed whitespace-pre-wrap">{m.content}</p>
            </div>
          </div>
        ))}
        {/* 4. Titik jangkar tidak terlihat di paling bawah */}
        <div ref={messagesEndRef} />
      </div>

      <div className="w-full max-w-3xl mx-auto p-4 bg-neutral-950">
        <form onSubmit={handleSubmit} className="flex gap-3">
          <input
            className="flex-1 p-4 bg-neutral-900 border border-neutral-800 rounded-xl text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-600/50 transition-all"
            value={input}
            placeholder="Ketik pesan Anda di sini..."
            onChange={handleInputChange}
          />
          <button
            type="submit"
            disabled={!input.trim()}
            className="bg-blue-600 text-white px-6 py-4 rounded-xl font-semibold hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md"
          >
            Kirim
          </button>
        </form>
      </div>
    </div>
  );
}