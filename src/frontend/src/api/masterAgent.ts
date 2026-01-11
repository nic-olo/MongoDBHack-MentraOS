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
  agentId?: string;          // Present if a terminal agent was spawned
  agentResult?: {            // Raw agent output (if agent was spawned)
    agentId: string;
    status: string;
    result?: string;
    error?: string;
    executionTimeMs: number;
  };
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
  onProgress?: (status: string, resultType?: ResultType) => void,
  maxAttempts: number = 150 // 5 minutes max (at 2s intervals)
): Promise<TaskResponse> {
  let attempts = 0;

  while (attempts < maxAttempts) {
    const taskResponse = await getTaskStatus(taskId, userId);

    if (taskResponse.status === 'completed' || taskResponse.status === 'failed') {
      return taskResponse;
    }

    // Call progress callback
    if (onProgress) {
      onProgress(taskResponse.status);
    }

    // Wait 2 seconds before next poll
    await new Promise(resolve => setTimeout(resolve, 2000));
    attempts++;
  }

  throw new Error('Task polling timeout - task did not complete in time');
}

/**
 * Combined function: Submit query and wait for result
 */
export async function queryMasterAgent(
  userId: string,
  query: string,
  onProgress?: (message: string) => void
): Promise<TaskResponse> {
  // Step 1: Submit query
  if (onProgress) onProgress('Submitting query...');
  const submitResponse = await submitQuery(userId, query);

  // Step 2: Poll for completion
  if (onProgress) onProgress('Processing query...');
  const result = await pollTaskUntilComplete(
    submitResponse.task_id,
    userId,
    (status) => {
      if (onProgress) {
        onProgress(`Status: ${status}`);
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
    return result.glassesDisplay || result.webviewContent || 'No content';
  }
  return result.webviewContent || result.glassesDisplay || 'No content';
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
