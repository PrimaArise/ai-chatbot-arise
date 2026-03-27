'use client';

import { useChat } from '@ai-sdk/react';
import { useEffect, useRef, useState, memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Menu, Plus, Send, MessageSquare, Settings, MoreVertical, Edit2, Trash2, X, Check, Copy, Square } from 'lucide-react';
import WelcomeScreen from '@/components/WelcomeScreen';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css';
import toast, { Toaster } from 'react-hot-toast';

// Fungsi pembantu (helper) untuk mengekstrak isi teks murni dari elemen React.
// Digunakan oleh fitur Tombol Copy untuk menarik kode pemrograman dari dalam format rendering Markdown.
const extractText = (node: any): string => {
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (node && node.props && node.props.children) return extractText(node.props.children);
  return '';
};

const ChatMessage = memo(({ m }: { m: any }) => {
  return (
    <div className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[90%] sm:max-w-[80%] p-4 rounded-3xl ${m.role === 'user'
          ? 'bg-[#1a1a1a] text-white' // Gaya bubble pengguna gelap
          : 'text-neutral-200' // Pesan AI tanpa latar yang jelas seperti Gemini
          }`}
      >
        <span className="text-[11px] font-bold opacity-50 block mb-2 uppercase tracking-wider">
          {m.role === 'user' ? 'Anda' : 'Arise'}
        </span>

        {m.role === 'user' ? (
          <p className="leading-relaxed whitespace-pre-wrap">{m.content}</p>
        ) : (
          <div className="prose prose-invert prose-sm max-w-none prose-p:leading-relaxed prose-pre:p-0 prose-pre:bg-transparent prose-pre:border-0 break-words overflow-x-auto">
            <ReactMarkdown 
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeHighlight]}
              components={{
                // Menimpa blok kode bawaan bawaan markdown (<pre>) dengan elemen kustom
                pre({ node, className, children, ...props }: any) {
                  return (
                    <div className="relative group my-4">
                      {/* Tombol Copy yang akan muncul saat mouse diarahkan (hover) ke blok kode */}
                      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                        <button
                          onClick={() => {
                            const rawContent = extractText(children);
                            navigator.clipboard.writeText(rawContent); // Salin teks ke memori komputer
                            toast.success('Kode disalin!', { id: 'copy-toast' });
                          }}
                          className="p-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded border border-neutral-700 cursor-pointer shadow-sm"
                          title="Copy Code"
                        >
                          <Copy size={16} />
                        </button>
                      </div>
                      
                      {/* Tempat asli diletakkannya kode pemrograman (syntax highlighting akan merender warnanya di sini) */}
                      <pre {...props} className={`${className || ''} bg-neutral-900 border border-neutral-800 rounded-xl p-4 overflow-x-auto text-[13px] leading-relaxed`}>
                        {children}
                      </pre>
                    </div>
                  );
                }
              }}
            >
              {m.content}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  return prevProps.m.content === nextProps.m.content && prevProps.m.role === nextProps.m.role;
});

export default function Home() {
  const [ruanganId, setRuanganId] = useState('');
  const [chatList, setChatList] = useState<any[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);

  // States for renaming and deleting chats
  const [dropdownOpenId, setDropdownOpenId] = useState<string | null>(null);
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editTitleBuffer, setEditTitleBuffer] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpenId(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ==========================================================================
  // [useChat] KONEKSI KE MESIN AI
  // Mengendalikan pengiriman form secara otomatis ke /api/chat. 
  // Juga mengurus aliran teks (streaming) dan mencatat apa yang Anda ketik (input).
  // ==========================================================================
  const { messages, input, handleInputChange, handleSubmit, setMessages, stop, isLoading } = useChat({
    body: {
      chatId: ruanganId
    },
    onError: () => {
      // Jika internet mati atau AI gagal merespons, munculkan pop-up error merah
      toast.error('Gagal terhubung ke AI. Silakan coba lagi.', { id: 'ai-error' });
    }
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isFirstLoad = useRef(true);
  const lastScrollTime = useRef(0);

  // ==========================================================================
  // [EFEK] PEMBUATAN RUANG OBROLAN PERTAMA KALI KETIKA WEB TERBUKA
  // Sengaja membuat ID unik berdasarkan detik saat ini.
  // ==========================================================================
  useEffect(() => {
    const defaultRoom = `room-${Date.now()}`;
    setRuanganId(defaultRoom);
    setIsLoadingHistory(false); 
  }, []);

  // ==========================================================================
  // [EFEK] MENGAMBIL DAFTAR SEMUA RIWAYAT UNTUK DITAMPILKAN DI SIDEBAR
  // Fungsi ini otomatis mengeksekusi /api/chats setiap kali jumlah pesan berubah,
  // sehingga daftar judul obrolan di sidebar sebelah kiri selalu Sinkron & Terupdate.
  // ==========================================================================
  useEffect(() => {
    fetch('/api/chats')
      .then(res => res.json())
      .then(data => {
        if (data && Array.isArray(data)) setChatList(data);
      })
      .catch(() => {}); // Tangkapan error sengaja dikosongkan agar konsol terminal tetap bersih
  }, [messages.length]);

  // ==========================================================================
  // [EFEK] MEMUAT PESAN LAMA SETIAP KALI PINDAH RUANG OBROLAN
  // Ketika ruanganId berpindah (karena di-klik dari sidebar), layar akan dikosongkan 
  // sejenak lalu menarik paket percakapan lama langsung dari Supabase.
  // ==========================================================================
  useEffect(() => {
    if (!ruanganId) return; 

    isFirstLoad.current = true;
    setMessages([]); // Dikosongkan sebelum memuat
    setIsLoadingHistory(true);
    
    fetch(`/api/chat?chatId=${ruanganId}`)
      .then(res => res.json())
      .then(data => {
        if (data && data.length > 0) setMessages(data);
      })
      .catch(() => {}) // Console log dihapus demi kebersihan
      .finally(() => setIsLoadingHistory(false));
  }, [setMessages, ruanganId]);

  // Efek untuk auto-scroll
  useEffect(() => {
    if (!isLoadingHistory && messagesEndRef.current) {
      if (isFirstLoad.current) {
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
          isFirstLoad.current = false;
        }, 50);
      } else {
        const now = Date.now();
        // Throttle animasi smooth (maksimal 1 per 150ms) agar tidak lag saat terima kata yang mengalir deras
        if (now - lastScrollTime.current > 150) {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
          lastScrollTime.current = now;
        }
      }
    }
  }, [messages, isLoadingHistory]);

  // ==========================================================================
  // [FUNGSI] NAVIGASI & AKSI KHUSUS
  // Di bawah ini berisikan blok khusus untuk memulai, menghapus, dan mengganti nama obrolan
  // ==========================================================================

  const buatChatBaru = () => {
    stop(); // Selalu potong komunikasi AI kalau mencoba lari ke ruangan baru
    setRuanganId(`room-${Date.now()}`);
    setMessages([]);
    if (window.innerWidth < 640) setIsSidebarOpen(true);
  };

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  const handleDeleteChat = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Apakah Anda yakin ingin menghapus obrolan ini secara permanen?')) {
      try {
        await fetch(`/api/chats/${id}`, { method: 'DELETE' });
        // Hapus dari daftar memori layar agar tidak perlu me-refresh halaman website
        setChatList(prev => prev.filter(c => c.id !== id));
        if (ruanganId === id) buatChatBaru();
      } catch (err) {}
    }
    setDropdownOpenId(null);
  };

  const startEditing = (chat: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingChatId(chat.id);
    setEditTitleBuffer(chat.title);
    setDropdownOpenId(null);
  };

  const submitEdit = async (id: string, e?: React.MouseEvent | React.FormEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    // Cegah pekerjaan boros jika judul yang diketik sama saja atau kosong
    if (!editTitleBuffer.trim() || editTitleBuffer === chatList.find(c => c.id === id)?.title) {
        setEditingChatId(null);
        return;
    }

    try {
        await fetch(`/api/chats/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: editTitleBuffer.trim() })
        });
        setChatList(prev => prev.map(c => c.id === id ? { ...c, title: editTitleBuffer.trim() } : c));
    } catch (err) {}
    setEditingChatId(null);
  };

  const cancelEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingChatId(null);
  };

  const isChatEmpty = messages.length === 0;

  return (
    <div className="flex h-screen bg-neutral-950 text-neutral-100 font-sans overflow-hidden">
      <Toaster position="top-center" toastOptions={{ style: { background: '#262626', color: '#fff', border: '1px solid #404040' } }} />
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
            <div key={chat.id} className="relative group">
              {editingChatId === chat.id ? (
                <div className={`flex items-center w-full px-2 py-2 rounded-lg text-sm transition-all ${ruanganId === chat.id ? 'bg-neutral-800' : 'bg-neutral-800'}`}>
                  <form onSubmit={(e) => submitEdit(chat.id, e)} className="flex items-center w-full gap-1">
                    <input 
                      autoFocus
                      value={editTitleBuffer}
                      onChange={(e) => setEditTitleBuffer(e.target.value)}
                      className="flex-1 bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-white outline-none focus:border-blue-500 w-full"
                    />
                    <button type="submit" className="p-1.5 text-green-500 hover:bg-neutral-700 rounded cursor-pointer" onClick={(e) => submitEdit(chat.id, e)}>
                      <Check size={14} />
                    </button>
                    <button type="button" className="p-1.5 text-red-500 hover:bg-neutral-700 rounded cursor-pointer" onClick={cancelEdit}>
                      <X size={14} />
                    </button>
                  </form>
                </div>
              ) : (
                <div className={`flex items-center justify-between w-full text-left rounded-lg text-sm transition-all ${ruanganId === chat.id ? 'bg-neutral-800 text-white font-medium shadow-sm' : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200'}`}>
                  <button
                    onClick={() => {
                      stop(); // Pastikan tidak ada stream yang bocor dari chat sebelumnya
                      setRuanganId(chat.id);
                      if (window.innerWidth < 640) setIsSidebarOpen(false); // Tutup sidebar otomatis di mobile
                    }}
                    className="flex-1 text-left px-3 py-3 truncate"
                  >
                    {chat.title}
                  </button>
                  
                  {/* Options 3-dots Button */}
                  <div className="pr-1.5" ref={dropdownOpenId === chat.id ? dropdownRef : null}>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setDropdownOpenId(dropdownOpenId === chat.id ? null : chat.id);
                      }}
                      className={`p-1.5 text-neutral-400 hover:text-white hover:bg-neutral-700 rounded-md transition-opacity cursor-pointer ${ruanganId === chat.id || dropdownOpenId === chat.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                    >
                      <MoreVertical size={16} />
                    </button>
                    
                    {/* Dropdown Menu */}
                    {dropdownOpenId === chat.id && (
                      <div className="absolute right-2 top-10 mt-1 w-36 bg-neutral-800 border border-neutral-700 rounded-lg shadow-xl z-50 overflow-hidden">
                        <button 
                          onClick={(e) => startEditing(chat, e)}
                          className="w-full text-left px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-700 flex items-center gap-2 cursor-pointer"
                        >
                          <Edit2 size={14} /> Rename
                        </button>
                        <button 
                          onClick={(e) => handleDeleteChat(chat.id, e)}
                          className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-neutral-700 flex items-center gap-2 cursor-pointer"
                        >
                          <Trash2 size={14} /> Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
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
                  <ChatMessage key={m.id || idx} m={m} />
                ))}
                <div ref={messagesEndRef} />
              </div>
            </div>

            {/* Area Input (Sticky bawah) saat chat aktif */}
            <div className="w-full shrink-0 bg-transparent p-4 pb-6">
              {isLoading && (
                <div className="flex justify-center mb-3">
                  <button
                    onClick={stop}
                    className="flex items-center justify-center gap-2 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-neutral-300 rounded-full text-sm font-medium transition-colors shadow-sm cursor-pointer"
                  >
                    <Square size={14} className="fill-neutral-400" />
                    Stop Generation
                  </button>
                </div>
              )}
              <div className="max-w-4xl mx-auto bg-neutral-900 border border-neutral-800 rounded-2xl p-2 shadow-lg">
                {/* Sama seperti WelcomeScreen, onSubmit dimodifikasi agar textarea mereset tinggi ke ukuran awal */}
                <form onSubmit={(e) => {
                  handleSubmit(e);
                  const ta = e.currentTarget.querySelector('textarea');
                  if (ta) ta.style.height = 'auto';
                }} className="flex gap-2 items-end">
                  
                  {/* Kotak chat otomatis expand ke bawah */}
                  <textarea
                    className="flex-1 p-3 bg-transparent text-neutral-100 placeholder-neutral-400 focus:outline-none resize-none min-h-[48px] max-h-[200px] overflow-y-auto"
                    value={input}
                    placeholder="Minta AI..."
                    onChange={handleInputChange}
                    rows={1}
                    onInput={(e) => {
                      const target = e.target as HTMLTextAreaElement;
                      target.style.height = 'auto';
                      target.style.height = `${target.scrollHeight}px`;
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        if (input.trim()) {
                          e.currentTarget.form?.requestSubmit();
                        }
                      }
                    }}
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