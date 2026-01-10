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
      <div className="space-y-4">
        <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-6 border border-gray-200 shadow-sm">
          {/* Header */}
          <div className="flex items-center gap-3 mb-4">
            <div className="relative">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
              </div>
              <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-white animate-pulse" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-800">Running async session</h3>
              <p className="text-sm text-gray-500">{progressMessage || 'AI is working on your request...'}</p>
            </div>
          </div>

          {/* Animated Progress Bar */}
          <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
            <div className="h-full bg-gradient-to-r from-blue-500 to-purple-600 rounded-full animate-pulse" style={{ width: '60%' }}></div>
          </div>

          {/* Info Box */}
          <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              <div className="flex-1">
                <h4 className="text-sm font-semibold text-blue-900 mb-1">Processing your request</h4>
                <p className="text-xs text-blue-700 leading-relaxed">
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
    <div className="space-y-4">
      {/* Text Response */}
      {parsed.type !== 'code' && (
        <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
          <div className="prose prose-sm max-w-none">
            <ReactMarkdown content={parsed.text} />
          </div>
        </div>
      )}

      {/* Files Modified Section */}
      {parsed.files.length > 0 && (
        <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-4 border border-green-200">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-green-500 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div className="flex-1">
              <h4 className="text-sm font-semibold text-green-900 mb-2">Files modified</h4>
              <div className="space-y-1">
                {parsed.files.map((file, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-xs text-green-800 font-mono bg-white px-3 py-1.5 rounded-lg border border-green-200">
                    <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {file}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Code Blocks */}
      {parsed.codeBlocks.map((block, idx) => (
        <div key={idx} className="bg-gray-900 rounded-xl overflow-hidden shadow-lg">
          {/* Code Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-gray-800 border-b border-gray-700">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                <div className="w-3 h-3 rounded-full bg-green-500"></div>
              </div>
              <div className="flex items-center gap-2">
                {block.filePath && (
                  <>
                    <span className="text-xs text-gray-400 font-mono">{block.filePath}</span>
                    <span className="text-gray-600">•</span>
                  </>
                )}
                <span className="text-xs text-gray-400 font-semibold">{getLanguageDisplayName(block.language)}</span>
              </div>
            </div>
            <button
              onClick={() => handleCopy(block.code, idx)}
              className="flex items-center gap-2 px-3 py-1.5 text-xs text-gray-300 hover:text-white bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
            >
              {copiedIndex === idx ? (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Copied!
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Copy
                </>
              )}
            </button>
          </div>

          {/* Code Content */}
          <div className="p-4 overflow-x-auto">
            <pre className="text-sm font-mono text-gray-100">
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
    <div className="space-y-3">
      {lines.map((line, idx) => {
        // Headings
        if (line.startsWith('### ')) {
          return <h3 key={idx} className="text-lg font-semibold text-gray-800 mt-4">{line.substring(4)}</h3>;
        }
        if (line.startsWith('## ')) {
          return <h2 key={idx} className="text-xl font-semibold text-gray-800 mt-4">{line.substring(3)}</h2>;
        }
        if (line.startsWith('# ')) {
          return <h1 key={idx} className="text-2xl font-bold text-gray-800 mt-4">{line.substring(2)}</h1>;
        }

        // Lists
        if (line.match(/^[\*\-]\s/)) {
          return (
            <li key={idx} className="text-gray-700 ml-4">
              {line.substring(2)}
            </li>
          );
        }

        // Bold
        const boldText = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

        // Inline code
        const withCode = boldText.replace(/`([^`]+)`/g, '<code class="px-1.5 py-0.5 bg-gray-100 text-gray-800 rounded text-sm font-mono">$1</code>');

        // Empty line
        if (line.trim() === '') {
          return <div key={idx} className="h-2"></div>;
        }

        return (
          <p key={idx} className="text-gray-700 leading-relaxed" dangerouslySetInnerHTML={{ __html: withCode }}></p>
        );
      })}
    </div>
  );
}
