/**
 * Conversation Module
 * Manages conversation history for contextual AI interactions
 */

export {
  ConversationService,
  getConversationService,
  createConversationService,
} from "./ConversationService";

export type {
  Conversation,
  ConversationTurn,
  AddTurnOptions,
} from "./types";

export { CONVERSATION_CONFIG } from "./types";
