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
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            className="flex-1 p-4 bg-transparent text-neutral-100 placeholder-neutral-400 focus:outline-none text-lg"
            value={input}
            placeholder="Ketik Sesuatu..."
            onChange={handleInputChange}
            autoFocus
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
