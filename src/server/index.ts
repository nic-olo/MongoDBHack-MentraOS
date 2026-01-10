/**
 * =============================================================================
 * MentraOS Camera App - Beginner-Friendly Template
 * =============================================================================
 *
 * This app allows users to take photos using their MentraOS glasses.
 *
 * QUICK START:
 * 1. Make sure your .env file has PACKAGE_NAME and MENTRAOS_API_KEY set
 * 2. Run: bun run dev
 * 3. Visit the MentraOS Developer Console: https://console.mentra.glass/
 *
 * HOW IT WORKS:
 * - When a user presses the button on their glasses, it takes a photo
 * - When they hold the button, it toggles video streaming mode
 * - Photos are stored temporarily and can be viewed in a web interface
 *
 * =============================================================================
 */

import { AppServer, AppSession } from "@mentra/sdk";
import { setupButtonHandler } from "./event/button";
import {
  setupWebviewRoutes,
  broadcastTranscriptionToClients,
  registerSession,
  unregisterSession,
  callMasterAgentFromVoice,
  pollAndSpeakResult,
} from "./routes/routes";
import { setupTranscription } from "./modules/transcription";
import {
  createTranscriptionProcessor,
  TranscriptionProcessor,
} from "./handler/transcriptionProcessor";
import {
  createGlassesDisplayManager,
  GlassesDisplayManager,
} from "./manager/glassesDisplayManager";
import { TRANSCRIPTION_CONFIG } from "./const/wakeWords";
import { getDaemonManager, createDaemonRoutes } from "./daemon";
import { connectMongo } from "./db/mongo";
import { WebSocketServer } from "ws";
import * as path from "path";
import * as http from "http";

interface StoredPhoto {
  requestId: string;
  buffer: Buffer;
  timestamp: Date;
  userId: string;
  mimeType: string;
  filename: string;
  size: number;
}

// CONFIGURATION - Load settings from .env file

const PACKAGE_NAME =
  process.env.PACKAGE_NAME ??
  (() => {
    throw new Error("PACKAGE_NAME is not set in .env file");
  })();

const MENTRAOS_API_KEY =
  process.env.MENTRAOS_API_KEY ??
  (() => {
    throw new Error("MENTRAOS_API_KEY is not set in .env file");
  })();

const PORT = parseInt(process.env.PORT || "3000");

// MAIN APP CLASS

// Initialize DaemonManager (singleton)
const daemonManager = getDaemonManager();

class ExampleMentraOSApp extends AppServer {
  private photosMap: Map<string, StoredPhoto> = new Map();
  private transcriptionProcessors: Map<string, TranscriptionProcessor> =
    new Map();
  private glassesDisplays: Map<string, GlassesDisplayManager> = new Map();

  constructor() {
    super({
      packageName: PACKAGE_NAME,
      apiKey: MENTRAOS_API_KEY,
      port: PORT,
    });

    // Ensure JSON body parser is enabled
    const express = require("express");
    const { createProxyMiddleware } = require("http-proxy-middleware");
    this.getExpressApp().use(express.json());

    // Enable CORS for localhost:5173 (Vite dev server)
    this.getExpressApp().use((req: any, res: any, next: any) => {
      res.header("Access-Control-Allow-Origin", "http://localhost:5173");
      res.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS",
      );
      res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.header("Access-Control-Allow-Credentials", "true");

      // Handle preflight requests
      if (req.method === "OPTIONS") {
        return res.sendStatus(200);
      }

      next();
    });

    // Serve static files (audio, images, etc.) from the public directory
    const publicPath = path.join(process.cwd(), "src", "public");
    this.getExpressApp().use("/assets", express.static(publicPath + "/assets"));

    // Set up all web routes (pass our photos map)
    setupWebviewRoutes(this.getExpressApp(), this.photosMap);

    // Set up daemon REST routes (using /daemon-api to avoid MentraOS middleware)
    this.getExpressApp().use("/daemon-api", createDaemonRoutes(daemonManager));
    console.log("[Daemon] REST routes mounted at /daemon-api");

    // Check if we should use Vite dev server or serve built files
    const frontendDistPath = path.join(
      process.cwd(),
      "src",
      "frontend",
      "dist",
    );
    const useViteDevServer =
      process.env.NODE_ENV !== "production" &&
      process.env.USE_VITE_DEV === "true";

    if (useViteDevServer) {
      // Development mode: proxy /webview to Vite dev server
      console.log("Using Vite dev server for /webview");
      this.getExpressApp().use(
        "/webview",
        createProxyMiddleware({
          target: "http://localhost:5173/webview",
          changeOrigin: true,
          ws: true, // Enable WebSocket proxying for HMR
          pathRewrite: {
            "^/webview": "", // Remove /webview prefix when proxying
          },
          onError: (err: any, _req: any, res: any) => {
            console.error("Proxy error:", err);
            res
              .status(500)
              .send(
                "Frontend dev server not running. Please start it with: npm run dev:frontend",
              );
          },
        }),
      );
    } else {
      // Production mode: serve the built React frontend at /webview
      console.log("Serving built frontend from", frontendDistPath);
      this.getExpressApp().use("/webview", express.static(frontendDistPath));

      // SPA fallback for /webview routes in production
      this.getExpressApp().get("/webview/*", (_req: any, res: any) => {
        res.sendFile(path.join(frontendDistPath, "index.html"), (err: any) => {
          if (err) {
            console.error("Error serving index.html:", err);
            res
              .status(500)
              .send(
                "Frontend build not found. Please run: npm run build:frontend",
              );
          }
        });
      });
    }
  }

  // Session Lifecycle - Called when a user opens/closes the app

  /**
   * Called when a user launches the app on their glasses
   */
  protected async onSession(
    session: AppSession,
    sessionId: string,
    userId: string,
  ): Promise<void> {
    this.logger.info(`Session started for user ${userId}`);
    session.layouts.showTextWall("hello world");
    // Register this session for audio playback from the frontend
    registerSession(userId, session);

    // Create glasses display manager for this user
    const glassesDisplay = createGlassesDisplayManager(
      session,
      userId,
      this.logger,
    );
    this.glassesDisplays.set(userId, glassesDisplay);

    // Show welcome message on glasses
    await glassesDisplay.showStatus("🎯 SOGA Ready");
    await glassesDisplay.showTemporary('Say "Hey SOGA" to start', 3000);

    // const result = await session.audio.playAudio({
    //   audioUrl: this.audioURL
    // })
    // // await session.audio.speak('Hello from your app!');

    // Create transcription processor for this user
    const transcriptionProcessor = createTranscriptionProcessor({
      ...TRANSCRIPTION_CONFIG, // Use wake words and silence threshold from constants
      onWakeWordDetected: async () => {
        console.log("\n========================================");
        console.log("🎙️  WAKE WORD DETECTED");
        console.log(`User: ${userId}`);
        console.log("Status: Listening for command...");
        console.log("========================================\n");
        this.logger.info(`🎙️ Wake word detected for user ${userId}`);

        // Show on glasses
        await glassesDisplay.showWakeWord();

        // Notify the frontend
        broadcastTranscriptionToClients(
          "Wake word detected - listening...",
          true,
          userId,
        );
      },
      onReadyToProcess: async (command) => {
        // Check if command is empty (no command captured after wake word)
        if (!command || command.trim() === "") {
          console.log("\n========================================");
          console.log("⚠️  NO COMMAND CAPTURED");
          console.log(`User: ${userId}`);
          console.log("Status: Clearing display");
          console.log("========================================\n");

          this.logger.info(
            `⚠️  No command captured for user ${userId} - clearing display`,
          );

          // Clear the glasses display
          await glassesDisplay.clear();

          // Notify frontend
          broadcastTranscriptionToClients("No command captured", true, userId);

          return; // Don't proceed to Master Agent
        }

        console.log("\n========================================");
        console.log("✅ VOICE COMMAND CAPTURED");
        console.log(`User: ${userId}`);
        console.log(`Command: "${command}"`);
        console.log("Status: Ready to process");
        console.log("========================================\n");

        this.logger.info(
          `✅ Ready to process command for user ${userId}: "${command}"`,
        );

        // Show command on glasses
        await glassesDisplay.showCommand(command);

        // Broadcast the command to process
        broadcastTranscriptionToClients(`Processing: ${command}`, true, userId);

        // Call Master Agent to process the voice command
        try {
          console.log("\n========================================");
          console.log("🚀 SENDING TO MASTER AGENT");
          console.log(`User: ${userId}`);
          console.log(`Query: "${command}"`);
          console.log("Destination: Master Agent Server (port 3001)");
          console.log("========================================\n");

          // Show processing on glasses
          await glassesDisplay.showProcessing("Sending to AI agent...");

          const taskId = await callMasterAgentFromVoice(
            userId,
            command,
            async (progressMsg) => {
              this.logger.info(`[Master Agent] ${progressMsg}`);
              broadcastTranscriptionToClients(progressMsg, true, userId);
              await glassesDisplay.showProcessing(progressMsg);
            },
          );

          console.log("\n========================================");
          console.log("✅ MASTER AGENT RECEIVED REQUEST");
          console.log(`Task ID: ${taskId}`);
          console.log(`User: ${userId}`);
          console.log("Status: Processing with sub-agents...");
          console.log("Next: Polling for results every 2 seconds");
          console.log("========================================\n");

          this.logger.info(`[Master Agent] Task submitted: ${taskId}`);

          // Show agent activity on glasses
          await glassesDisplay.showAgentActivity(
            "Master Agent",
            "Analyzing your request...",
          );

          broadcastTranscriptionToClients("I'm thinking...", true, userId);

          // Poll for results and log them (audio disabled for now)
          // This runs in the background and doesn't block
          // Pass the display manager to show progress
          pollAndSpeakResult(
            taskId,
            userId,
            session,
            this.logger,
            glassesDisplay,
          ).catch(async (error) => {
            console.log("\n========================================");
            console.log("❌ ERROR IN POLLING/SPEAKING");
            console.log(`Task ID: ${taskId}`);
            console.log(`User: ${userId}`);
            console.log(`Error: ${error}`);
            console.log("========================================\n");
            this.logger.error(
              `[Master Agent] Error polling/speaking result:`,
              error,
            );
            await glassesDisplay.showError("Processing error occurred");

            // Clear display after 5 seconds
            setTimeout(async () => {
              await glassesDisplay.clear();
            }, 5000);
          });
        } catch (error) {
          console.log("\n========================================");
          console.log("❌ ERROR CALLING MASTER AGENT");
          console.log(`User: ${userId}`);
          console.log(`Command: "${command}"`);
          console.log(`Error: ${error}`);
          console.log("========================================\n");

          this.logger.error(
            `[Master Agent] Error calling Master Agent:`,
            error,
          );
          broadcastTranscriptionToClients(
            "Sorry, I encountered an error.",
            true,
            userId,
          );

          // Show error on glasses
          await glassesDisplay.showError("Failed to connect to AI");

          // Clear display after 5 seconds
          setTimeout(async () => {
            await glassesDisplay.clear();
          }, 5000);

          // TODO: Re-enable audio when ready
          // try {
          //   await session.audio.speak('Sorry, I encountered an error processing your command.');
          // } catch (speakError) {
          //   this.logger.error(`[Master Agent] Error speaking error message:`, speakError);
          // }
        }
      },
      logger: this.logger,
    });

    // Store the processor for this user
    this.transcriptionProcessors.set(userId, transcriptionProcessor);

    // Set up transcription to log all speech-to-text
    setupTranscription(
      session,
      (finalText) => {
        // Called when transcription is finalized
        this.logger.info(
          `[FINAL] Transcription for user ${userId}: ${finalText}`,
        );
        console.log(`✅ Final transcription (user ${userId}): ${finalText}`);

        // Process through transcription processor for wake word detection
        transcriptionProcessor.processTranscription(finalText, true);

        // Broadcast final transcription to this user's SSE clients only
        broadcastTranscriptionToClients(finalText, true, userId);
      },
      (partialText) => {
        // Called for interim/partial results (optional)
        console.log(
          `⏳ Partial transcription (user ${userId}): ${partialText}`,
        );

        // Process partial transcription
        transcriptionProcessor.processTranscription(partialText, false);

        // Show live transcription on glasses ONLY if wake word is detected
        if (transcriptionProcessor.isWakeWordActive()) {
          glassesDisplay.showStatus(partialText);
        }

        // Broadcast partial transcription to this user's SSE clients only
        broadcastTranscriptionToClients(partialText, false, userId);
      },
    );

    // Register handler for all touch events
    session.events.onTouchEvent((event) => {
      console.log(`wTouch event: ${event.gesture_name}`);
    });
  }

  /**
   * Called when a user closes the app or disconnects
   */
  protected async onStop(
    sessionId: string,
    userId: string,
    reason: string,
  ): Promise<void> {
    this.logger.info(`Session stopped for user ${userId}, reason: ${reason}`);

    // Clean up transcription processor for this user
    const processor = this.transcriptionProcessors.get(userId);
    if (processor) {
      processor.destroy();
      this.transcriptionProcessors.delete(userId);
    }

    // Clean up glasses display manager for this user
    const glassesDisplay = this.glassesDisplays.get(userId);
    if (glassesDisplay) {
      this.glassesDisplays.delete(userId);
    }

    // Unregister the session
    unregisterSession(userId);
  }
}

// START THE SERVER

const app = new ExampleMentraOSApp();

// Connect to MongoDB first, then start the server
connectMongo()
  .then(() => app.start())
  .then(() => {
    // Set up WebSocket server for daemon connections
    // We need to create a separate HTTP server for WebSocket since MentraOS SDK manages its own
    const wsPort = PORT; // Use same port - Express app should handle upgrade

    // Get the underlying HTTP server from Express
    const expressApp = app.getExpressApp();

    // Create a simple HTTP server to handle WebSocket upgrades
    const wss = new WebSocketServer({ noServer: true });

    // Handle WebSocket connections
    wss.on("connection", (ws, req) => {
      const url = new URL(req.url || "", `http://localhost:${PORT}`);
      const email = url.searchParams.get("email");

      if (!email) {
        console.log("[Daemon WS] Connection rejected: no email provided");
        ws.close(4001, "Email required");
        return;
      }

      console.log(`[Daemon WS] New connection from: ${email}`);

      // Register the daemon with email as both daemonId and userId for simplicity
      const daemonId = `daemon_${email}`;
      daemonManager.registerToken(email, daemonId, email);
      daemonManager.handleWebSocket(ws as any, daemonId, email);
    });

    // Listen for upgrade requests on the Express server
    // This requires access to the underlying HTTP server
    const server = (expressApp as any).server || http.createServer(expressApp);

    server.on(
      "upgrade",
      (request: http.IncomingMessage, socket: any, head: Buffer) => {
        const url = new URL(request.url || "", `http://localhost:${PORT}`);

        if (url.pathname === "/ws/daemon") {
          console.log("[Daemon WS] Upgrade request received");
          wss.handleUpgrade(request, socket, head, (ws) => {
            wss.emit("connection", ws, request);
          });
        } else {
          // Let other WebSocket connections pass through (e.g., Vite HMR)
          socket.destroy();
        }
      },
    );

    // If we created a new server, we need to make it listen
    if (!(expressApp as any).server) {
      server.listen(PORT, () => {
        console.log(
          `[Daemon WS] WebSocket server ready on ws://localhost:${PORT}/ws/daemon`,
        );
      });
    } else {
      console.log(
        `[Daemon WS] WebSocket server ready on ws://localhost:${PORT}/ws/daemon`,
      );
    }
  })
  .catch(console.error);
