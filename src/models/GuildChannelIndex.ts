// MARK: - Guild Channel Index Model
// Persists guild channel and thread metadata for inventory tracking

import mongoose, { Document, Schema } from 'mongoose';

export interface IGuildChannelIndex extends Document {
  guildId: string;
  channelId: string;
  name: string;
  type: string;
  parentId?: string | null;
  isThread: boolean;
  archived: boolean;
  createdTimestamp?: Date;
  lastScannedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const GuildChannelIndexSchema = new Schema<IGuildChannelIndex>({
  guildId: {
    type: String,
    required: true,
  },
  channelId: {
    type: String,
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  type: {
    type: String,
    required: true,
  },
  parentId: {
    type: String,
    default: null,
  },
  isThread: {
    type: Boolean,
    default: false,
  },
  archived: {
    type: Boolean,
    default: false,
  },
  createdTimestamp: {
    type: Date,
  },
  lastScannedAt: {
    type: Date,
    default: Date.now,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

GuildChannelIndexSchema.index({ guildId: 1, channelId: 1 }, { unique: true });

GuildChannelIndexSchema.pre('save', function save(next) {
  this.updatedAt = new Date();
  next();
});

export const GuildChannelIndex = mongoose.model<IGuildChannelIndex>('GuildChannelIndex', GuildChannelIndexSchema);
