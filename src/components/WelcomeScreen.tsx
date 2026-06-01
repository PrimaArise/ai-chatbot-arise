import { Send, Sparkles } from 'lucide-react';
import { useEffect, useRef } from 'react';

interface WelcomeScreenProps {
  input: string;
  handleInputChange: (e: React.ChangeEvent<HTMLInputElement> | React.ChangeEvent<HTMLTextAreaElement>) => void;
  handleSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  setInput: (value: string) => void;
}

// 5 pertanyaan umum berdasarkan chatbot-knowledge.txt
const SUGGESTED_QUESTIONS = [
  'Apa itu Chatbot Arise dan bagaimana cara kerjanya?',
  'Bagaimana cara mengunggah dokumen ke Knowledge Base?',
  'Apa perbedaan mode Knowledge Base ON dan OFF?',
  'Bagaimana cara mereset password akun saya?',
  'Apa saja fitur utama yang dimiliki Chatbot Arise?',
];

export default function WelcomeScreen({ input, handleInputChange, handleSubmit, setInput }: WelcomeScreenProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    // Focus setelah mount (client-only) — menghindari hydration mismatch
    textareaRef.current?.focus();
  }, []);

  const handleBubbleClick = (question: string) => {
    setInput(question);
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.style.height = 'auto';
        textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
      }
    }, 0);
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-8 w-full max-w-3xl mx-auto overflow-y-auto">
      {/* Heading */}
      <div className="w-full text-left mb-8 space-y-2">
        <h2 className="text-4xl font-semibold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">
          Halo Manusia
        </h2>
        <h2 className="text-4xl font-semibold text-neutral-300">
          Sebaiknya kita mulai dari mana?
        </h2>
      </div>

      {/* Suggested Questions Bubbles */}
      <div className="w-full mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles size={13} className="text-blue-400" />
          <span className="text-xs text-neutral-500 font-medium tracking-wide uppercase">Pertanyaan Populer</span>
        </div>
        <div className="flex flex-col gap-2">
          {SUGGESTED_QUESTIONS.map((question, idx) => (
            <button
              key={idx}
              onClick={() => handleBubbleClick(question)}
              className="group w-full text-left px-4 py-3 rounded-2xl bg-neutral-900 border border-neutral-800 hover:border-blue-500/40 hover:bg-neutral-800/80 text-neutral-400 hover:text-neutral-200 text-sm leading-relaxed transition-all duration-200 cursor-pointer relative overflow-hidden"
            >
              {/* Subtle shimmer on hover */}
              <span className="absolute inset-0 bg-gradient-to-r from-blue-600/0 via-blue-600/5 to-purple-600/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <span className="relative flex items-start gap-3">
                <span className="shrink-0 mt-0.5 w-5 h-5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center text-[10px] font-bold">
                  {idx + 1}
                </span>
                {question}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Input Form */}
      <div className="w-full bg-neutral-900 border border-neutral-800 rounded-2xl p-2 shrink-0 shadow-lg">
        {/* 
          Form pengiriman pesan.
          Event onSubmit dicegat sebentar untuk memastikan ukuran textarea kembali mengecil (auto) setelah pesan dikirim.
        */}
        <form onSubmit={(e) => {
          handleSubmit(e);
          const ta = e.currentTarget.querySelector('textarea');
          if (ta) ta.style.height = 'auto';
        }} className="flex gap-2 items-end">
          
          {/* Textarea kustom: Bisa memanjang ke bawah otomatis dan mentolerir tombol Enter */}
          <textarea
            ref={textareaRef}
            className="flex-1 p-4 bg-transparent text-neutral-100 placeholder-neutral-400 focus:outline-none text-lg resize-none min-h-[60px] max-h-[200px] overflow-y-auto"
            value={input}
            placeholder="Ketik Sesuatu..."
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
            className="p-4 text-neutral-400 hover:text-white disabled:opacity-50 transition-colors shrink-0 cursor-pointer"
          >
            <Send size={20} className={input.trim() ? "text-blue-500" : ""} />
          </button>
        </form>
      </div>
    </div>
  );
}
