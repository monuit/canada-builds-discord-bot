// MARK: - Thread Tag Model
// Stores applied and suggested tags for discussion threads

import mongoose, { Schema, Document } from 'mongoose';

type TagSource = 'ai' | 'manual';

export interface IThreadTag extends Document {
  guildId: string;
  parentChannelId: string;
  threadId: string;
  tags: string[];
  source: TagSource;
  suggestedBy?: string;
  confidence?: number;
  messageSampleIds: string[];
  cachedUntil?: Date;
  appliedAt: Date;
  updatedAt: Date;
}

const ThreadTagSchema = new Schema<IThreadTag>({
  guildId: {
    type: String,
    required: true,
    index: true,
  },
  parentChannelId: {
    type: String,
    required: true,
  },
  threadId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  tags: [{
    type: String,
    lowercase: true,
    trim: true,
  }],
  source: {
    type: String,
    enum: ['ai', 'manual'],
    default: 'ai',
  },
  suggestedBy: {
    type: String,
  },
  confidence: {
    type: Number,
    min: 0,
    max: 1,
  },
  messageSampleIds: [{
    type: String,
  }],
  cachedUntil: {
    type: Date,
  },
  appliedAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

ThreadTagSchema.index({ guildId: 1, tags: 1 });
ThreadTagSchema.index({ guildId: 1, source: 1, cachedUntil: 1 });

ThreadTagSchema.pre('save', function threadTagUpdate(this: IThreadTag, next) {
  this.updatedAt = new Date();
  next();
});

export const ThreadTag = mongoose.model<IThreadTag>('ThreadTag', ThreadTagSchema);
