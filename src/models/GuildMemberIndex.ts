// MARK: - Guild Member Index Model
// Stores guild member metadata alongside subscription status snapshots

import mongoose, { Document, Schema } from 'mongoose';

export interface IGuildMemberIndex extends Document {
  guildId: string;
  userId: string;
  username: string;
  displayName?: string;
  joinedAt?: Date;
  isSubscribed: boolean;
  consentStatus?: string;
  lastScannedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const GuildMemberIndexSchema = new Schema<IGuildMemberIndex>({
  guildId: {
    type: String,
    required: true,
  },
  userId: {
    type: String,
    required: true,
  },
  username: {
    type: String,
    required: true,
  },
  displayName: {
    type: String,
  },
  joinedAt: {
    type: Date,
  },
  isSubscribed: {
    type: Boolean,
    default: false,
  },
  consentStatus: {
    type: String,
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

GuildMemberIndexSchema.index({ guildId: 1, userId: 1 }, { unique: true });

GuildMemberIndexSchema.pre('save', function save(next) {
  this.updatedAt = new Date();
  next();
});

export const GuildMemberIndex = mongoose.model<IGuildMemberIndex>('GuildMemberIndex', GuildMemberIndexSchema);
