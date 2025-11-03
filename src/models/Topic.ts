// MARK: - Topic Model
// Stores curated topic taxonomy for discovery & tagging

import mongoose, { Schema, Document } from 'mongoose';

export interface ITopic extends Document {
  slug: string;
  keywords: string[];
  bigrams: string[];
  boost: number;
  createdAt: Date;
  updatedAt: Date;
}

const TopicSchema = new Schema<ITopic>({
  slug: { type: String, required: true, index: true, unique: true },
  keywords: { type: [String], default: [] },
  bigrams: { type: [String], default: [] },
  boost: { type: Number, default: 1.0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

TopicSchema.pre('save', function topicUpdate(this: ITopic, next) {
  this.updatedAt = new Date();
  next();
});

export const Topic = mongoose.model<ITopic>('Topic', TopicSchema);
