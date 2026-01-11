import { useState } from 'react';
import { motion } from 'framer-motion';
import Prism from 'prismjs';
import 'prismjs/themes/prism-tomorrow.css';

// Import common language support
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-tsx';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-java';
import 'prismjs/components/prism-go';
import 'prismjs/components/prism-rust';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-yaml';
import 'prismjs/components/prism-markdown';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-css';

interface CodeBlockProps {
  code: string;
  language: string;
  filePath?: string;
  showLineNumbers?: boolean;
}

export default function CodeBlock({ 
  code, 
  language, 
  filePath,
  showLineNumbers = false 
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  // Compute highlighted code directly without state
  const highlightedCode = (() => {
    try {
      // Map common language aliases
      const langMap: Record<string, string> = {
        'ts': 'typescript',
        'tsx': 'tsx',
        'js': 'javascript',
        'jsx': 'jsx',
        'py': 'python',
        'rs': 'rust',
        'sh': 'bash',
        'yml': 'yaml'
      };

      const prismLang = langMap[language.toLowerCase()] || language.toLowerCase();
      const grammar = Prism.languages[prismLang];

      if (grammar) {
        return Prism.highlight(code, grammar, prismLang);
      }
      return code;
    } catch (error) {
      console.error('Syntax highlighting error:', error);
      return code;
    }
  })();

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getLanguageDisplayName = (lang: string): string => {
    const displayNames: Record<string, string> = {
      'ts': 'TypeScript',
      'tsx': 'TypeScript React',
      'js': 'JavaScript',
      'jsx': 'JavaScript React',
      'py': 'Python',
      'rs': 'Rust',
      'go': 'Go',
      'java': 'Java',
      'cpp': 'C++',
      'c': 'C',
      'html': 'HTML',
      'css': 'CSS',
      'json': 'JSON',
      'yaml': 'YAML',
      'yml': 'YAML',
      'md': 'Markdown',
      'sh': 'Shell',
      'bash': 'Bash'
    };
    return displayNames[lang.toLowerCase()] || lang.toUpperCase();
  };

  const lines = code.split('\n');

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="rounded-2xl overflow-hidden"
      style={{ 
        backgroundColor: '#1e1e1e',
        boxShadow: 'var(--shadow-lg)'
      }}
    >
      {/* Code Header */}
      <div 
        className="flex items-center justify-between px-5 py-3"
        style={{ 
          backgroundColor: '#252526',
          borderBottom: '1px solid #3e3e42'
        }}
      >
        <div className="flex items-center gap-3">
          {filePath && (
            <>
              <span className="text-xs font-mono text-gray-400">{filePath}</span>
              <span className="text-gray-600">•</span>
            </>
          )}
          <span className="text-xs font-semibold text-gray-500">
            {getLanguageDisplayName(language)}
          </span>
        </div>
        
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={handleCopy}
          className="flex items-center gap-2 px-3 py-1.5 text-xs rounded-lg transition-smooth"
          style={{ 
            backgroundColor: copied ? '#10b981' : '#3e3e42',
            color: '#e5e5e5'
          }}
        >
          {copied ? (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              Copied!
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Copy
            </>
          )}
        </motion.button>
      </div>

      {/* Code Content */}
      <div className="overflow-x-auto">
        <div className="p-5">
          {showLineNumbers ? (
            <div className="flex">
              {/* Line Numbers */}
              <div 
                className="select-none pr-4 text-right font-mono text-xs"
                style={{ color: '#858585' }}
              >
                {lines.map((_, idx) => (
                  <div key={idx} style={{ lineHeight: '1.5' }}>
                    {idx + 1}
                  </div>
                ))}
              </div>
              
              {/* Code */}
              <pre className="flex-1 text-sm font-mono" style={{ margin: 0, lineHeight: '1.5' }}>
                <code 
                  className={`language-${language}`}
                  dangerouslySetInnerHTML={{ __html: highlightedCode }}
                />
              </pre>
            </div>
          ) : (
            <pre className="text-sm font-mono" style={{ margin: 0, lineHeight: '1.5' }}>
              <code 
                className={`language-${language}`}
                dangerouslySetInnerHTML={{ __html: highlightedCode }}
              />
            </pre>
          )}
        </div>
      </div>
    </motion.div>
  );
}
