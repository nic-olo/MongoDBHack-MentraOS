/**
 * MasterAgent Types
 * Type definitions for the MasterAgent orchestration system
 */

import type { ObjectId } from "mongodb";

// =============================================================================
// Model Configuration
// =============================================================================

/**
 * Available Claude models
 */
export const MODELS = {
  // Fast model - for decisions, simple responses, tool calls
  fast: "claude-haiku-4-5-20251001",

  // Smart model - for goal formulation, synthesis
  smart: "claude-sonnet-4-5-20250929",
} as const;

export type ModelType = keyof typeof MODELS;

// =============================================================================
// Decision Types
// =============================================================================

/**
 * Types of decisions the MasterAgent can make
 */
export type DecisionType =
  | "direct_response"
  | "clarifying_question"
  | "spawn_agent";

/**
 * Result of MasterAgent's decision process
 */
export interface MasterAgentDecision {
  type: DecisionType;

  // For direct_response and clarifying_question
  glassesDisplay?: string;
  webviewContent?: string;

  // For spawn_agent
  goal?: string;
  workingDirectory?: string;

  // Reasoning (for debugging)
  reasoning?: string;
}

// =============================================================================
// Task Types
// =============================================================================

/**
 * Status of a task
 */
export type TaskStatus = "processing" | "completed" | "failed";

/**
 * Result type for completed tasks
 */
export type ResultType = "direct_response" | "clarifying_question" | "agent_result";

/**
 * Task result structure
 */
export interface TaskResult {
  type: ResultType;
  glassesDisplay: string;
  webviewContent: string;

  // Only for agent_result type
  agentId?: string;
  agentResult?: any;
}

/**
 * A task document stored in MongoDB
 */
export interface Task {
  _id?: ObjectId;
  taskId: string;
  userId: string;
  conversationId: string;

  // Input
  query: string;

  // Status
  status: TaskStatus;

  // Result (when completed)
  result?: TaskResult;

  // Error (if failed)
  error?: string;

  // Metrics
  processingTimeMs?: number;
  agentSpawned: boolean;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

// =============================================================================
// Tool Types
// =============================================================================

/**
 * Tool definitions for MasterAgent
 */
export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, any>;
    required?: string[];
  };
}

/**
 * Tool call from Claude
 */
export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, any>;
}

/**
 * Tool result to send back to Claude
 */
export interface ToolResult {
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

// =============================================================================
// Agent Types
// =============================================================================

/**
 * Options for spawning a terminal agent
 */
export interface SpawnAgentRequest {
  goal: string;
  workingDirectory?: string;
  timeout?: number;
}

/**
 * Result from a terminal agent
 */
export interface AgentExecutionResult {
  agentId: string;
  status: "completed" | "failed" | "cancelled";
  result?: string;
  error?: string;
  executionTimeMs: number;
}

// =============================================================================
// API Types
// =============================================================================

/**
 * Request body for POST /api/master-agent/query
 */
export interface QueryRequest {
  userId: string;
  query: string;
  workingDirectory?: string;
}

/**
 * Response for POST /api/master-agent/query
 */
export interface QueryResponse {
  success: boolean;
  taskId: string;
  status: TaskStatus;
  message: string;
  userId: string;
}

/**
 * Response for GET /api/master-agent/task/:taskId
 */
export interface TaskResponse {
  taskId: string;
  query: string;
  status: TaskStatus;
  result?: TaskResult;
  error?: string;
  processingTimeMs?: number;
  agentSpawned?: boolean;
  createdAt: Date;
  completedAt?: Date;
  userId: string;
}

// =============================================================================
// Event Types
// =============================================================================

/**
 * Events emitted by MasterAgent
 */
export type MasterAgentEvent =
  | { type: "decision"; taskId: string; decision: DecisionType }
  | { type: "agent_spawned"; taskId: string; agentId: string }
  | { type: "agent_completed"; taskId: string; agentId: string; result: any }
  | { type: "task_completed"; taskId: string; result: TaskResult }
  | { type: "task_failed"; taskId: string; error: string };

/**
 * Event callback type
 */
export type MasterAgentEventCallback = (event: MasterAgentEvent) => void;
