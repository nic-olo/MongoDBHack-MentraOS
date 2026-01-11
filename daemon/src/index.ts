/**
 * Desktop Daemon - Main Entry Point
 * Connects to cloud backend, receives commands, manages local agents
 */

import * as readline from "readline";
import { DaemonClient } from "./daemon-client";
import { AgentPool, getAgentPool } from "./agent-pool";
import { TerminalAgent } from "./terminal-agent";
import {
  loadConfig,
  isConfigured,
  saveConfig,
  DEFAULT_SERVER_URL,
} from "./config";
import type {
  CloudCommand,
  SpawnAgentCommand,
  KillAgentCommand,
  DaemonConfig,
  AgentStatus,
  LogPayload,
} from "./types";

/**
 * Prompt user for input using readline
 */
async function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Validate email format
 */
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

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
    console.log("🚀 Desktop Daemon starting...\n");

    // Load configuration
    this.config = loadConfig();

    // If not configured, run setup
    if (!this.config) {
      console.log("📋 First time setup required.\n");
      await this.runSetup();
      this.config = loadConfig();
    }

    if (!this.config) {
      console.error("❌ Setup failed. Please try again.");
      process.exit(1);
    }

    console.log(`📧 Email: ${this.config.email}`);
    console.log(`📡 Server: ${this.config.serverUrl}`);

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

    console.log("\n✅ Daemon started. Waiting for commands...\n");
  }

  /**
   * Run interactive setup
   */
  private async runSetup(): Promise<void> {
    console.log("Welcome to the MentraOS Desktop Daemon!\n");
    console.log("This daemon connects your computer to MentraOS so AI agents");
    console.log("can run coding tasks on your machine.\n");

    // Get email
    let email = "";
    while (!email) {
      email = await prompt("Enter your email address: ");
      if (!isValidEmail(email)) {
        console.log("❌ Invalid email format. Please try again.\n");
        email = "";
      }
    }

    // Get server URL (optional)
    const serverUrlInput = await prompt(
      `Server URL (press Enter for default: ${DEFAULT_SERVER_URL}): `,
    );
    const serverUrl = serverUrlInput || DEFAULT_SERVER_URL;

    // Get device name (optional)
    const hostname = require("os").hostname();
    const nameInput = await prompt(
      `Device name (press Enter for default: ${hostname}): `,
    );
    const name = nameInput || hostname;

    // Save config
    const config: DaemonConfig = {
      email,
      serverUrl,
      name,
    };

    saveConfig(config);

    console.log("\n✅ Setup complete!\n");
    console.log(`   Email: ${email}`);
    console.log(`   Server: ${serverUrl}`);
    console.log(`   Device: ${name}\n`);
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
    console.log(
      `🤖 Spawning agent ${command.agentId}: "${command.goal.slice(0, 50)}..."`,
    );

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
      console.error(
        `❌ Failed to start agent ${command.agentId}: ${result.error}`,
      );
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
    this.pool.on(
      "agent:status",
      (agentId: string, status: AgentStatus, step?: string) => {
        console.log(
          `📊 Agent ${agentId} status: ${status}${step ? ` - ${step}` : ""}`,
        );

        this.client?.sendStatusUpdate(agentId, {
          status,
          currentStep: step,
          timestamp: Date.now(),
        });
      },
    );

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

  // Handle reset command
  if (command === "reset") {
    const { clearConfig } = await import("./config");
    clearConfig();
    console.log(
      "✅ Configuration cleared. Run 'bun run daemon' to set up again.",
    );
    return;
  }

  // Handle status command
  if (command === "status") {
    if (!isConfigured()) {
      console.log("❌ Daemon not configured. Run 'bun run daemon' to set up.");
    } else {
      const config = loadConfig()!;
      console.log("✅ Daemon is configured:");
      console.log(`   Email: ${config.email}`);
      console.log(`   Server: ${config.serverUrl}`);
      console.log(`   Device: ${config.name || "unknown"}`);
    }
    return;
  }

  // Handle help command
  if (command === "help" || command === "--help" || command === "-h") {
    console.log("MentraOS Desktop Daemon\n");
    console.log("Usage: bun run daemon [command]\n");
    console.log("Commands:");
    console.log("  (none)    Start the daemon (runs setup if needed)");
    console.log("  status    Show current configuration");
    console.log("  reset     Clear configuration and start fresh");
    console.log("  test      Run a test agent locally (no server needed)");
    console.log("  help      Show this help message");
    return;
  }

  // Handle test command - run TerminalAgent directly without server
  if (command === "test") {
    const goal =
      args.slice(1).join(" ") ||
      "List the files in the current directory and describe what you see";

    console.log("🧪 Running TerminalAgent test (no server connection)\n");
    console.log(`📁 Working directory: ${process.cwd()}`);
    console.log(`🎯 Goal: "${goal}"\n`);
    console.log("=".repeat(60));
    console.log("");

    const agent = new TerminalAgent({
      agentId: `test_${Date.now()}`,
      goal,
      workingDirectory: process.cwd(),
      autoApprove: true,
      timeout: 3 * 60 * 1000, // 3 minutes for test
      streamOutput: true,
      onLog: (log) => {
        if (log.type === "stdout") {
          // Don't prefix stdout to keep terminal output clean
          process.stdout.write(log.content);
        } else {
          console.log(`[${log.type}] ${log.content}`);
        }
      },
      onStatusChange: (status, step) => {
        console.log(`\n📊 Status: ${status}${step ? ` - ${step}` : ""}\n`);
      },
    });

    try {
      const result = await agent.start();

      console.log("\n" + "=".repeat(60));
      console.log("🏁 Test Complete!\n");
      console.log(`   Status: ${result.status}`);
      console.log(`   Duration: ${result.executionTimeMs}ms`);
      if (result.error) {
        console.log(`   Error: ${result.error}`);
      }
      console.log("");
    } catch (error) {
      console.error("\n❌ Test failed:", error);
      process.exit(1);
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
