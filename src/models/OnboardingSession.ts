// MARK: - Onboarding Session Model
// Persists multi-step onboarding workflows for restart safety

import mongoose, { Schema, Document } from 'mongoose';

export type OnboardingSessionStatus = 'pending' | 'completed' | 'expired';

interface ResponseSnapshot {
  step: string;
  value: string;
  recordedAt: Date;
}

export interface IOnboardingSession extends Document {
  guildId: string;
  userId: string;
  sessionId: string;
  status: OnboardingSessionStatus;
  currentStep: string;
  responses: ResponseSnapshot[];
  lastPromptAt?: Date;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ResponseSchema = new Schema<ResponseSnapshot>({
  step: {
    type: String,
    required: true,
  },
  value: {
    type: String,
    required: true,
  },
  recordedAt: {
    type: Date,
    default: Date.now,
  },
}, { _id: false });

const OnboardingSessionSchema = new Schema<IOnboardingSession>({
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
  sessionId: {
    type: String,
    required: true,
    unique: true,
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'expired'],
    default: 'pending',
  },
  currentStep: {
    type: String,
    required: true,
  },
  responses: {
    type: [ResponseSchema],
    default: [],
  },
  lastPromptAt: {
    type: Date,
  },
  expiresAt: {
    type: Date,
    index: { expires: '2d' },
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

OnboardingSessionSchema.index({ guildId: 1, userId: 1, status: 1 });

OnboardingSessionSchema.pre('save', function onboardingSessionUpdate(this: IOnboardingSession, next) {
  this.updatedAt = new Date();
  next();
});

export const OnboardingSession = mongoose.model<IOnboardingSession>('OnboardingSession', OnboardingSessionSchema);
