/**
 * Desktop Daemon - Main Entry Point
 * Connects to cloud backend, receives commands, manages local agents
 */

import { DaemonClient } from "./daemon-client";
import { AgentPool, getAgentPool } from "./agent-pool";
import { loadConfig, isConfigured, saveConfig, DEFAULT_SERVER_URL } from "./config";
import type {
  CloudCommand,
  SpawnAgentCommand,
  KillAgentCommand,
  DaemonConfig,
  AgentStatus,
  LogPayload,
} from "./types";

class DesktopDaemon {
  private client: DaemonClient | null = null;
  private pool: AgentPool;
  private config: DaemonConfig | null = null;

  constructor() {
    this.pool = getAgentPool();
    this.setupPoolEvents();
  }

  /**
   * Start the daemon
   */
  async start(): Promise<void> {
    console.log("🚀 Desktop Daemon starting...");

    // Load configuration
    this.config = loadConfig();
    if (!this.config) {
      console.error("❌ Daemon not configured. Run with 'auth <token>' first.");
      console.log("\nUsage:");
      console.log("  bun run auth <token> [serverUrl]  - Authenticate daemon");
      console.log("  bun run start                     - Start daemon");
      process.exit(1);
    }

    console.log(`📡 Server: ${this.config.serverUrl}`);
    console.log(`🔑 Token: ${this.config.token.slice(0, 10)}...`);

    // Create client
    this.client = new DaemonClient({
      config: this.config,
      onCommand: (cmd) => this.handleCommand(cmd),
      onConnect: () => this.onConnected(),
      onDisconnect: () => this.onDisconnected(),
    });

    // Setup client events
    this.client.on("heartbeat_tick", () => this.sendHeartbeat());
    this.client.on("reconnect_failed", () => {
      console.error("❌ Failed to reconnect to server, exiting...");
      process.exit(1);
    });

    // Connect to server
    this.client.connect();

    // Handle shutdown gracefully
    process.on("SIGINT", () => this.shutdown());
    process.on("SIGTERM", () => this.shutdown());

    console.log("✅ Daemon started. Waiting for commands...\n");
  }

  /**
   * Handle incoming command from cloud
   */
  private async handleCommand(command: CloudCommand): Promise<void> {
    console.log(`📥 Received command: ${command.type}`);

    switch (command.type) {
      case "spawn_agent":
        await this.handleSpawnAgent(command);
        break;

      case "kill_agent":
        await this.handleKillAgent(command);
        break;

      case "ping":
        // Already handled in DaemonClient
        break;

      default:
        console.warn(`⚠️ Unknown command type: ${(command as any).type}`);
    }
  }

  /**
   * Handle spawn_agent command
   */
  private async handleSpawnAgent(command: SpawnAgentCommand): Promise<void> {
    console.log(`🤖 Spawning agent ${command.agentId}: "${command.goal.slice(0, 50)}..."`);

    const result = await this.pool.spawn(command);

    // Send acknowledgment
    this.client?.send({
      type: "agent_ack",
      agentId: command.agentId,
      status: result.success ? "started" : "error",
      error: result.error,
    });

    if (result.success) {
      console.log(`✅ Agent ${command.agentId} started`);
    } else {
      console.error(`❌ Failed to start agent ${command.agentId}: ${result.error}`);
    }
  }

  /**
   * Handle kill_agent command
   */
  private async handleKillAgent(command: KillAgentCommand): Promise<void> {
    console.log(`🛑 Killing agent ${command.agentId}`);
    const killed = this.pool.kill(command.agentId);

    if (killed) {
      console.log(`✅ Agent ${command.agentId} killed`);
    } else {
      console.warn(`⚠️ Agent ${command.agentId} not found`);
    }
  }

  /**
   * Setup event handlers for agent pool
   */
  private setupPoolEvents(): void {
    // Agent status changed
    this.pool.on("agent:status", (agentId: string, status: AgentStatus, step?: string) => {
      console.log(`📊 Agent ${agentId} status: ${status}${step ? ` - ${step}` : ""}`);

      this.client?.sendStatusUpdate(agentId, {
        status,
        currentStep: step,
        timestamp: Date.now(),
      });
    });

    // Agent completed
    this.pool.on("agent:complete", (agentId: string, result: any) => {
      console.log(`🎉 Agent ${agentId} completed: ${result.status}`);

      this.client?.sendComplete(agentId, {
        status: result.status,
        result: result.result,
        error: result.error,
        executionTimeMs: result.executionTimeMs,
        timestamp: Date.now(),
      });
    });

    // Agent error
    this.pool.on("agent:error", (agentId: string, error: string) => {
      console.error(`❌ Agent ${agentId} error: ${error}`);

      this.client?.sendComplete(agentId, {
        status: "failed",
        error,
        executionTimeMs: 0,
        timestamp: Date.now(),
      });
    });

    // Agent log
    this.pool.on("agent:log", (agentId: string, log: LogPayload) => {
      // Only send significant logs to reduce traffic
      if (log.type === "status" || log.type === "stderr") {
        this.client?.sendLog(agentId, log);
      }
    });
  }

  /**
   * Called when connected to server
   */
  private onConnected(): void {
    console.log("🟢 Connected to server");
    this.sendHeartbeat();
  }

  /**
   * Called when disconnected from server
   */
  private onDisconnected(): void {
    console.log("🔴 Disconnected from server");
  }

  /**
   * Send heartbeat to server
   */
  private async sendHeartbeat(): Promise<void> {
    if (!this.client?.getIsConnected()) return;

    const success = await this.client.sendHeartbeat({
      activeAgents: this.pool.getActiveCount(),
      agentIds: this.pool.getAgentIds(),
      timestamp: Date.now(),
    });

    if (!success) {
      console.warn("⚠️ Heartbeat failed");
    }
  }

  /**
   * Graceful shutdown
   */
  private async shutdown(): Promise<void> {
    console.log("\n🛑 Shutting down daemon...");

    // Stop all agents
    await this.pool.shutdown();

    // Disconnect from server
    this.client?.disconnect();

    console.log("👋 Goodbye!");
    process.exit(0);
  }
}

// =============================================================================
// CLI Entry Point
// =============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  // Handle auth command
  if (command === "auth") {
    const token = args[1];
    const serverUrl = args[2] || DEFAULT_SERVER_URL;

    if (!token) {
      console.error("Usage: bun run auth <token> [serverUrl]");
      process.exit(1);
    }

    saveConfig({
      token,
      serverUrl,
      name: `daemon-${Date.now()}`,
    });

    console.log("✅ Daemon authenticated successfully!");
    console.log(`   Server: ${serverUrl}`);
    console.log(`   Token: ${token.slice(0, 10)}...`);
    console.log("\nRun 'bun run start' to start the daemon.");
    return;
  }

  // Handle status command
  if (command === "status") {
    if (!isConfigured()) {
      console.log("❌ Daemon not configured. Run 'bun run auth <token>' first.");
    } else {
      const config = loadConfig()!;
      console.log("✅ Daemon is configured:");
      console.log(`   Server: ${config.serverUrl}`);
      console.log(`   Token: ${config.token.slice(0, 10)}...`);
    }
    return;
  }

  // Default: start daemon
  const daemon = new DesktopDaemon();
  await daemon.start();
}

// Run
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
