/**
 * ConversationService
 * Manages conversation history per user for contextual AI interactions
 *
 * Features:
 * - Stores conversation turns in MongoDB
 * - Auto-expires conversations after inactivity timeout
 * - Keeps last N turns to avoid token limits
 * - Provides formatted history for MasterAgent prompts
 */

import type { Db } from "mongodb";
import { getDb, isConnected } from "../db/mongo";
import {
  type Conversation,
  type ConversationTurn,
  type AddTurnOptions,
  CONVERSATION_CONFIG,
} from "./types";

/**
 * Generate a unique conversation ID
 */
function generateConversationId(userId: string): string {
  return `conv_${userId}_${Date.now()}`;
}

/**
 * ConversationService - Manages conversation history for users
 */
export class ConversationService {
  private collectionName = CONVERSATION_CONFIG.COLLECTION_NAME;

  /**
   * Get the MongoDB collection
   */
  private getCollection() {
    const db = getDb();
    return db.collection<Conversation>(this.collectionName);
  }

  /**
   * Get or create an active conversation for a user
   * Creates a new conversation if none exists or the last one is stale
   */
  async getOrCreateConversation(userId: string): Promise<Conversation> {
    if (!isConnected()) {
      throw new Error("MongoDB not connected");
    }

    const collection = this.getCollection();
    const cutoff = new Date(Date.now() - CONVERSATION_CONFIG.TIMEOUT_MS);

    // Find active conversation (updated within timeout)
    const existingConversation = await collection.findOne({
      userId,
      lastActiveAt: { $gt: cutoff },
    });

    if (existingConversation) {
      // Return existing conversation (strip MongoDB _id for type compatibility)
      return {
        conversationId: existingConversation.conversationId,
        userId: existingConversation.userId,
        turns: existingConversation.turns,
        createdAt: existingConversation.createdAt,
        updatedAt: existingConversation.updatedAt,
        lastActiveAt: existingConversation.lastActiveAt,
        sessionId: existingConversation.sessionId,
      };
    }

    // Create new conversation
    const now = new Date();
    const newConversation: Conversation = {
      conversationId: generateConversationId(userId),
      userId,
      turns: [],
      createdAt: now,
      updatedAt: now,
      lastActiveAt: now,
    };

    await collection.insertOne(newConversation as any);

    console.log(
      `[ConversationService] Created new conversation: ${newConversation.conversationId}`,
    );

    return newConversation;
  }

  /**
   * Get a conversation by ID
   */
  async getConversation(conversationId: string): Promise<Conversation | null> {
    if (!isConnected()) {
      return null;
    }

    const collection = this.getCollection();
    const doc = await collection.findOne({ conversationId });

    if (!doc) {
      return null;
    }

    // Return without MongoDB _id for type compatibility
    return {
      conversationId: doc.conversationId,
      userId: doc.userId,
      turns: doc.turns,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      lastActiveAt: doc.lastActiveAt,
      sessionId: doc.sessionId,
    };
  }

  /**
   * Add a turn to a conversation
   */
  async addTurn(
    conversationId: string,
    options: AddTurnOptions,
  ): Promise<void> {
    if (!isConnected()) {
      console.warn(
        "[ConversationService] MongoDB not connected, skipping turn",
      );
      return;
    }

    const collection = this.getCollection();
    const turn: ConversationTurn = {
      role: options.role,
      content: options.content,
      timestamp: new Date(),
      ...(options.glassesDisplay && { glassesDisplay: options.glassesDisplay }),
      ...(options.type && { type: options.type }),
      ...(options.taskId && { taskId: options.taskId }),
      ...(options.agentId && { agentId: options.agentId }),
    };

    await collection.updateOne(
      { conversationId },
      {
        $push: {
          turns: {
            $each: [turn],
            $slice: -CONVERSATION_CONFIG.MAX_TURNS, // Keep only last N turns
          },
        } as any,
        $set: {
          updatedAt: new Date(),
          lastActiveAt: new Date(),
        },
      },
    );

    console.log(
      `[ConversationService] Added ${options.role} turn to ${conversationId}`,
    );
  }

  /**
   * Add a user message to a conversation
   */
  async addUserMessage(conversationId: string, content: string): Promise<void> {
    await this.addTurn(conversationId, {
      role: "user",
      content,
    });
  }

  /**
   * Add an assistant response to a conversation
   */
  async addAssistantMessage(
    conversationId: string,
    content: string,
    options: {
      glassesDisplay?: string;
      type?: "direct_response" | "clarifying_question" | "agent_result";
      taskId?: string;
      agentId?: string;
    } = {},
  ): Promise<void> {
    await this.addTurn(conversationId, {
      role: "assistant",
      content,
      ...options,
    });
  }

  /**
   * Get conversation history formatted for Claude prompt
   */
  getHistoryForPrompt(conversation: Conversation): string {
    if (!conversation.turns || conversation.turns.length === 0) {
      return "";
    }

    return conversation.turns
      .map((turn) => {
        if (turn.role === "user") {
          return `User: ${turn.content}`;
        } else {
          return `Assistant: ${turn.content}`;
        }
      })
      .join("\n\n");
  }

  /**
   * Get conversation history as messages array for Claude API
   */
  getHistoryAsMessages(
    conversation: Conversation,
  ): Array<{ role: "user" | "assistant"; content: string }> {
    if (!conversation.turns || conversation.turns.length === 0) {
      return [];
    }

    return conversation.turns.map((turn) => ({
      role: turn.role,
      content: turn.content,
    }));
  }

  /**
   * Get a summary of the conversation (last N turns)
   */
  getConversationSummary(
    conversation: Conversation,
    maxTurns: number = 10,
  ): string {
    if (!conversation.turns || conversation.turns.length === 0) {
      return "No conversation history.";
    }

    const recentTurns = conversation.turns.slice(-maxTurns);
    const summary = recentTurns
      .map((turn, index) => {
        const role = turn.role === "user" ? "User" : "Assistant";
        const preview =
          turn.content.length > 100
            ? turn.content.substring(0, 100) + "..."
            : turn.content;
        return `${index + 1}. ${role}: ${preview}`;
      })
      .join("\n");

    return `Conversation summary (${recentTurns.length} recent turns):\n${summary}`;
  }

  /**
   * Clear a conversation (delete all turns)
   */
  async clearConversation(conversationId: string): Promise<void> {
    if (!isConnected()) {
      return;
    }

    const collection = this.getCollection();
    await collection.updateOne(
      { conversationId },
      {
        $set: {
          turns: [],
          updatedAt: new Date(),
        },
      },
    );

    console.log(
      `[ConversationService] Cleared conversation: ${conversationId}`,
    );
  }

  /**
   * Delete old conversations (cleanup)
   */
  async deleteOldConversations(): Promise<number> {
    if (!isConnected()) {
      return 0;
    }

    const collection = this.getCollection();
    const cutoff = new Date(Date.now() - CONVERSATION_CONFIG.TIMEOUT_MS * 2); // 2x timeout

    const result = await collection.deleteMany({
      lastActiveAt: { $lt: cutoff },
    });

    if (result.deletedCount > 0) {
      console.log(
        `[ConversationService] Deleted ${result.deletedCount} old conversations`,
      );
    }

    return result.deletedCount;
  }

  /**
   * Get all conversations for a user
   */
  async getConversationsForUser(userId: string): Promise<Conversation[]> {
    if (!isConnected()) {
      return [];
    }

    const collection = this.getCollection();
    return collection
      .find({ userId })
      .sort({ lastActiveAt: -1 })
      .limit(10)
      .toArray();
  }
}

// Singleton instance
let serviceInstance: ConversationService | null = null;

/**
 * Get the ConversationService singleton
 */
export function getConversationService(): ConversationService {
  if (!serviceInstance) {
    serviceInstance = new ConversationService();
  }
  return serviceInstance;
}

/**
 * Create a new ConversationService instance (for testing)
 */
export function createConversationService(): ConversationService {
  return new ConversationService();
}
