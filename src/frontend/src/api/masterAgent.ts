/**
 * Master Agent API Client
 * Handles communication with the integrated MasterAgent backend
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Response from submitting a query
 */
interface SubmitQueryResponse {
  success: true;
  task_id: string;
  status: 'processing';
  message: string;
  userId: string;
}

/**
 * Result type for completed tasks
 */
type ResultType = 'direct_response' | 'clarifying_question' | 'agent_result';

/**
 * Task result with dual output format
 */
interface TaskResult {
  type: ResultType;
  glassesDisplay: string;    // Short text for AR glasses (max ~100 chars)
  webviewContent: string;    // Full markdown content for web display
  synthesis?: string;        // Full synthesis (for backward compatibility)
  tools_used?: string[];     // Tools used during processing
  tool_results?: Record<string, unknown>; // Results from tool calls
  agentId?: string;          // Present if a terminal agent was spawned
  agentResult?: {            // Raw agent output (if agent was spawned)
    agentId: string;
    status: string;
    result?: string;
    error?: string;
    executionTimeMs: number;
  };
  timestamp?: string;
}

/**
 * Task response from polling endpoint
 */
interface TaskResponse {
  taskId: string;
  query: string;
  status: 'processing' | 'completed' | 'failed';
  result?: TaskResult;
  error?: string;
  processingTimeMs?: number;
  agentSpawned?: boolean;
  createdAt: string;
  completedAt?: string;
  userId: string;
}

/**
 * Error response from API
 */
interface MasterAgentError {
  error: string;
  code: string;
  message?: string;
}

// =============================================================================
// Configuration
// =============================================================================

// API base URL - works for both dev (5173) and production (3000)
const API_BASE_URL = import.meta.env.DEV
  ? 'http://localhost:3000'  // In dev mode (5173), point to backend
  : '';  // In production, use relative paths

// =============================================================================
// API Functions
// =============================================================================

/**
 * Submit a query to Master Agent
 * Returns immediately with a task ID (non-blocking)
 */
export async function submitQuery(
  userId: string,
  query: string
): Promise<SubmitQueryResponse> {
  const response = await fetch(`${API_BASE_URL}/api/master-agent/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, query })
  });

  const data = await response.json();

  if (!response.ok) {
    const error = data as MasterAgentError;
    throw new Error(error.message || error.error);
  }

  return data as SubmitQueryResponse;
}

/**
 * Get task status and results
 */
export async function getTaskStatus(
  taskId: string,
  userId: string
): Promise<TaskResponse> {
  const response = await fetch(
    `${API_BASE_URL}/api/master-agent/task/${taskId}?userId=${userId}`
  );

  const data = await response.json();

  if (!response.ok) {
    const error = data as MasterAgentError;
    throw new Error(error.message || error.error);
  }

  return data as TaskResponse;
}

/**
 * Poll for task completion
 * Polls every 2 seconds until task is completed or failed
 */
export async function pollTaskUntilComplete(
  taskId: string,
  userId: string,
  onProgress?: (message: string, taskResponse?: TaskResponse) => void,
  maxAttempts: number = 150 // 5 minutes max (at 2s intervals)
): Promise<TaskResponse> {
  let attempts = 0;
  const progressMessages = [
    'Analyzing your request...',
    'Exploring the codebase...',
    'Deploying specialist agents...',
    'Executing sub-agents...',
    'Gathering results...',
    'Synthesizing findings...',
    'Finalizing response...'
  ];

  while (attempts < maxAttempts) {
    const taskResponse = await getTaskStatus(taskId, userId);

    if (taskResponse.status === 'completed' || taskResponse.status === 'failed') {
      return taskResponse;
    }

    // Call progress callback with contextual message
    if (onProgress) {
      const messageIndex = Math.min(Math.floor(attempts / 3), progressMessages.length - 1);
      onProgress(progressMessages[messageIndex], taskResponse);
    }

    // Wait 2 seconds before next poll
    await new Promise(resolve => setTimeout(resolve, 2000));
    attempts++;
  }

  throw new Error('Task polling timeout - task did not complete in time');
}

/**
 * Submit an agent status query
 * Returns immediately with a task ID
 */
export async function submitAgentStatusQuery(
  userId: string,
  query: string
): Promise<SubmitQueryResponse> {
  const response = await fetch(`${API_BASE_URL}/api/master-agent/agent-status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, query })
  });

  const data = await response.json();

  if (!response.ok) {
    const error = data as MasterAgentError;
    throw new Error(error.message || error.error);
  }

  return data as SubmitQueryResponse;
}

/**
 * Combined function: Submit agent status query and wait for result
 */
export async function queryAgentStatus(
  userId: string,
  query: string,
  onProgress?: (message: string, taskResponse?: TaskResponse) => void
): Promise<TaskResponse> {
  // Step 1: Submit status query
  if (onProgress) onProgress('Querying agent status...');
  const submitResponse = await submitAgentStatusQuery(userId, query);

  // Step 2: Poll for completion
  if (onProgress) onProgress('Analyzing agent data...');
  const result = await pollTaskUntilComplete(
    submitResponse.task_id,
    userId,
    (message, taskResponse) => {
      if (onProgress) {
        onProgress(message, taskResponse);
      }
    }
  );

  return result;
}

/**
 * Combined function: Submit query and wait for result
 */
export async function queryMasterAgent(
  userId: string,
  query: string,
  onProgress?: (message: string, taskResponse?: TaskResponse) => void
): Promise<TaskResponse> {
  // Step 1: Submit query
  if (onProgress) onProgress('Submitting query to Master Agent...');
  const submitResponse = await submitQuery(userId, query);

  // Step 2: Poll for completion
  if (onProgress) onProgress('Agent session started...');
  const result = await pollTaskUntilComplete(
    submitResponse.task_id,
    userId,
    (message, taskResponse) => {
      if (onProgress) {
        onProgress(message, taskResponse);
      }
    }
  );

  return result;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get the display content based on context
 * @param result - The task result
 * @param forGlasses - If true, returns short glassesDisplay; otherwise webviewContent
 */
export function getDisplayContent(result: TaskResult, forGlasses: boolean = false): string {
  if (forGlasses) {
    return result.glassesDisplay || result.webviewContent || result.synthesis || 'No content';
  }
  return result.webviewContent || result.synthesis || result.glassesDisplay || 'No content';
}

/**
 * Check if the result requires user follow-up (clarifying question)
 */
export function isAskingForClarification(result: TaskResult): boolean {
  return result.type === 'clarifying_question';
}

/**
 * Check if an agent was spawned for this task
 */
export function wasAgentSpawned(result: TaskResult): boolean {
  return result.type === 'agent_result' && !!result.agentId;
}

// =============================================================================
// Type Exports
// =============================================================================

export type {
  SubmitQueryResponse,
  TaskResponse,
  TaskResult,
  ResultType,
  MasterAgentError
};
