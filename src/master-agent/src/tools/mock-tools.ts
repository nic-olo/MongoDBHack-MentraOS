/**
 * Mock Tools - Simulate tool execution
 * In production, these would be real implementations
 */
import type { ToolResult } from '../types.js';

/**
 * Simulate async work
 */
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Mock tool: Search for files in codebase
 */
export async function fileSearch(params: { query: string }): Promise<ToolResult> {
  await sleep(1000);
  
  return {
    tool: 'file_search',
    query: params.query,
    results: [
      'mobile/src/components/NotificationFilter.tsx',
      'mobile/src/hooks/useNotificationFilter.ts',
      'mobile/src/utils/filterUtils.ts'
    ],
    count: 3
  };
}

/**
 * Mock tool: Read code from a file
 */
export async function codeRead(params: { file_path: string }): Promise<ToolResult> {
  await sleep(500);
  
  return {
    tool: 'code_read',
    file: params.file_path,
    content: `
// Mock content of ${params.file_path}
export function NotificationFilter() {
  const [filter, setFilter] = useState("");
  // Current implementation uses simple string matching
  return <div>Filter component</div>;
}
`
  };
}

/**
 * Mock tool: Analyze code structure
 */
export async function codeAnalyze(params: { files: string[] }): Promise<ToolResult> {
  await sleep(2000);
  
  return {
    tool: 'code_analyze',
    files: params.files,
    analysis: {
      architecture: 'React hooks pattern',
      dependencies: ['useState', 'useMemo'],
      complexity: 'medium',
      extension_points: ['filter logic', 'UI component']
    }
  };
}

/**
 * Mock tool: Run tests
 */
export async function testRun(params: { test_path: string }): Promise<ToolResult> {
  await sleep(1500);
  
  return {
    tool: 'test_run',
    path: params.test_path,
    results: {
      passed: 12,
      failed: 0,
      duration: '1.2s'
    }
  };
}

/**
 * Tool registry
 */
export const TOOLS = {
  file_search: fileSearch,
  code_read: codeRead,
  code_analyze: codeAnalyze,
  test_run: testRun
};

export type ToolName = keyof typeof TOOLS;
