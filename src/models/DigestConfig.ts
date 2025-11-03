// MARK: - Digest Config Model
// Guild-level configuration for digest generation and error notifications

import mongoose, { Schema, Document } from 'mongoose';

export interface IDigestConfig extends Document {
  guildId: string;
  digestChannelId?: string; // Optional: for manual admin digest posts
  errorChannelId: string; // Required: for error notifications
  excludedChannelIds: string[];
  schedule: {
    enabled: boolean;
    cron: string;
    timezone: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

const DigestConfigSchema = new Schema<IDigestConfig>({
  guildId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  digestChannelId: {
    type: String,
  },
  errorChannelId: {
    type: String,
    required: true,
  },
  excludedChannelIds: [{
    type: String,
  }],
  schedule: {
    enabled: {
      type: Boolean,
      default: false,
    },
    cron: {
      type: String,
      default: '0 9 * * *', // 9 AM daily default
    },
    timezone: {
      type: String,
      default: 'UTC',
    },
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

// Update timestamp on save
DigestConfigSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

export const DigestConfig = mongoose.model<IDigestConfig>('DigestConfig', DigestConfigSchema);
