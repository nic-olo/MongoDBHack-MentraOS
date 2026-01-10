/**
 * Daemon Module
 * Cloud-side management for connected desktop daemons
 *
 * This module provides:
 * - DaemonManager: Manages WebSocket connections and agent lifecycle
 * - REST route handlers: For daemon status updates
 * - Types: Shared type definitions
 *
 * Usage:
 * ```typescript
 * import { getDaemonManager, createDaemonRoutes } from './daemon';
 *
 * // Get singleton manager
 * const daemonManager = getDaemonManager();
 *
 * // Register a daemon token (from your auth system)
 * daemonManager.registerToken('jwt-token-here', 'daemon-123', 'user-456');
 *
 * // Handle WebSocket connections
 * app.ws('/ws/daemon', (ws, req) => {
 *   const token = req.query.token;
 *   const auth = daemonManager.authenticateDaemon(token);
 *   if (auth) {
 *     daemonManager.handleWebSocket(ws, auth.daemonId, auth.userId);
 *   } else {
 *     ws.close(4001, 'Unauthorized');
 *   }
 * });
 *
 * // Mount REST routes
 * app.use('/api', createDaemonRoutes(daemonManager));
 *
 * // Subscribe to agent events (for master agent integration)
 * daemonManager.on('agent:completed', (event) => {
 *   console.log('Agent completed:', event.agentId, event.result);
 * });
 *
 * // Spawn an agent on a user's daemon
 * const agentId = await daemonManager.spawnAgent(daemonId, {
 *   agentType: 'terminal',
 *   goal: 'Refactor the auth module to use JWT',
 *   workingDirectory: '/path/to/project',
 *   sessionId: 'master-agent-session-id'
 * });
 * ```
 */

// Main manager class
export {
  DaemonManager,
  getDaemonManager,
  createDaemonManager,
} from "./DaemonManager";

// Route handlers
export { createDaemonRoutes, createBunHandlers } from "./routes";

// Types
export type {
  // Agent types
  AgentType,
  AgentStatus,

  // WebSocket messages
  CloudCommand,
  SpawnAgentCommand,
  KillAgentCommand,
  PingCommand,
  DaemonMessage,
  PongMessage,
  AgentAckMessage,

  // REST payloads
  HeartbeatPayload,
  StatusUpdatePayload,
  CompletePayload,
  LogPayload,

  // State types
  DaemonState,
  SubAgentState,

  // Event types
  DaemonEvent,
  DaemonConnectedEvent,
  DaemonDisconnectedEvent,
  AgentStartedEvent,
  AgentStatusEvent,
  AgentCompletedEvent,
  AgentFailedEvent,
  AgentLogEvent,

  // Options
  SpawnAgentOptions,
  EventCallback,
} from "./types";
