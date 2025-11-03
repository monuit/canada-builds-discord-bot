// MARK: - Guild Feature Config Model
// Stores guild-wide feature toggles and defaults for automation flows

import mongoose, { Schema, Document } from 'mongoose';

export interface IGuildFeatureConfig extends Document {
  guildId: string;
  highlightChannelId?: string;
  errorChannelId?: string;
  onboardingDefaults: {
    autoSubscribeKeywords: string[];
    consentVersion: string;
  };
  channelMultipliers: Record<string, number>;
  featureFlags: Record<string, boolean>;
  createdAt: Date;
  updatedAt: Date;
}

const GuildFeatureConfigSchema = new Schema<IGuildFeatureConfig>({
  guildId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  highlightChannelId: {
    type: String,
  },
  errorChannelId: {
    type: String,
  },
  onboardingDefaults: {
    autoSubscribeKeywords: {
      type: [String],
      default: ['announcements', 'events', 'resources'],
    },
    consentVersion: {
      type: String,
      default: 'v1',
    },
  },
  featureFlags: {
    type: Schema.Types.Mixed,
    default: {},
  },
  channelMultipliers: {
    type: Schema.Types.Mixed,
    default: {},
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

GuildFeatureConfigSchema.pre('save', function guildFeatureConfigUpdate(this: IGuildFeatureConfig, next) {
  this.updatedAt = new Date();
  next();
});

export const GuildFeatureConfig = mongoose.model<IGuildFeatureConfig>('GuildFeatureConfig', GuildFeatureConfigSchema);
