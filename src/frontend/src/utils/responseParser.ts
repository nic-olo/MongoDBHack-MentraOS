/**
 * Smart AI Response Parser
 * Detects code blocks, file paths, and response types
 */

export interface CodeBlock {
  language: string;
  code: string;
  filePath?: string;
  startLine?: number;
  endLine?: number;
}

export interface ParsedResponse {
  type: 'code' | 'text' | 'mixed';
  text: string;
  codeBlocks: CodeBlock[];
  files: string[];
  hasCode: boolean;
}

/**
 * Parse AI response to detect code blocks and file paths
 */
export function parseAgentResponse(response: string): ParsedResponse {
  const codeBlocks: CodeBlock[] = [];
  const files = new Set<string>();

  // Regex patterns
  const codeBlockRegex = /```(\w+)?\s*\n([\s\S]*?)```/g;
  const filePathRegex = /(?:^|\s)([a-zA-Z0-9_\-./]+\.(ts|tsx|js|jsx|json|css|html|py|java|go|rs|cpp|c|h|yaml|yml|md|txt))(?:\s|$|:)/gi;
  const fileEditRegex = /(?:edited|modified|updated|created|added|wrote to|changed)\s+(?:file\s+)?[`"]?([a-zA-Z0-9_\-./]+\.[a-zA-Z]+)[`"]?/gi;

  // Extract code blocks
  let match;
  while ((match = codeBlockRegex.exec(response)) !== null) {
    const language = match[1] || 'text';
    const code = match[2].trim();

    // Try to extract file path from context (lines before code block)
    const beforeCode = response.substring(Math.max(0, match.index - 200), match.index);
    const fileMatch = beforeCode.match(/(?:in|from|file:?|path:?)\s+[`"]?([a-zA-Z0-9_\-./]+\.[a-zA-Z]+)[`"]?/i);
    const filePath = fileMatch ? fileMatch[1] : undefined;

    if (filePath) {
      files.add(filePath);
    }

    codeBlocks.push({
      language,
      code,
      filePath
    });
  }

  // Extract file paths mentioned in text
  const textWithoutCode = response.replace(/```[\s\S]*?```/g, '');

  while ((match = filePathRegex.exec(textWithoutCode)) !== null) {
    if (match[1]) {
      files.add(match[1]);
    }
  }

  // Extract file paths from edit descriptions
  while ((match = fileEditRegex.exec(textWithoutCode)) !== null) {
    if (match[1]) {
      files.add(match[1]);
    }
  }

  // Determine response type
  let type: 'code' | 'text' | 'mixed' = 'text';
  if (codeBlocks.length > 0) {
    const codeLength = codeBlocks.reduce((sum, block) => sum + block.code.length, 0);
    const textLength = textWithoutCode.length;

    if (codeLength > textLength * 0.5) {
      type = 'code';
    } else {
      type = 'mixed';
    }
  }

  return {
    type,
    text: response,
    codeBlocks,
    files: Array.from(files),
    hasCode: codeBlocks.length > 0
  };
}

/**
 * Extract summary from agent response (first paragraph or heading)
 */
export function extractSummary(response: string, maxLength: number = 150): string {
  // Remove code blocks
  const textOnly = response.replace(/```[\s\S]*?```/g, '');

  // Get first paragraph or heading
  const lines = textOnly.split('\n').filter(line => line.trim());
  if (lines.length === 0) return 'Response generated';

  let summary = lines[0].replace(/^#+\s*/, '').trim();

  if (summary.length > maxLength) {
    summary = summary.substring(0, maxLength) + '...';
  }

  return summary || 'Response generated';
}

/**
 * Format code with syntax highlighting classes (basic)
 */
export function getLanguageDisplayName(language: string): string {
  const languageMap: Record<string, string> = {
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

  return languageMap[language.toLowerCase()] || language.toUpperCase();
}
