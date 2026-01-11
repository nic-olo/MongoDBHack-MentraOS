/**
 * MasterAgentTools
 * Sandboxed tools that MasterAgent can use to query context about the user's session
 *
 * SECURITY: All tools are sandboxed to the authenticated user.
 * The userId is injected server-side at construction and cannot be overridden by Claude.
 * This prevents prompt injection attacks from accessing other users' data.
 */

import { getDb, isConnected } from "../db/mongo";
import { getDaemonManager } from "../daemon/DaemonManager";
import { getConversationService } from "../conversation";
import type { ToolDefinition } from "./types";

/**
 * Tool definitions for Claude
 * These define what tools are available and their parameters
 */
export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "get_recent_tasks",
    description:
      "Get the user's recent tasks/queries and their results. Use this to check what the user has asked before or to see the status of previous requests.",
    input_schema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Maximum number of tasks to return (default 5, max 20)",
        },
        status: {
          type: "string",
          enum: ["processing", "completed", "failed"],
          description: "Filter by task status (optional)",
        },
      },
    },
  },
  {
    name: "get_running_agents",
    description:
      "Get currently running terminal agents for this user. Use this to check if there are active agents working on tasks.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_agent_status",
    description:
      "Get detailed status of a specific agent by ID. Use this to check on a particular agent's progress or result.",
    input_schema: {
      type: "object",
      properties: {
        agentId: {
          type: "string",
          description: "The agent ID to check",
        },
      },
      required: ["agentId"],
    },
  },
  {
    name: "get_daemon_status",
    description:
      "Check if the user's desktop daemon is online and available. Use this before spawning agents to verify the daemon is connected.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_conversation_summary",
    description:
      "Get a summary of the current conversation context. Use this to understand what has been discussed recently.",
    input_schema: {
      type: "object",
      properties: {
        turns: {
          type: "number",
          description: "Number of recent turns to summarize (default 10)",
        },
      },
    },
  },
];

/**
 * MasterAgentTools - Sandboxed tools for querying user context
 *
 * All methods are automatically scoped to the userId provided at construction.
 * Claude cannot override the userId - it's injected server-side.
 */
export class MasterAgentTools {
  private userId: string;
  private conversationId: string | null;

  /**
   * Create a new MasterAgentTools instance
   * @param userId - The authenticated user's ID (email). This is immutable and scopes all queries.
   * @param conversationId - Optional conversation ID for conversation-related tools
   */
  constructor(userId: string, conversationId: string | null = null) {
    this.userId = userId;
    this.conversationId = conversationId;
  }

  /**
   * Execute a tool by name
   * This is the main entry point called when Claude wants to use a tool
   */
  async executeTool(name: string, input: Record<string, any>): Promise<any> {
    switch (name) {
      case "get_recent_tasks":
        return this.getRecentTasks(input);
      case "get_running_agents":
        return this.getRunningAgents();
      case "get_agent_status":
        return this.getAgentStatus(input as { agentId: string });
      case "get_daemon_status":
        return this.getDaemonStatus();
      case "get_conversation_summary":
        return this.getConversationSummary(input);
      default:
        return { error: `Unknown tool: ${name}` };
    }
  }

  /**
   * Get recent tasks for the user
   * Always filtered by this.userId - cannot be overridden
   */
  async getRecentTasks(input: {
    limit?: number;
    status?: "processing" | "completed" | "failed";
  }): Promise<any> {
    if (!isConnected()) {
      return { error: "Database not connected", tasks: [] };
    }

    try {
      const db = getDb();
      const limit = Math.min(input.limit || 5, 20); // Cap at 20

      const query: any = { userId: this.userId }; // ALWAYS filtered by userId
      if (input.status) {
        query.status = input.status;
      }

      const tasks = await db
        .collection("tasks")
        .find(query)
        .sort({ createdAt: -1 })
        .limit(limit)
        .project({
          taskId: 1,
          query: 1,
          status: 1,
          result: 1,
          error: 1,
          processingTimeMs: 1,
          agentSpawned: 1,
          createdAt: 1,
          completedAt: 1,
        })
        .toArray();

      return {
        count: tasks.length,
        tasks: tasks.map((t) => ({
          taskId: t.taskId,
          query: t.query,
          status: t.status,
          resultType: t.result?.type,
          resultPreview:
            t.result?.glassesDisplay || t.error || "In progress...",
          agentSpawned: t.agentSpawned,
          createdAt: t.createdAt,
          completedAt: t.completedAt,
        })),
      };
    } catch (error) {
      console.error("[MasterAgentTools] Error getting recent tasks:", error);
      return { error: "Failed to get recent tasks", tasks: [] };
    }
  }

  /**
   * Get running agents for the user
   * Always filtered by this.userId - cannot be overridden
   */
  async getRunningAgents(): Promise<any> {
    if (!isConnected()) {
      return { error: "Database not connected", agents: [] };
    }

    try {
      const db = getDb();

      const agents = await db
        .collection("subagents")
        .find({
          userId: this.userId, // ALWAYS filtered by userId
          status: { $in: ["pending", "initializing", "running"] },
        })
        .sort({ createdAt: -1 })
        .project({
          agentId: 1,
          type: 1,
          status: 1,
          goal: 1,
          currentStep: 1,
          createdAt: 1,
        })
        .toArray();

      return {
        count: agents.length,
        agents: agents.map((a) => ({
          agentId: a.agentId,
          type: a.type,
          status: a.status,
          goal: a.goal.length > 100 ? a.goal.substring(0, 100) + "..." : a.goal,
          currentStep: a.currentStep,
          createdAt: a.createdAt,
        })),
      };
    } catch (error) {
      console.error("[MasterAgentTools] Error getting running agents:", error);
      return { error: "Failed to get running agents", agents: [] };
    }
  }

  /**
   * Get status of a specific agent
   * Validates that the agent belongs to this user
   */
  async getAgentStatus(input: { agentId: string }): Promise<any> {
    if (!input.agentId) {
      return { error: "agentId is required" };
    }

    if (!isConnected()) {
      return { error: "Database not connected" };
    }

    try {
      const db = getDb();

      const agent = await db.collection("subagents").findOne({
        agentId: input.agentId,
        userId: this.userId, // ALWAYS filtered by userId - security check
      });

      if (!agent) {
        return {
          error: "Agent not found or does not belong to this user",
          agentId: input.agentId,
        };
      }

      return {
        agentId: agent.agentId,
        type: agent.type,
        status: agent.status,
        goal: agent.goal,
        currentStep: agent.currentStep,
        notes: agent.notes?.slice(-5), // Last 5 notes
        result: agent.result,
        error: agent.error,
        executionTimeMs: agent.executionTimeMs,
        createdAt: agent.createdAt,
        completedAt: agent.completedAt,
      };
    } catch (error) {
      console.error("[MasterAgentTools] Error getting agent status:", error);
      return { error: "Failed to get agent status" };
    }
  }

  /**
   * Check if the user's daemon is online
   */
  getDaemonStatus(): any {
    try {
      const daemonManager = getDaemonManager();
      const daemon = daemonManager.getOnlineDaemonForUser(this.userId);

      if (!daemon) {
        return {
          online: false,
          message:
            "No daemon is currently connected for this user. The user needs to run the daemon on their machine.",
          hint: "Start the daemon with: bun run daemon",
        };
      }

      return {
        online: true,
        daemonId: daemon.daemonId,
        status: daemon.status,
        activeAgents: daemon.activeAgents,
        lastSeen: daemon.lastSeen,
        message: "Daemon is online and ready to accept agent tasks.",
      };
    } catch (error) {
      console.error("[MasterAgentTools] Error getting daemon status:", error);
      return { error: "Failed to get daemon status", online: false };
    }
  }

  /**
   * Get conversation summary
   */
  async getConversationSummary(input: { turns?: number }): Promise<any> {
    if (!this.conversationId) {
      return {
        summary: "No active conversation.",
        turns: 0,
      };
    }

    try {
      const conversationService = getConversationService();
      const conversation = await conversationService.getConversation(
        this.conversationId,
      );

      if (!conversation) {
        return {
          summary: "Conversation not found.",
          turns: 0,
        };
      }

      const maxTurns = Math.min(input.turns || 10, 20);
      const summary = conversationService.getConversationSummary(
        conversation,
        maxTurns,
      );

      return {
        conversationId: this.conversationId,
        totalTurns: conversation.turns.length,
        summary,
        lastActiveAt: conversation.lastActiveAt,
      };
    } catch (error) {
      console.error(
        "[MasterAgentTools] Error getting conversation summary:",
        error,
      );
      return { error: "Failed to get conversation summary" };
    }
  }

  /**
   * Set the conversation ID (for when it's created after tool construction)
   */
  setConversationId(conversationId: string): void {
    this.conversationId = conversationId;
  }
}

/**
 * Create a new MasterAgentTools instance
 */
export function createMasterAgentTools(
  userId: string,
  conversationId?: string,
): MasterAgentTools {
  return new MasterAgentTools(userId, conversationId || null);
}
