/**
 * Daemon REST Routes
 * Express/Bun route handlers for daemon API endpoints
 *
 * These routes handle incoming REST calls from the daemon:
 * - POST /api/daemon/heartbeat - Daemon health check
 * - POST /api/subagent/:id/status - Agent status updates
 * - POST /api/subagent/:id/complete - Agent completion
 * - POST /api/subagent/:id/log - Agent log streaming
 *
 * Usage with Express:
 * ```typescript
 * import { createDaemonRoutes } from './daemon/routes';
 * import { getDaemonManager } from './daemon/DaemonManager';
 *
 * const daemonManager = getDaemonManager();
 * app.use('/api', createDaemonRoutes(daemonManager));
 * ```
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import type { DaemonManager } from "./DaemonManager";
import type {
  HeartbeatPayload,
  StatusUpdatePayload,
  CompletePayload,
  LogPayload,
} from "./types";

/**
 * Middleware to authenticate daemon requests
 */
function authMiddleware(daemonManager: DaemonManager) {
  return (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing or invalid authorization header" });
    }

    const token = authHeader.slice(7); // Remove "Bearer "
    const auth = daemonManager.authenticateDaemon(token);

    if (!auth) {
      return res.status(401).json({ error: "Invalid token" });
    }

    // Attach daemon info to request
    (req as any).daemonId = auth.daemonId;
    (req as any).userId = auth.userId;

    next();
  };
}

/**
 * Create Express router for daemon endpoints
 */
export function createDaemonRoutes(daemonManager: DaemonManager): Router {
  const router = Router();

  // Apply auth middleware to all routes
  router.use(authMiddleware(daemonManager));

  /**
   * POST /daemon/heartbeat
   * Daemon sends periodic heartbeats to indicate it's alive
   */
  router.post("/daemon/heartbeat", (req: Request, res: Response) => {
    const daemonId = (req as any).daemonId;
    const payload = req.body as HeartbeatPayload;

    if (!payload || typeof payload.activeAgents !== "number") {
      return res.status(400).json({ error: "Invalid heartbeat payload" });
    }

    daemonManager.onHeartbeat(daemonId, payload);

    return res.json({ ok: true });
  });

  /**
   * POST /subagent/:id/status
   * Daemon reports agent status changes
   */
  router.post("/subagent/:id/status", (req: Request, res: Response) => {
    const agentId = req.params.id;
    const payload = req.body as StatusUpdatePayload;

    if (!payload || !payload.status) {
      return res.status(400).json({ error: "Invalid status payload" });
    }

    // Verify this agent belongs to this daemon
    const agent = daemonManager.getAgent(agentId);
    const daemonId = (req as any).daemonId;

    if (!agent) {
      return res.status(404).json({ error: "Agent not found" });
    }

    if (agent.daemonId !== daemonId) {
      return res.status(403).json({ error: "Agent does not belong to this daemon" });
    }

    daemonManager.onAgentStatus(agentId, payload);

    return res.json({ ok: true });
  });

  /**
   * POST /subagent/:id/complete
   * Daemon reports agent completion (success or failure)
   */
  router.post("/subagent/:id/complete", (req: Request, res: Response) => {
    const agentId = req.params.id;
    const payload = req.body as CompletePayload;

    if (!payload || !payload.status) {
      return res.status(400).json({ error: "Invalid complete payload" });
    }

    // Verify this agent belongs to this daemon
    const agent = daemonManager.getAgent(agentId);
    const daemonId = (req as any).daemonId;

    if (!agent) {
      return res.status(404).json({ error: "Agent not found" });
    }

    if (agent.daemonId !== daemonId) {
      return res.status(403).json({ error: "Agent does not belong to this daemon" });
    }

    daemonManager.onAgentComplete(agentId, payload);

    return res.json({ ok: true });
  });

  /**
   * POST /subagent/:id/log
   * Daemon streams agent logs (stdout, stderr, status notes)
   */
  router.post("/subagent/:id/log", (req: Request, res: Response) => {
    const agentId = req.params.id;
    const payload = req.body as LogPayload;

    if (!payload || !payload.type || !payload.content) {
      return res.status(400).json({ error: "Invalid log payload" });
    }

    // Verify this agent belongs to this daemon
    const agent = daemonManager.getAgent(agentId);
    const daemonId = (req as any).daemonId;

    if (!agent) {
      return res.status(404).json({ error: "Agent not found" });
    }

    if (agent.daemonId !== daemonId) {
      return res.status(403).json({ error: "Agent does not belong to this daemon" });
    }

    daemonManager.onAgentLog(agentId, payload);

    return res.json({ ok: true });
  });

  /**
   * GET /daemon/status
   * Get daemon's own status and connected agents
   */
  router.get("/daemon/status", (req: Request, res: Response) => {
    const daemonId = (req as any).daemonId;
    const daemon = daemonManager.getDaemon(daemonId);

    if (!daemon) {
      return res.status(404).json({ error: "Daemon not found" });
    }

    const agents = daemonManager.getAgentsForDaemon(daemonId);

    return res.json({
      daemon: {
        id: daemon.daemonId,
        status: daemon.status,
        lastSeen: daemon.lastSeen,
        activeAgents: daemon.activeAgents,
      },
      agents: agents.map((a) => ({
        id: a.agentId,
        type: a.type,
        status: a.status,
        goal: a.goal,
        createdAt: a.createdAt,
      })),
    });
  });

  return router;
}

/**
 * Create Bun-compatible route handlers (if not using Express)
 * Returns an object with handler functions that can be used with Bun.serve
 */
export function createBunHandlers(daemonManager: DaemonManager) {
  /**
   * Authenticate request and return daemon info
   */
  function authenticate(req: Request): { daemonId: string; userId: string } | null {
    const authHeader = req.headers.get("authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return null;
    }

    const token = authHeader.slice(7);
    return daemonManager.authenticateDaemon(token);
  }

  return {
    /**
     * POST /api/daemon/heartbeat
     */
    async heartbeat(req: Request): Promise<Response> {
      const auth = authenticate(req);
      if (!auth) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }

      try {
        const payload = (await req.json()) as HeartbeatPayload;
        daemonManager.onHeartbeat(auth.daemonId, payload);
        return Response.json({ ok: true });
      } catch {
        return Response.json({ error: "Invalid payload" }, { status: 400 });
      }
    },

    /**
     * POST /api/subagent/:id/status
     */
    async status(req: Request, agentId: string): Promise<Response> {
      const auth = authenticate(req);
      if (!auth) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }

      const agent = daemonManager.getAgent(agentId);
      if (!agent) {
        return Response.json({ error: "Agent not found" }, { status: 404 });
      }
      if (agent.daemonId !== auth.daemonId) {
        return Response.json({ error: "Forbidden" }, { status: 403 });
      }

      try {
        const payload = (await req.json()) as StatusUpdatePayload;
        daemonManager.onAgentStatus(agentId, payload);
        return Response.json({ ok: true });
      } catch {
        return Response.json({ error: "Invalid payload" }, { status: 400 });
      }
    },

    /**
     * POST /api/subagent/:id/complete
     */
    async complete(req: Request, agentId: string): Promise<Response> {
      const auth = authenticate(req);
      if (!auth) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }

      const agent = daemonManager.getAgent(agentId);
      if (!agent) {
        return Response.json({ error: "Agent not found" }, { status: 404 });
      }
      if (agent.daemonId !== auth.daemonId) {
        return Response.json({ error: "Forbidden" }, { status: 403 });
      }

      try {
        const payload = (await req.json()) as CompletePayload;
        daemonManager.onAgentComplete(agentId, payload);
        return Response.json({ ok: true });
      } catch {
        return Response.json({ error: "Invalid payload" }, { status: 400 });
      }
    },

    /**
     * POST /api/subagent/:id/log
     */
    async log(req: Request, agentId: string): Promise<Response> {
      const auth = authenticate(req);
      if (!auth) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }

      const agent = daemonManager.getAgent(agentId);
      if (!agent) {
        return Response.json({ error: "Agent not found" }, { status: 404 });
      }
      if (agent.daemonId !== auth.daemonId) {
        return Response.json({ error: "Forbidden" }, { status: 403 });
      }

      try {
        const payload = (await req.json()) as LogPayload;
        daemonManager.onAgentLog(agentId, payload);
        return Response.json({ ok: true });
      } catch {
        return Response.json({ error: "Invalid payload" }, { status: 400 });
      }
    },

    /**
     * GET /api/daemon/status
     */
    async daemonStatus(req: Request): Promise<Response> {
      const auth = authenticate(req);
      if (!auth) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }

      const daemon = daemonManager.getDaemon(auth.daemonId);
      if (!daemon) {
        return Response.json({ error: "Daemon not found" }, { status: 404 });
      }

      const agents = daemonManager.getAgentsForDaemon(auth.daemonId);

      return Response.json({
        daemon: {
          id: daemon.daemonId,
          status: daemon.status,
          lastSeen: daemon.lastSeen,
          activeAgents: daemon.activeAgents,
        },
        agents: agents.map((a) => ({
          id: a.agentId,
          type: a.type,
          status: a.status,
          goal: a.goal,
          createdAt: a.createdAt,
        })),
      });
    },
  };
}
