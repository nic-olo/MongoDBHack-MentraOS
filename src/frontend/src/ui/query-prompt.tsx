import React, { useState, useRef, useEffect } from 'react';
import { Send } from 'lucide-react';

interface QueryPromptProps {
  isMobile: boolean;
  onSendMessage?: (message: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

function QueryPrompt({
  isMobile,
  onSendMessage,
  placeholder = "Ask anything...",
  disabled = false
}: QueryPromptProps) {
  const [message, setMessage] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea as user types
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [message]);

  const handleSend = () => {
    if (message.trim() && !disabled) {
      onSendMessage?.(message.trim());
      setMessage('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className={`w-full ${isMobile ? 'p-4' : 'p-6'} font-mono`}>
      <div className="max-w-3xl mx-auto">
        <div className="relative flex items-end gap-2 bg-white border-2 border-black rounded-2xl transition-all hover:border-black/80 shadow-lg">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            rows={1}
            className={`
              flex-1 resize-none bg-transparent px-3 py-2
              focus:outline-none placeholder:text-black/40 text-black
              ${isMobile ? 'text-base' : 'text-sm'}
              max-h-[200px] overflow-y-auto font-mono
              disabled:opacity-50 disabled:cursor-not-allowed
            `}
            style={{ minHeight: '36px' }}
          />

          <button
            onClick={handleSend}
            disabled={disabled || !message.trim()}
            className={`
              flex items-center justify-center rounded-lg
              ${isMobile ? 'w-8 h-8 m-1.5' : 'w-8 h-8 m-2'}
              transition-all border-2
              ${
                disabled || !message.trim()
                  ? 'bg-black/10 text-black/40 border-black/10 cursor-not-allowed'
                  : 'bg-black text-white border-black hover:bg-black/90 active:scale-95'
              }
            `}
          >
            <Send className={isMobile ? 'w-4 h-4' : 'w-4 h-4'} />
          </button>
        </div>

        {/* Optional hint text */}
        <p className="text-xs text-black/40 text-center mt-2 uppercase tracking-wide">
          [ ENTER ] to send | [ SHIFT + ENTER ] for new line
        </p>
      </div>
    </div>
  );
}

export default QueryPrompt;