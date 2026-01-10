/**
 * Desktop Daemon Types
 * Shared type definitions for daemon <-> cloud communication
 */

// ============================================================================
// Agent Types
// ============================================================================

export type AgentType = "terminal" | "coding";

export type AgentStatus =
  | "pending"
  | "initializing"
  | "running"
  | "needs_approval"
  | "completed"
  | "failed"
  | "cancelled";

// ============================================================================
// WebSocket Messages (Cloud -> Daemon)
// ============================================================================

export interface SpawnAgentCommand {
  type: "spawn_agent";
  agentId: string;
  agentType: AgentType;
  goal: string;
  workingDirectory?: string;
  options?: {
    autoApprove?: boolean;
    timeout?: number; // ms
    streamOutput?: boolean;
  };
}

export interface KillAgentCommand {
  type: "kill_agent";
  agentId: string;
}

export interface PingCommand {
  type: "ping";
}

export type CloudCommand = SpawnAgentCommand | KillAgentCommand | PingCommand;

// ============================================================================
// WebSocket Messages (Daemon -> Cloud)
// ============================================================================

export interface PongMessage {
  type: "pong";
}

export interface AgentAckMessage {
  type: "agent_ack";
  agentId: string;
  status: "started" | "error";
  error?: string;
}

export type DaemonMessage = PongMessage | AgentAckMessage;

// ============================================================================
// REST Payloads (Daemon -> Cloud)
// ============================================================================

export interface HeartbeatPayload {
  activeAgents: number;
  agentIds: string[];
  timestamp: number;
}

export interface StatusUpdatePayload {
  status: AgentStatus;
  currentStep?: string;
  notes?: string[];
  timestamp: number;
}

export interface CompletePayload {
  status: "completed" | "failed";
  result?: string;
  error?: string;
  executionTimeMs: number;
  timestamp: number;
}

export interface LogPayload {
  type: "stdout" | "stderr" | "status" | "note";
  content: string;
  timestamp: number;
}

// ============================================================================
// LLM Observer Types
// ============================================================================

export type TerminalState =
  | "initializing"      // Claude CLI is starting up
  | "ready"             // Claude is waiting for input (haven't sent goal yet)
  | "working"           // Claude is actively working
  | "needs_approval"    // Claude is asking permission (y/n)
  | "completed"         // Claude finished, back to idle prompt
  | "error";            // Something went wrong

export interface TerminalObservation {
  state: TerminalState;
  confidence: number;
  action: "wait" | "send_approval" | "send_rejection" | "report_complete" | "report_error";
  summary?: string;
  error?: string;
}

// ============================================================================
// Daemon Config
// ============================================================================

export interface DaemonConfig {
  token: string;
  serverUrl: string;
  name?: string;
}

// ============================================================================
// Agent Result (returned when agent completes)
// ============================================================================

export interface AgentResult {
  agentId: string;
  agentType: AgentType;
  goal: string;
  status: "completed" | "failed";
  result?: string;
  error?: string;
  executionTimeMs: number;
  logs?: string[];
}
