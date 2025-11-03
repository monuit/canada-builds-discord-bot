// MARK: - User Subscription Model
// Manages user keyword subscriptions and notification preferences

import mongoose, { Schema, Document } from 'mongoose';

export interface IUserSubscription extends Document {
  userId: string;
  guildId: string;
  keywords: string[];
  dmEnabled: boolean;
  cooldownHours: number;
  lastNotified: Map<string, Date>;
  preferences: {
    timezone?: string;
    digestHourUTC?: number;
    digestPreference?: 'daily-morning' | 'daily-evening' | 'twice-weekly' | 'weekly' | 'manual';
  };
  createdAt: Date;
  updatedAt: Date;
}

const UserSubscriptionSchema = new Schema<IUserSubscription>({
  userId: {
    type: String,
    required: true,
  },
  guildId: {
    type: String,
    required: true,
  },
  keywords: [{
    type: String,
    lowercase: true,
    trim: true,
  }],
  dmEnabled: {
    type: Boolean,
    default: true,
  },
  cooldownHours: {
    type: Number,
    default: 24,
    min: 1,
    max: 168, // 1 week max
  },
  lastNotified: {
    type: Map,
    of: Date,
    default: {},
  },
  preferences: {
    timezone: {
      type: String,
      default: 'UTC',
    },
    digestHourUTC: {
      type: Number,
      min: 0,
      max: 23,
    },
    digestPreference: {
      type: String,
      enum: ['daily-morning', 'daily-evening', 'twice-weekly', 'weekly', 'manual'],
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

// Compound unique index on userId + guildId
UserSubscriptionSchema.index({ userId: 1, guildId: 1 }, { unique: true });

// Update timestamp on save
UserSubscriptionSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

export const UserSubscription = mongoose.model<IUserSubscription>('UserSubscription', UserSubscriptionSchema);
