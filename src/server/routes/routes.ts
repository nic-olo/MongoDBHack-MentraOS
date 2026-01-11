/**
 * =============================================================================
 * Web Routes Module
 * =============================================================================
 *
 * This module contains all API endpoints for the camera application.
 *
 * Routes included:
 * - GET /api/photo-stream - SSE endpoint for real-time photo updates
 * - GET /api/transcription-stream - SSE endpoint for real-time transcriptions
 * - POST /api/play-audio - Play audio to MentraOS glasses
 * - POST /api/speak - Text-to-speech to MentraOS glasses
 * - POST /api/stop-audio - Stop audio playback
 * - GET /api/theme-preference - Get user's theme preference from Simple Storage
 * - POST /api/theme-preference - Set user's theme preference in Simple Storage
 * - GET /api/latest-photo - Get metadata for the latest photo
 * - GET /api/photo/:requestId - Get the actual photo image data
 * - GET /api/photo-base64/:requestId - Get photo as base64 JSON
 * - POST /api/master-agent/query - Submit query to MasterAgent
 * - GET /api/master-agent/task/:taskId - Get task status/result
 *
 * Note: The React frontend is served from the root route by index.ts
 *
 * =============================================================================
 */

import { Express, Response } from "express";
import { getDb, isConnected } from "../db/mongo";
import { getMasterAgent } from "../master-agent";
import { getConversationService } from "../conversation";
import { setupConversationRoutes } from "./conversation.routes.js";
import { getDaemonManager } from "../daemon";

// Store SSE clients with userId mapping
interface SSEClient {
  response: Response;
  userId: string;
}

const sseClients: Set<SSEClient> = new Set();
const transcriptionClients: Set<SSEClient> = new Set();

// Store active sessions for audio playback
const activeSessions: Map<string, any> = new Map();

interface StoredPhoto {
  requestId: string;
  buffer: Buffer;
  timestamp: Date;
  userId: string;
  mimeType: string;
  filename: string;
  size: number;
}

/**
 * Helper function to broadcast photo to specific user's SSE clients
 */
export function broadcastPhotoToClients(photo: StoredPhoto): void {
  const base64Data = photo.buffer.toString("base64");
  const photoData = {
    requestId: photo.requestId,
    timestamp: photo.timestamp.getTime(),
    mimeType: photo.mimeType,
    filename: photo.filename,
    size: photo.size,
    userId: photo.userId,
    base64: base64Data,
    dataUrl: `data:${photo.mimeType};base64,${base64Data}`,
  };

  const message = `data: ${JSON.stringify(photoData)}\n\n`;

  sseClients.forEach((client) => {
    // Only send to clients belonging to this user
    if (client.userId === photo.userId) {
      try {
        client.response.write(message);
      } catch (error) {
        // Remove dead clients
        sseClients.delete(client);
      }
    }
  });
}

/**
 * Helper function to broadcast transcription to specific user's SSE clients
 */
export function broadcastTranscriptionToClients(
  text: string,
  isFinal: boolean,
  userId: string,
): void {
  const transcriptionData = {
    text,
    isFinal,
    timestamp: Date.now(),
    userId,
  };

  const message = `data: ${JSON.stringify(transcriptionData)}\n\n`;

  transcriptionClients.forEach((client) => {
    // Only send to clients belonging to this user
    if (client.userId === userId) {
      try {
        client.response.write(message);
      } catch (error) {
        // Remove dead clients
        transcriptionClients.delete(client);
      }
    }
  });
}

/**
 * Register an active session for audio playback
 */
export function registerSession(userId: string, session: any): void {
  activeSessions.set(userId, session);
}

/**
 * Unregister a session
 */
export function unregisterSession(userId: string): void {
  activeSessions.delete(userId);
}

/**
 * Set up all web routes for the application
 */
export function setupWebviewRoutes(
  app: Express,
  photosMap: Map<string, StoredPhoto>,
): void {
  // Setup conversation history routes
  setupConversationRoutes(app);

  // ==========================================================================
  // Debug Endpoints (no auth required)
  // ==========================================================================

  /**
   * GET /api/debug/daemons
   * Comprehensive debug endpoint for daemon connections
   * Shows all connected daemons, agents, and helps diagnose connection issues
   */
  app.get("/api/debug/daemons", (req: any, res: any) => {
    const daemonManager = getDaemonManager();
    const debugInfo = daemonManager.getDebugInfo();

    return res.json({
      timestamp: new Date().toISOString(),
      ...debugInfo,
      hints: {
        daemonOffline:
          "If daemon shows offline: 1) Is daemon running? 2) Is WebSocket connected? 3) Does userId match?",
        userIdMismatch:
          "Frontend userId must match daemon's email/userId for agent spawning to work",
        checkConnections:
          "The 'connections' array shows active WebSocket connections by daemonId",
        howToStart: "Start daemon with: cd daemon && bun run start",
      },
    });
  });

  /**
   * GET /api/debug/daemons/:userId
   * Debug endpoint for a specific user - diagnoses why agent spawning might fail
   */
  app.get("/api/debug/daemons/:userId", (req: any, res: any) => {
    const { userId } = req.params;
    const daemonManager = getDaemonManager();

    // Get all daemons
    const allDaemons = daemonManager.getAllDaemons();

    // Find daemons for this user
    const userDaemons = daemonManager.getDaemonsForUser(userId);
    const onlineDaemon = daemonManager.getOnlineDaemonForUser(userId);

    // Get all agents for user's daemons
    const userAgents = userDaemons.flatMap((d: any) =>
      daemonManager.getAgentsForDaemon(d.daemonId),
    );

    // Check for potential matches (case-insensitive, partial)
    const potentialMatches = allDaemons.filter(
      (d: any) =>
        d.userId.toLowerCase().includes(userId.toLowerCase()) ||
        userId.toLowerCase().includes(d.userId.toLowerCase()),
    );

    return res.json({
      timestamp: new Date().toISOString(),
      queryUserId: userId,
      result: {
        foundDaemons: userDaemons.length,
        onlineDaemon: onlineDaemon
          ? {
              daemonId: onlineDaemon.daemonId,
              userId: onlineDaemon.userId,
              status: onlineDaemon.status,
              lastSeen: onlineDaemon.lastSeen,
            }
          : null,
        canSpawnAgent: !!onlineDaemon,
      },
      userDaemons,
      userAgents,
      debugging: {
        allRegisteredUserIds: allDaemons.map((d: any) => d.userId),
        potentialMatches: potentialMatches.map((d: any) => ({
          daemonId: d.daemonId,
          userId: d.userId,
          status: d.status,
        })),
        suggestion: !onlineDaemon
          ? potentialMatches.length > 0
            ? `Found potential match. Try using userId: "${potentialMatches[0].userId}" instead`
            : "No daemon found. Make sure daemon is running and connected with this userId"
          : "Daemon is online and ready to spawn agents",
      },
    });
  });

  // SSE Route: Real-time photo stream
  app.get("/api/photo-stream", (req: any, res: any) => {
    // Get userId from query parameter
    const userId = req.query.userId as string;

    if (!userId) {
      res.status(400).json({ error: "userId is required" });
      return;
    }

    console.log(`[SSE Photo] Client connected for user: ${userId}`);

    // Set up SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("Access-Control-Allow-Origin", "*");

    // Create client object
    const client: SSEClient = { response: res, userId };

    // Add this client to the set
    sseClients.add(client);

    // Send initial connection message
    res.write(`data: ${JSON.stringify({ type: "connected", userId })}\n\n`);

    // Send existing photos for this user
    photosMap.forEach((photo) => {
      if (photo.userId === userId) {
        const base64Data = photo.buffer.toString("base64");
        const photoData = {
          requestId: photo.requestId,
          timestamp: photo.timestamp.getTime(),
          mimeType: photo.mimeType,
          filename: photo.filename,
          size: photo.size,
          userId: photo.userId,
          base64: base64Data,
          dataUrl: `data:${photo.mimeType};base64,${base64Data}`,
        };
        res.write(`data: ${JSON.stringify(photoData)}\n\n`);
      }
    });

    // Handle client disconnect
    req.on("close", () => {
      console.log(`[SSE Photo] Client disconnected for user: ${userId}`);
      sseClients.delete(client);
    });
  });

  // SSE Route: Real-time transcription stream
  app.get("/api/transcription-stream", (req: any, res: any) => {
    // Get userId from query parameter
    const userId = req.query.userId as string;

    if (!userId) {
      res.status(400).json({ error: "userId is required" });
      return;
    }

    console.log(`[SSE Transcription] Client connected for user: ${userId}`);

    // Set up SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("Access-Control-Allow-Origin", "*");

    // Create client object
    const client: SSEClient = { response: res, userId };

    // Add this client to the set
    transcriptionClients.add(client);

    // Send initial connection message
    res.write(`data: ${JSON.stringify({ type: "connected", userId })}\n\n`);

    // Handle client disconnect
    req.on("close", () => {
      console.log(
        `[SSE Transcription] Client disconnected for user: ${userId}`,
      );
      transcriptionClients.delete(client);
    });
  });

  // Route: Play audio from URL
  app.post("/api/play-audio", async (req: any, res: any) => {
    try {
      const { audioUrl, userId } = req.body;

      if (!audioUrl) {
        res.status(400).json({ error: "audioUrl is required" });
        return;
      }

      if (!userId) {
        res.status(400).json({ error: "userId is required" });
        return;
      }

      // Get the session for this specific user
      const session = activeSessions.get(userId);

      if (!session) {
        res.status(404).json({ error: `No active session for user ${userId}` });
        return;
      }

      console.log(`[Audio] Playing audio for user: ${userId}`);
      console.log(`[Audio] Audio URL: ${audioUrl}`);

      // Play the audio
      const result = await session.audio.playAudio({ audioUrl });
      console.log(`[Audio] Play audio result:`, result);

      res.json({
        success: true,
        message: "Audio playback started",
        userId,
        audioUrl,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Route: Text-to-speech
  app.post("/api/speak", async (req: any, res: any) => {
    try {
      const { text, userId } = req.body;

      if (!text) {
        res.status(400).json({ error: "text is required" });
        return;
      }

      if (!userId) {
        res.status(400).json({ error: "userId is required" });
        return;
      }

      // Get the session for this specific user
      const session = activeSessions.get(userId);

      if (!session) {
        res.status(404).json({ error: `No active session for user ${userId}` });
        return;
      }

      console.log(`[Speak] Speaking text for user: ${userId}`);

      // Speak the text
      await session.audio.speak(text);

      res.json({ success: true, message: "Text-to-speech started", userId });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Route: Stop audio
  app.post("/api/stop-audio", async (req: any, res: any) => {
    try {
      const { userId } = req.body;

      if (!userId) {
        res.status(400).json({ error: "userId is required" });
        return;
      }

      // Get the session for this specific user
      const session = activeSessions.get(userId);

      if (!session) {
        res.status(404).json({ error: `No active session for user ${userId}` });
        return;
      }

      console.log(`[Audio] Stopping audio for user: ${userId}`);

      // Stop the audio
      await session.audio.stopAudio();

      res.json({ success: true, message: "Audio stopped", userId });
    } catch (error: any) {
      console.error("Error stopping audio:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Route: Set theme preference in Simple Storage

  // Route 1: Get the latest photo metadata for a specific user
  app.get("/api/latest-photo", (req: any, res: any) => {
    const userId = req.query.userId as string;

    if (!userId) {
      res.status(400).json({ error: "userId is required" });
      return;
    }

    // Find the most recent photo for this user
    const userPhotos = Array.from(photosMap.values())
      .filter((photo) => photo.userId === userId)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    if (userPhotos.length === 0) {
      res.status(404).json({ error: "No photos available for this user" });
      return;
    }

    const latestPhoto = userPhotos[0];

    res.json({
      requestId: latestPhoto.requestId,
      timestamp: latestPhoto.timestamp.getTime(),
      userId: latestPhoto.userId,
      hasPhoto: true,
    });
  });

  // Route 2: Get the actual photo image data
  app.get("/api/photo/:requestId", (req: any, res: any) => {
    const requestId = req.params.requestId;
    const userId = req.query.userId as string;

    if (!userId) {
      res.status(400).json({ error: "userId is required" });
      return;
    }

    const photo = photosMap.get(requestId);

    if (!photo) {
      res.status(404).json({ error: "Photo not found" });
      return;
    }

    // Verify this photo belongs to the requesting user
    if (photo.userId !== userId) {
      res
        .status(403)
        .json({ error: "Access denied: photo belongs to different user" });
      return;
    }

    res.set({
      "Content-Type": photo.mimeType,
      "Cache-Control": "no-cache",
    });

    res.send(photo.buffer);
  });

  // Route 3: Get photo as base64 JSON
  app.get("/api/photo-base64/:requestId", (req: any, res: any) => {
    const requestId = req.params.requestId;
    const userId = req.query.userId as string;

    if (!userId) {
      res.status(400).json({ error: "userId is required" });
      return;
    }

    const photo = photosMap.get(requestId);

    if (!photo) {
      res.status(404).json({ error: "Photo not found" });
      return;
    }

    // Verify this photo belongs to the requesting user
    if (photo.userId !== userId) {
      res
        .status(403)
        .json({ error: "Access denied: photo belongs to different user" });
      return;
    }

    const base64Data = photo.buffer.toString("base64");

    res.json({
      requestId: photo.requestId,
      timestamp: photo.timestamp.getTime(),
      mimeType: photo.mimeType,
      filename: photo.filename,
      size: photo.size,
      userId: photo.userId,
      base64: base64Data,
      dataUrl: `data:${photo.mimeType};base64,${base64Data}`,
    });
  });

  // ==========================================================================
  // Master Agent Routes (Direct - No Proxy)
  // ==========================================================================

  /**
   * Route: Submit query to Master Agent (returns task ID)
   * POST /api/master-agent/query
   *
   * This route:
   * 1. Creates a task in MongoDB
   * 2. Returns taskId immediately (non-blocking)
   * 3. Processes the query in the background with MasterAgent
   * 4. Client polls GET /api/master-agent/task/:taskId for result
   */
  app.post("/api/master-agent/query", async (req: any, res: any) => {
    try {
      const { userId, query } = req.body;

      // Validation: Required fields
      if (!userId) {
        return res.status(400).json({
          error: "userId is required",
          code: "MISSING_USER_ID",
        });
      }

      if (!query) {
        return res.status(400).json({
          error: "query is required",
          code: "MISSING_QUERY",
        });
      }

      // Validation: Type and content
      if (typeof userId !== "string" || userId.trim() === "") {
        return res.status(400).json({
          error: "userId must be a non-empty string",
          code: "INVALID_USER_ID",
        });
      }

      if (typeof query !== "string" || query.trim() === "") {
        return res.status(400).json({
          error: "query must be a non-empty string",
          code: "INVALID_QUERY",
        });
      }

      // Validation: Length limit
      const MAX_QUERY_LENGTH = 4000;
      if (query.length > MAX_QUERY_LENGTH) {
        return res.status(400).json({
          error: `query must not exceed ${MAX_QUERY_LENGTH} characters`,
          code: "QUERY_TOO_LONG",
          userId,
        });
      }

      // Check MongoDB connection
      if (!isConnected()) {
        return res.status(503).json({
          error: "Database not connected",
          code: "DB_NOT_CONNECTED",
        });
      }

      const sanitizedQuery = query.trim();
      const sanitizedUserId = userId.trim();

      console.log(
        `[Master Agent API] Submitting query from user ${sanitizedUserId}`,
      );
      console.log(`[Master Agent API] Query: "${sanitizedQuery}"`);

      // Get or create conversation for this user
      const conversationService = getConversationService();
      const conversation =
        await conversationService.getOrCreateConversation(sanitizedUserId);

      // Generate task ID
      const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      // Create task in MongoDB
      const db = getDb();
      await db.collection("tasks").insertOne({
        taskId,
        userId: sanitizedUserId,
        conversationId: conversation.conversationId,
        query: sanitizedQuery,
        status: "processing",
        agentSpawned: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Add user message to conversation
      await conversationService.addUserMessage(
        conversation.conversationId,
        sanitizedQuery,
      );

      // Return task ID immediately (non-blocking)
      res.json({
        success: true,
        task_id: taskId,
        status: "processing",
        message: "Master Agent is processing your query",
        userId: sanitizedUserId,
      });

      // Process query in background (don't await)
      const masterAgent = getMasterAgent(sanitizedUserId);
      masterAgent
        .processQuery(taskId, sanitizedQuery, conversation.conversationId)
        .catch((error) => {
          console.error(
            `[Master Agent API] Background processing error for task ${taskId}:`,
            error,
          );
        });
    } catch (error: any) {
      console.error("[Master Agent API] Error:", error);

      res.status(500).json({
        error: "Internal server error",
        code: "INTERNAL_ERROR",
        message: error.message || String(error),
      });
    }
  });

  /**
   * Route: Get task status and results
   * GET /api/master-agent/task/:taskId
   */
  app.get("/api/master-agent/task/:taskId", async (req: any, res: any) => {
    try {
      const { taskId } = req.params;
      const userId = req.query.userId as string;

      if (!userId) {
        return res.status(400).json({
          error: "userId is required",
          code: "MISSING_USER_ID",
        });
      }

      // Check MongoDB connection
      if (!isConnected()) {
        return res.status(503).json({
          error: "Database not connected",
          code: "DB_NOT_CONNECTED",
        });
      }

      // Get task from MongoDB
      const db = getDb();
      const task = await db.collection("tasks").findOne({ taskId });

      if (!task) {
        return res.status(404).json({
          error: "Task not found",
          code: "TASK_NOT_FOUND",
          task_id: taskId,
        });
      }

      // Verify task belongs to user
      if (task.userId !== userId) {
        return res.status(403).json({
          error: "Access denied",
          code: "ACCESS_DENIED",
          task_id: taskId,
        });
      }

      // Return task data
      res.json({
        taskId: task.taskId,
        query: task.query,
        status: task.status,
        result: task.result,
        error: task.error,
        processingTimeMs: task.processingTimeMs,
        agentSpawned: task.agentSpawned,
        createdAt: task.createdAt,
        completedAt: task.completedAt,
        userId: task.userId,
      });
    } catch (error: any) {
      console.error("[Master Agent API] Error:", error);

      res.status(500).json({
        error: "Internal server error",
        code: "INTERNAL_ERROR",
        message: error.message || String(error),
      });
    }
  });

  /**
   * Route: Health check for Master Agent
   * GET /api/master-agent/health
   */
  app.get("/api/master-agent/health", async (_req: any, res: any) => {
    const dbConnected = isConnected();

    res.json({
      status: dbConnected ? "healthy" : "degraded",
      service: "Master Agent (integrated)",
      database: dbConnected ? "connected" : "disconnected",
      timestamp: new Date().toISOString(),
    });
  });

  /**
   * Route: Query agent status from DaemonManager
   * POST /api/master-agent/agent-status
   *
   * This endpoint queries the status of agents managed by the DaemonManager.
   * The query is processed by the Master Agent to provide intelligent status summaries.
   */
  app.post("/api/master-agent/agent-status", async (req: any, res: any) => {
    try {
      const { userId, query } = req.body;

      // Validation: Required fields
      if (!userId) {
        return res.status(400).json({
          error: "userId is required",
          code: "MISSING_USER_ID",
        });
      }

      if (!query) {
        return res.status(400).json({
          error: "query is required",
          code: "MISSING_QUERY",
        });
      }

      // Validation: Type and content
      if (typeof userId !== "string" || userId.trim() === "") {
        return res.status(400).json({
          error: "userId must be a non-empty string",
          code: "INVALID_USER_ID",
        });
      }

      if (typeof query !== "string" || query.trim() === "") {
        return res.status(400).json({
          error: "query must be a non-empty string",
          code: "INVALID_QUERY",
        });
      }

      const sanitizedQuery = query.trim();
      const sanitizedUserId = userId.trim();

      console.log(
        `[Agent Status API] Querying agent status for user ${sanitizedUserId}: "${sanitizedQuery}"`,
      );

      // Get DaemonManager instance
      const { getDaemonManager } = await import("../daemon");
      const daemonManager = getDaemonManager();

      // Get all daemons for this user
      const userDaemons = daemonManager.getDaemonsForUser(sanitizedUserId);

      // Get all agents across all user's daemons
      const allAgents = userDaemons.flatMap((daemon) =>
        daemonManager.getAgentsForDaemon(daemon.daemonId),
      );

      // Build context for Master Agent
      const statusContext = {
        daemons: userDaemons.map((d) => ({
          daemonId: d.daemonId,
          name: d.name,
          status: d.status,
          lastSeen: d.lastSeen,
          activeAgents: d.activeAgents,
        })),
        agents: allAgents.map((a) => ({
          agentId: a.agentId,
          type: a.type,
          status: a.status,
          goal: a.goal,
          currentStep: a.currentStep,
          notes: a.notes,
          result: a.result,
          error: a.error,
          executionTimeMs: a.executionTimeMs,
          createdAt: a.createdAt,
          startedAt: a.startedAt,
          completedAt: a.completedAt,
        })),
        totalDaemons: userDaemons.length,
        onlineDaemons: userDaemons.filter((d) => d.status === "online").length,
        totalAgents: allAgents.length,
        activeAgents: allAgents.filter(
          (a) => a.status === "running" || a.status === "initializing",
        ).length,
        completedAgents: allAgents.filter((a) => a.status === "completed")
          .length,
        failedAgents: allAgents.filter((a) => a.status === "failed").length,
      };

      // Build enhanced query for Master Agent with status context
      const enhancedQuery = `
User Query: ${sanitizedQuery}

AGENT STATUS CONTEXT:
${JSON.stringify(statusContext, null, 2)}

Please analyze the agent status data above and respond to the user's query about agent status.
Provide a clear, concise summary with relevant details about daemon and agent states.
`;

      console.log(
        `[Agent Status API] Found ${statusContext.totalAgents} agents for user`,
      );

      // Generate task ID for this status query
      const taskId = `task_status_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

      // Get or create a conversation for this user's status queries
      const conversationService = getConversationService();
      const statusConversation =
        await conversationService.getOrCreateConversation(sanitizedUserId);

      // Store task in database
      const db = getDb();
      await db.collection("tasks").insertOne({
        taskId,
        userId: sanitizedUserId,
        conversationId: statusConversation.conversationId,
        query: enhancedQuery,
        status: "processing",
        agentSpawned: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Return task ID immediately (non-blocking)
      res.json({
        success: true,
        task_id: taskId,
        status: "processing",
        message: "Analyzing agent status...",
        userId: sanitizedUserId,
        statusSummary: {
          totalAgents: statusContext.totalAgents,
          activeAgents: statusContext.activeAgents,
          completedAgents: statusContext.completedAgents,
          failedAgents: statusContext.failedAgents,
          onlineDaemons: statusContext.onlineDaemons,
        },
      });

      // Process query in background using integrated MasterAgent
      const masterAgent = getMasterAgent(sanitizedUserId);
      masterAgent
        .processQuery(taskId, enhancedQuery, statusConversation.conversationId)
        .catch((error) => {
          console.error(
            `[Agent Status API] Background processing error for task ${taskId}:`,
            error,
          );
        });
    } catch (error: any) {
      console.error("[Agent Status API] Error:", error);

      res.status(500).json({
        error: "Internal server error",
        code: "INTERNAL_ERROR",
        message: error.message || String(error),
      });
    }
  });

  // Note: The /webview EJS route has been removed.
  // The React frontend is now served from the root route (/) by the SPA fallback in index.ts
}

/**
 * Helper function to call Master Agent from transcription/voice commands
 * Returns the task ID immediately for async processing
 *
 * Now uses integrated MasterAgent directly (no external server)
 */
export async function callMasterAgentFromVoice(
  userId: string,
  query: string,
  onProgress?: (message: string) => void,
): Promise<string> {
  try {
    console.log(`[Master Agent Voice] 📡 Processing query directly`);
    console.log(`[Master Agent Voice] 👤 User: ${userId}`);
    console.log(`[Master Agent Voice] 📝 Query: "${query}"`);
    if (onProgress) onProgress("Processing your command...");

    // Check MongoDB connection
    if (!isConnected()) {
      throw new Error("Database not connected");
    }

    // Get or create conversation
    const conversationService = getConversationService();
    const conversation =
      await conversationService.getOrCreateConversation(userId);

    // Generate task ID
    const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Create task in MongoDB
    const db = getDb();
    await db.collection("tasks").insertOne({
      taskId,
      userId,
      conversationId: conversation.conversationId,
      query,
      status: "processing",
      agentSpawned: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Add user message to conversation
    await conversationService.addUserMessage(
      conversation.conversationId,
      query,
    );

    console.log(`[Master Agent Voice] ✅ Task created with ID: ${taskId}`);

    // Process query in background (don't await)
    const masterAgent = getMasterAgent(userId);
    masterAgent
      .processQuery(taskId, query, conversation.conversationId)
      .catch((error) => {
        console.error(
          `[Master Agent Voice] Background processing error for task ${taskId}:`,
          error,
        );
      });

    return taskId;
  } catch (error: any) {
    console.error("[Master Agent Voice] ❌ Exception caught:", error);
    throw error;
  }
}

/**
 * Helper function to poll Master Agent task and log results
 * This runs in the background and logs the result when ready
 * (Audio speaking is disabled for now - results are logged to console)
 */
export async function pollAndSpeakResult(
  taskId: string,
  userId: string,
  session: any,
  logger?: any,
  glassesDisplay?: any,
): Promise<void> {
  const maxAttempts = 150; // 5 minutes max (at 2s intervals)
  let attempts = 0;

  const log = logger || console;

  console.log("\n========================================");
  console.log("🔄 STARTING TASK POLLING");
  console.log(`Task ID: ${taskId}`);
  console.log(`User: ${userId}`);
  console.log(`Max attempts: ${maxAttempts} (5 minutes)`);
  console.log("========================================\n");

  while (attempts < maxAttempts) {
    try {
      attempts++;
      console.log(`[Poll #${attempts}] 🔍 Checking task status...`);

      // Show polling progress on glasses
      if (glassesDisplay && attempts % 3 === 0) {
        // Update every 3 polls (6 seconds)
        await glassesDisplay.showPollingStatus(attempts, maxAttempts);
      }

      // Check MongoDB connection
      if (!isConnected()) {
        console.log(`[Poll #${attempts}] ❌ Database not connected`);
        log.error(`[Master Agent Voice] Database not connected`);
        if (glassesDisplay) {
          await glassesDisplay.showError("Database not connected");

          // Clear display after 5 seconds
          setTimeout(async () => {
            console.log(
              `[Display] 🧹 Clearing HTTP error display for user ${userId}`,
            );
            await glassesDisplay.clear();
          }, 5000);
        }
        break;
      }

      // Query task from MongoDB directly
      const db = getDb();
      const taskData = await db.collection("tasks").findOne({ taskId });

      if (!taskData) {
        console.log(`[Poll #${attempts}] ❌ Task not found in database`);
        log.error(`[Master Agent Voice] Task ${taskId} not found`);
        break;
      }

      console.log(`[Poll #${attempts}] 📊 Status: ${taskData.status}`);

      if (taskData.status === "completed" && taskData.result) {
        console.log("\n========================================");
        console.log("✅ TASK COMPLETED SUCCESSFULLY");
        console.log(`Task ID: ${taskId}`);
        console.log(`User: ${userId}`);
        console.log(`Result type: ${taskData.result.type}`);
        console.log(`Agent spawned: ${taskData.agentSpawned}`);
        console.log(`Processing time: ${taskData.processingTimeMs || 0}ms`);
        console.log("========================================\n");

        console.log("📝 MASTER AGENT RESPONSE:");
        console.log("----------------------------------------");
        console.log("Glasses: " + taskData.result.glassesDisplay);
        console.log(
          "Webview: " +
            (taskData.result.webviewContent?.substring(0, 200) || "N/A") +
            "...",
        );
        console.log("----------------------------------------\n");

        // Log the result (audio speaking disabled for now)
        log.info(`[Master Agent Voice] Task completed for user ${userId}`);

        // Show response on glasses (use glassesDisplay text)
        if (glassesDisplay) {
          await glassesDisplay.showResponse(
            taskData.result.glassesDisplay || taskData.result.webviewContent,
          );

          // Clear display after 10 seconds
          setTimeout(async () => {
            console.log(`[Display] 🧹 Clearing display for user ${userId}`);
            await glassesDisplay.clear();
          }, 10000);
        }

        // TODO: Re-enable audio when ready
        // await session.audio.speak(taskData.result.synthesis);

        console.log("\n========================================");
        console.log("✅ RESULT DISPLAYED ON GLASSES");
        console.log(`Task ID: ${taskId}`);
        console.log(`User: ${userId}`);
        console.log("Status: Complete - display will clear in 10 seconds");
        console.log("========================================\n");
        break;
      } else if (taskData.status === "failed") {
        console.log("\n========================================");
        console.log("❌ TASK FAILED");
        console.log(`Task ID: ${taskId}`);
        console.log(`User: ${userId}`);
        console.log(`Error: ${taskData.error}`);
        console.log("========================================\n");

        log.error(`[Master Agent Voice] Task failed: ${taskData.error}`);

        // Show error on glasses
        if (glassesDisplay) {
          await glassesDisplay.showError(`Task failed: ${taskData.error}`);

          // Clear display after 5 seconds
          setTimeout(async () => {
            console.log(
              `[Display] 🧹 Clearing error display for user ${userId}`,
            );
            await glassesDisplay.clear();
          }, 5000);
        }

        // TODO: Re-enable audio when ready
        // await session.audio.speak('Sorry, I encountered an error processing your request.');
        break;
      }

      // Still processing
      console.log(
        `[Poll #${attempts}] ⏳ Still processing, waiting 2 seconds...`,
      );
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch (error: any) {
      console.log(`[Poll #${attempts}] ❌ Polling exception:`, error);
      log.error(`[Master Agent Voice] Polling error:`, error);
      break;
    }
  }

  if (attempts >= maxAttempts) {
    console.log("\n========================================");
    console.log("⏱️  TASK TIMEOUT");
    console.log(`Task ID: ${taskId}`);
    console.log(`User: ${userId}`);
    console.log(`Attempts: ${attempts}/${maxAttempts}`);
    console.log("========================================\n");

    log.error(`[Master Agent Voice] Task timeout for user ${userId}`);

    // Show timeout error on glasses
    if (glassesDisplay) {
      await glassesDisplay.showError("Request timed out");

      // Clear display after 5 seconds
      setTimeout(async () => {
        console.log(`[Display] 🧹 Clearing timeout display for user ${userId}`);
        await glassesDisplay.clear();
      }, 5000);
    }

    // TODO: Re-enable audio when ready
    // await session.audio.speak('Sorry, the request took too long to process.');
  }
}
