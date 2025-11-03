// MARK: - Consent Ledger Model
// Tracks user consent state for onboarding and DM automation

import mongoose, { Schema, Document } from 'mongoose';

type ConsentStatus = 'pending' | 'consented' | 'revoked';

export interface IConsentLedger extends Document {
  guildId: string;
  userId: string;
  status: ConsentStatus;
  consentVersion: string;
  defaultSubscriptions: string[];
  consentedAt?: Date;
  revokedAt?: Date;
  lastInteractionAt?: Date;
  onboardingSessionId?: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const ConsentLedgerSchema = new Schema<IConsentLedger>({
  guildId: {
    type: String,
    required: true,
    index: true,
  },
  userId: {
    type: String,
    required: true,
    index: true,
  },
  status: {
    type: String,
    enum: ['pending', 'consented', 'revoked'],
    default: 'pending',
  },
  consentVersion: {
    type: String,
    default: 'v1',
  },
  defaultSubscriptions: [{
    type: String,
  }],
  consentedAt: {
    type: Date,
  },
  revokedAt: {
    type: Date,
  },
  lastInteractionAt: {
    type: Date,
  },
  onboardingSessionId: {
    type: String,
  },
  metadata: {
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

ConsentLedgerSchema.index({ guildId: 1, userId: 1 }, { unique: true });

ConsentLedgerSchema.pre('save', function consentLedgerUpdate(this: IConsentLedger, next) {
  this.updatedAt = new Date();
  next();
});

export const ConsentLedger = mongoose.model<IConsentLedger>('ConsentLedger', ConsentLedgerSchema);
