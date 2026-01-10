/**
 * Agent Pool
 * Manages multiple running agents on the daemon
 * Handles spawning, tracking, and cleanup of agents
 */

import { EventEmitter } from "events";
import { TerminalAgent, type TerminalAgentOptions } from "./terminal-agent";
import type {
  AgentType,
  AgentStatus,
  AgentResult,
  LogPayload,
  SpawnAgentCommand,
} from "./types";

interface ManagedAgent {
  id: string;
  type: AgentType;
  agent: TerminalAgent;
  status: AgentStatus;
  goal: string;
  startedAt: number;
  result?: AgentResult;
}

/**
 * AgentPool - Manages all running agents on this daemon
 */
export class AgentPool extends EventEmitter {
  private agents: Map<string, ManagedAgent> = new Map();
  private maxConcurrentAgents: number;

  constructor(maxConcurrentAgents: number = 5) {
    super();
    this.maxConcurrentAgents = maxConcurrentAgents;
  }

  /**
   * Spawn a new agent
   */
  async spawn(command: SpawnAgentCommand): Promise<{ success: boolean; error?: string }> {
    const { agentId, agentType, goal, workingDirectory, options } = command;

    // Check if agent already exists
    if (this.agents.has(agentId)) {
      return { success: false, error: `Agent ${agentId} already exists` };
    }

    // Check capacity
    if (this.getActiveCount() >= this.maxConcurrentAgents) {
      return {
        success: false,
        error: `Max concurrent agents (${this.maxConcurrentAgents}) reached`,
      };
    }

    // Currently only support terminal agents
    if (agentType !== "terminal" && agentType !== "coding") {
      return { success: false, error: `Unsupported agent type: ${agentType}` };
    }

    try {
      // Create the terminal agent
      const agentOptions: TerminalAgentOptions = {
        agentId,
        goal,
        workingDirectory,
        autoApprove: options?.autoApprove ?? true,
        timeout: options?.timeout ?? 5 * 60 * 1000,
        streamOutput: options?.streamOutput ?? true,
        onLog: (log) => this.handleLog(agentId, log),
        onStatusChange: (status, step) => this.handleStatusChange(agentId, status, step),
      };

      const agent = new TerminalAgent(agentOptions);

      // Register the agent
      const managed: ManagedAgent = {
        id: agentId,
        type: agentType,
        agent,
        status: "pending",
        goal,
        startedAt: Date.now(),
      };

      this.agents.set(agentId, managed);

      console.log(`[pool] Spawned agent ${agentId} (${agentType}): "${goal.slice(0, 50)}..."`);

      // Start the agent asynchronously
      this.runAgent(agentId, agent);

      return { success: true };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[pool] Failed to spawn agent ${agentId}:`, errorMsg);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Run an agent and handle completion
   */
  private async runAgent(agentId: string, agent: TerminalAgent): Promise<void> {
    try {
      const result = await agent.start();

      // Update managed agent with result
      const managed = this.agents.get(agentId);
      if (managed) {
        managed.status = result.status === "completed" ? "completed" : "failed";
        managed.result = result;
      }

      // Emit completion event
      this.emit("agent:complete", agentId, result);

      console.log(`[pool] Agent ${agentId} completed with status: ${result.status}`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      // Update status
      const managed = this.agents.get(agentId);
      if (managed) {
        managed.status = "failed";
        managed.result = {
          agentId,
          agentType: "terminal",
          goal: managed.goal,
          status: "failed",
          error: errorMsg,
          executionTimeMs: Date.now() - managed.startedAt,
        };
      }

      // Emit error event
      this.emit("agent:error", agentId, errorMsg);

      console.error(`[pool] Agent ${agentId} failed:`, errorMsg);
    }
  }

  /**
   * Kill a running agent
   */
  kill(agentId: string): boolean {
    const managed = this.agents.get(agentId);
    if (!managed) {
      console.warn(`[pool] Cannot kill agent ${agentId}: not found`);
      return false;
    }

    managed.agent.stop();
    managed.status = "cancelled";

    console.log(`[pool] Killed agent ${agentId}`);
    this.emit("agent:killed", agentId);

    return true;
  }

  /**
   * Get agent status
   */
  getAgent(agentId: string): ManagedAgent | undefined {
    return this.agents.get(agentId);
  }

  /**
   * Get all agent IDs
   */
  getAgentIds(): string[] {
    return Array.from(this.agents.keys());
  }

  /**
   * Get active (running) agent count
   */
  getActiveCount(): number {
    let count = 0;
    for (const agent of this.agents.values()) {
      if (
        agent.status === "pending" ||
        agent.status === "initializing" ||
        agent.status === "running" ||
        agent.status === "needs_approval"
      ) {
        count++;
      }
    }
    return count;
  }

  /**
   * Get total agent count
   */
  getTotalCount(): number {
    return this.agents.size;
  }

  /**
   * Get summary of all agents
   */
  getSummary(): Array<{
    id: string;
    type: AgentType;
    status: AgentStatus;
    goal: string;
    runningFor: number;
  }> {
    const now = Date.now();
    return Array.from(this.agents.values()).map((a) => ({
      id: a.id,
      type: a.type,
      status: a.status,
      goal: a.goal,
      runningFor: now - a.startedAt,
    }));
  }

  /**
   * Clean up completed/failed agents older than maxAge
   */
  cleanup(maxAgeMs: number = 60 * 60 * 1000): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [id, agent] of this.agents) {
      if (
        (agent.status === "completed" ||
          agent.status === "failed" ||
          agent.status === "cancelled") &&
        now - agent.startedAt > maxAgeMs
      ) {
        this.agents.delete(id);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[pool] Cleaned up ${cleaned} old agents`);
    }

    return cleaned;
  }

  /**
   * Stop all agents and clear the pool
   */
  async shutdown(): Promise<void> {
    console.log(`[pool] Shutting down ${this.agents.size} agents...`);

    for (const [id, managed] of this.agents) {
      if (
        managed.status === "pending" ||
        managed.status === "initializing" ||
        managed.status === "running"
      ) {
        managed.agent.stop();
      }
    }

    this.agents.clear();
    console.log("[pool] Shutdown complete");
  }

  /**
   * Handle log from agent
   */
  private handleLog(agentId: string, log: LogPayload): void {
    this.emit("agent:log", agentId, log);
  }

  /**
   * Handle status change from agent
   */
  private handleStatusChange(agentId: string, status: AgentStatus, step?: string): void {
    const managed = this.agents.get(agentId);
    if (managed) {
      managed.status = status;
    }
    this.emit("agent:status", agentId, status, step);
  }
}

// Singleton instance
let poolInstance: AgentPool | null = null;

/**
 * Get the global agent pool instance
 */
export function getAgentPool(): AgentPool {
  if (!poolInstance) {
    poolInstance = new AgentPool();
  }
  return poolInstance;
}

/**
 * Create a new agent pool (mainly for testing)
 */
export function createAgentPool(maxConcurrent?: number): AgentPool {
  return new AgentPool(maxConcurrent);
}
