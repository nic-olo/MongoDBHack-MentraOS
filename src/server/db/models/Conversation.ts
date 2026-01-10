import mongoose, { Schema, Document, Model } from 'mongoose';

/**
 * Message interface
 */
export interface IMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isStatusQuery?: boolean;
}

/**
 * Conversation interface
 */
export interface IConversation extends Document {
  userId: string;
  title: string;
  messages: IMessage[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Message schema
 */
const MessageSchema = new Schema<IMessage>({
  role: {
    type: String,
    enum: ['user', 'assistant'],
    required: true
  },
  content: {
    type: String,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  isStatusQuery: {
    type: Boolean,
    default: false
  }
}, { _id: false });

/**
 * Conversation schema
 */
const ConversationSchema = new Schema<IConversation>({
  userId: {
    type: String,
    required: true,
    index: true
  },
  title: {
    type: String,
    required: true,
    default: 'New Conversation'
  },
  messages: {
    type: [MessageSchema],
    default: []
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
ConversationSchema.index({ userId: 1, createdAt: -1 });
ConversationSchema.index({ userId: 1, updatedAt: -1 });

/**
 * Generate title from first message
 */
ConversationSchema.methods.generateTitle = function(): string {
  if (this.messages.length > 0) {
    const firstMessage = this.messages.find(m => m.role === 'user');
    if (firstMessage) {
      const title = firstMessage.content.substring(0, 50);
      return title.length < firstMessage.content.length ? `${title}...` : title;
    }
  }
  return 'New Conversation';
};

/**
 * Add message to conversation
 */
ConversationSchema.methods.addMessage = function(message: IMessage): void {
  this.messages.push(message);
  this.updatedAt = new Date();
};

// Export the model
export const Conversation: Model<IConversation> = mongoose.models.Conversation || 
  mongoose.model<IConversation>('Conversation', ConversationSchema);
