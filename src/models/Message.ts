// MARK: - Message Model
// Stores indexed Discord messages with keyword matching

import mongoose, { Schema, Document } from 'mongoose';

export interface IMessage extends Document {
  messageId: string;
  guildId: string;
  channelId: string;
  threadId?: string;
  parentChannelId?: string;
  authorId: string;
  authorUsername: string;
  content: string;
  normalizedContent: string;
  matchedKeywords: string[];
  primaryKeyword?: string;
  linkCount: number;
  reactionSummary: Array<{ emoji: string; count: number }>;
  timestamp: Date;
  createdAt: Date;
}

const MessageSchema = new Schema<IMessage>({
  messageId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  guildId: {
    type: String,
    required: true,
    index: true,
  },
  channelId: {
    type: String,
    required: true,
    index: true,
  },
  threadId: {
    type: String,
    index: true,
  },
  parentChannelId: {
    type: String,
    index: true,
  },
  authorId: {
    type: String,
    required: true,
  },
  authorUsername: {
    type: String,
    required: true,
  },
  content: {
    type: String,
    default: '',
  },
  normalizedContent: {
    type: String,
    default: '',
  },
  matchedKeywords: [{
    type: String,
  }],
  primaryKeyword: {
    type: String,
    index: true,
  },
  linkCount: {
    type: Number,
    default: 0,
  },
  reactionSummary: [{
    emoji: String,
    count: Number,
  }],
  timestamp: {
    type: Date,
    required: true,
    index: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 604800, // TTL: 7 days in seconds
  },
});

// Compound index for efficient digest queries
MessageSchema.index({ guildId: 1, channelId: 1, timestamp: -1 });
MessageSchema.index({ primaryKeyword: 1, timestamp: -1 });

export const Message = mongoose.model<IMessage>('Message', MessageSchema);
