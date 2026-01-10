import { terminalManager } from "./terminal";
import type { Scratchpad } from "./types";
import { EventEmitter } from "events";

/** Global event emitter for scratchpad updates */
export const agentEvents = new EventEmitter();

/**
 * TerminalAgent - an AI agent that controls a terminal session
 * Uses interactive Claude mode (not -p flag)
 */
export class TerminalAgent {
    private isRunning = false;
    private claudeReady = false;
    private dataListener: ((event: { id: string; data: string }) => void) | null = null;

    public scratchpad: Scratchpad;

    constructor(private terminalId: string) {
        this.scratchpad = {
            goal: "",
            status: "idle",
            notes: [],
            lastUpdated: Date.now(),
        };
    }

    /** Update scratchpad and emit event */
    private updateScratchpad(updates: Partial<Scratchpad>) {
        Object.assign(this.scratchpad, updates, { lastUpdated: Date.now() });
        agentEvents.emit("scratchpad", {
            type: "scratchpad_update",
            terminalId: this.terminalId,
            scratchpad: { ...this.scratchpad },
        });
    }

    /** Add a note to the scratchpad */
    private addNote(note: string) {
        this.scratchpad.notes.push(note);
        if (this.scratchpad.notes.length > 10) {
            this.scratchpad.notes.shift();
        }
        this.updateScratchpad({});
    }

    /** Start the AI control loop with interactive Claude */
    async start(goal: string) {
        if (this.isRunning) return;
        this.isRunning = true;
        this.claudeReady = false;

        this.updateScratchpad({
            goal,
            status: "thinking",
            currentStep: "Starting Claude Code session...",
            notes: [],
        });

        console.log(`[Agent] Starting interactive Claude for: ${goal}`);

        // Subscribe to terminal data events
        this.dataListener = (event) => {
            if (event.id === this.terminalId) {
                this.handleTerminalData(event.data);
            }
        };
        terminalManager.on("data", this.dataListener);

        // Start interactive claude (use \r for Enter in PTY)
        this.addNote("Launching interactive Claude session");
        console.log(`[Agent] Writing 'claude\\r' to terminal`);
        terminalManager.write(this.terminalId, "claude\r");

        // Wait for Claude to be ready, then send the goal
        await this.waitForClaudePrompt();

        console.log(`[Agent] claudeReady=${this.claudeReady}, goal="${goal}"`);

        if (this.claudeReady) {
            this.addNote("Claude ready, sending goal");
            this.updateScratchpad({
                status: "working",
                currentStep: "Sending goal to Claude...",
            });

            // Type the goal text first
            console.log(`[Agent] Typing goal text: "${goal}"`);
            terminalManager.write(this.terminalId, goal);

            // Wait a bit before sending Enter to ensure the UI has processed the characters
            await new Promise((r) => setTimeout(r, 800));

            // Send the Enter signal (carriage return)
            console.log(`[Agent] Sending Enter (\r)`);
            terminalManager.write(this.terminalId, "\r");

            this.updateScratchpad({
                currentStep: "Goal submitted, watching Claude work...",
            });

            // Now monitor for completion
            await this.monitorClaudeWork();
        } else {
            console.log(`[Agent] Claude NOT ready, skipping goal send`);
        }
    }

    /** Wait for Claude's input prompt to appear */
    private async waitForClaudePrompt(): Promise<void> {
        const maxWaitMs = 30000;
        const checkIntervalMs = 500;
        let elapsed = 0;

        while (this.isRunning && elapsed < maxWaitMs && !this.claudeReady) {
            await new Promise((r) => setTimeout(r, checkIntervalMs));
            elapsed += checkIntervalMs;

            const buffer = terminalManager.getBuffer(this.terminalId);
            // Strip ANSI codes for cleaner detection
            const cleanBuffer = buffer.replace(/\u001b\[[0-9;]*[a-zA-Z]/g, '');

            // Debug: Log the last 200 chars of clean buffer
            if (elapsed % 2000 === 0) {
                console.log(`[Agent] Prompt check cleanBuffer (last 100 chars): "${cleanBuffer.slice(-100).replace(/\n/g, '\\n')}"`);
            }

            const hasClaude = cleanBuffer.includes("Claude");
            const hasShortcut = cleanBuffer.includes("shortcut");
            const hasNewline = cleanBuffer.includes("newline");
            const hasTry = cleanBuffer.includes("Try \"");

            if (elapsed % 2000 === 0) {
                console.log(`[Agent] Prompt check: hasClaude=${hasClaude}, hasShortcut=${hasShortcut}, hasNewline=${hasNewline}, hasTry=${hasTry}`);
            }

            if (hasShortcut || hasNewline || hasTry) {
                console.log(`[Agent] Detected Claude prompt pattern!`);
                // Wait a bit more to ensure the prompt is fully settled
                await new Promise((r) => setTimeout(r, 2000));
                this.claudeReady = true;
                this.addNote("Claude prompt detected");
                return;
            }
        }

        if (!this.claudeReady) {
            this.addNote("Timeout waiting for Claude prompt");
            this.updateScratchpad({ status: "error", currentStep: "Claude didn't start" });
            this.isRunning = false;
        }
    }

    /** Handle incoming terminal data */
    private handleTerminalData(data: string) {
        // Look for signals in the output
        const lower = data.toLowerCase();

        // Claude is working
        if (lower.includes("working") || lower.includes("thinking") || lower.includes("reading")) {
            this.updateScratchpad({ currentStep: "Claude is working..." });
        }

        // Claude completed something
        if (lower.includes("done") || lower.includes("complete") || lower.includes("finished")) {
            this.addNote("Claude reported completion");
        }

        // Claude asking for permission
        if (lower.includes("allow") || lower.includes("permission") || lower.includes("approve")) {
            this.addNote("Claude needs approval");
            this.updateScratchpad({ currentStep: "Claude waiting for approval" });
        }
    }

    /** Monitor Claude's work until it returns to idle prompt */
    private async monitorClaudeWork(): Promise<void> {
        const maxWaitMs = 300000; // 5 minutes for complex tasks
        const checkIntervalMs = 2000;
        let elapsed = 0;
        let idleCount = 0;

        while (this.isRunning && elapsed < maxWaitMs) {
            await new Promise((r) => setTimeout(r, checkIntervalMs));
            elapsed += checkIntervalMs;

            const buffer = terminalManager.getBuffer(this.terminalId);
            const lines = buffer.split("\n").filter((l) => l.trim());
            const lastLine = lines[lines.length - 1] || "";

            // Claude's idle state: waiting for input with > prompt
            // Usually looks like: "> " at the start of a line
            if (lastLine.trim().startsWith(">") && lastLine.trim().length < 5) {
                idleCount++;
                // Need to see idle state multiple times to confirm
                if (idleCount >= 2) {
                    this.addNote("Claude returned to prompt - task complete");
                    this.updateScratchpad({
                        status: "complete",
                        currentStep: "Done",
                    });
                    break;
                }
            } else {
                idleCount = 0;
            }

            // Update progress
            this.updateScratchpad({
                currentStep: `Claude working... (${Math.floor(elapsed / 1000)}s)`,
            });
        }

        if (elapsed >= maxWaitMs) {
            this.addNote("Timeout - Claude took too long");
            this.updateScratchpad({
                status: "error",
                currentStep: "Timeout",
            });
        }

        this.cleanup();
    }

    /** Stop the agent */
    stop() {
        this.isRunning = false;
        this.updateScratchpad({
            status: "idle",
            currentStep: "Stopped by user",
        });
        this.addNote("Agent stopped");
        this.cleanup();
    }

    /** Cleanup listeners */
    private cleanup() {
        if (this.dataListener) {
            terminalManager.off("data", this.dataListener);
            this.dataListener = null;
        }
        this.isRunning = false;
    }

    /** Get current scratchpad state */
    getScratchpad(): Scratchpad {
        return { ...this.scratchpad };
    }
}

/** Global map of active terminal agents */
export const activeAgents = new Map<string, TerminalAgent>();
