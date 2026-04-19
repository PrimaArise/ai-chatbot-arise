'use client';

import { nanoid } from 'nanoid';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useChat } from '@ai-sdk/react';
import { useEffect, useRef, useState, memo, Suspense, FormEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Menu, Plus, Send, MessageSquare, Settings, MoreVertical, Edit2, Trash2, X, Check, Copy, Square, LogOut, AlertTriangle } from 'lucide-react';
import WelcomeScreen from '@/components/WelcomeScreen';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css';
import toast, { Toaster } from 'react-hot-toast';

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
          ? 'bg-[#1a1a1a] text-white'
          : 'text-neutral-200'
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
                pre({ node, className, children, ...props }: any) {
                  return (
                    <div className="relative group my-4">
                      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                        <button
                          onClick={() => {
                            const rawContent = extractText(children);
                            navigator.clipboard.writeText(rawContent);
                            toast.success('Kode disalin!', { id: 'copy-toast' });
                          }}
                          className="p-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded border border-neutral-700 cursor-pointer shadow-sm"
                          title="Copy Code"
                        >
                          <Copy size={16} />
                        </button>
                      </div>
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

function ChatComponent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const idFromUrl = searchParams.get('id');

  const [ruanganId, setRuanganId] = useState('');
  const [chatList, setChatList] = useState<any[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const [dropdownOpenId, setDropdownOpenId] = useState<string | null>(null);
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editTitleBuffer, setEditTitleBuffer] = useState('');
  const [chatToDelete, setChatToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpenId(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (ruanganId) {
      router.replace(`?id=${ruanganId}`, { scroll: false });
    } else {
      router.replace('/chat', { scroll: false });
    }
  }, [ruanganId, router]);

  useEffect(() => {
    const checkUser = async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.push('/login');
      }
    };
    checkUser();
  }, [router]);

  const { messages, input, handleInputChange, handleSubmit: originalSubmit, setMessages, stop, isLoading } = useChat({
    body: {
      chatId: ruanganId
    },
    onError: () => {
      toast.error('Gagal terhubung ke AI. Silakan coba lagi.', { id: 'ai-error' });
    }
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isFirstLoad = useRef(true);
  const lastScrollTime = useRef(0);

  useEffect(() => {
    const loadChats = async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (!data.user) return;
        const res = await fetch('/api/session');
        const result = await res.json();
        if (Array.isArray(result)) setChatList(result);
      } catch { }
    };
    loadChats();
  }, [messages.length]);

  useEffect(() => {
    if (!ruanganId) {
      setIsLoadingHistory(false);
      return;
    }

    const loadMessages = async () => {
      isFirstLoad.current = true;
      setMessages([]);
      setIsLoadingHistory(true);

      try {
        const { data } = await supabase.auth.getUser();
        if (!data.user) return;

        const res = await fetch(`/api/chat?chatId=${ruanganId}`);
        const result = await res.json();
        if (Array.isArray(result) && result.length > 0) setMessages(result);
      } catch { }
      setIsLoadingHistory(false);
    };

    loadMessages();
  }, [ruanganId, setMessages]);

  useEffect(() => {
    if (!isLoadingHistory && messagesEndRef.current) {
      if (isFirstLoad.current) {
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
          isFirstLoad.current = false;
        }, 50);
      } else {
        const now = Date.now();
        if (now - lastScrollTime.current > 150) {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
          lastScrollTime.current = now;
        }
      }
    }
  }, [messages, isLoadingHistory]);

  const buatChatBaru = () => {
    if (isLoading) {
      toast.error('Harap tunggu AI selesai membalas terlebih dahulu.', { id: 'loading-lock' });
      return;
    }
    stop();
    setRuanganId('');
    setMessages([]);
    setIsSidebarOpen(false);
  };

  const handleCustomSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim()) return;

    if (!ruanganId) {
      const newId = nanoid();
      setRuanganId(newId);

      originalSubmit(e, { body: { chatId: newId } });
    } else {
      originalSubmit(e);
    }
  };

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  const handleDeleteClick = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setChatToDelete(id);
    setDropdownOpenId(null);
  };

  const confirmDeleteChat = async () => {
    if (!chatToDelete) return;
    setIsDeleting(true);
    try {
      await fetch(`/api/session?id=${chatToDelete}`, { method: 'DELETE' });
      setChatList(prev => prev.filter(c => c.id !== chatToDelete));
      if (ruanganId === chatToDelete) buatChatBaru();
      toast.success("Obrolan berhasil dihapus");
    } catch (err) {
      toast.error("Gagal menghapus obrolan");
    }
    setIsDeleting(false);
    setChatToDelete(null);
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

    if (!editTitleBuffer.trim() || editTitleBuffer === chatList.find(c => c.id === id)?.title) {
      setEditingChatId(null);
      return;
    }

    try {
      await fetch(`/api/session?id=${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editTitleBuffer.trim() })
      });
      setChatList(prev => prev.map(c => c.id === id ? { ...c, title: editTitleBuffer.trim() } : c));
    } catch (err) { }
    setEditingChatId(null);
  };

  const cancelEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingChatId(null);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const isChatEmpty = !ruanganId || messages.length === 0;

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
        <div className="flex-1 overflow-y-auto p-3 space-y-1 w-64 pb-16">
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
                      if (isLoading) {
                        toast.error('Harap tunggu AI selesai membalas terlebih dahulu.', { id: 'loading-lock' });
                        return;
                      }
                      stop();
                      setRuanganId(chat.id);
                      if (window.innerWidth < 640) setIsSidebarOpen(false);
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
                          onClick={(e) => handleDeleteClick(chat.id, e)}
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

        <div className="p-4 border-t border-neutral-800 shrink-0 w-64 absolute bottom-0 bg-neutral-900 z-10">
          <button
            onClick={(e) => {
              if (isLoading) {
                e.preventDefault();
                toast.error('Harap tunggu AI selesai membalas.', { id: 'loading-lock' });
                return;
              }
              handleLogout();
            }}
            className="w-full bg-red-600 hover:bg-red-700 text-white py-3 px-4 rounded-xl font-medium transition-all shadow-sm flex items-center justify-center gap-2 text-sm whitespace-nowrap cursor-pointer border border-red-500"
          >
            <LogOut size={16} />
            <span>Logout</span>
          </button>
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
          <div className="flex-1 flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
          </div>
        ) : isChatEmpty ? (
          <WelcomeScreen
            input={input}
            handleInputChange={handleInputChange}
            handleSubmit={handleCustomSubmit}
          />
        ) : (
          <>
            <div className="flex-1 overflow-y-auto w-full">
              <div className="p-4 sm:p-6 w-full max-w-4xl mx-auto space-y-6">
                {messages.map((m, idx) => (
                  <ChatMessage key={m.id || idx} m={m} />
                ))}
                <div ref={messagesEndRef} />
              </div>
            </div>

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
                <form onSubmit={(e) => {
                  handleCustomSubmit(e);
                  const ta = e.currentTarget.querySelector('textarea');
                  if (ta) ta.style.height = 'auto';
                }} className="flex gap-2 items-end">
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

      {/* Delete Confirmation Modal */}
      {chatToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-sm p-6 shadow-2xl relative animate-in fade-in zoom-in duration-200">
            <div className="flex flex-col items-center text-center">
              <div className="w-12 h-12 rounded-full bg-red-500/20 text-red-500 flex items-center justify-center mb-4">
                <AlertTriangle size={24} />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Hapus Obrolan?</h3>
              <p className="text-neutral-400 text-sm mb-6">
                Tindakan ini tidak dapat dibatalkan. Riwayat obrolan ini akan dihapus secara permanen dari server.
              </p>

              <div className="flex gap-3 w-full">
                <button
                  onClick={() => setChatToDelete(null)}
                  disabled={isDeleting}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-neutral-700 text-neutral-300 hover:bg-neutral-800 font-medium text-sm transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  onClick={confirmDeleteChat}
                  disabled={isDeleting}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-medium text-sm transition-colors cursor-pointer flex items-center justify-center"
                >
                  {isDeleting ? (
                    <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    'Hapus Permanen'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<div className="h-screen bg-neutral-950 text-white flex justify-center items-center">Loading...</div>}>
      <ChatComponent />
    </Suspense>
  );
}