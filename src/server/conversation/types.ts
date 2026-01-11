/**
 * Conversation Types
 * Type definitions for conversation history management
 */

import type { ObjectId } from "mongodb";

/**
 * A single turn in a conversation
 */
export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;

  // Assistant-only fields
  glassesDisplay?: string;
  type?: "direct_response" | "clarifying_question" | "agent_result";
  taskId?: string;
  agentId?: string;
}

/**
 * A conversation document stored in MongoDB
 */
export interface Conversation {
  _id?: ObjectId;
  conversationId: string;
  userId: string;

  turns: ConversationTurn[];

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  lastActiveAt: Date;

  // Optional: link to glasses session
  sessionId?: string;
}

/**
 * Configuration constants for conversations
 */
export const CONVERSATION_CONFIG = {
  // Maximum number of turns to keep in a conversation
  MAX_TURNS: 20,

  // Conversation timeout in milliseconds (4 hours)
  TIMEOUT_MS: 4 * 60 * 60 * 1000,

  // Collection name in MongoDB
  COLLECTION_NAME: "conversations",
} as const;

/**
 * Options for creating a new conversation turn
 */
export interface AddTurnOptions {
  role: "user" | "assistant";
  content: string;

  // Assistant-only fields
  glassesDisplay?: string;
  type?: "direct_response" | "clarifying_question" | "agent_result";
  taskId?: string;
  agentId?: string;
}
