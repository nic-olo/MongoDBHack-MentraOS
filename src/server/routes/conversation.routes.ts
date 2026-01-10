import { Express } from 'express';
import { Conversation, IMessage } from '../db/models/Conversation';
import { isDatabaseConnected } from '../db/connection';

/**
 * Setup conversation routes
 */
export function setupConversationRoutes(app: Express): void {
  
  /**
   * Create new conversation
   * POST /api/conversations
   */
  app.post('/api/conversations', async (req: any, res: any) => {
    try {
      if (!isDatabaseConnected()) {
        return res.status(503).json({
          error: 'Database not available',
          code: 'DB_UNAVAILABLE'
        });
      }

      const { userId, title, firstMessage } = req.body;

      if (!userId) {
        return res.status(400).json({
          error: 'userId is required',
          code: 'MISSING_USER_ID'
        });
      }

      // Create new conversation
      const conversation = new Conversation({
        userId,
        title: title || 'New Conversation',
        messages: []
      });

      // Add first message if provided
      if (firstMessage) {
        conversation.messages.push({
          role: firstMessage.role,
          content: firstMessage.content,
          timestamp: new Date(),
          isStatusQuery: firstMessage.isStatusQuery || false
        });

        // Auto-generate title from first message if not provided
        if (!title && firstMessage.role === 'user') {
          conversation.title = conversation.generateTitle();
        }
      }

      await conversation.save();

      res.status(201).json({
        success: true,
        conversation: {
          id: conversation._id,
          userId: conversation.userId,
          title: conversation.title,
          messages: conversation.messages,
          createdAt: conversation.createdAt,
          updatedAt: conversation.updatedAt
        }
      });

    } catch (error: any) {
      console.error('[Conversations API] Error creating conversation:', error);
      res.status(500).json({
        error: 'Failed to create conversation',
        code: 'INTERNAL_ERROR',
        message: error.message
      });
    }
  });

  /**
   * Get all conversations for a user
   * GET /api/conversations/user/:userId
   */
  app.get('/api/conversations/user/:userId', async (req: any, res: any) => {
    try {
      if (!isDatabaseConnected()) {
        return res.status(503).json({
          error: 'Database not available',
          code: 'DB_UNAVAILABLE'
        });
      }

      const { userId } = req.params;
      const limit = parseInt(req.query.limit) || 50;

      if (!userId) {
        return res.status(400).json({
          error: 'userId is required',
          code: 'MISSING_USER_ID'
        });
      }

      // Get conversations, sorted by most recently updated
      // Project to exclude full message content for list view
      const conversations = await Conversation
        .find({ userId })
        .select('_id userId title createdAt updatedAt')
        .sort({ updatedAt: -1 })
        .limit(limit)
        .lean();

      res.json({
        success: true,
        conversations: conversations.map(conv => ({
          id: conv._id,
          userId: conv.userId,
          title: conv.title,
          createdAt: conv.createdAt,
          updatedAt: conv.updatedAt
        }))
      });

    } catch (error: any) {
      console.error('[Conversations API] Error fetching conversations:', error);
      res.status(500).json({
        error: 'Failed to fetch conversations',
        code: 'INTERNAL_ERROR',
        message: error.message
      });
    }
  });

  /**
   * Get single conversation with full messages
   * GET /api/conversations/:id
   */
  app.get('/api/conversations/:id', async (req: any, res: any) => {
    try {
      if (!isDatabaseConnected()) {
        return res.status(503).json({
          error: 'Database not available',
          code: 'DB_UNAVAILABLE'
        });
      }

      const { id } = req.params;

      const conversation = await Conversation.findById(id).lean();

      if (!conversation) {
        return res.status(404).json({
          error: 'Conversation not found',
          code: 'NOT_FOUND'
        });
      }

      res.json({
        success: true,
        conversation: {
          id: conversation._id,
          userId: conversation.userId,
          title: conversation.title,
          messages: conversation.messages,
          createdAt: conversation.createdAt,
          updatedAt: conversation.updatedAt
        }
      });

    } catch (error: any) {
      console.error('[Conversations API] Error fetching conversation:', error);
      res.status(500).json({
        error: 'Failed to fetch conversation',
        code: 'INTERNAL_ERROR',
        message: error.message
      });
    }
  });

  /**
   * Add message to conversation
   * PUT /api/conversations/:id/messages
   */
  app.put('/api/conversations/:id/messages', async (req: any, res: any) => {
    try {
      if (!isDatabaseConnected()) {
        return res.status(503).json({
          error: 'Database not available',
          code: 'DB_UNAVAILABLE'
        });
      }

      const { id } = req.params;
      const { message } = req.body;

      if (!message || !message.role || !message.content) {
        return res.status(400).json({
          error: 'Invalid message format',
          code: 'INVALID_MESSAGE'
        });
      }

      const conversation = await Conversation.findById(id);

      if (!conversation) {
        return res.status(404).json({
          error: 'Conversation not found',
          code: 'NOT_FOUND'
        });
      }

      // Add message
      conversation.addMessage({
        role: message.role,
        content: message.content,
        timestamp: new Date(),
        isStatusQuery: message.isStatusQuery || false
      });

      await conversation.save();

      res.json({
        success: true,
        conversation: {
          id: conversation._id,
          userId: conversation.userId,
          title: conversation.title,
          messages: conversation.messages,
          createdAt: conversation.createdAt,
          updatedAt: conversation.updatedAt
        }
      });

    } catch (error: any) {
      console.error('[Conversations API] Error adding message:', error);
      res.status(500).json({
        error: 'Failed to add message',
        code: 'INTERNAL_ERROR',
        message: error.message
      });
    }
  });

  /**
   * Update conversation (rename)
   * PUT /api/conversations/:id
   */
  app.put('/api/conversations/:id', async (req: any, res: any) => {
    try {
      if (!isDatabaseConnected()) {
        return res.status(503).json({
          error: 'Database not available',
          code: 'DB_UNAVAILABLE'
        });
      }

      const { id } = req.params;
      const { title } = req.body;

      if (!title) {
        return res.status(400).json({
          error: 'title is required',
          code: 'MISSING_TITLE'
        });
      }

      const conversation = await Conversation.findByIdAndUpdate(
        id,
        { title, updatedAt: new Date() },
        { new: true }
      ).lean();

      if (!conversation) {
        return res.status(404).json({
          error: 'Conversation not found',
          code: 'NOT_FOUND'
        });
      }

      res.json({
        success: true,
        conversation: {
          id: conversation._id,
          userId: conversation.userId,
          title: conversation.title,
          createdAt: conversation.createdAt,
          updatedAt: conversation.updatedAt
        }
      });

    } catch (error: any) {
      console.error('[Conversations API] Error updating conversation:', error);
      res.status(500).json({
        error: 'Failed to update conversation',
        code: 'INTERNAL_ERROR',
        message: error.message
      });
    }
  });

  /**
   * Delete conversation
   * DELETE /api/conversations/:id
   */
  app.delete('/api/conversations/:id', async (req: any, res: any) => {
    try {
      if (!isDatabaseConnected()) {
        return res.status(503).json({
          error: 'Database not available',
          code: 'DB_UNAVAILABLE'
        });
      }

      const { id } = req.params;

      const conversation = await Conversation.findByIdAndDelete(id);

      if (!conversation) {
        return res.status(404).json({
          error: 'Conversation not found',
          code: 'NOT_FOUND'
        });
      }

      res.json({
        success: true,
        message: 'Conversation deleted successfully'
      });

    } catch (error: any) {
      console.error('[Conversations API] Error deleting conversation:', error);
      res.status(500).json({
        error: 'Failed to delete conversation',
        code: 'INTERNAL_ERROR',
        message: error.message
      });
    }
  });
}
