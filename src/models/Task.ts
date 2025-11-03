// MARK: - Task Model
// Persists scoped todo items for channels and threads

import mongoose, { Schema, Document } from 'mongoose';

export type TaskStatus = 'pending' | 'completed';

export interface ITask extends Document {
  guildId: string;
  channelId: string;
  threadId?: string;
  contextMessageId?: string;
  description: string;
  createdBy: string;
  assignedTo?: string;
  status: TaskStatus;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

const TaskSchema = new Schema<ITask>({
  guildId: {
    type: String,
    required: true,
    index: true,
  },
  channelId: {
    type: String,
    required: true,
    index: true,
  },
  threadId: {
    type: String,
    index: true,
  },
  contextMessageId: {
    type: String,
  },
  description: {
    type: String,
    required: true,
    minlength: 3,
    maxlength: 500,
  },
  createdBy: {
    type: String,
    required: true,
  },
  assignedTo: {
    type: String,
  },
  status: {
    type: String,
    enum: ['pending', 'completed'],
    default: 'pending',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
  completedAt: {
    type: Date,
  },
});

TaskSchema.index({ guildId: 1, status: 1 });
TaskSchema.index({ guildId: 1, channelId: 1, threadId: 1, status: 1 });
TaskSchema.index({ guildId: 1, assignedTo: 1, status: 1 });

TaskSchema.pre('save', function taskUpdate(this: ITask, next) {
  this.updatedAt = new Date();
  if (this.status === 'completed' && !this.completedAt) {
    this.completedAt = new Date();
  }
  next();
});

export const Task = mongoose.model<ITask>('Task', TaskSchema);
