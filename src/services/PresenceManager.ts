// MARK: - Presence Manager Service
// Rotates the bot presence with command hints and trending topics

import { Client } from 'discord.js';
import { topicTrendService } from './TopicTrendService';
import { logger } from '../utils/logger';
import { buildPresenceActivities, presenceFallbackActivity, PresenceActivity } from './PresenceActivityBuilder';

const ROTATION_INTERVAL_MS = 60_000; // Rotate every minute (well within rate limits)
const TREND_REFRESH_INTERVAL_MS = 10 * 60 * 1000; // Refresh trending data every 10 minutes

class PresenceManager {
  private client: Client | null = null;
  private guildId: string | null = null;
  private rotationTimer: NodeJS.Timeout | null = null;
  private activities: PresenceActivity[] = [];
  private activityIndex = 0;
  private lastTrendRefreshAt = 0;
  private cachedTopic: { label: string; mentions: number } | null = null;
  private cachedKeyword: { keyword: string; mentions: number } | null = null;

  initialize(client: Client, guildId: string): void {
    this.client = client;
    this.guildId = guildId;

    this.refreshActivities(true)
      .then(() => this.pushNextPresence())
      .catch(error => {
        const err = error as Error;
        logger.warn('Initial presence update failed', {
          error: err.message,
        });
      });

    this.rotationTimer = setInterval(() => {
      this.pushNextPresence().catch(error => {
        const err = error as Error;
        logger.warn('Scheduled presence update failed', {
          error: err.message,
        });
      });
    }, ROTATION_INTERVAL_MS);

    if (typeof this.rotationTimer.unref === 'function') {
      this.rotationTimer.unref();
    }
  }

  shutdown(): void {
    if (this.rotationTimer) {
      clearInterval(this.rotationTimer);
      this.rotationTimer = null;
    }
    this.activities = [];
    this.activityIndex = 0;
    this.cachedKeyword = null;
    this.cachedTopic = null;
  }

  private async refreshActivities(force = false): Promise<void> {
    if (!this.client || !this.guildId) {
      return;
    }

    await this.refreshTrendCache(force);

    const guildCount = Math.max(1, this.client.guilds.cache.size || 1);
    this.activities = buildPresenceActivities({
      trendingTopic: this.cachedTopic ?? undefined,
      trendingKeyword: this.cachedKeyword ?? undefined,
      guildCount,
    });

    if (this.activityIndex >= this.activities.length) {
      this.activityIndex = 0;
    }
  }

  private async pushNextPresence(): Promise<void> {
    if (!this.client || !this.client.user || !this.guildId) {
      return;
    }

    if (this.activities.length === 0) {
      await this.refreshActivities(true);
    }

    const activities = this.activities.length > 0 ? this.activities : [presenceFallbackActivity];
    const next = activities[this.activityIndex % activities.length];
    this.activityIndex = (this.activityIndex + 1) % activities.length;

    this.client.user.setPresence({
      activities: [next],
      status: 'online',
    });
  }

  private async refreshTrendCache(force = false): Promise<void> {
    if (!this.guildId) {
      return;
    }

    const now = Date.now();
    if (!force && now - this.lastTrendRefreshAt < TREND_REFRESH_INTERVAL_MS && this.cachedTopic !== null) {
      return;
    }

    try {
      const trends = await topicTrendService.getTrendingTopics(this.guildId, {
        limit: 3,
        windowHours: 72,
        minMentions: 1,
      });

      const topic = trends.topics.at(0);
      this.cachedTopic = topic
        ? {
            label: topic.label,
            mentions: topic.totalMentions,
          }
        : null;

      const keyword = trends.keywords.at(0);
      this.cachedKeyword = keyword
        ? {
            keyword: keyword.keyword,
            mentions: keyword.count,
          }
        : null;

      this.lastTrendRefreshAt = now;
    } catch (error: any) {
      logger.warn('Presence trend lookup failed, using fallback', {
        error: error.message,
      });
      this.cachedTopic = null;
      this.cachedKeyword = null;
      this.lastTrendRefreshAt = now;
    }
  }
}

export const presenceManager = new PresenceManager();
