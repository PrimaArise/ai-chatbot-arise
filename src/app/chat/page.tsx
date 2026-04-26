'use client';

import { nanoid } from 'nanoid';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useChat } from '@ai-sdk/react';
import { useEffect, useRef, useState, memo, Suspense, FormEvent, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Menu, Plus, Send, MessageSquare, MoreVertical, Edit2, Trash2, X, Check, Copy, Square, LogOut, AlertTriangle, Settings, Upload, FileText, Loader2, ChevronDown, BookOpen, Shield, User, Search, Download, RefreshCw, BarChart2 } from 'lucide-react';
import WelcomeScreen from '@/components/WelcomeScreen';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css';
import toast, { Toaster } from 'react-hot-toast';

// Types for react-markdown component props
type PreProps = React.HTMLAttributes<HTMLPreElement> & { node?: unknown };
type ChatMsg = { id?: string; role: string; content: string };
type ChunkCitation = { index: number; snippet: string; distance: number };

const extractText = (node: unknown): string => {
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return (node as unknown[]).map(extractText).join('');
  const n = node as { props?: { children?: unknown } };
  if (n && n.props && n.props.children) return extractText(n.props.children);
  return '';
};

const ChatMessage = memo(function ChatMessage({ m, citations }: { m: ChatMsg; citations?: ChunkCitation[] }) {
  const [showCitations, setShowCitations] = useState(false);
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
                pre({ className, children, ...props }: PreProps) {
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

            {/* Citation card — hanya tampil untuk pesan AI yang punya referensi */}
            {citations && citations.length > 0 && (
              <div className="mt-3 border border-neutral-800 rounded-xl overflow-hidden">
                <button
                  onClick={() => setShowCitations(v => !v)}
                  className="w-full flex items-center justify-between px-3 py-2 bg-neutral-900 hover:bg-neutral-800 transition-colors text-xs text-neutral-400 cursor-pointer"
                >
                  <div className="flex items-center gap-1.5">
                    <BookOpen size={12} className="text-blue-400" />
                    <span className="font-medium text-neutral-300">Sumber Referensi</span>
                    <span className="bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded-full text-[10px] font-semibold">{citations.length}</span>
                  </div>
                  <ChevronDown size={12} className={`transition-transform duration-200 ${showCitations ? 'rotate-180' : ''}`} />
                </button>
                {showCitations && (
                  <div className="divide-y divide-neutral-800">
                    {citations.map((c) => (
                      <div key={c.index} className="px-3 py-2.5 bg-neutral-950">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="text-[10px] font-bold text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded">
                            #{c.index}
                          </span>
                          <span className="text-[10px] text-neutral-600">relevansi {Math.round((1 - c.distance) * 100)}%</span>
                        </div>
                        <p className="text-xs text-neutral-400 leading-relaxed line-clamp-3">{c.snippet}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  return prevProps.m.content === nextProps.m.content &&
         prevProps.m.role === nextProps.m.role &&
         prevProps.citations === nextProps.citations;
});


function ChatComponent() {
  const router = useRouter();

  // ===== State utama sesi chat =====
  // ruanganId = ID sesi obrolan yang sedang aktif (dipakai sebagai primary key di database)
  const [ruanganId, setRuanganId] = useState('');
  const [chatList, setChatList] = useState<{ id: string; title: string }[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // ===== State dropdown & edit judul chat di sidebar =====
  const [dropdownOpenId, setDropdownOpenId] = useState<string | null>(null);
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editTitleBuffer, setEditTitleBuffer] = useState('');
  const [chatToDelete, setChatToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // ===== AI Customization Modal =====
  const [isKostumiModal, setIsKostumiModal] = useState(false);
  const [kostumiTab, setKostumiTab] = useState<'upload' | 'chunks'>('upload');
  const [uploadText, setUploadText] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isIngesting, setIsIngesting] = useState(false);
  const [ingestResult, setIngestResult] = useState<string | null>(null);
  const [chunks, setChunks] = useState<{ id: string; content: string; createdAt: string; isGlobal: boolean; userId: string }[]>([]);
  const [isLoadingChunks, setIsLoadingChunks] = useState(false);
  const [deletingChunkId, setDeletingChunkId] = useState<string | null>(null);
  const [expandedChunkId, setExpandedChunkId] = useState<string | null>(null);
  const [editingChunkId, setEditingChunkId] = useState<string | null>(null);
  const [editChunkContent, setEditChunkContent] = useState('');
  const [isUpdatingChunk, setIsUpdatingChunk] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const ingestResultRef = useRef<HTMLDivElement>(null);

  // ===== Multi-select chunks =====
  const [selectedChunkIds, setSelectedChunkIds] = useState<Set<string>>(new Set());
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);

  // ===== User role (admin/user) =====
  const [userRole, setUserRole] = useState<'admin' | 'user'>('user');
  const isAdmin = userRole === 'admin';

  // ===== Role change modal =====
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [isChangingRole, setIsChangingRole] = useState(false);

  // ===== isGlobal toggle untuk admin saat upload =====
  const [isGlobalUpload, setIsGlobalUpload] = useState(false);

  // ===== Sidebar search =====
  const [chatSearch, setChatSearch] = useState('');

  // ===== Export state =====
  const [isExporting, setIsExporting] = useState<string | null>(null);

  // ===== KB Toggle state =====
  const [isKbEnabled, setIsKbEnabled] = useState(true);

  // ===== Rate Limit indicator =====
  type RateLimitStatus = { used: number; remaining: number; max: number; resetInMs: number; resetsAt: number };
  const [rateLimit, setRateLimit] = useState<RateLimitStatus | null>(null);
  const [rlCountdown, setRlCountdown] = useState(0);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpenId(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Sinkronisasi URL query param (?id=xxx) dengan sesi chat yang aktif
  // Memungkinkan user untuk share/bookmark URL sesi langsung
  useEffect(() => {
    if (ruanganId) {
      router.replace(`?id=${ruanganId}`, { scroll: false });
    } else {
      router.replace('/chat', { scroll: false });
    }
  }, [ruanganId, router]);

  // Guard autentikasi — redirect ke halaman login jika sesi Supabase tidak valid
  useEffect(() => {
    const checkUser = async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.push('/login');
      }
    };
    checkUser();
  }, [router]);

  // Auto-scroll ke hasil ingest saat muncul
  useEffect(() => {
    if (ingestResult && ingestResultRef.current) {
      ingestResultRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [ingestResult]);

  // Ambil role user (admin/user) saat pertama kali komponen dimuat
  // Role dipakai untuk menentukan akses global upload dokumen
  useEffect(() => {
    fetch('/api/me')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.role === 'admin') setUserRole('admin'); })
      .catch(() => {});
  }, []);


  // Countdown timer — hitung mundur detik sampai window rate limit reset
  useEffect(() => {
    if (!rateLimit || rateLimit.used === 0) return;
    const tick = () => {
      const sisa = Math.max(0, Math.ceil((rateLimit.resetsAt - Date.now()) / 1000));
      setRlCountdown(sisa);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [rateLimit]);

  // ===== Handler perubahan role via OTP =====

  // Downgrade dari Admin ke User — tidak memerlukan verifikasi tambahan
  const handleRoleChange = async (targetRole: 'admin' | 'user') => {
    if (targetRole === 'user') {
      setIsChangingRole(true);
      const res = await fetch('/api/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetRole: 'user' }),
      });
      const result = await res.json();
      setIsChangingRole(false);
      if (res.ok) {
        setUserRole('user');
        setShowRoleModal(false);
        toast.success('Role berhasil diubah menjadi User.');
      } else {
        toast.error(result.error || 'Gagal mengubah role.');
      }
    }
  };

  // Kirim permintaan OTP ke email admin untuk proses promosi ke Admin
  const handleRequestOtp = async () => {
    setIsChangingRole(true);
    const res = await fetch('/api/promote-request', { method: 'POST' });
    const result = await res.json();
    setIsChangingRole(false);
    if (res.ok) {
      setOtpSent(true);
      toast.success('Kode OTP dikirim ke email admin!');
    } else {
      toast.error(result.error || 'Gagal mengirim OTP.');
    }
  };

  // Verifikasi kode OTP 6-digit dari admin dan ubah role ke Admin jika valid
  const handleVerifyOtp = async () => {
    if (otpCode.trim().length !== 6) { toast.error('Kode OTP harus 6 digit.'); return; }
    setIsChangingRole(true);
    const res = await fetch('/api/promote-verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ otp: otpCode.trim() }),
    });
    const result = await res.json();
    setIsChangingRole(false);
    if (res.ok) {
      setUserRole('admin');
      setShowRoleModal(false);
      setOtpCode('');
      setOtpSent(false);
      toast.success('✅ Selamat! Anda sekarang menjadi Admin!');
    } else {
      toast.error(result.error || 'Kode OTP tidak valid.');
    }
  };

  // Hook utama Vercel AI SDK untuk streaming chat
  // kbEnabled dikirim ke API sebagai flag apakah RAG aktif atau tidak
  const { messages, input, handleInputChange, handleSubmit: originalSubmit, setMessages, stop, isLoading, append, data: streamData } = useChat({
    body: {
      chatId: ruanganId,
      kbEnabled: isKbEnabled
    },
    onError: () => {
      toast.error('Gagal terhubung ke AI. Silakan coba lagi.', { id: 'ai-error' });
    }
  });


  // Derive citations langsung dari streamData tanpa useState/useEffect
  // Ini menghindari cascading renders dan mematuhi react-hooks/set-state-in-effect rule
  const lastCitations = useMemo<ChunkCitation[]>(() => {
    if (!streamData || streamData.length === 0) return [];
    for (let i = streamData.length - 1; i >= 0; i--) {
      const item = streamData[i] as { type?: string; citations?: ChunkCitation[] };
      if (item?.type === 'rag_citations' && Array.isArray(item.citations)) {
        return item.citations;
      }
    }
    return [];
  // ruanganId disertakan agar citations reset otomatis saat pindah sesi
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamData, ruanganId]);

  // Fetch rate limit status setiap kali jumlah pesan berubah (setelah kirim/terima)
  // Ditempatkan SETELAH useChat agar `messages` sudah dideklarasikan
  useEffect(() => {
    fetch('/api/rate-limit')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setRateLimit(d); })
      .catch(() => {});
  }, [messages.length]);


  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isFirstLoad = useRef(true);
  const lastScrollTime = useRef(0);

  // Reload daftar riwayat chat di sidebar setiap kali ada pesan baru dikirim/diterima
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

  // Muat riwayat pesan dari database setiap kali sesi chat berganti (ruanganId berubah)
  useEffect(() => {
    if (!ruanganId) {
      const t = setTimeout(() => setIsLoadingHistory(false), 0);
      return () => clearTimeout(t);
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

  // Auto-scroll ke pesan terbawah dengan throttle 150ms agar tidak terlalu sering dipicu
  // Saat pertama load, scroll langsung ke bawah dengan sedikit delay untuk menunggu render
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

  // Buat sesi chat baru — reset semua state terkait sesi aktif
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

  // Submit pesan ke AI — generate chatId baru jika ini sesi pertama,
  // dan sertakan flag kbEnabled agar backend tahu mode RAG yang aktif
  const handleCustomSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim()) return;

    if (!ruanganId) {
      const newId = nanoid();
      setRuanganId(newId);
      originalSubmit(e, { body: { chatId: newId, kbEnabled: isKbEnabled } });
    } else {
      originalSubmit(e, { body: { chatId: ruanganId, kbEnabled: isKbEnabled } });
    }
  };

  // Toggle buka/tutup sidebar
  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  // Set chat yang akan dihapus, lalu tutup dropdown
  const handleDeleteClick = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setChatToDelete(id);
    setDropdownOpenId(null);
  };

  // Konfirmasi hapus chat — hapus dari DB dan update list di sidebar
  const confirmDeleteChat = async () => {
    if (!chatToDelete) return;
    setIsDeleting(true);
    try {
      await fetch(`/api/session?id=${chatToDelete}`, { method: 'DELETE' });
      setChatList(prev => prev.filter(c => c.id !== chatToDelete));
      if (ruanganId === chatToDelete) buatChatBaru();
      toast.success("Obrolan berhasil dihapus");
    } catch {
      toast.error("Gagal menghapus obrolan");
    }
    setIsDeleting(false);
    setChatToDelete(null);
  };

  // Mulai mode edit judul chat
  const startEditing = (chat: { id: string; title: string }, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingChatId(chat.id);
    setEditTitleBuffer(chat.title);
    setDropdownOpenId(null);
  };

  // Simpan judul baru ke API jika berbeda dari judul lama
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
    } catch { }
    setEditingChatId(null);
  };

  // Batal edit judul chat
  const cancelEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingChatId(null);
  };

  // Logout dari Supabase dan redirect ke halaman login
  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  // ===== Kostumisasi AI handlers =====
  const loadChunks = async () => {
    setIsLoadingChunks(true);
    try {
      const res = await fetch('/api/documents');
      const data = await res.json();
      if (Array.isArray(data)) setChunks(data);
    } catch { toast.error('Gagal memuat data chunks'); }
    setIsLoadingChunks(false);
  };

  const openKostumiModal = () => {
    setIsKostumiModal(true);
    setKostumiTab('upload');
    setIngestResult(null);
    setUploadText('');
    setUploadFile(null);
    loadChunks();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setUploadFile(file);
    if (file) {
      const fileName = file.name.toLowerCase();
      if (fileName.endsWith('.pdf')) {
        // PDF dibaca server-side, tidak perlu baca di client
        setUploadText('');
      } else {
        // TXT / MD — baca langsung di client sebagai preview
        const reader = new FileReader();
        reader.onload = (ev) => setUploadText(ev.target?.result as string || '');
        reader.readAsText(file);
      }
    }
  };

  const handleIngest = async () => {
    // Jika ada file (termasuk PDF), kirim sebagai FormData
    if (uploadFile) {
      setIsIngesting(true);
      setIngestResult(null);
      try {
        const formData = new FormData();
        formData.append('file', uploadFile);
        // Admin: kirim isGlobal flag agar server bisa set dokumen sebagai global
        if (isAdmin) formData.append('isGlobal', String(isGlobalUpload));
        const res = await fetch('/api/ingest', { method: 'POST', body: formData });
        const data = await res.json();
        if (res.ok) {
          const skipInfo = data.skipped > 0 ? ` (${data.skipped} duplikat dilewati)` : '';
          setIngestResult(`✅ Berhasil mengindeks ${data.inserted ?? data.chunks?.length ?? 0} chunk ke knowledge base${isAdmin && isGlobalUpload ? ' (Global 🌐)' : ' (Pribadi 🔒)'}${skipInfo}.`);
          setUploadText('');
          setUploadFile(null);
          if (fileInputRef.current) fileInputRef.current.value = '';
          loadChunks();
        } else {
          setIngestResult(`❌ Gagal: ${data.error || 'Unknown error'}`);
        }
      } catch { setIngestResult('❌ Terjadi kesalahan saat mengindeks.'); }
      setIsIngesting(false);
      return;
    }
    // Mode teks manual (JSON)
    if (!uploadText.trim()) { toast.error('Masukkan teks terlebih dahulu'); return; }
    setIsIngesting(true);
    setIngestResult(null);
    try {
      const res = await fetch('/api/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: uploadText, isGlobal: isAdmin && isGlobalUpload }),
      });

      const data = await res.json();
      if (res.ok) {
        const skipInfo2 = data.skipped > 0 ? ` (${data.skipped} duplikat dilewati)` : '';
        setIngestResult(`✅ Berhasil mengindeks ${data.inserted ?? data.chunks?.length ?? 0} chunk ke knowledge base${isAdmin && isGlobalUpload ? ' (Global 🌐)' : isAdmin ? ' (Pribadi 🔒)' : ''}${skipInfo2}.`);
        setUploadText('');
        setUploadFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        loadChunks();
      } else {
        setIngestResult(`❌ Gagal: ${data.error || 'Unknown error'}`);
      }
    } catch { setIngestResult('❌ Terjadi kesalahan saat mengindeks.'); }
    setIsIngesting(false);
  };

  // Hapus satu chunk dokumen dari knowledge base
  const handleDeleteChunk = async (id: string) => {
    setDeletingChunkId(id);
    try {
      await fetch(`/api/documents?id=${id}`, { method: 'DELETE' });
      setChunks(prev => prev.filter(c => c.id !== id));
      setSelectedChunkIds(prev => { const n = new Set(prev); n.delete(id); return n; });
      toast.success('Chunk berhasil dihapus');
    } catch { toast.error('Gagal menghapus chunk'); }
    setDeletingChunkId(null);
  };

  // Toggle seleksi satu chunk untuk operasi bulk delete
  const toggleSelectChunk = (id: string) => {
    setSelectedChunkIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Toggle pilih semua / batal pilih semua chunk
  const toggleSelectAll = () => {
    if (selectedChunkIds.size === chunks.length) {
      setSelectedChunkIds(new Set());
    } else {
      setSelectedChunkIds(new Set(chunks.map(c => c.id)));
    }
  };

  // Hapus semua chunk yang dipilih secara massal via API
  const handleBulkDelete = async () => {
    if (selectedChunkIds.size === 0) return;
    setIsBulkDeleting(true);
    try {
      const ids = Array.from(selectedChunkIds);
      const res = await fetch('/api/documents', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      if (res.ok) {
        setChunks(prev => prev.filter(c => !selectedChunkIds.has(c.id)));
        setSelectedChunkIds(new Set());
        toast.success(`${ids.length} chunk berhasil dihapus`);
      } else {
        const data = await res.json();
        toast.error(data.error || 'Gagal menghapus chunk');
      }
    } catch { toast.error('Gagal menghapus chunk'); }
    setIsBulkDeleting(false);
    setShowBulkDeleteConfirm(false);
  };

  // Buka mode edit untuk satu chunk — memuat konten ke textarea
  const openEditChunk = (chunk: { id: string; content: string }) => {
    setEditingChunkId(chunk.id);
    setEditChunkContent(chunk.content);
    setExpandedChunkId(null);
  };

  // Simpan perubahan konten chunk ke database via API PATCH
  const handleUpdateChunk = async () => {
    if (!editingChunkId || !editChunkContent.trim()) return;
    setIsUpdatingChunk(true);
    try {
      const res = await fetch(`/api/documents?id=${editingChunkId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editChunkContent.trim() }),
      });
      if (res.ok) {
        setChunks(prev => prev.map(c =>
          c.id === editingChunkId ? { ...c, content: editChunkContent.trim() } : c
        ));
        toast.success('Chunk berhasil diperbarui!');
        setEditingChunkId(null);
      } else {
        const data = await res.json();
        toast.error(data.error || 'Gagal memperbarui chunk');
      }
    } catch { toast.error('Gagal memperbarui chunk'); }
    setIsUpdatingChunk(false);
  };

  // Halaman dianggap kosong jika belum ada sesi atau belum ada pesan — tampilkan WelcomeScreen
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
          {/* Search riwayat chat */}
          <div className="relative mb-2">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-600" />
            <input
              type="text"
              placeholder="Cari riwayat..."
              value={chatSearch}
              onChange={e => setChatSearch(e.target.value)}
              className="w-full pl-7 pr-7 py-1.5 bg-neutral-950 border border-neutral-800 rounded-lg text-xs text-neutral-300 placeholder-neutral-600 focus:outline-none focus:border-neutral-600 transition-colors"
            />
            {chatSearch && (
              <button onClick={() => setChatSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-600 hover:text-neutral-400 cursor-pointer">
                <X size={11} />
              </button>
            )}
          </div>

          {(chatSearch ? chatList.filter(c => c.title.toLowerCase().includes(chatSearch.toLowerCase())) : chatList).map((chat) => (
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
                      <div className="absolute right-2 top-10 mt-1 w-40 bg-neutral-800 border border-neutral-700 rounded-lg shadow-xl z-50 overflow-hidden">
                        <button
                          onClick={(e) => startEditing(chat, e)}
                          className="w-full text-left px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-700 flex items-center gap-2 cursor-pointer"
                        >
                          <Edit2 size={14} /> Rename
                        </button>
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            setDropdownOpenId(null);
                            setIsExporting(chat.id);
                            try {
                              let msgs: { role: string; content: string }[] = [];
                              if (chat.id === ruanganId && messages.length > 0) {
                                msgs = messages;
                              } else {
                                const res = await fetch(`/api/chat?chatId=${chat.id}`);
                                msgs = await res.json();
                              }
                              const lines = [`=== AI Arise — Ekspor Percakapan ===`, `Judul  : ${chat.title}`, `Tanggal: ${new Date().toLocaleDateString('id-ID')}`, ``, ...msgs.map(m => `[${m.role === 'user' ? 'Anda' : 'Arise'}]:\n${m.content}`)];
                              const blob = new Blob([lines.join('\n\n')], { type: 'text/plain' });
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url; a.download = `${chat.title.replace(/[^a-z0-9]/gi, '_')}.txt`;
                              a.click(); URL.revokeObjectURL(url);
                            } catch { toast.error('Gagal mengekspor chat.'); }
                            setIsExporting(null);
                          }}
                          className="w-full text-left px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-700 flex items-center gap-2 cursor-pointer"
                        >
                          {isExporting === chat.id ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Export .txt
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

        <div className="p-4 border-t border-neutral-800 shrink-0 w-64 absolute bottom-0 bg-neutral-900 z-10 space-y-2">
          {/* Role Badge — klik untuk ubah role */}
          <button
            onClick={() => { setShowRoleModal(v => !v); setOtpCode(''); setOtpSent(false); }}
            className={`w-full flex items-center gap-2 py-2 px-3 rounded-xl border transition-all cursor-pointer ${
              isAdmin
                ? 'bg-amber-500/10 border-amber-500/20 hover:bg-amber-500/20'
                : 'bg-neutral-800/60 border-neutral-700 hover:bg-neutral-800'
            }`}
          >
            <span className={`text-xs font-medium ${isAdmin ? 'text-amber-500' : 'text-neutral-500'}`}>Role :</span>
            {isAdmin
              ? <Shield size={13} className="text-amber-400" />
              : <User size={13} className="text-neutral-400" />
            }
            <span className={`text-xs font-bold tracking-wider uppercase ${isAdmin ? 'text-amber-400' : 'text-neutral-400'}`}>
              {isAdmin ? 'Admin' : 'User'}
            </span>
            <ChevronDown size={11} className={`ml-auto transition-transform ${showRoleModal ? 'rotate-180' : ''} ${isAdmin ? 'text-amber-500/60' : 'text-neutral-600'}`} />
          </button>

          {/* Role Change Panel */}
          {showRoleModal && (
            <div className={`rounded-xl border p-3 space-y-2.5 ${isAdmin ? 'bg-neutral-950 border-amber-500/20' : 'bg-neutral-950 border-neutral-700'}`}>
              {isAdmin ? (
                // Admin → demote ke user (tidak perlu verifikasi)
                <>
                  <p className="text-xs text-neutral-400">Ubah role Anda menjadi <span className="text-neutral-200 font-medium">User</span>. Akses admin akan dicabut.</p>
                  <button
                    onClick={() => handleRoleChange('user')}
                    disabled={isChangingRole}
                    className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-neutral-800 hover:bg-red-500/10 border border-neutral-700 hover:border-red-500/30 text-neutral-300 hover:text-red-300 rounded-lg text-xs font-medium transition-all cursor-pointer disabled:opacity-50"
                  >
                    {isChangingRole
                      ? <Loader2 size={12} className="animate-spin" />
                      : <User size={12} />}
                    Demote ke User
                  </button>
                </>
              ) : (
                // User → promote ke admin via OTP email
                <>
                  {!otpSent ? (
                    <>
                      <p className="text-xs text-neutral-400">Untuk menjadi <span className="text-amber-400 font-medium">Admin</span>, kirim permintaan ke pengelola sistem. Kode OTP akan dikirim ke email admin.</p>
                      <button
                        onClick={handleRequestOtp}
                        disabled={isChangingRole}
                        className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 rounded-lg text-xs font-medium transition-all cursor-pointer disabled:opacity-50"
                      >
                        {isChangingRole ? <Loader2 size={12} className="animate-spin" /> : <Shield size={12} />}
                        Kirim Permintaan ke Admin
                      </button>
                    </>
                  ) : (
                    <>
                      <p className="text-xs text-green-400">✅ Kode OTP dikirim ke email admin. Minta kodenya lalu masukkan di bawah.</p>
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        placeholder="Masukkan 6 digit kode..."
                        value={otpCode}
                        onChange={e => setOtpCode(e.target.value.replace(/\D/g, ''))}
                        className="w-full px-3 py-2 bg-neutral-900 border border-neutral-700 focus:border-amber-500/50 rounded-lg text-sm text-center text-neutral-200 placeholder-neutral-600 outline-none transition-colors tracking-widest font-mono"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => { setOtpSent(false); setOtpCode(''); }}
                          className="flex-1 py-2 px-3 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-neutral-400 rounded-lg text-xs transition-all cursor-pointer"
                        >
                          Kirim Ulang
                        </button>
                        <button
                          onClick={handleVerifyOtp}
                          disabled={isChangingRole || otpCode.length !== 6}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 rounded-lg text-xs font-medium transition-all cursor-pointer disabled:opacity-50"
                        >
                          {isChangingRole ? <Loader2 size={12} className="animate-spin" /> : <Shield size={12} />}
                          Verifikasi
                        </button>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          )}

          {/* Kostumisasi AI Button */}
          <button
            onClick={openKostumiModal}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white py-3 px-4 rounded-xl font-medium transition-all shadow-sm flex items-center justify-center gap-2 text-sm whitespace-nowrap cursor-pointer border border-blue-500"
          >
            <Settings size={16} />
            <span>Kostumisasi AI</span>
          </button>

          {/* Dashboard Link */}
          <button
            onClick={() => window.location.href = '/dashboard'}
            className="w-full bg-neutral-800 hover:bg-neutral-700 text-neutral-300 py-2.5 px-4 rounded-xl font-medium transition-all flex items-center justify-center gap-2 text-sm whitespace-nowrap cursor-pointer border border-neutral-700"
          >
            <BarChart2 size={15} />
            <span>Dashboard</span>
          </button>

          {/* Logout Button */}
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
                {messages.map((m, idx) => {
                  // Citations ditampilkan hanya di pesan assistant paling akhir yang sedang/baru selesai
                  const isLastAssistant =
                    m.role === 'assistant' &&
                    idx === messages.length - 1 &&
                    lastCitations.length > 0;
                  return (
                    <ChatMessage
                      key={m.id || idx}
                      m={m}
                      citations={isLastAssistant ? lastCitations : undefined}
                    />
                  );
                })}

                {/* Typing Indicator — muncul saat AI belum mulai balas */}
                {isLoading && messages.length > 0 && messages[messages.length - 1].role === 'user' && (
                  <div className="flex justify-start">
                    <div className="flex items-center gap-1.5 px-4 py-3 bg-neutral-900 border border-neutral-800 rounded-3xl">
                      <span className="text-xs text-neutral-500 mr-1">Arise</span>
                      {[0, 1, 2].map(i => (
                        <div
                          key={i}
                          className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce"
                          style={{ animationDelay: `${i * 150}ms` }}
                        />
                      ))}
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            </div>

            <div className="w-full shrink-0 bg-transparent p-4 pb-6">
              <div className="flex justify-center mb-3 gap-2">
                {isLoading ? (
                  <button
                    onClick={stop}
                    className="flex items-center justify-center gap-2 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-neutral-300 rounded-full text-sm font-medium transition-colors shadow-sm cursor-pointer"
                  >
                    <Square size={14} className="fill-neutral-400" />
                    Stop Generation
                  </button>
                ) : messages.length > 0 && messages[messages.length - 1].role === 'assistant' && (
                  <button
                    onClick={() => {
                      const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
                      if (lastUserMsg) {
                        append({ role: 'user', content: lastUserMsg.content });
                      }
                    }}
                    className="flex items-center justify-center gap-2 px-4 py-2 bg-neutral-800/60 hover:bg-neutral-700 border border-neutral-700/50 text-neutral-500 hover:text-neutral-300 rounded-full text-xs font-medium transition-colors cursor-pointer"
                  >
                    <RefreshCw size={12} />
                    Regenerate
                  </button>
                )}
              </div>
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

              {/* Rate Limit Indicator */}
              {rateLimit !== null && (
                <div className="mt-2 px-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-neutral-600">
                      Batas pesan: <span className={`font-semibold ${
                        rateLimit.remaining <= 3 ? 'text-red-400' :
                        rateLimit.remaining <= 8 ? 'text-yellow-400' : 'text-neutral-500'
                      }`}>{rateLimit.remaining}/{rateLimit.max}</span> tersisa
                    </span>
                    {rateLimit.used > 0 && (
                      <span className="text-[10px] text-neutral-700">
                        reset dalam {rlCountdown}d
                      </span>
                    )}
                  </div>
                  <div className="h-0.5 bg-neutral-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        rateLimit.remaining <= 3 ? 'bg-red-500' :
                        rateLimit.remaining <= 8 ? 'bg-yellow-500' : 'bg-blue-500/50'
                      }`}
                      style={{ width: `${(rateLimit.used / rateLimit.max) * 100}%` }}
                    />
                  </div>
                </div>
              )}
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

      {/* ===== Kostumisasi AI Modal ===== */}
      {isKostumiModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-neutral-800 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-600/20 text-blue-400 flex items-center justify-center">
                  <Settings size={18} />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-white">Kostumisasi AI</h2>
                  <p className="text-xs text-neutral-500">Kelola knowledge base Arise</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 mr-2 bg-neutral-950 px-3 py-1.5 rounded-lg border border-neutral-800" title={isKbEnabled ? 'AI hanya menjawab dari dokumen' : 'AI bebas menjawab tanpa batasan dokumen'}>
                  <span className={`text-xs font-medium ${isKbEnabled ? 'text-blue-400' : 'text-neutral-500'}`}>
                    KB {isKbEnabled ? 'Aktif' : 'Nonaktif'}
                  </span>
                  <button
                    onClick={() => setIsKbEnabled(!isKbEnabled)}
                    className={`relative w-8 h-4 rounded-full transition-colors cursor-pointer ${isKbEnabled ? 'bg-blue-600' : 'bg-neutral-700'}`}
                  >
                    <div className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full transition-transform ${isKbEnabled ? 'translate-x-4' : 'translate-x-0'}`} />
                  </button>
                </div>
                <button
                  onClick={() => setIsKostumiModal(false)}
                  className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-neutral-800 shrink-0 px-5 pt-3">
              <button
                onClick={() => setKostumiTab('upload')}
                className={`flex items-center gap-2 pb-3 px-1 mr-6 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
                  kostumiTab === 'upload'
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-neutral-500 hover:text-neutral-300'
                }`}
              >
                <Upload size={14} />
                Upload Dokumen
              </button>
              <button
                onClick={() => { setKostumiTab('chunks'); loadChunks(); }}
                className={`flex items-center gap-2 pb-3 px-1 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
                  kostumiTab === 'chunks'
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-neutral-500 hover:text-neutral-300'
                }`}
              >
                <FileText size={14} />
                Kelola Chunks
                {chunks.length > 0 && (
                  <span className="bg-neutral-700 text-neutral-300 text-xs px-1.5 py-0.5 rounded-full">{chunks.length}</span>
                )}
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-5">

              {/* === Tab Upload === */}
              {kostumiTab === 'upload' && (
                <div className="space-y-4">
                  <p className="text-sm text-neutral-400">
                    Upload file teks atau tempel konten dokumen secara langsung. Sistem akan otomatis memotong teks menjadi chunk dan mengindeks ke knowledge base AI.
                  </p>

                  {/* File Upload Zone */}
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-neutral-700 hover:border-blue-500/60 rounded-xl p-6 text-center cursor-pointer transition-colors group"
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".txt,.md,.pdf"
                      className="hidden"
                      onChange={handleFileChange}
                    />
                    <Upload size={24} className="mx-auto mb-2 text-neutral-600 group-hover:text-blue-400 transition-colors" />
                    {uploadFile ? (
                      <p className="text-sm font-medium">
                        <span className={uploadFile.name.endsWith('.pdf') ? 'text-red-300' : 'text-blue-300'}>
                          {uploadFile.name}
                        </span>
                      </p>
                    ) : (
                      <>
                        <p className="text-sm text-neutral-400">Klik untuk memilih file <span className="text-blue-400">.txt</span>, <span className="text-blue-400">.md</span>, atau <span className="text-red-400">.pdf</span></p>
                        <p className="text-xs text-neutral-600 mt-1">Atau tempel teks langsung di bawah ini</p>
                      </>
                    )}
                  </div>

                  {/* Text Area */}
                  <textarea
                    value={uploadText}
                    onChange={(e) => { setUploadText(e.target.value); setUploadFile(null); }}
                    placeholder="Atau tempel konten dokumen Anda di sini..."
                    rows={8}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl p-4 text-sm text-neutral-200 placeholder-neutral-600 focus:outline-none focus:border-blue-500/60 resize-none transition-colors"
                  />

                  <div className="flex items-center justify-between">
                    <span className="text-xs text-neutral-600">
                      {uploadFile
                        ? uploadFile.name.endsWith('.pdf')
                          ? `PDF siap dikirim (${(uploadFile.size / 1024).toFixed(1)} KB)`
                          : `${uploadText.trim().split(/\s+/).filter(Boolean).length} kata`
                        : `${uploadText.trim().split(/\s+/).filter(Boolean).length} kata`
                      }
                    </span>
                    <div className="flex items-center gap-3">
                      {/* Toggle Global/Pribadi — hanya tampil untuk admin (berlaku untuk file DAN teks) */}
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => setIsGlobalUpload(v => !v)}
                          className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-all cursor-pointer ${
                            isGlobalUpload
                              ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                              : 'bg-neutral-800 border-neutral-700 text-neutral-500 hover:text-neutral-300'
                          }`}
                          title={isGlobalUpload ? 'Dokumen akan tersedia untuk semua user' : 'Klik untuk jadikan dokumen global'}
                        >
                          <Shield size={11} />
                          {isGlobalUpload ? 'Global' : 'Pribadi'}
                        </button>
                      )}
                      <button
                        onClick={handleIngest}
                        disabled={isIngesting || (!uploadText.trim() && !uploadFile)}
                        className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl transition-colors cursor-pointer"
                      >
                        {isIngesting ? (
                          <><Loader2 size={14} className="animate-spin" /> Memproses...</>
                        ) : (
                          <><Upload size={14} /> Indeks ke Knowledge Base</>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Result Badge */}
                  {ingestResult && (
                    <div
                      ref={ingestResultRef}
                      className={`rounded-xl px-4 py-3 text-sm font-medium ${
                        ingestResult.startsWith('✅')
                          ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                          : 'bg-red-500/10 text-red-400 border border-red-500/20'
                      }`}
                    >
                      {ingestResult}
                    </div>
                  )}
                </div>
              )}

              {/* === Tab Chunks === */}
              {kostumiTab === 'chunks' && (
                <div className="space-y-3">
                  {isLoadingChunks ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 size={24} className="animate-spin text-blue-400" />
                    </div>
                  ) : chunks.length === 0 ? (
                    <div className="text-center py-12">
                      <FileText size={36} className="mx-auto mb-3 text-neutral-700" />
                      <p className="text-neutral-500 text-sm">Belum ada dokumen dalam knowledge base.</p>
                      <p className="text-neutral-600 text-xs mt-1">Upload dokumen di tab sebelumnya.</p>
                    </div>
                  ) : (
                    <>
                      {/* Toolbar multi-select */}
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={toggleSelectAll}
                            className="flex items-center gap-2 text-xs text-neutral-400 hover:text-white transition-colors cursor-pointer px-2 py-1 rounded-lg hover:bg-neutral-800"
                          >
                            <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                              selectedChunkIds.size === chunks.length && chunks.length > 0
                                ? 'bg-blue-600 border-blue-600'
                                : selectedChunkIds.size > 0
                                  ? 'bg-blue-600/40 border-blue-500'
                                  : 'border-neutral-600'
                            }`}>
                              {selectedChunkIds.size === chunks.length && chunks.length > 0 ? (
                                <Check size={10} className="text-white" />
                              ) : selectedChunkIds.size > 0 ? (
                                <div className="w-2 h-0.5 bg-white rounded" />
                              ) : null}
                            </div>
                            Pilih Semua
                          </button>
                          <span className="text-xs text-neutral-600">{chunks.length} chunk</span>
                        </div>
                        {selectedChunkIds.size > 0 && (
                          <button
                            onClick={() => setShowBulkDeleteConfirm(true)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 text-red-400 hover:text-red-300 rounded-lg text-xs font-medium transition-colors cursor-pointer"
                          >
                            <Trash2 size={12} />
                            Hapus {selectedChunkIds.size} Terpilih
                          </button>
                        )}
                      </div>

                      {chunks.map((chunk) => (
                        <div
                          key={chunk.id}
                          className={`border rounded-xl overflow-hidden transition-colors ${
                            selectedChunkIds.has(chunk.id)
                              ? 'border-blue-500/50 bg-blue-500/5'
                              : 'border-neutral-800'
                          }`}
                        >
                          <div className="flex items-center justify-between px-3 py-3 bg-neutral-950/60">
                            {/* Checkbox */}
                            <button
                              onClick={() => toggleSelectChunk(chunk.id)}
                              className="shrink-0 mr-2 cursor-pointer"
                              title={selectedChunkIds.has(chunk.id) ? 'Batalkan pilihan' : 'Pilih chunk ini'}
                            >
                              <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                                selectedChunkIds.has(chunk.id)
                                  ? 'bg-blue-600 border-blue-600'
                                  : 'border-neutral-600 hover:border-blue-500'
                              }`}>
                                {selectedChunkIds.has(chunk.id) && <Check size={10} className="text-white" />}
                              </div>
                            </button>

                            <button
                              onClick={() => setExpandedChunkId(expandedChunkId === chunk.id ? null : chunk.id)}
                              className="flex items-center gap-2 flex-1 text-left text-sm text-neutral-300 hover:text-white transition-colors cursor-pointer min-w-0"
                            >
                              <ChevronDown
                                size={14}
                                className={`shrink-0 text-neutral-500 transition-transform ${expandedChunkId === chunk.id ? 'rotate-180' : ''}`}
                              />
                              <span className="truncate">{chunk.content.slice(0, 80)}...</span>
                            </button>
                            {/* Badge Global/Pribadi */}
                            {chunk.isGlobal ? (
                              <span className="ml-1 shrink-0 text-[10px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded">
                                GLOBAL
                              </span>
                            ) : isAdmin && (
                              <span className="ml-1 shrink-0 text-[10px] text-neutral-600 bg-neutral-800 px-1.5 py-0.5 rounded">
                                {chunk.userId === '' ? 'lama' : chunk.userId.slice(-6)}
                              </span>
                            )}
                            <button
                              onClick={() => {
                                if (chunk.isGlobal && !isAdmin) {
                                  toast.error('Anda bukan admin. Chunk global tidak dapat diedit.');
                                  return;
                                }
                                openEditChunk(chunk);
                              }}
                              className={`ml-1 p-1.5 rounded-lg transition-colors cursor-pointer shrink-0 ${
                                chunk.isGlobal && !isAdmin
                                  ? 'text-neutral-700 cursor-not-allowed'
                                  : 'text-neutral-500 hover:text-blue-400 hover:bg-blue-500/10'
                              }`}
                              title={chunk.isGlobal && !isAdmin ? 'Hanya admin yang dapat mengedit chunk global' : 'Edit chunk'}
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              onClick={() => {
                                if (chunk.isGlobal && !isAdmin) {
                                  toast.error('Anda bukan admin. Chunk global tidak dapat dihapus.');
                                  return;
                                }
                                handleDeleteChunk(chunk.id);
                              }}
                              disabled={deletingChunkId === chunk.id}
                              className={`ml-1 p-1.5 rounded-lg transition-colors cursor-pointer shrink-0 disabled:opacity-50 ${
                                chunk.isGlobal && !isAdmin
                                  ? 'text-neutral-700 cursor-not-allowed'
                                  : 'text-neutral-500 hover:text-red-400 hover:bg-red-500/10'
                              }`}
                              title={chunk.isGlobal && !isAdmin ? 'Hanya admin yang dapat menghapus chunk global' : 'Hapus chunk'}
                            >
                              {deletingChunkId === chunk.id ? (
                                <Loader2 size={14} className="animate-spin" />
                              ) : (
                                <Trash2 size={14} />
                              )}
                            </button>
                          </div>
                          {expandedChunkId === chunk.id && (
                            <div className="px-4 py-3 bg-neutral-950 border-t border-neutral-800">
                              <p className="text-xs text-neutral-400 leading-relaxed whitespace-pre-wrap">{chunk.content}</p>
                            </div>
                          )}
                        </div>
                      ))}

                      {/* ── Sticky Floating Bar ── muncul saat ada chunk dipilih, user tidak perlu scroll ke atas */}
                      {selectedChunkIds.size > 0 && (
                        <div className="sticky bottom-0 mt-3 flex items-center justify-between gap-3 px-4 py-3 bg-neutral-900/95 backdrop-blur border border-red-500/20 rounded-xl shadow-lg z-10">
                          <span className="text-xs text-neutral-400">
                            <span className="text-white font-semibold">{selectedChunkIds.size}</span> chunk dipilih
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setSelectedChunkIds(new Set())}
                              className="px-3 py-1.5 text-xs text-neutral-400 hover:text-white border border-neutral-700 hover:border-neutral-500 rounded-lg transition-colors cursor-pointer"
                            >
                              Batal
                            </button>
                            <button
                              onClick={() => setShowBulkDeleteConfirm(true)}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-medium transition-colors cursor-pointer shadow-sm"
                            >
                              <Trash2 size={12} />
                              Hapus {selectedChunkIds.size} Terpilih
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

            </div>
          </div>
        </div>
      )}

      {/* ===== Bulk Delete Confirm Modal ===== */}
      {showBulkDeleteConfirm && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-sm p-6 shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="flex flex-col items-center text-center">
              <div className="w-12 h-12 rounded-full bg-red-500/20 text-red-500 flex items-center justify-center mb-4">
                <AlertTriangle size={24} />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Hapus {selectedChunkIds.size} Chunk?</h3>
              <p className="text-neutral-400 text-sm mb-6">
                Tindakan ini tidak dapat dibatalkan. {selectedChunkIds.size} chunk yang dipilih akan dihapus secara permanen dari knowledge base.
              </p>
              <div className="flex gap-3 w-full">
                <button
                  onClick={() => setShowBulkDeleteConfirm(false)}
                  disabled={isBulkDeleting}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-neutral-700 text-neutral-300 hover:bg-neutral-800 font-medium text-sm transition-colors cursor-pointer disabled:opacity-50"
                >
                  Batal
                </button>
                <button
                  onClick={handleBulkDelete}
                  disabled={isBulkDeleting}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-medium text-sm transition-colors cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isBulkDeleting ? (
                    <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    'Hapus Permanen'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== Edit Chunk Modal ===== */}
      {editingChunkId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[85vh]">
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-neutral-800 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-600/20 text-blue-400 flex items-center justify-center">
                  <Edit2 size={18} />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-white">Edit Chunk</h2>
                  <p className="text-xs text-neutral-500">Embedding akan di-regenerasi otomatis setelah disimpan</p>
                </div>
              </div>
              <button
                onClick={() => setEditingChunkId(null)}
                disabled={isUpdatingChunk}
                className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
              >
                <X size={18} />
              </button>
            </div>

            {/* Textarea */}
            <div className="flex-1 overflow-y-auto p-5">
              <textarea
                value={editChunkContent}
                onChange={(e) => setEditChunkContent(e.target.value)}
                rows={14}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl p-4 text-sm text-neutral-200 placeholder-neutral-600 focus:outline-none focus:border-blue-500/60 resize-none transition-colors font-mono leading-relaxed"
                placeholder="Konten chunk..."
              />
              <p className="text-xs text-neutral-600 mt-2 text-right">
                {editChunkContent.trim().split(/\s+/).filter(Boolean).length} kata · ≈{Math.ceil(editChunkContent.length / 4)} token
              </p>
            </div>

            {/* Footer Buttons */}
            <div className="flex gap-3 p-5 border-t border-neutral-800 shrink-0">
              <button
                onClick={() => setEditingChunkId(null)}
                disabled={isUpdatingChunk}
                className="flex-1 px-4 py-2.5 rounded-xl border border-neutral-700 text-neutral-300 hover:bg-neutral-800 font-medium text-sm transition-colors cursor-pointer disabled:opacity-50"
              >
                Batal
              </button>
              <button
                onClick={handleUpdateChunk}
                disabled={isUpdatingChunk || !editChunkContent.trim()}
                className="flex-1 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium text-sm transition-colors cursor-pointer flex items-center justify-center gap-2"
              >
                {isUpdatingChunk ? (
                  <><Loader2 size={14} className="animate-spin" /> Menyimpan & Re-embed...</>
                ) : (
                  <><Check size={14} /> Simpan Perubahan</>
                )}
              </button>
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