/**
 * MasterAgent Module
 * The intelligent orchestrator for processing user queries
 *
 * Features:
 * - Decision flow: direct_response / clarifying_question / spawn_agent
 * - Tool use for querying user context (sandboxed by userId)
 * - Conversation history integration
 * - Dual output: glassesDisplay (AR) + webviewContent (web)
 * - Models: Haiku 4.5 (fast) + Sonnet 4.5 (smart)
 */

// Main MasterAgent class
export {
  MasterAgent,
  getMasterAgent,
  createMasterAgent,
  clearMasterAgentCache,
} from "./MasterAgent";

// Tools
export {
  MasterAgentTools,
  createMasterAgentTools,
  TOOL_DEFINITIONS,
} from "./MasterAgentTools";

// Types
export type {
  MasterAgentDecision,
  Task,
  TaskResult,
  TaskStatus,
  ResultType,
  DecisionType,
  QueryRequest,
  QueryResponse,
  TaskResponse,
  SpawnAgentRequest,
  AgentExecutionResult,
  ToolDefinition,
  ToolCall,
  ToolResult,
  MasterAgentEvent,
  MasterAgentEventCallback,
  ModelType,
} from "./types";

// Models configuration
export { MODELS } from "./types";
