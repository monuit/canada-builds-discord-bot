// MARK: - Webhook Model
// Caches Discord webhooks for efficient reuse

import mongoose, { Schema, Document } from 'mongoose';

export interface IWebhook extends Document {
  guildId: string;
  channelId: string;
  webhookId: string;
  webhookToken: string;
  lastValidated: Date;
  isValid: boolean;
  createdAt: Date;
}

const WebhookSchema = new Schema<IWebhook>({
  guildId: {
    type: String,
    required: true,
    index: true,
  },
  channelId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  webhookId: {
    type: String,
    required: true,
  },
  webhookToken: {
    type: String,
    required: true,
  },
  lastValidated: {
    type: Date,
    default: Date.now,
  },
  isValid: {
    type: Boolean,
    default: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export const Webhook = mongoose.model<IWebhook>('Webhook', WebhookSchema);
