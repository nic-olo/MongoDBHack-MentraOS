/**
 * Real Tools for Master Agent
 * These tools interact with actual MentraOS capabilities:
 * - Glasses SDK (display, audio, camera)
 * - Daemon system (terminal, file access)
 * - Database operations
 */

export interface ToolResult {
  tool: string;
  success: boolean;
  data?: any;
  error?: string;
  executionTime: number;
}

// =============================================================================
// GLASSES SDK TOOLS
// =============================================================================

/**
 * Display text on user's smart glasses
 */
export async function display_text(params: {
  userId: string;
  text: string;
  duration?: number;
}): Promise<ToolResult> {
  const startTime = Date.now();
  
  try {
    // In real implementation, this would call the server's session
    // For now, we'll call the API endpoint
    const response = await fetch('http://localhost:3000/api/speak', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: params.userId,
        text: params.text
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to display text: ${response.statusText}`);
    }

    return {
      tool: 'display_text',
      success: true,
      data: {
        text: params.text,
        userId: params.userId
      },
      executionTime: Date.now() - startTime
    };
  } catch (error: any) {
    return {
      tool: 'display_text',
      success: false,
      error: error.message,
      executionTime: Date.now() - startTime
    };
  }
}

/**
 * Speak text using TTS on smart glasses
 */
export async function speak_text(params: {
  userId: string;
  text: string;
}): Promise<ToolResult> {
  const startTime = Date.now();
  
  try {
    const response = await fetch('http://localhost:3000/api/speak', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: params.userId,
        text: params.text
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to speak: ${response.statusText}`);
    }

    return {
      tool: 'speak_text',
      success: true,
      data: {
        text: params.text,
        userId: params.userId
      },
      executionTime: Date.now() - startTime
    };
  } catch (error: any) {
    return {
      tool: 'speak_text',
      success: false,
      error: error.message,
      executionTime: Date.now() - startTime
    };
  }
}

/**
 * Play audio file on smart glasses
 */
export async function play_audio(params: {
  userId: string;
  audioUrl: string;
}): Promise<ToolResult> {
  const startTime = Date.now();
  
  try {
    const response = await fetch('http://localhost:3000/api/play-audio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: params.userId,
        audioUrl: params.audioUrl
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to play audio: ${response.statusText}`);
    }

    return {
      tool: 'play_audio',
      success: true,
      data: {
        audioUrl: params.audioUrl,
        userId: params.userId
      },
      executionTime: Date.now() - startTime
    };
  } catch (error: any) {
    return {
      tool: 'play_audio',
      success: false,
      error: error.message,
      executionTime: Date.now() - startTime
    };
  }
}

// =============================================================================
// DAEMON TOOLS (Local Computer Access)
// =============================================================================

/**
 * Spawn a terminal agent on user's computer
 */
export async function spawn_terminal_agent(params: {
  userId: string;
  goal: string;
  workingDirectory?: string;
  autoApprove?: boolean;
}): Promise<ToolResult> {
  const startTime = Date.now();
  
  try {
    const response = await fetch('http://localhost:3000/daemon-api/spawn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: params.userId, // Using email as userId
        agentType: 'terminal',
        goal: params.goal,
        workingDirectory: params.workingDirectory,
        options: {
          autoApprove: params.autoApprove ?? false
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to spawn agent: ${response.statusText}`);
    }

    const data = await response.json();

    return {
      tool: 'spawn_terminal_agent',
      success: true,
      data: {
        agentId: data.agentId,
        goal: params.goal,
        workingDirectory: params.workingDirectory
      },
      executionTime: Date.now() - startTime
    };
  } catch (error: any) {
    return {
      tool: 'spawn_terminal_agent',
      success: false,
      error: error.message,
      executionTime: Date.now() - startTime
    };
  }
}

/**
 * Get status of a daemon agent
 */
export async function get_agent_status(params: {
  agentId: string;
}): Promise<ToolResult> {
  const startTime = Date.now();
  
  try {
    const response = await fetch(`http://localhost:3000/daemon-api/agents/${params.agentId}`);

    if (!response.ok) {
      throw new Error(`Failed to get agent status: ${response.statusText}`);
    }

    const data = await response.json();

    return {
      tool: 'get_agent_status',
      success: true,
      data,
      executionTime: Date.now() - startTime
    };
  } catch (error: any) {
    return {
      tool: 'get_agent_status',
      success: false,
      error: error.message,
      executionTime: Date.now() - startTime
    };
  }
}

/**
 * Kill a daemon agent
 */
export async function kill_daemon_agent(params: {
  userId: string;
  agentId: string;
}): Promise<ToolResult> {
  const startTime = Date.now();
  
  try {
    const response = await fetch('http://localhost:3000/daemon-api/kill', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: params.userId,
        agentId: params.agentId
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to kill agent: ${response.statusText}`);
    }

    return {
      tool: 'kill_daemon_agent',
      success: true,
      data: {
        agentId: params.agentId
      },
      executionTime: Date.now() - startTime
    };
  } catch (error: any) {
    return {
      tool: 'kill_daemon_agent',
      success: false,
      error: error.message,
      executionTime: Date.now() - startTime
    };
  }
}

// =============================================================================
// FILE/DATABASE TOOLS
// =============================================================================

/**
 * Initialize user file in database
 */
export async function init_user_file(params: {
  userEmail: string;
}): Promise<ToolResult> {
  const startTime = Date.now();
  
  try {
    // This would call the actual DB manager
    // For now, returning mock success
    return {
      tool: 'init_user_file',
      success: true,
      data: {
        userEmail: params.userEmail,
        fileId: `file_${Date.now()}`
      },
      executionTime: Date.now() - startTime
    };
  } catch (error: any) {
    return {
      tool: 'init_user_file',
      success: false,
      error: error.message,
      executionTime: Date.now() - startTime
    };
  }
}

// =============================================================================
// TOOL REGISTRY
// =============================================================================

export const AVAILABLE_TOOLS = {
  // Glasses SDK
  display_text,
  speak_text,
  play_audio,
  
  // Daemon/Terminal
  spawn_terminal_agent,
  get_agent_status,
  kill_daemon_agent,
  
  // Database
  init_user_file,
} as const;

export type ToolName = keyof typeof AVAILABLE_TOOLS;

/**
 * Execute a tool by name
 */
export async function executeTool(
  toolName: ToolName,
  params: Record<string, any>
): Promise<ToolResult> {
  const tool = AVAILABLE_TOOLS[toolName];
  
  if (!tool) {
    return {
      tool: toolName,
      success: false,
      error: `Tool '${toolName}' not found`,
      executionTime: 0
    };
  }

  return await tool(params as any);
}

/**
 * Get tool descriptions for Claude to understand what tools are available
 */
export function getToolDescriptions(): string {
  return `
Available Tools:

=== GLASSES DISPLAY & AUDIO ===

1. display_text(userId, text, duration?)
   - Display text on user's smart glasses
   - Parameters: userId (string), text (string), duration (number, optional)
   - Use for: Showing information, status updates, messages

2. speak_text(userId, text)
   - Speak text using text-to-speech on smart glasses
   - Parameters: userId (string), text (string)
   - Use for: Verbal responses, notifications, conversations

3. play_audio(userId, audioUrl)
   - Play an audio file on smart glasses
   - Parameters: userId (string), audioUrl (string)
   - Use for: Playing sounds, music, audio notifications

=== LOCAL COMPUTER ACCESS (via Daemon) ===

4. spawn_terminal_agent(userId, goal, workingDirectory?, autoApprove?)
   - Spawn a terminal agent on user's computer to execute coding tasks
   - Parameters: 
     - userId (string)
     - goal (string) - what the agent should accomplish
     - workingDirectory (string, optional) - where to run
     - autoApprove (boolean, optional) - auto-approve actions
   - Use for: Running code, accessing files, executing commands
   - Returns: agentId for tracking

5. get_agent_status(agentId)
   - Check status of a running daemon agent
   - Parameters: agentId (string)
   - Use for: Monitoring agent progress, getting results

6. kill_daemon_agent(userId, agentId)
   - Terminate a running daemon agent
   - Parameters: userId (string), agentId (string)
   - Use for: Stopping agents that are done or misbehaving

=== DATABASE ===

7. init_user_file(userEmail)
   - Initialize a file record for a user in the database
   - Parameters: userEmail (string)
   - Use for: Setting up user data storage

=== TOOL SELECTION GUIDELINES ===

- For displaying info to user → use display_text or speak_text
- For running code/commands → use spawn_terminal_agent
- For file operations → use spawn_terminal_agent with appropriate goal
- For web searches → use spawn_terminal_agent to run curl/wget
- For data processing → spawn_terminal_agent with Python/Node scripts
- Always include userId in tool calls to target the right user
`;
}
