import type { AgentMessage, AgentEvent, ClaudeOptions } from "./types";
import { runClaudeCode, runClaudeCodeStreaming } from "./claude";

export type EventCallback = (event: AgentEvent) => void;

/**
 * AI Agent that uses Claude Code to perform tasks
 */
export class Agent {
    private messages: AgentMessage[] = [];
    private sessionId?: string;
    private eventListeners: Set<EventCallback> = new Set();
    private isRunning = false;

    constructor(
        private cwd: string = process.cwd(),
        private allowedTools: string[] = ["Read", "Write", "Edit", "Bash", "LS"]
    ) { }

    /** Subscribe to agent events */
    subscribe(callback: EventCallback): () => void {
        this.eventListeners.add(callback);
        return () => this.eventListeners.delete(callback);
    }

    /** Emit an event to all listeners */
    private emit(event: Omit<AgentEvent, "timestamp">) {
        const fullEvent: AgentEvent = { ...event, timestamp: Date.now() };
        for (const listener of this.eventListeners) {
            listener(fullEvent);
        }
    }

    /** Get conversation history */
    getHistory(): AgentMessage[] {
        return [...this.messages];
    }

    /** Check if agent is currently running */
    getIsRunning(): boolean {
        return this.isRunning;
    }

    /** Run a single prompt through Claude Code */
    async run(prompt: string): Promise<string> {
        if (this.isRunning) {
            throw new Error("Agent is already running");
        }

        this.isRunning = true;

        // Add user message to history
        this.messages.push({
            role: "user",
            content: prompt,
            timestamp: Date.now(),
        });

        this.emit({ type: "status", data: "Starting Claude Code..." });

        try {
            const options: ClaudeOptions = {
                cwd: this.cwd,
                allowedTools: this.allowedTools,
                sessionId: this.sessionId,
                outputFormat: "json",
            };

            const response = await runClaudeCode(prompt, options);

            // Store session ID for conversation continuity
            if (response.session_id) {
                this.sessionId = response.session_id;
            }

            // Add assistant response to history
            this.messages.push({
                role: "assistant",
                content: response.result,
                timestamp: Date.now(),
            });

            this.emit({ type: "output", data: response.result });
            this.emit({ type: "done", data: "Completed" });

            return response.result;
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            this.emit({ type: "error", data: errorMsg });
            throw error;
        } finally {
            this.isRunning = false;
        }
    }

    /** Run with real-time streaming output */
    async *runStreaming(prompt: string): AsyncGenerator<string> {
        if (this.isRunning) {
            throw new Error("Agent is already running");
        }

        this.isRunning = true;

        this.messages.push({
            role: "user",
            content: prompt,
            timestamp: Date.now(),
        });

        this.emit({ type: "status", data: "Starting Claude Code (streaming)..." });

        let fullOutput = "";

        try {
            const options: ClaudeOptions = {
                cwd: this.cwd,
                allowedTools: this.allowedTools,
            };

            for await (const chunk of runClaudeCodeStreaming(prompt, options)) {
                fullOutput += chunk;
                this.emit({ type: "output", data: chunk });
                yield chunk;
            }

            this.messages.push({
                role: "assistant",
                content: fullOutput,
                timestamp: Date.now(),
            });

            this.emit({ type: "done", data: "Completed" });
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            this.emit({ type: "error", data: errorMsg });
            throw error;
        } finally {
            this.isRunning = false;
        }
    }

    /** Clear conversation history and session */
    reset() {
        this.messages = [];
        this.sessionId = undefined;
        this.emit({ type: "status", data: "Agent reset" });
    }
}

// Test if run directly
if (import.meta.main) {
    console.log("Testing Agent...\n");

    const agent = new Agent();

    agent.subscribe((event) => {
        console.log(`[${event.type}]`, event.data);
    });

    const result = await agent.run("What files are in the current directory?");
    console.log("\nFinal result:", result);
}
