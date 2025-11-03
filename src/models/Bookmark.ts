// MARK: - Bookmark Model
// Tracks highlight relay entries created from starred messages

import mongoose, { Schema, Document } from 'mongoose';

export interface IBookmark extends Document {
  guildId: string;
  channelId: string;
  messageId: string;
  highlightChannelId: string;
  highlightMessageId?: string;
  starredBy: string[];
  firstStarredAt: Date;
  lastStarredAt: Date;
  removedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const BookmarkSchema = new Schema<IBookmark>({
  guildId: {
    type: String,
    required: true,
    index: true,
  },
  channelId: {
    type: String,
    required: true,
  },
  messageId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  highlightChannelId: {
    type: String,
    required: true,
  },
  highlightMessageId: {
    type: String,
  },
  starredBy: {
    type: [String],
    default: [],
  },
  firstStarredAt: {
    type: Date,
    default: Date.now,
  },
  lastStarredAt: {
    type: Date,
    default: Date.now,
  },
  removedAt: {
    type: Date,
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

BookmarkSchema.index({ guildId: 1, highlightChannelId: 1 });

BookmarkSchema.pre('save', function bookmarkUpdate(this: IBookmark, next) {
  this.updatedAt = new Date();
  next();
});

export const Bookmark = mongoose.model<IBookmark>('Bookmark', BookmarkSchema);
