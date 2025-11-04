// MARK: - Reminder Model
// Stores scheduled reminders for users or channels

import mongoose, { Document, Schema } from 'mongoose';

export type ReminderDeliveryMethod = 'dm' | 'channel';
export type ReminderStatus = 'pending' | 'processing' | 'sent' | 'failed';

export interface IReminder extends Document {
  guildId: string;
  userId: string;
  deliveryMethod: ReminderDeliveryMethod;
  targetChannelId?: string;
  note?: string;
  messageLink?: string;
  remindAt: Date;
  status: ReminderStatus;
  createdAt: Date;
  sentAt?: Date;
  failureReason?: string;
  processingStartedAt?: Date;
}

const ReminderSchema = new Schema<IReminder>({
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
  deliveryMethod: {
    type: String,
    enum: ['dm', 'channel'],
    required: true,
  },
  targetChannelId: {
    type: String,
    required() {
      return this.deliveryMethod === 'channel';
    },
  },
  note: {
    type: String,
    maxlength: 240,
  },
  messageLink: {
    type: String,
    maxlength: 400,
  },
  remindAt: {
    type: Date,
    required: true,
    index: true,
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'sent', 'failed'],
    default: 'pending',
    index: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
  sentAt: {
    type: Date,
  },
  failureReason: {
    type: String,
    maxlength: 300,
  },
  processingStartedAt: {
    type: Date,
  },
});

ReminderSchema.index({ status: 1, remindAt: 1 });
ReminderSchema.index({ guildId: 1, status: 1 });

export const Reminder = mongoose.model<IReminder>('Reminder', ReminderSchema);
