/**
 * Daemon Manager Types
 * Shared type definitions for cloud-side daemon management
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
// Daemon State (tracked on cloud)
// ============================================================================

export interface DaemonState {
  daemonId: string;
  userId: string;
  name?: string;
  status: "online" | "offline";
  lastSeen: Date;
  activeAgents: number;
  agentIds: string[];
  connectedAt?: Date;
}

// ============================================================================
// SubAgent State (tracked on cloud)
// ============================================================================

export interface SubAgentState {
  agentId: string;
  daemonId: string;
  sessionId?: string; // master agent session
  type: AgentType;
  status: AgentStatus;
  goal: string;
  currentStep?: string;
  notes: string[];
  result?: string;
  error?: string;
  executionTimeMs?: number;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

// ============================================================================
// Event Types (for subscribers)
// ============================================================================

export interface DaemonConnectedEvent {
  type: "daemon:connected";
  daemonId: string;
  userId: string;
}

export interface DaemonDisconnectedEvent {
  type: "daemon:disconnected";
  daemonId: string;
  userId: string;
}

export interface AgentStartedEvent {
  type: "agent:started";
  agentId: string;
  daemonId: string;
}

export interface AgentStatusEvent {
  type: "agent:status";
  agentId: string;
  daemonId: string;
  status: AgentStatus;
  currentStep?: string;
}

export interface AgentCompletedEvent {
  type: "agent:completed";
  agentId: string;
  daemonId: string;
  result?: string;
  executionTimeMs: number;
}

export interface AgentFailedEvent {
  type: "agent:failed";
  agentId: string;
  daemonId: string;
  error: string;
  executionTimeMs: number;
}

export interface AgentLogEvent {
  type: "agent:log";
  agentId: string;
  daemonId: string;
  log: LogPayload;
}

export type DaemonEvent =
  | DaemonConnectedEvent
  | DaemonDisconnectedEvent
  | AgentStartedEvent
  | AgentStatusEvent
  | AgentCompletedEvent
  | AgentFailedEvent
  | AgentLogEvent;

// ============================================================================
// Spawn Options (for master agent)
// ============================================================================

export interface SpawnAgentOptions {
  agentType: AgentType;
  goal: string;
  workingDirectory?: string;
  autoApprove?: boolean;
  timeout?: number;
  streamOutput?: boolean;
  sessionId?: string; // associate with master agent session
}

// ============================================================================
// Callbacks for DaemonManager
// ============================================================================

export type EventCallback = (event: DaemonEvent) => void;
