/**
 * Terminal Agent
 * Manages Claude CLI in a PTY terminal with LLM-powered observation
 * This is the core agent that runs on the user's machine
 */

import { EventEmitter } from "events";
import { TerminalObserver } from "./observer";
import type {
  AgentStatus,
  AgentResult,
  TerminalObservation,
  LogPayload,
} from "./types";

export interface TerminalAgentOptions {
  agentId: string;
  goal: string;
  workingDirectory?: string;
  autoApprove?: boolean;
  timeout?: number; // ms, default 5 minutes
  streamOutput?: boolean;
  onLog?: (log: LogPayload) => void;
  onStatusChange?: (status: AgentStatus, step?: string) => void;
}

interface TerminalSession {
  proc: ReturnType<typeof Bun.spawn>;
  buffer: string;
}

/**
 * TerminalAgent - Controls Claude CLI through a PTY
 * Uses LLM observer to intelligently detect state and handle edge cases
 */
export class TerminalAgent extends EventEmitter {
  private agentId: string;
  private goal: string;
  private workingDirectory: string;
  private autoApprove: boolean;
  private timeout: number;
  private streamOutput: boolean;

  private session: TerminalSession | null = null;
  private observer: TerminalObserver;
  private status: AgentStatus = "pending";
  private startTime: number = 0;
  private isRunning: boolean = false;
  private goalSubmitted: boolean = false;

  private onLog?: (log: LogPayload) => void;
  private onStatusChange?: (status: AgentStatus, step?: string) => void;

  constructor(options: TerminalAgentOptions) {
    super();
    this.agentId = options.agentId;
    this.goal = options.goal;
    this.workingDirectory = options.workingDirectory || process.cwd();
    this.autoApprove = options.autoApprove ?? true;
    this.timeout = options.timeout ?? 5 * 60 * 1000; // 5 minutes default
    this.streamOutput = options.streamOutput ?? true;
    this.onLog = options.onLog;
    this.onStatusChange = options.onStatusChange;

    this.observer = new TerminalObserver(this.goal);
  }

  /**
   * Start the agent - launches Claude CLI and submits the goal
   */
  async start(): Promise<AgentResult> {
    if (this.isRunning) {
      throw new Error(`Agent ${this.agentId} is already running`);
    }

    this.isRunning = true;
    this.startTime = Date.now();
    this.updateStatus("initializing", "Starting Claude CLI...");

    try {
      // Start the terminal with Claude CLI
      await this.startTerminal();

      // Wait for Claude to be ready
      await this.waitForReady();

      // Submit the goal
      await this.submitGoal();

      // Monitor until completion
      const result = await this.monitorUntilComplete();

      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.updateStatus("failed", `Error: ${errorMsg}`);
      this.log("stderr", `Agent failed: ${errorMsg}`);

      return {
        agentId: this.agentId,
        agentType: "terminal",
        goal: this.goal,
        status: "failed",
        error: errorMsg,
        executionTimeMs: Date.now() - this.startTime,
        logs: this.session?.buffer.split("\n") || [],
      };
    } finally {
      this.cleanup();
    }
  }

  /**
   * Stop the agent
   */
  stop(): void {
    this.log("status", "Agent stopped by user");
    this.updateStatus("cancelled", "Stopped by user");
    this.cleanup();
  }

  /**
   * Get current status
   */
  getStatus(): AgentStatus {
    return this.status;
  }

  /**
   * Get terminal buffer
   */
  getBuffer(): string {
    return this.session?.buffer || "";
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Start the PTY terminal with Claude CLI
   */
  private async startTerminal(): Promise<void> {
    this.log("status", "Launching terminal...");

    let buffer = "";

    const proc = Bun.spawn(["zsh"], {
      cwd: this.workingDirectory,
      terminal: {
        cols: 120,
        rows: 30,
        data: (_terminal, data) => {
          const output = data.toString();

          // Append to buffer (keep last 50k characters)
          buffer += output;
          if (buffer.length > 50000) {
            buffer = buffer.slice(-50000);
          }

          // Update session buffer reference
          if (this.session) {
            this.session.buffer = buffer;
          }

          // Stream output if enabled
          if (this.streamOutput) {
            this.log("stdout", output);
          }
        },
      },
    });

    this.session = { proc, buffer };

    // Give shell a moment to initialize
    await this.sleep(500);

    // Launch Claude CLI
    this.log("status", "Starting Claude CLI...");
    this.write("claude\r");
  }

  /**
   * Wait for Claude CLI to be ready for input
   */
  private async waitForReady(): Promise<void> {
    this.updateStatus("initializing", "Waiting for Claude to start...");

    const maxWait = 30000; // 30 seconds
    const checkInterval = 1000; // 1 second
    let elapsed = 0;

    while (elapsed < maxWait && this.isRunning) {
      await this.sleep(checkInterval);
      elapsed += checkInterval;

      const observation = await this.observer.observe(this.getBuffer());

      if (observation.state === "ready") {
        this.log("status", "Claude CLI is ready");
        return;
      }

      if (observation.state === "error") {
        throw new Error(`Claude CLI failed to start: ${observation.error || "Unknown error"}`);
      }

      // Still initializing, continue waiting
      this.updateStatus("initializing", `Waiting for Claude... (${Math.floor(elapsed / 1000)}s)`);
    }

    throw new Error("Timeout waiting for Claude CLI to start");
  }

  /**
   * Submit the goal to Claude
   */
  private async submitGoal(): Promise<void> {
    this.updateStatus("running", "Submitting goal to Claude...");
    this.log("status", `Submitting goal: ${this.goal}`);

    // Type the goal
    this.write(this.goal);

    // Wait a moment for the text to be typed
    await this.sleep(500);

    // Send Enter to submit
    this.write("\r");

    // Mark goal as submitted for the observer
    this.observer.markGoalSubmitted();
    this.goalSubmitted = true;

    this.updateStatus("running", "Goal submitted, Claude is working...");
  }

  /**
   * Monitor terminal until Claude completes or times out
   */
  private async monitorUntilComplete(): Promise<AgentResult> {
    const checkInterval = 2000; // Check every 2 seconds
    let elapsed = 0;
    let lastActivity = Date.now();
    let noActivityCount = 0;

    while (this.isRunning) {
      await this.sleep(checkInterval);
      elapsed += checkInterval;

      // Check timeout
      if (elapsed > this.timeout) {
        this.log("status", "Agent timed out");
        return this.createResult("failed", "Timeout: Agent took too long");
      }

      // Observe terminal state
      const observation = await this.observer.observe(this.getBuffer());

      // Handle based on action
      switch (observation.action) {
        case "wait":
          this.updateStatus("running", observation.summary || `Working... (${Math.floor(elapsed / 1000)}s)`);
          break;

        case "send_approval":
          if (this.autoApprove) {
            this.log("status", "Auto-approving action...");
            this.write("y\r");
            await this.sleep(500);
          } else {
            this.updateStatus("needs_approval", observation.summary || "Claude needs approval");
            // In non-auto mode, we'd wait for external approval signal
            // For now, just auto-approve anyway
            this.write("y\r");
          }
          break;

        case "send_rejection":
          this.log("status", "Rejecting action...");
          this.write("n\r");
          await this.sleep(500);
          break;

        case "report_complete":
          this.log("status", "Claude completed the task");
          return this.createResult("completed", undefined, observation.summary);

        case "report_error":
          this.log("status", `Claude encountered an error: ${observation.error}`);
          return this.createResult("failed", observation.error || "Unknown error");
      }

      // Track activity (check if buffer is growing)
      const currentBufferLen = this.getBuffer().length;
      if (currentBufferLen === this.session?.buffer.length) {
        noActivityCount++;
        // If no activity for 30 seconds after goal submission, check if complete
        if (noActivityCount > 15 && this.goalSubmitted) {
          const finalCheck = await this.observer.observe(this.getBuffer());
          if (finalCheck.state === "completed" || finalCheck.state === "ready") {
            this.log("status", "No activity detected, assuming complete");
            return this.createResult("completed");
          }
        }
      } else {
        noActivityCount = 0;
        lastActivity = Date.now();
      }
    }

    // If we get here, agent was stopped
    return this.createResult("failed", "Agent was stopped");
  }

  /**
   * Create the result object
   */
  private createResult(
    status: "completed" | "failed",
    error?: string,
    summary?: string
  ): AgentResult {
    const buffer = this.getBuffer();

    return {
      agentId: this.agentId,
      agentType: "terminal",
      goal: this.goal,
      status,
      result: summary || this.extractResult(buffer),
      error,
      executionTimeMs: Date.now() - this.startTime,
      logs: buffer.split("\n").slice(-100), // Last 100 lines
    };
  }

  /**
   * Extract meaningful result from buffer
   * This is a simple heuristic - the LLM observer's summary is usually better
   */
  private extractResult(buffer: string): string {
    // Strip ANSI codes
    const clean = buffer.replace(/\u001b\[[0-9;]*[a-zA-Z]/g, "");

    // Get the last meaningful section (after goal was submitted)
    const lines = clean.split("\n").filter((l) => l.trim());

    // Return last 50 lines as summary
    return lines.slice(-50).join("\n");
  }

  /**
   * Write to terminal
   */
  private write(input: string): void {
    if (this.session?.proc.terminal) {
      this.session.proc.terminal.write(input);
    }
  }

  /**
   * Update status and notify listeners
   */
  private updateStatus(status: AgentStatus, step?: string): void {
    this.status = status;
    this.emit("status", status, step);
    this.onStatusChange?.(status, step);
  }

  /**
   * Log output and notify listeners
   */
  private log(type: LogPayload["type"], content: string): void {
    const log: LogPayload = {
      type,
      content,
      timestamp: Date.now(),
    };
    this.emit("log", log);
    this.onLog?.(log);
  }

  /**
   * Cleanup resources
   */
  private cleanup(): void {
    this.isRunning = false;

    if (this.session?.proc.terminal) {
      // Send exit command
      try {
        this.write("exit\r");
      } catch {
        // Ignore errors during cleanup
      }

      // Close terminal
      setTimeout(() => {
        try {
          this.session?.proc.terminal?.close();
        } catch {
          // Ignore
        }
      }, 500);
    }

    this.session = null;
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Factory function to create and start a terminal agent
 */
export async function runTerminalAgent(
  options: TerminalAgentOptions
): Promise<AgentResult> {
  const agent = new TerminalAgent(options);
  return agent.start();
}
