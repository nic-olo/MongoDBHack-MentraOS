import { useState } from 'react';
import { parseAgentResponse, getLanguageDisplayName, extractSummary, type ParsedResponse } from '../utils/responseParser';

interface AgentMessageProps {
  content: string;
  isProcessing?: boolean;
  progressMessage?: string;
}

export default function AgentMessage({ content, isProcessing = false, progressMessage }: AgentMessageProps) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  // Parse the response
  const parsed: ParsedResponse = parseAgentResponse(content);

  const handleCopy = async (code: string, index: number) => {
    await navigator.clipboard.writeText(code);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  if (isProcessing) {
    return (
      <div className="space-y-4 font-mono">
        <div className="bg-white border-2 border-black rounded-2xl p-6 shadow-lg">
          {/* Header */}
          <div className="flex items-center gap-3 mb-4">
            <div className="relative">
              <div className="w-10 h-10 bg-black rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
              </div>
              <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-black rounded-full border-2 border-white animate-pulse" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-black uppercase tracking-wider">$ Running async session</h3>
              <p className="text-xs text-black/60 mt-1">&gt; {progressMessage || 'AI is working on your request...'}</p>
            </div>
          </div>

          {/* Animated Progress Bar */}
          <div className="w-full bg-black/10 rounded-full h-1.5 overflow-hidden">
            <div className="h-full bg-black rounded-full animate-pulse" style={{ width: '60%' }}></div>
          </div>

          {/* Info Box */}
          <div className="mt-4 p-4 bg-black/5 border-2 border-black/10 rounded-xl">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-black mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              <div className="flex-1">
                <h4 className="text-xs font-semibold text-black mb-1 uppercase tracking-wide">[ INFO ]</h4>
                <p className="text-xs text-black/70 leading-relaxed">
                  The agent is analyzing your query, exploring the codebase, and generating a response.
                  This may take a moment for complex requests.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Render based on response type
  return (
    <div className="space-y-4 font-mono">
      {/* Text Response */}
      {parsed.type !== 'code' && (
        <div className="bg-white border-2 border-black rounded-2xl p-6 shadow-lg">
          <div className="prose prose-sm max-w-none">
            <ReactMarkdown content={parsed.text} />
          </div>
        </div>
      )}

      {/* Files Modified Section */}
      {parsed.files.length > 0 && (
        <div className="bg-white border-2 border-black rounded-2xl p-4 shadow-lg">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div className="flex-1">
              <h4 className="text-xs font-semibold text-black mb-2 uppercase tracking-wide">[ FILES MODIFIED ]</h4>
              <div className="space-y-1">
                {parsed.files.map((file, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-xs text-black bg-black/5 px-3 py-1.5 border-2 border-black/10 rounded-lg">
                    <svg className="w-4 h-4 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="font-mono">{file}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Code Blocks */}
      {parsed.codeBlocks.map((block, idx) => (
        <div key={idx} className="bg-white border-2 border-black rounded-2xl overflow-hidden shadow-lg">
          {/* Code Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-black/5 border-b-2 border-black/10">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 bg-black rounded-full"></div>
                <div className="w-3 h-3 bg-black/60 rounded-full"></div>
                <div className="w-3 h-3 bg-black/30 rounded-full"></div>
              </div>
              <div className="flex items-center gap-2">
                {block.filePath && (
                  <>
                    <span className="text-xs text-black/80 font-mono">/{block.filePath}</span>
                    <span className="text-black/40">|</span>
                  </>
                )}
                <span className="text-xs text-black/60 font-semibold uppercase">{getLanguageDisplayName(block.language)}</span>
              </div>
            </div>
            <button
              onClick={() => handleCopy(block.code, idx)}
              className="flex items-center gap-2 px-3 py-1.5 text-xs text-black/80 hover:text-black bg-black/5 hover:bg-black/10 border-2 border-black/10 rounded-lg transition-colors"
            >
              {copiedIndex === idx ? (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  COPIED
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  COPY
                </>
              )}
            </button>
          </div>

          {/* Code Content */}
          <div className="p-4 overflow-x-auto bg-white">
            <pre className="text-sm font-mono text-black whitespace-pre-wrap break-words">
              <code>{block.code}</code>
            </pre>
          </div>
        </div>
      ))}
    </div>
  );
}

// Simple markdown renderer component
function ReactMarkdown({ content }: { content: string }) {
  // Remove code blocks for text rendering (they're shown separately)
  const textOnly = content.replace(/```[\s\S]*?```/g, '');

  // Basic markdown parsing
  const lines = textOnly.split('\n');

  return (
    <div className="space-y-3 font-mono">
      {lines.map((line, idx) => {
        // Headings
        if (line.startsWith('### ')) {
          return <h3 key={idx} className="text-base font-bold text-black mt-4 uppercase tracking-wide break-words">&gt;&gt; {line.substring(4)}</h3>;
        }
        if (line.startsWith('## ')) {
          return <h2 key={idx} className="text-lg font-bold text-black mt-4 uppercase tracking-wide break-words">&gt;&gt; {line.substring(3)}</h2>;
        }
        if (line.startsWith('# ')) {
          return <h1 key={idx} className="text-xl font-bold text-black mt-4 uppercase tracking-wide break-words">&gt;&gt;&gt; {line.substring(2)}</h1>;
        }

        // Lists
        if (line.match(/^[\*\-]\s/)) {
          return (
            <li key={idx} className="text-black/90 ml-4 break-words">
              <span className="text-black/60">→</span> {line.substring(2)}
            </li>
          );
        }

        // Bold
        const boldText = line.replace(/\*\*(.*?)\*\*/g, '<strong class="text-black font-bold">$1</strong>');

        // Inline code
        const withCode = boldText.replace(/`([^`]+)`/g, '<code class="px-1.5 py-0.5 bg-black/10 text-black border-2 border-black/20 rounded text-xs font-mono break-all">$1</code>');

        // Empty line
        if (line.trim() === '') {
          return <div key={idx} className="h-2"></div>;
        }

        return (
          <p key={idx} className="text-black/80 leading-relaxed text-sm break-words" dangerouslySetInnerHTML={{ __html: withCode }}></p>
        );
      })}
    </div>
  );
}
