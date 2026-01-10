interface SubmitQueryResponse {
  success: true;
  task_id: string;
  status: 'processing';
  message: string;
  userId: string;
}

interface TaskResponse {
  id: string;
  query: string;
  status: 'processing' | 'completed' | 'failed';
  result?: {
    query: string;
    tools_used: string[];
    tool_results: Record<string, any>;
    synthesis: string;
    timestamp: string;
  };
  error?: string;
  created_at: string;
  completed_at?: string;
  userId: string;
}

interface MasterAgentError {
  error: string;
  code: string;
  message?: string;
}

// API base URL - works for both dev (5173) and production (3000)
const API_BASE_URL = import.meta.env.DEV
  ? 'http://localhost:3000'  // In dev mode (5173), point to backend
  : '';  // In production, use relative paths

/**
 * Submit a query to Master Agent
 * Returns immediately with a task ID
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
  onProgress?: (message: string, taskResponse: TaskResponse) => void,
  maxAttempts: number = 60 // 2 minutes max
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
