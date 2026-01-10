/**
 * Conversation API Client
 * Handles all conversation-related API calls
 */

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: Date;
  isStatusQuery?: boolean;
}

interface Conversation {
  id: string;
  userId: string;
  title: string;
  messages?: Message[];
  createdAt: string;
  updatedAt: string;
}

interface ConversationListItem {
  id: string;
  userId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

interface ApiError {
  error: string;
  code: string;
  message?: string;
}

// API base URL - works for both dev (5173) and production (3000)
const API_BASE_URL = import.meta.env.DEV
  ? 'http://localhost:3000'
  : '';

/**
 * Create a new conversation
 */
export async function createConversation(
  userId: string,
  firstMessage?: Message,
  title?: string
): Promise<Conversation> {
  const response = await fetch(`${API_BASE_URL}/api/conversations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId,
      title,
      firstMessage
    })
  });

  const data = await response.json();

  if (!response.ok) {
    const error = data as ApiError;
    throw new Error(error.message || error.error);
  }

  return data.conversation;
}

/**
 * Get all conversations for a user
 */
export async function getConversations(
  userId: string,
  limit: number = 50
): Promise<ConversationListItem[]> {
  const response = await fetch(
    `${API_BASE_URL}/api/conversations/user/${userId}?limit=${limit}`
  );

  const data = await response.json();

  if (!response.ok) {
    const error = data as ApiError;
    throw new Error(error.message || error.error);
  }

  return data.conversations;
}

/**
 * Get a single conversation with full messages
 */
export async function getConversation(conversationId: string): Promise<Conversation> {
  const response = await fetch(`${API_BASE_URL}/api/conversations/${conversationId}`);

  const data = await response.json();

  if (!response.ok) {
    const error = data as ApiError;
    throw new Error(error.message || error.error);
  }

  return data.conversation;
}

/**
 * Add a message to an existing conversation
 */
export async function addMessage(
  conversationId: string,
  message: Message
): Promise<Conversation> {
  const response = await fetch(
    `${API_BASE_URL}/api/conversations/${conversationId}/messages`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message })
    }
  );

  const data = await response.json();

  if (!response.ok) {
    const error = data as ApiError;
    throw new Error(error.message || error.error);
  }

  return data.conversation;
}

/**
 * Update conversation title
 */
export async function updateConversation(
  conversationId: string,
  title: string
): Promise<Conversation> {
  const response = await fetch(`${API_BASE_URL}/api/conversations/${conversationId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title })
  });

  const data = await response.json();

  if (!response.ok) {
    const error = data as ApiError;
    throw new Error(error.message || error.error);
  }

  return data.conversation;
}

/**
 * Delete a conversation
 */
export async function deleteConversation(conversationId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/conversations/${conversationId}`, {
    method: 'DELETE'
  });

  const data = await response.json();

  if (!response.ok) {
    const error = data as ApiError;
    throw new Error(error.message || error.error);
  }
}

// Export types
export type { Message, Conversation, ConversationListItem };
