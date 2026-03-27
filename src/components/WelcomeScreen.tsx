import { Send } from 'lucide-react';

interface WelcomeScreenProps {
  input: string;
  handleInputChange: (e: React.ChangeEvent<HTMLInputElement> | React.ChangeEvent<HTMLTextAreaElement>) => void;
  handleSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
}

export default function WelcomeScreen({ input, handleInputChange, handleSubmit }: WelcomeScreenProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-8 w-full max-w-3xl mx-auto -mt-10 overflow-y-auto">
      <div className="w-full text-left mb-8 space-y-2">
        <h2 className="text-4xl font-semibold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">
          Halo Manusia
        </h2>
        <h2 className="text-4xl font-semibold text-neutral-300">
          Sebaiknya kita mulai dari mana?
        </h2>
      </div>

      <div className="w-full bg-neutral-900 border border-neutral-800 rounded-2xl p-2 shrink-0 shadow-lg">
        <form onSubmit={(e) => {
          handleSubmit(e);
          const ta = e.currentTarget.querySelector('textarea');
          if (ta) ta.style.height = 'auto';
        }} className="flex gap-2 items-end">
          <textarea
            className="flex-1 p-4 bg-transparent text-neutral-100 placeholder-neutral-400 focus:outline-none text-lg resize-none min-h-[60px] max-h-[200px] overflow-y-auto"
            value={input}
            placeholder="Ketik Sesuatu..."
            onChange={handleInputChange}
            autoFocus
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
