// MARK: - Digest History Model
// Tracks generated digests for analytics and auditing

import mongoose, { Schema, Document } from 'mongoose';

export interface IDigestHistory extends Document {
  guildId: string;
  recipientUserId: string;
  topicClusters: Array<{
    keyword: string;
    messageCount: number;
    crossRefs: Array<{ keyword: string; count: number }>;
  }>;
  threadScores?: Array<{
    key: string;
    score: number;
    participants: number;
    messages: number;
    decisionVerbHits: number;
  }>;
  topTopics?: Array<{ slug: string; count: number }>;
  clusterLabels?: string[];
  tokensUsed: {
    input: number;
    output: number;
  };
  costUSD: number;
  generatedAt: Date;
  deliveryMethod: 'dm' | 'channel';
  success: boolean;
  errorMessage?: string;
  createdAt: Date;
}

const DigestHistorySchema = new Schema<IDigestHistory>({
  guildId: {
    type: String,
    required: true,
    index: true,
  },
  recipientUserId: {
    type: String,
    required: true,
  },
  topicClusters: [{
    keyword: String,
    messageCount: Number,
    crossRefs: [{
      keyword: String,
      count: Number,
    }],
  }],
  threadScores: [{
    key: String,
    score: Number,
    participants: Number,
    messages: Number,
    decisionVerbHits: Number,
  }],
  topTopics: [{
    slug: String,
    count: Number,
  }],
  clusterLabels: [String],
  tokensUsed: {
    input: {
      type: Number,
      default: 0,
    },
    output: {
      type: Number,
      default: 0,
    },
  },
  costUSD: {
    type: Number,
    default: 0,
  },
  generatedAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
  deliveryMethod: {
    type: String,
    enum: ['dm', 'channel'],
    default: 'dm',
  },
  success: {
    type: Boolean,
    default: true,
  },
  errorMessage: {
    type: String,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 2592000, // TTL: 30 days in seconds
  },
});

// Compound index for analytics queries
DigestHistorySchema.index({ guildId: 1, generatedAt: -1 });

export const DigestHistory = mongoose.model<IDigestHistory>('DigestHistory', DigestHistorySchema);
