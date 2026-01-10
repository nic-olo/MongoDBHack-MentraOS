/**
 * Daemon Client
 * Handles WebSocket connection to cloud server and REST API calls
 * This is the communication layer between the daemon and the cloud backend
 */

import { EventEmitter } from "events";
import type {
  CloudCommand,
  DaemonMessage,
  HeartbeatPayload,
  StatusUpdatePayload,
  CompletePayload,
  LogPayload,
  DaemonConfig,
} from "./types";

export interface DaemonClientOptions {
  config: DaemonConfig;
  onCommand?: (command: CloudCommand) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

/**
 * DaemonClient - Manages connection to cloud backend
 *
 * - WebSocket: Receives commands from cloud (spawn_agent, kill_agent, ping)
 * - REST: Sends updates to cloud (heartbeat, status, complete, log)
 */
export class DaemonClient extends EventEmitter {
  private config: DaemonConfig;
  private ws: WebSocket | null = null;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10;
  private reconnectDelay: number = 1000; // Start with 1 second
  private maxReconnectDelay: number = 30000; // Max 30 seconds
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private isConnected: boolean = false;
  private isShuttingDown: boolean = false;

  private onCommand?: (command: CloudCommand) => void;
  private onConnect?: () => void;
  private onDisconnect?: () => void;

  constructor(options: DaemonClientOptions) {
    super();
    this.config = options.config;
    this.onCommand = options.onCommand;
    this.onConnect = options.onConnect;
    this.onDisconnect = options.onDisconnect;
  }

  /**
   * Connect to the cloud server via WebSocket
   */
  connect(): void {
    if (this.ws) {
      console.log("[client] Already connected or connecting");
      return;
    }

    const wsUrl = this.getWebSocketUrl();
    console.log(`[client] Connecting to ${wsUrl}...`);

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log("[client] WebSocket connected");
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.reconnectDelay = 1000;

        // Start heartbeat
        this.startHeartbeat();

        this.emit("connected");
        this.onConnect?.();
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      this.ws.onclose = (event) => {
        console.log(`[client] WebSocket closed: ${event.code} ${event.reason}`);
        this.isConnected = false;
        this.ws = null;

        this.stopHeartbeat();
        this.emit("disconnected");
        this.onDisconnect?.();

        // Attempt reconnect if not shutting down
        if (!this.isShuttingDown) {
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = (error) => {
        console.error("[client] WebSocket error:", error);
        this.emit("error", error);
      };
    } catch (error) {
      console.error("[client] Failed to create WebSocket:", error);
      this.scheduleReconnect();
    }
  }

  /**
   * Disconnect from the cloud server
   */
  disconnect(): void {
    this.isShuttingDown = true;
    this.stopHeartbeat();

    if (this.ws) {
      this.ws.close(1000, "Daemon shutting down");
      this.ws = null;
    }

    this.isConnected = false;
    console.log("[client] Disconnected");
  }

  /**
   * Send a message to the cloud server
   */
  send(message: DaemonMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn("[client] Cannot send message: not connected");
      return;
    }

    this.ws.send(JSON.stringify(message));
  }

  /**
   * Check if connected
   */
  getIsConnected(): boolean {
    return this.isConnected;
  }

  // ===========================================================================
  // REST API Methods (Daemon -> Cloud)
  // ===========================================================================

  /**
   * Send heartbeat to cloud
   */
  async sendHeartbeat(payload: HeartbeatPayload): Promise<boolean> {
    return this.post("/api/daemon/heartbeat", payload);
  }

  /**
   * Send agent status update
   */
  async sendStatusUpdate(agentId: string, payload: StatusUpdatePayload): Promise<boolean> {
    return this.post(`/api/subagent/${agentId}/status`, payload);
  }

  /**
   * Send agent completion
   */
  async sendComplete(agentId: string, payload: CompletePayload): Promise<boolean> {
    return this.post(`/api/subagent/${agentId}/complete`, payload);
  }

  /**
   * Send agent log
   */
  async sendLog(agentId: string, payload: LogPayload): Promise<boolean> {
    return this.post(`/api/subagent/${agentId}/log`, payload);
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Get WebSocket URL from config
   */
  private getWebSocketUrl(): string {
    const baseUrl = this.config.serverUrl;
    const wsProtocol = baseUrl.startsWith("https") ? "wss" : "ws";
    const host = baseUrl.replace(/^https?:\/\//, "");
    return `${wsProtocol}://${host}/ws/daemon?token=${encodeURIComponent(this.config.token)}`;
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(data: string | Buffer): void {
    try {
      const message = JSON.parse(data.toString()) as CloudCommand;
      console.log(`[client] Received command: ${message.type}`);

      // Handle ping internally
      if (message.type === "ping") {
        this.send({ type: "pong" });
        return;
      }

      // Emit event and call callback
      this.emit("command", message);
      this.onCommand?.(message);
    } catch (error) {
      console.error("[client] Failed to parse message:", error);
    }
  }

  /**
   * Schedule a reconnection attempt
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error("[client] Max reconnection attempts reached, giving up");
      this.emit("reconnect_failed");
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(
      this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1),
      this.maxReconnectDelay
    );

    console.log(
      `[client] Reconnecting in ${Math.round(delay / 1000)}s (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`
    );

    setTimeout(() => {
      if (!this.isShuttingDown) {
        this.connect();
      }
    }, delay);
  }

  /**
   * Start heartbeat interval
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();

    // Send heartbeat every 30 seconds
    this.heartbeatInterval = setInterval(async () => {
      if (this.isConnected) {
        // The actual heartbeat payload will be provided by the daemon
        this.emit("heartbeat_tick");
      }
    }, 30000);
  }

  /**
   * Stop heartbeat interval
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Make a POST request to the cloud server
   */
  private async post(path: string, body: unknown): Promise<boolean> {
    const url = `${this.config.serverUrl}${path}`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.token}`,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        console.error(`[client] POST ${path} failed: ${response.status} ${response.statusText}`);
        return false;
      }

      return true;
    } catch (error) {
      console.error(`[client] POST ${path} error:`, error);
      return false;
    }
  }
}

/**
 * Create a daemon client with the given config
 */
export function createDaemonClient(options: DaemonClientOptions): DaemonClient {
  return new DaemonClient(options);
}
