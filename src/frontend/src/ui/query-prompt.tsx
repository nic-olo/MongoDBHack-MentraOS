import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
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
    // CMD/Ctrl + Enter to send
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    }
    // Enter without shift to send
    else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const charCount = message.length;
  const showCharCount = charCount > 200;

  return (
    <div className={`w-full ${isMobile ? 'p-4' : 'p-6'}`}>
      <div className="max-w-3xl mx-auto">
        <div 
          className="relative flex items-center gap-3 rounded-2xl transition-smooth"
          style={{ 
            backgroundColor: 'var(--surface-elevated)',
            border: '1px solid var(--border-subtle)',
            padding: isMobile ? '12px' : '16px',
            boxShadow: 'var(--shadow-sm)'
          }}
        >
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            rows={1}
            className={`
              flex-1 resize-none bg-transparent
              focus:outline-none
              ${isMobile ? 'text-base' : 'text-sm'}
              max-h-[200px] overflow-y-auto
              disabled:opacity-50 disabled:cursor-not-allowed
            `}
            style={{ 
              minHeight: '28px',
              color: 'var(--color-gray-900)',
              lineHeight: '1.75',
              paddingTop: '2px',
              paddingBottom: '2px'
            }}
          />

          <motion.button
            whileHover={{ scale: disabled || !message.trim() ? 1 : 1.05 }}
            whileTap={{ scale: disabled || !message.trim() ? 1 : 0.95 }}
            onClick={handleSend}
            disabled={disabled || !message.trim()}
            className={`
              flex items-center justify-center rounded-lg
              ${isMobile ? 'w-9 h-9' : 'w-10 h-10'}
              transition-smooth focus-ring flex-shrink-0
            `}
            style={{
              background: disabled || !message.trim() 
                ? 'var(--color-gray-200)' 
                : 'linear-gradient(135deg, var(--color-primary-500) 0%, var(--color-accent-600) 100%)',
              color: disabled || !message.trim() ? 'var(--color-gray-400)' : 'white',
              cursor: disabled || !message.trim() ? 'not-allowed' : 'pointer',
              opacity: disabled || !message.trim() ? 0.5 : 1
            }}
          >
            <Send className={isMobile ? 'w-4 h-4' : 'w-5 h-5'} />
          </motion.button>
        </div>

        {/* Hints and Character Count */}
        <div className="flex items-center justify-center mt-3 px-1 relative">
          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--color-gray-500)' }}>
            <div className="flex items-center gap-1">
              <kbd 
                className="px-1.5 py-0.5 rounded text-xs font-mono"
                style={{ 
                  backgroundColor: 'var(--surface-elevated)',
                  border: '1px solid var(--border-subtle)'
                }}
              >
                {isMobile ? '↵' : '⏎'}
              </kbd>
              <span>to send</span>
            </div>
            {!isMobile && (
              <>
                <span>•</span>
                <div className="flex items-center gap-1">
                  <kbd 
                    className="px-1.5 py-0.5 rounded text-xs font-mono"
                    style={{ 
                      backgroundColor: 'var(--surface-elevated)',
                      border: '1px solid var(--border-subtle)'
                    }}
                  >
                    ⇧
                  </kbd>
                  <kbd 
                    className="px-1.5 py-0.5 rounded text-xs font-mono"
                    style={{ 
                      backgroundColor: 'var(--surface-elevated)',
                      border: '1px solid var(--border-subtle)'
                    }}
                  >
                    ⏎
                  </kbd>
                  <span>for new line</span>
                </div>
              </>
            )}
          </div>

          {showCharCount && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="absolute right-0 text-xs"
              style={{ 
                color: charCount > 500 ? 'var(--color-warning-500)' : 'var(--color-gray-500)'
              }}
            >
              {charCount} characters
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}

export default QueryPrompt;
