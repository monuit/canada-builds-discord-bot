// MARK: - Guild Inventory State Model
// Tracks scanning checkpoints for guild-wide resource inventories

import mongoose, { Document, Schema } from 'mongoose';

export interface IGuildInventoryState extends Document {
  guildId: string;
  initialScanCompleted: boolean;
  lastFullScanAt?: Date;
  lastIncrementalScanAt?: Date;
  nightlyCron?: string;
  createdAt: Date;
  updatedAt: Date;
}

const GuildInventoryStateSchema = new Schema<IGuildInventoryState>({
  guildId: {
    type: String,
    required: true,
    unique: true,
  },
  initialScanCompleted: {
    type: Boolean,
    default: false,
  },
  lastFullScanAt: {
    type: Date,
  },
  lastIncrementalScanAt: {
    type: Date,
  },
  nightlyCron: {
    type: String,
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

GuildInventoryStateSchema.pre('save', function save(next) {
  this.updatedAt = new Date();
  next();
});

export const GuildInventoryState = mongoose.model<IGuildInventoryState>('GuildInventoryState', GuildInventoryStateSchema);
