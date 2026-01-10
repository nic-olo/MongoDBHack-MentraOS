import type { ServerWebSocket } from "bun";

import { EventEmitter } from "events";

/**
 * Terminal Manager - handles PTY terminals with WebSocket streaming
 */
class TerminalManagerClass extends EventEmitter {
    private terminals: Map<string, {
        proc: ReturnType<typeof Bun.spawn>;
        clients: Set<ServerWebSocket<unknown>>;
        buffer: string;
    }> = new Map();

    /** Generate unique terminal ID */
    private generateId(): string {
        return `term_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    }

    /** Create a new terminal session */
    createTerminal(shell: string = "zsh"): string {
        const id = this.generateId();
        const clients = new Set<ServerWebSocket<unknown>>();
        let buffer = "";

        const proc = Bun.spawn([shell], {
            terminal: {
                cols: 120,
                rows: 30,
                data: (_terminal, data) => {
                    const output = data.toString();

                    // Update internal buffer (keep last 10,000 characters)
                    buffer += output;
                    if (buffer.length > 10000) {
                        buffer = buffer.slice(-10000);
                    }

                    const session = this.terminals.get(id);
                    if (session) session.buffer = buffer;

                    // Emit event for AI agents
                    this.emit("data", { id, data: output });

                    // Broadcast terminal output to all connected WebSocket clients
                    for (const ws of clients) {
                        try {
                            ws.send(JSON.stringify({ type: "output", data: output }));
                        } catch {
                            clients.delete(ws);
                        }
                    }
                },
            },
        });

        this.terminals.set(id, { proc, clients, buffer });

        console.log(`[terminal] Created terminal ${id}`);
        return id;
    }

    /** Subscribe a WebSocket client to a terminal */
    subscribe(terminalId: string, ws: ServerWebSocket<unknown>): boolean {
        const terminal = this.terminals.get(terminalId);
        if (!terminal) return false;

        terminal.clients.add(ws);
        console.log(`[terminal] Client subscribed to ${terminalId}`);
        return true;
    }

    /** Unsubscribe a WebSocket client */
    unsubscribe(terminalId: string, ws: ServerWebSocket<unknown>) {
        const terminal = this.terminals.get(terminalId);
        if (terminal) {
            terminal.clients.delete(ws);
            console.log(`[terminal] Client unsubscribed from ${terminalId}`);
        }
    }

    /** Write input to terminal (from user or AI) */
    write(terminalId: string, input: string): boolean {
        const terminal = this.terminals.get(terminalId);
        if (!terminal?.proc.terminal) return false;

        // Debug: log what's being written
        console.log(`[terminal] write to ${terminalId}: ${JSON.stringify(input)} (bytes: ${Buffer.from(input).toString('hex')})`);

        terminal.proc.terminal.write(input);
        return true;
    }

    /** Resize terminal */
    resize(terminalId: string, cols: number, rows: number): boolean {
        const terminal = this.terminals.get(terminalId);
        if (!terminal?.proc.terminal) return false;

        terminal.proc.terminal.resize(cols, rows);
        return true;
    }

    /** Close a terminal */
    close(terminalId: string) {
        const terminal = this.terminals.get(terminalId);
        if (!terminal) return;

        // Notify clients
        for (const ws of terminal.clients) {
            try {
                ws.send(JSON.stringify({ type: "closed" }));
                ws.close();
            } catch { }
        }

        terminal.proc.terminal?.close();
        this.terminals.delete(terminalId);
        console.log(`[terminal] Closed terminal ${terminalId}`);
    }

    /** Get terminal by ID */
    get(terminalId: string) {
        return this.terminals.get(terminalId);
    }

    /** Get current terminal buffer */
    getBuffer(terminalId: string): string {
        return this.terminals.get(terminalId)?.buffer || "";
    }

    /** List all terminal IDs */
    list(): string[] {
        return Array.from(this.terminals.keys());
    }
}

export const terminalManager = new TerminalManagerClass();
