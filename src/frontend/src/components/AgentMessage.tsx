import { motion } from 'framer-motion';
import { parseAgentResponse, type ParsedResponse } from '../utils/responseParser';
import CodeBlock from './CodeBlock';

interface AgentMessageProps {
  content: string;
  isProcessing?: boolean;
  progressMessage?: string;
}

export default function AgentMessage({ content, isProcessing = false, progressMessage }: AgentMessageProps) {
  // Parse the response
  const parsed: ParsedResponse = parseAgentResponse(content);

  if (isProcessing) {
    return (
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-4"
      >
        <div 
          className="rounded-2xl p-6"
          style={{ 
            backgroundColor: 'var(--surface-elevated)',
            border: '1px solid var(--border-subtle)',
            boxShadow: 'var(--shadow-sm)'
          }}
        >
          {/* Header */}
          <div className="flex items-center gap-3 mb-4">
            <div className="relative">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center"
                style={{ boxShadow: 'var(--shadow-glow)' }}
              >
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </motion.div>
            </div>
            <div>
              <h3 className="text-base font-semibold" style={{ color: 'var(--color-gray-900)' }}>Processing</h3>
              <p className="text-sm" style={{ color: 'var(--color-gray-500)' }}>{progressMessage || 'AI is working on your request...'}</p>
            </div>
          </div>

          {/* Animated Progress Bar */}
          <div className="w-full rounded-full h-1.5 overflow-hidden" style={{ backgroundColor: 'var(--color-gray-200)' }}>
            <motion.div 
              className="h-full gradient-primary rounded-full"
              animate={{ x: ['-100%', '100%'] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
              style={{ width: '50%' }}
            />
          </div>

          {/* Info Box */}
          <div 
            className="mt-4 p-4 rounded-xl"
            style={{ 
              backgroundColor: 'var(--color-primary-50)',
              border: '1px solid var(--color-primary-200)'
            }}
          >
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: 'var(--color-primary-600)' }} fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              <div className="flex-1">
                <h4 className="text-sm font-semibold mb-1" style={{ color: 'var(--color-primary-900)' }}>Processing your request</h4>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--color-primary-700)' }}>
                  The agent is analyzing your query, exploring the codebase, and generating a response.
                </p>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  // Render based on response type
  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      {/* Text Response */}
      {parsed.type !== 'code' && (
        <div 
          className="rounded-2xl p-6"
          style={{ 
            backgroundColor: 'var(--surface-elevated)',
            border: '1px solid var(--border-subtle)',
            boxShadow: 'var(--shadow-sm)'
          }}
        >
          <div className="flex items-start gap-3 mb-4">
            <div 
              className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center flex-shrink-0"
              style={{ boxShadow: 'var(--shadow-glow)' }}
            >
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div className="flex-1">
              <ReactMarkdown content={parsed.text} />
            </div>
          </div>
        </div>
      )}

      {/* Files Modified Section */}
      {parsed.files.length > 0 && (
        <motion.div 
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          className="rounded-2xl p-4"
          style={{ 
            background: 'linear-gradient(135deg, var(--color-success-500) 0%, var(--color-success-600) 100%)',
            boxShadow: 'var(--shadow-md)'
          }}
        >
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div className="flex-1">
              <h4 className="text-sm font-semibold text-white mb-2">Files modified</h4>
              <div className="space-y-1.5">
                {parsed.files.map((file, idx) => (
                  <motion.div 
                    key={idx}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    className="flex items-center gap-2 text-xs text-white font-mono bg-white/10 px-3 py-2 rounded-lg backdrop-blur-sm"
                  >
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    {file}
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Code Blocks */}
      {parsed.codeBlocks.map((block, idx) => (
        <CodeBlock
          key={idx}
          code={block.code}
          language={block.language}
          filePath={block.filePath}
          showLineNumbers={false}
        />
      ))}
    </motion.div>
  );
}

// Simple markdown renderer component
function ReactMarkdown({ content }: { content: string }) {
  // Remove code blocks for text rendering (they're shown separately)
  const textOnly = content.replace(/```[\s\S]*?```/g, '');

  // Basic markdown parsing
  const lines = textOnly.split('\n');

  return (
    <div className="space-y-3">
      {lines.map((line, idx) => {
        // Headings
        if (line.startsWith('### ')) {
          return <h3 key={idx} className="text-lg font-semibold mt-4" style={{ color: 'var(--color-gray-900)' }}>{line.substring(4)}</h3>;
        }
        if (line.startsWith('## ')) {
          return <h2 key={idx} className="text-xl font-semibold mt-4" style={{ color: 'var(--color-gray-900)' }}>{line.substring(3)}</h2>;
        }
        if (line.startsWith('# ')) {
          return <h1 key={idx} className="text-2xl font-bold mt-4" style={{ color: 'var(--color-gray-900)' }}>{line.substring(2)}</h1>;
        }

        // Lists
        if (line.match(/^[*-]\s/)) {
          return (
            <li key={idx} className="ml-4" style={{ color: 'var(--color-gray-700)' }}>
              {line.substring(2)}
            </li>
          );
        }

        // Bold
        const boldText = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

        // Inline code
        const withCode = boldText.replace(/`([^`]+)`/g, '<code class="px-1.5 py-0.5 rounded text-sm font-mono" style="background-color: var(--color-gray-150); color: var(--color-gray-800)">$1</code>');

        // Empty line
        if (line.trim() === '') {
          return <div key={idx} className="h-2"></div>;
        }

        return (
          <p key={idx} className="leading-relaxed" style={{ color: 'var(--color-gray-700)' }} dangerouslySetInnerHTML={{ __html: withCode }}></p>
        );
      })}
    </div>
  );
}
