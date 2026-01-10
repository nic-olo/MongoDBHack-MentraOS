import { terminalManager } from "./terminal";
import { TerminalAgent, activeAgents, agentEvents } from "./terminalAgent";
import type { ServerWebSocket } from "bun";
import type { ScratchpadEvent } from "./types";

const PORT = 3000;

/** WebSocket data structure */
interface WSData {
    terminalId: string;
}

// Serve HTTP and WebSocket
Bun.serve<WSData>({
    port: PORT,
    idleTimeout: 300,

    // WebSocket handlers
    websocket: {
        message(ws: ServerWebSocket<WSData>, message: string | Buffer) {
            try {
                const data = JSON.parse(message.toString());
                const { terminalId } = ws.data;

                if (!terminalId) return;

                switch (data.type) {
                    case "input":
                        // User or AI typing into terminal
                        terminalManager.write(terminalId, data.data);
                        break;

                    case "resize":
                        // Terminal resize
                        terminalManager.resize(terminalId, data.cols, data.rows);
                        break;
                }
            } catch (e) {
                console.error("[ws] Message error:", e);
            }
        },

        open(ws: ServerWebSocket<WSData>) {
            const { terminalId } = ws.data;
            if (terminalId) {
                const success = terminalManager.subscribe(terminalId, ws as any);
                if (!success) {
                    ws.send(JSON.stringify({ type: "error", message: "Terminal not found" }));
                    ws.close();
                } else {
                    console.log(`[ws] Client connected to terminal ${terminalId}`);
                }
            }
        },

        close(ws: ServerWebSocket<WSData>) {
            const { terminalId } = ws.data;
            if (terminalId) {
                terminalManager.unsubscribe(terminalId, ws as any);
            }
            console.log("[ws] Client disconnected");
        },
    },

    async fetch(req, server) {
        const url = new URL(req.url);
        const path = url.pathname;

        // CORS headers
        const corsHeaders = {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        };

        if (req.method === "OPTIONS") {
            return new Response(null, { headers: corsHeaders });
        }

        // === WebSocket Upgrade ===
        if (path === "/ws/terminal") {
            const terminalId = url.searchParams.get("id");
            if (!terminalId) {
                return new Response("Missing terminal ID", { status: 400 });
            }

            if (server.upgrade(req, { data: { terminalId } })) {
                return undefined; // Handled by Bun.serve
            }
            return new Response("Upgrade failed", { status: 500 });
        }

        // === Terminal API ===

        // POST /api/terminal - Create new terminal
        if (path === "/api/terminal" && req.method === "POST") {
            const terminalId = terminalManager.createTerminal();
            return Response.json({ terminalId }, { headers: corsHeaders });
        }

        // GET /api/terminal - List terminals
        if (path === "/api/terminal" && req.method === "GET") {
            return Response.json(
                { terminals: terminalManager.list() },
                { headers: corsHeaders }
            );
        }

        // DELETE /api/terminal/:id - Close terminal
        if (path.startsWith("/api/terminal/") && req.method === "DELETE") {
            const terminalId = path.split("/api/terminal/")[1];
            terminalManager.close(terminalId);
            return Response.json({ ok: true }, { headers: corsHeaders });
        }

        // POST /api/terminal/:id/write - Write to terminal (for AI agent)
        if (path.match(/^\/api\/terminal\/[^/]+\/write$/) && req.method === "POST") {
            const terminalId = path.split("/api/terminal/")[1].split("/write")[0];
            const body = await req.json() as { input?: string };

            if (!body.input) {
                return Response.json(
                    { error: "Missing input" },
                    { status: 400, headers: corsHeaders }
                );
            }

            const success = terminalManager.write(terminalId, body.input);
            return Response.json({ success }, { headers: corsHeaders });
        }

        // POST /api/terminal/:id/ai - Start AI control loop
        if (path.match(/^\/api\/terminal\/[^/]+\/ai$/) && req.method === "POST") {
            const terminalId = path.split("/api/terminal/")[1].split("/ai")[0];
            const body = await req.json() as { goal?: string };

            if (!body.goal) {
                return Response.json({ error: "Missing goal" }, { status: 400, headers: corsHeaders });
            }

            let agent = activeAgents.get(terminalId);
            if (!agent) {
                agent = new TerminalAgent(terminalId);
                activeAgents.set(terminalId, agent);
            }

            // Start async (non-blocking)
            agent.start(body.goal);

            return Response.json({ status: "AI started", terminalId }, { headers: corsHeaders });
        }

        // DELETE /api/terminal/:id/ai - Stop AI control loop
        if (path.match(/^\/api\/terminal\/[^/]+\/ai$/) && req.method === "DELETE") {
            const terminalId = path.split("/api/terminal/")[1].split("/ai")[0];
            const agent = activeAgents.get(terminalId);

            if (agent) {
                agent.stop();
                activeAgents.delete(terminalId);
                return Response.json({ status: "AI stopped" }, { headers: corsHeaders });
            }

            return Response.json({ error: "No AI agent running on this terminal" }, { status: 404, headers: corsHeaders });
        }

        // GET /api/terminal/:id/scratchpad - Get current scratchpad
        if (path.match(/^\/api\/terminal\/[^/]+\/scratchpad$/) && req.method === "GET") {
            const terminalId = path.split("/api/terminal/")[1].split("/scratchpad")[0];
            const agent = activeAgents.get(terminalId);

            if (agent) {
                return Response.json({ scratchpad: agent.getScratchpad() }, { headers: corsHeaders });
            }

            return Response.json({ scratchpad: null }, { headers: corsHeaders });
        }

        // GET /api/events - SSE for scratchpad updates
        if (path === "/api/events" && req.method === "GET") {
            const stream = new ReadableStream({
                start(controller) {
                    const encoder = new TextEncoder();

                    controller.enqueue(
                        encoder.encode(`data: ${JSON.stringify({ type: "connected" })}\n\n`)
                    );

                    const onScratchpad = (event: ScratchpadEvent) => {
                        try {
                            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
                        } catch { }
                    };

                    agentEvents.on("scratchpad", onScratchpad);

                    const heartbeat = setInterval(() => {
                        try {
                            controller.enqueue(encoder.encode(`: heartbeat\n\n`));
                        } catch {
                            clearInterval(heartbeat);
                            agentEvents.off("scratchpad", onScratchpad);
                        }
                    }, 5000);

                    req.signal.addEventListener("abort", () => {
                        clearInterval(heartbeat);
                        agentEvents.off("scratchpad", onScratchpad);
                        controller.close();
                    });
                },
            });

            return new Response(stream, {
                headers: {
                    ...corsHeaders,
                    "Content-Type": "text/event-stream",
                    "Cache-Control": "no-cache",
                    Connection: "keep-alive",
                },
            });
        }

        // === Static Files ===
        let filePath = path === "/" ? "/index.html" : path;
        const file = Bun.file(`./public${filePath}`);

        if (await file.exists()) {
            const response = new Response(file);
            // Transfer headers
            for (const [key, value] of Object.entries(corsHeaders)) {
                response.headers.set(key, value);
            }
            response.headers.set("Content-Type", getContentType(filePath));
            return response;
        }

        return new Response("Not Found", { status: 404, headers: corsHeaders });
    },
});

function getContentType(path: string): string {
    if (path.endsWith(".html")) return "text/html";
    if (path.endsWith(".css")) return "text/css";
    if (path.endsWith(".js")) return "application/javascript";
    if (path.endsWith(".json")) return "application/json";
    return "text/plain";
}

console.log(`🤖 Bun Agent running at http://localhost:${PORT}`);
console.log(`   Terminal: POST /api/terminal, WS /ws/terminal?id=...`);
