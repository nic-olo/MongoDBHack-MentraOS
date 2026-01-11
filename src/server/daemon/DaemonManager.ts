/**
 * DaemonManager
 * Cloud-side manager for connected desktop daemons
 *
 * This class is designed to be integrated into the backend server.
 * It handles:
 * - WebSocket connections from daemons
 * - Sending commands to daemons (spawn_agent, kill_agent)
 * - Receiving status updates via REST endpoints
 * - Tracking daemon and agent state
 * - Emitting events for the master agent to subscribe to
 *
 * Usage:
 * ```typescript
 * const daemonManager = new DaemonManager();
 *
 * // Handle WebSocket upgrade
 * app.ws('/ws/daemon', (ws, req) => {
 *   const token = req.query.token;
 *   const daemonId = daemonManager.authenticateDaemon(token);
 *   if (daemonId) {
 *     daemonManager.handleWebSocket(ws, daemonId);
 *   } else {
 *     ws.close(4001, 'Unauthorized');
 *   }
 * });
 *
 * // Mount REST routes
 * app.use('/api', daemonManager.getRouter());
 *
 * // Subscribe to events (for master agent)
 * daemonManager.on('agent:completed', (event) => {
 *   console.log('Agent completed:', event.agentId);
 * });
 *
 * // Spawn an agent
 * const agentId = await daemonManager.spawnAgent(daemonId, {
 *   agentType: 'terminal',
 *   goal: 'Refactor the auth module',
 *   workingDirectory: '/Users/example/project'
 * });
 * ```
 */

import { EventEmitter } from "events";
import type { WebSocket } from "ws";
import { getDb, isConnected } from "../db/mongo";
import type {
  AgentType,
  AgentStatus,
  DaemonState,
  SubAgentState,
  SpawnAgentOptions,
  CloudCommand,
  DaemonMessage,
  HeartbeatPayload,
  StatusUpdatePayload,
  CompletePayload,
  LogPayload,
  DaemonEvent,
  EventCallback,
} from "./types";

// Generate unique IDs
function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * DaemonManager - Manages connected daemons and their agents
 */
export class DaemonManager extends EventEmitter {
  // Connected daemons: daemonId -> WebSocket
  private connections: Map<string, WebSocket> = new Map();

  // Daemon state: daemonId -> DaemonState
  private daemons: Map<string, DaemonState> = new Map();

  // Agent state: agentId -> SubAgentState
  private agents: Map<string, SubAgentState> = new Map();

  // Token to daemonId mapping (for auth)
  private tokenMap: Map<string, { daemonId: string; userId: string }> =
    new Map();

  // Ping interval for connection health
  private pingInterval: NodeJS.Timeout | null = null;
  private pingIntervalMs: number = 30000; // 30 seconds

  constructor() {
    super();
    this.startPingInterval();
  }

  // ===========================================================================
  // Authentication
  // ===========================================================================

  /**
   * Register a daemon token (call this when generating tokens in your auth system)
   */
  registerToken(token: string, daemonId: string, userId: string): void {
    this.tokenMap.set(token, { daemonId, userId });
  }

  /**
   * Authenticate a daemon by token
   * Returns daemonId if valid, null if invalid
   */
  authenticateDaemon(
    token: string,
  ): { daemonId: string; userId: string } | null {
    return this.tokenMap.get(token) || null;
  }

  /**
   * Revoke a daemon token
   */
  revokeToken(token: string): void {
    const info = this.tokenMap.get(token);
    if (info) {
      // Disconnect the daemon if connected
      this.disconnectDaemon(info.daemonId);
      this.tokenMap.delete(token);
    }
  }

  // ===========================================================================
  // WebSocket Handling
  // ===========================================================================

  /**
   * Handle a new WebSocket connection from a daemon
   */
  handleWebSocket(ws: WebSocket, daemonId: string, userId: string): void {
    console.log(`[DaemonManager] Daemon connected: ${daemonId}`);

    // Store connection
    this.connections.set(daemonId, ws);

    // Initialize or update daemon state
    const existingState = this.daemons.get(daemonId);
    const daemonState: DaemonState = {
      daemonId,
      userId,
      name: existingState?.name,
      status: "online",
      lastSeen: new Date(),
      activeAgents: 0,
      agentIds: [],
      connectedAt: new Date(),
    };
    this.daemons.set(daemonId, daemonState);

    // Emit connected event
    this.emitEvent({
      type: "daemon:connected",
      daemonId,
      userId,
    });

    // Setup message handler
    ws.on("message", (data: Buffer | string) => {
      this.handleDaemonMessage(daemonId, data);
    });

    // Setup close handler
    ws.on("close", () => {
      this.handleDaemonDisconnect(daemonId, userId);
    });

    // Setup error handler
    ws.on("error", (error) => {
      console.error(
        `[DaemonManager] WebSocket error for daemon ${daemonId}:`,
        error,
      );
    });
  }

  /**
   * Handle incoming message from daemon
   */
  private handleDaemonMessage(daemonId: string, data: Buffer | string): void {
    try {
      const message = JSON.parse(data.toString()) as DaemonMessage;

      switch (message.type) {
        case "pong":
          // Update last seen
          const daemon = this.daemons.get(daemonId);
          if (daemon) {
            daemon.lastSeen = new Date();
          }
          break;

        case "agent_ack":
          this.handleAgentAck(daemonId, message);
          break;

        default:
          console.warn(
            `[DaemonManager] Unknown message type from daemon ${daemonId}:`,
            message,
          );
      }
    } catch (error) {
      console.error(
        `[DaemonManager] Failed to parse message from daemon ${daemonId}:`,
        error,
      );
    }
  }

  /**
   * Handle agent acknowledgment from daemon
   */
  private handleAgentAck(
    daemonId: string,
    message: { agentId: string; status: "started" | "error"; error?: string },
  ): void {
    const agent = this.agents.get(message.agentId);
    if (!agent) {
      console.warn(
        `[DaemonManager] Agent ack for unknown agent: ${message.agentId}`,
      );
      return;
    }

    if (message.status === "started") {
      agent.status = "initializing";
      agent.startedAt = new Date();

      this.emitEvent({
        type: "agent:started",
        agentId: message.agentId,
        daemonId,
      });
    } else {
      agent.status = "failed";
      agent.error = message.error;
      agent.completedAt = new Date();

      this.emitEvent({
        type: "agent:failed",
        agentId: message.agentId,
        daemonId,
        error: message.error || "Failed to start",
        executionTimeMs: 0,
      });
    }
  }

  /**
   * Handle daemon disconnect
   */
  private handleDaemonDisconnect(daemonId: string, userId: string): void {
    console.log(`[DaemonManager] Daemon disconnected: ${daemonId}`);

    this.connections.delete(daemonId);

    const daemon = this.daemons.get(daemonId);
    if (daemon) {
      daemon.status = "offline";
      daemon.lastSeen = new Date();
    }

    // Mark all agents from this daemon as failed
    for (const [agentId, agent] of this.agents) {
      if (
        agent.daemonId === daemonId &&
        !["completed", "failed", "cancelled"].includes(agent.status)
      ) {
        agent.status = "failed";
        agent.error = "Daemon disconnected";
        agent.completedAt = new Date();

        this.emitEvent({
          type: "agent:failed",
          agentId,
          daemonId,
          error: "Daemon disconnected",
          executionTimeMs: agent.startedAt
            ? Date.now() - agent.startedAt.getTime()
            : 0,
        });
      }
    }

    this.emitEvent({
      type: "daemon:disconnected",
      daemonId,
      userId,
    });
  }

  /**
   * Disconnect a daemon
   */
  disconnectDaemon(daemonId: string): void {
    const ws = this.connections.get(daemonId);
    if (ws) {
      ws.close(1000, "Disconnected by server");
    }
  }

  // ===========================================================================
  // Commands (Cloud -> Daemon)
  // ===========================================================================

  /**
   * Send a command to a daemon
   */
  private sendCommand(daemonId: string, command: CloudCommand): boolean {
    const ws = this.connections.get(daemonId);
    if (!ws || ws.readyState !== 1 /* WebSocket.OPEN */) {
      console.warn(
        `[DaemonManager] Cannot send command: daemon ${daemonId} not connected`,
      );
      return false;
    }

    try {
      ws.send(JSON.stringify(command));
      return true;
    } catch (error) {
      console.error(
        `[DaemonManager] Failed to send command to daemon ${daemonId}:`,
        error,
      );
      return false;
    }
  }

  /**
   * Spawn an agent on a daemon
   * Returns the agentId if successful, null if failed
   */
  async spawnAgent(
    daemonId: string,
    options: SpawnAgentOptions,
  ): Promise<string | null> {
    // Check daemon is online
    if (!this.isDaemonOnline(daemonId)) {
      console.error(
        `[DaemonManager] Cannot spawn agent: daemon ${daemonId} not online`,
      );
      return null;
    }

    // Get userId from daemon
    const daemon = this.daemons.get(daemonId);
    const userId = daemon?.userId || daemonId;

    // Generate agent ID
    const agentId = generateId("agent");

    // Create agent state
    const agentState: SubAgentState = {
      agentId,
      daemonId,
      sessionId: options.sessionId,
      type: options.agentType,
      status: "pending",
      goal: options.goal,
      notes: [],
      createdAt: new Date(),
    };
    this.agents.set(agentId, agentState);

    // Persist to MongoDB
    if (isConnected()) {
      try {
        const db = getDb();
        await db.collection("subagents").insertOne({
          ...agentState,
          userId,
          workingDirectory: options.workingDirectory,
          updatedAt: new Date(),
        });
      } catch (error) {
        console.error(
          "[DaemonManager] Failed to persist agent to MongoDB:",
          error,
        );
      }
    }

    // Send spawn command
    const command: CloudCommand = {
      type: "spawn_agent",
      agentId,
      agentType: options.agentType,
      goal: options.goal,
      workingDirectory: options.workingDirectory,
      options: {
        autoApprove: options.autoApprove ?? true,
        timeout: options.timeout,
        streamOutput: options.streamOutput ?? true,
      },
    };

    const sent = this.sendCommand(daemonId, command);
    if (!sent) {
      this.agents.delete(agentId);
      return null;
    }

    console.log(
      `[DaemonManager] Spawned agent ${agentId} on daemon ${daemonId}`,
    );
    return agentId;
  }

  /**
   * Kill an agent on a daemon
   */
  async killAgent(agentId: string): Promise<boolean> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      console.warn(
        `[DaemonManager] Cannot kill agent: agent ${agentId} not found`,
      );
      return false;
    }

    const command: CloudCommand = {
      type: "kill_agent",
      agentId,
    };

    const sent = this.sendCommand(agent.daemonId, command);
    if (sent) {
      agent.status = "cancelled";
      agent.completedAt = new Date();
    }

    return sent;
  }

  // ===========================================================================
  // REST Handlers (Daemon -> Cloud)
  // ===========================================================================

  /**
   * Handle heartbeat from daemon
   */
  onHeartbeat(daemonId: string, payload: HeartbeatPayload): void {
    const daemon = this.daemons.get(daemonId);
    if (daemon) {
      daemon.lastSeen = new Date();
      daemon.activeAgents = payload.activeAgents;
      daemon.agentIds = payload.agentIds;
    }
  }

  /**
   * Handle status update from daemon
   */
  async onAgentStatus(
    agentId: string,
    payload: StatusUpdatePayload,
  ): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      console.warn(
        `[DaemonManager] Status update for unknown agent: ${agentId}`,
      );
      return;
    }

    agent.status = payload.status;
    agent.currentStep = payload.currentStep;
    if (payload.notes) {
      agent.notes = payload.notes;
    }

    // Persist to MongoDB
    if (isConnected()) {
      try {
        const db = getDb();
        const updateDoc: any = {
          $set: {
            status: payload.status,
            currentStep: payload.currentStep,
            updatedAt: new Date(),
          },
        };
        if (payload.currentStep) {
          updateDoc.$push = { notes: payload.currentStep };
        }
        await db.collection("subagents").updateOne({ agentId }, updateDoc);
      } catch (error) {
        console.error(
          "[DaemonManager] Failed to update agent status in MongoDB:",
          error,
        );
      }
    }

    this.emitEvent({
      type: "agent:status",
      agentId,
      daemonId: agent.daemonId,
      status: payload.status,
      currentStep: payload.currentStep,
    });
  }

  /**
   * Handle completion from daemon
   */
  async onAgentComplete(
    agentId: string,
    payload: CompletePayload,
  ): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      console.warn(`[DaemonManager] Complete for unknown agent: ${agentId}`);
      return;
    }

    agent.status = payload.status;
    agent.result = payload.result;
    agent.error = payload.error;
    agent.executionTimeMs = payload.executionTimeMs;
    agent.completedAt = new Date();

    // Persist to MongoDB
    if (isConnected()) {
      try {
        const db = getDb();
        await db.collection("subagents").updateOne(
          { agentId },
          {
            $set: {
              status: payload.status,
              result: payload.result,
              error: payload.error,
              executionTimeMs: payload.executionTimeMs,
              completedAt: new Date(),
              updatedAt: new Date(),
            },
          },
        );
      } catch (error) {
        console.error(
          "[DaemonManager] Failed to update agent completion in MongoDB:",
          error,
        );
      }
    }

    if (payload.status === "completed") {
      this.emitEvent({
        type: "agent:completed",
        agentId,
        daemonId: agent.daemonId,
        result: payload.result,
        executionTimeMs: payload.executionTimeMs,
      });
    } else {
      this.emitEvent({
        type: "agent:failed",
        agentId,
        daemonId: agent.daemonId,
        error: payload.error || "Unknown error",
        executionTimeMs: payload.executionTimeMs,
      });
    }
  }

  /**
   * Handle log from daemon
   */
  onAgentLog(agentId: string, payload: LogPayload): void {
    const agent = this.agents.get(agentId);
    if (!agent) {
      return; // Silently ignore logs for unknown agents
    }

    this.emitEvent({
      type: "agent:log",
      agentId,
      daemonId: agent.daemonId,
      log: payload,
    });
  }

  // ===========================================================================
  // Query Methods
  // ===========================================================================

  /**
   * Check if a daemon is online
   */
  isDaemonOnline(daemonId: string): boolean {
    const daemon = this.daemons.get(daemonId);
    return daemon?.status === "online" && this.connections.has(daemonId);
  }

  /**
   * Get daemon state
   */
  getDaemon(daemonId: string): DaemonState | undefined {
    return this.daemons.get(daemonId);
  }

  /**
   * Get all daemons for a user
   */
  getDaemonsForUser(userId: string): DaemonState[] {
    return Array.from(this.daemons.values()).filter((d) => d.userId === userId);
  }

  /**
   * Get online daemon for a user (first one found)
   */
  getOnlineDaemonForUser(userId: string): DaemonState | undefined {
    return Array.from(this.daemons.values()).find(
      (d) => d.userId === userId && d.status === "online",
    );
  }

  /**
   * Get agent state
   */
  getAgent(agentId: string): SubAgentState | undefined {
    return this.agents.get(agentId);
  }

  /**
   * Get all agents for a daemon
   */
  getAgentsForDaemon(daemonId: string): SubAgentState[] {
    return Array.from(this.agents.values()).filter(
      (a) => a.daemonId === daemonId,
    );
  }

  /**
   * Get all agents for a session
   */
  getAgentsForSession(sessionId: string): SubAgentState[] {
    return Array.from(this.agents.values()).filter(
      (a) => a.sessionId === sessionId,
    );
  }

  /**
   * Wait for an agent to complete (poll MongoDB)
   * Returns the agent state when complete, or null on timeout
   */
  async waitForCompletion(
    agentId: string,
    timeoutMs: number = 300000,
  ): Promise<SubAgentState | null> {
    const pollInterval = 1000; // 1 second
    const maxAttempts = timeoutMs / pollInterval;
    let attempts = 0;

    while (attempts < maxAttempts) {
      // Check in-memory first
      const agent = this.agents.get(agentId);
      if (agent) {
        if (
          agent.status === "completed" ||
          agent.status === "failed" ||
          agent.status === "cancelled"
        ) {
          return agent;
        }
      }

      // Also check MongoDB if connected
      if (isConnected()) {
        try {
          const db = getDb();
          const doc = await db.collection("subagents").findOne({ agentId });
          if (doc) {
            if (
              doc.status === "completed" ||
              doc.status === "failed" ||
              doc.status === "cancelled"
            ) {
              return doc as unknown as SubAgentState;
            }
          }
        } catch (error) {
          console.error("[DaemonManager] Error polling MongoDB:", error);
        }
      }

      await new Promise((resolve) => setTimeout(resolve, pollInterval));
      attempts++;
    }

    return null; // Timeout
  }

  // ===========================================================================
  // Events
  // ===========================================================================

  /**
   * Emit a typed event
   */
  private emitEvent(event: DaemonEvent): void {
    this.emit(event.type, event);
    this.emit("*", event); // Wildcard for catching all events
  }

  /**
   * Subscribe to events
   */
  subscribe(callback: EventCallback): () => void {
    this.on("*", callback);
    return () => this.off("*", callback);
  }

  // ===========================================================================
  // Health & Cleanup
  // ===========================================================================

  /**
   * Start ping interval for connection health
   */
  private startPingInterval(): void {
    this.pingInterval = setInterval(() => {
      for (const [daemonId, ws] of this.connections) {
        if (ws.readyState === 1 /* WebSocket.OPEN */) {
          this.sendCommand(daemonId, { type: "ping" });
        }
      }
    }, this.pingIntervalMs);
  }

  /**
   * Stop ping interval
   */
  private stopPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  /**
   * Cleanup old completed agents
   */
  cleanupOldAgents(maxAgeMs: number = 60 * 60 * 1000): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [agentId, agent] of this.agents) {
      if (
        ["completed", "failed", "cancelled"].includes(agent.status) &&
        agent.completedAt &&
        now - agent.completedAt.getTime() > maxAgeMs
      ) {
        this.agents.delete(agentId);
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * Shutdown the manager
   */
  shutdown(): void {
    this.stopPingInterval();

    // Close all connections
    for (const [daemonId, ws] of this.connections) {
      ws.close(1000, "Server shutting down");
    }

    this.connections.clear();
    this.removeAllListeners();
  }
}

// Singleton instance
let managerInstance: DaemonManager | null = null;

/**
 * Get the global DaemonManager instance
 */
export function getDaemonManager(): DaemonManager {
  if (!managerInstance) {
    managerInstance = new DaemonManager();
  }
  return managerInstance;
}

/**
 * Create a new DaemonManager instance (mainly for testing)
 */
export function createDaemonManager(): DaemonManager {
  return new DaemonManager();
}
