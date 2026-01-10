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
    <div className={`w-full ${isMobile ? 'p-4' : 'p-6'}`}>
      <div className="max-w-3xl mx-auto">
        <div className="relative flex items-end gap-2 bg-white border border-gray-200 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            rows={1}
            className={`
              flex-1 resize-none bg-transparent px-4 py-3
              focus:outline-none placeholder:text-gray-400
              ${isMobile ? 'text-base' : 'text-sm'}
              max-h-[200px] overflow-y-auto
              disabled:opacity-50 disabled:cursor-not-allowed
            `}
            style={{ minHeight: '44px' }}
          />

          <button
            onClick={handleSend}
            disabled={disabled || !message.trim()}
            className={`
              flex items-center justify-center
              ${isMobile ? 'w-10 h-10 m-2' : 'w-8 h-8 m-2.5'}
              rounded-lg transition-all
              ${
                disabled || !message.trim()
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-black text-white hover:bg-gray-800 active:scale-95'
              }
            `}
          >
            <Send className={isMobile ? 'w-5 h-5' : 'w-4 h-4'} />
          </button>
        </div>

        {/* Optional hint text */}
        <p className="text-xs text-gray-400 text-center mt-2">
          Press Enter to send, Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}

export default QueryPrompt;