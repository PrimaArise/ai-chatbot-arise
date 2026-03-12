'use client';

import { useChat } from '@ai-sdk/react';
import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Menu, Plus, Send, MessageSquare, Settings } from 'lucide-react';
import WelcomeScreen from '@/components/WelcomeScreen';

export default function Home() {
  const [ruanganId, setRuanganId] = useState('');
  const [chatList, setChatList] = useState<any[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);

  // Kita tambahkan setMessages untuk memasukkan riwayat obrolan
  const { messages, input, handleInputChange, handleSubmit, setMessages } = useChat({
    body: {
      chatId: ruanganId
    }
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Buat ruangan baru secara otomatis saat aplikasi dibuka
  useEffect(() => {
    const defaultRoom = `room-${Date.now()}`;
    setRuanganId(defaultRoom);
    setIsLoadingHistory(false); // Jangan loading di ruangan baru agar Front Page langsung muncul
  }, []);

  // Efek untuk mengambil daftar chat sidebar
  useEffect(() => {
    fetch('/api/chats')
      .then(res => res.json())
      .then(data => {
        if (data && Array.isArray(data)) {
          setChatList(data);
        }
      })
      .catch(err => console.error("Gagal memuat daftar chat:", err));
  }, [messages.length]); // Refresh saat pesan/chat baru bertambah

  // Efek untuk mengambil riwayat / id ruangan berubah
  useEffect(() => {
    if (!ruanganId) return; // Jika belum ada ID dari useEffect pertama, jangan jalankan

    setMessages([]); // Kosongkan saat pindah ruangan
    setIsLoadingHistory(true); // Mulai loading
    fetch(`/api/chat?chatId=${ruanganId}`)
      .then(res => res.json())
      .then(data => {
        if (data && data.length > 0) {
          // Masukkan data dari database ke layar
          setMessages(data);
        }
      })
      .catch(err => console.error("Gagal memuat riwayat:", err))
      .finally(() => setIsLoadingHistory(false)); // Selesai loading
  }, [setMessages, ruanganId]);

  // Efek untuk auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const buatChatBaru = () => {
    setRuanganId(`room-${Date.now()}`);
    setMessages([]);
    // Jika di layar kecil, buka sidebar saat buat chat baru supaya kelihatan daftarnya
    if (window.innerWidth < 640) setIsSidebarOpen(true);
  };

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };



  const isChatEmpty = messages.length === 0;

  return (
    <div className="flex h-screen bg-neutral-950 text-neutral-100 font-sans overflow-hidden">
      {/* Sidebar */}
      <div
        className={`${isSidebarOpen ? 'w-64' : 'w-0'
          } bg-neutral-900 border-r border-neutral-800 flex flex-col shrink-0 transition-all duration-300 ease-in-out relative overflow-hidden`}
      >
        <div className="p-4 border-b border-transparent flex items-center shrink-0 w-64 mt-2 sticky top-0 bg-neutral-900 z-10">
          <button
            onClick={buatChatBaru}
            className="w-full bg-neutral-800 hover:bg-neutral-700 text-neutral-200 py-3 px-4 rounded-xl font-medium transition-all shadow-sm flex items-center justify-between text-sm whitespace-nowrap border border-neutral-700">
            <div className="flex items-center gap-3">
              <MessageSquare size={18} className="text-neutral-100" />
              <span>Obrolan Baru</span>
            </div>
            <Plus size={16} className="text-neutral-400" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-1 w-64">
          {chatList.map((chat) => (
            <button
              key={chat.id}
              onClick={() => {
                setRuanganId(chat.id);
                if (window.innerWidth < 640) setIsSidebarOpen(false); // Tutup sidebar otomatis di mobile
              }}
              className={`w-full text-left px-3 py-3 rounded-lg text-sm truncate transition-all ${ruanganId === chat.id ? 'bg-neutral-800 text-white font-medium shadow-sm' : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200'}`}
            >
              {chat.title}
            </button>
          ))}
        </div>

        {/* Bagian Bawah Sidebar (Spacer) */}
        <div className="h-15 shrink-0 w-64 bg-transparent mt-auto pointer-events-none">
          {/* Ruang kosong untuk menghindari tabrakan dengan logo Next.js Dev */}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0 transition-all duration-300 relative z-10 bg-[#0a0a0a]">
        <header className="py-4 px-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 w-1/4">
            <button
              onClick={toggleSidebar}
              className="p-2 hover:bg-neutral-800 rounded-lg text-neutral-400 hover:text-white transition-colors cursor-pointer shrink-0"
              aria-label="Toggle Sidebar"
            >
              <Menu size={24} />
            </button>
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-white flex-1 text-center truncate">AI Chatbot Arise</h1>
          <div className="w-1/4"></div> {/* Spacer for centering */}
        </header>

        {isLoadingHistory ? (
          /* Tampilan Loading Spinner di Tengah (Bisa dikosongkan jika mau) */
          <div className="flex-1 flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
          </div>
        ) : isChatEmpty ? (
          /* Tampilan Halaman Kosong (Landing Page) sekarang dipisah ke komponen terpisah */
          <WelcomeScreen
            input={input}
            handleInputChange={handleInputChange}
            handleSubmit={handleSubmit}
          />
        ) : (
          /* Tampilan Chat Aktif */
          <>
            <div className="flex-1 overflow-y-auto w-full">
              <div className="p-4 sm:p-6 w-full max-w-4xl mx-auto space-y-6">
                {messages.map((m, idx) => (
                  <div
                    key={m.id || idx}
                    className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[90%] sm:max-w-[80%] p-4 rounded-3xl ${m.role === 'user'
                        ? 'bg-[#1a1a1a] text-white' // Gaya bubble pengguna gelap
                        : 'text-neutral-200' // Pesan AI tanpa latar yang jelas seperti Gemini
                        }`}
                    >
                      <span className="text-[11px] font-bold opacity-50 block mb-2 uppercase tracking-wider">
                        {m.role === 'user' ? 'Anda' : 'AI Assistant'}
                      </span>

                      {m.role === 'user' ? (
                        <p className="leading-relaxed whitespace-pre-wrap">{m.content}</p>
                      ) : (
                        <div className="prose prose-invert prose-sm max-w-none prose-p:leading-relaxed prose-pre:bg-neutral-900 prose-pre:border prose-pre:border-neutral-700 break-words overflow-x-auto">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {m.content}
                          </ReactMarkdown>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            </div>

            {/* Area Input (Sticky bawah) saat chat aktif */}
            <div className="w-full shrink-0 bg-transparent p-4 pb-6">
              <div className="max-w-4xl mx-auto bg-neutral-900 border border-neutral-800 rounded-2xl p-2 shadow-lg">
                <form onSubmit={handleSubmit} className="flex gap-2">
                  <input
                    className="flex-1 p-3 bg-transparent text-neutral-100 placeholder-neutral-400 focus:outline-none"
                    value={input}
                    placeholder="Minta AI..."
                    onChange={handleInputChange}
                  />
                  <button
                    type="submit"
                    disabled={!input.trim()}
                    className="p-3 text-neutral-400 hover:text-white disabled:opacity-50 transition-colors shrink-0 cursor-pointer"
                  >
                    <Send size={20} className={input.trim() ? "text-blue-500" : ""} />
                  </button>
                </form>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}