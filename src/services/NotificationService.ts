// MARK: - Notification Service  
// Handles DM delivery with rate limiting and cooldown management

import { Client } from 'discord.js';
import { UserSubscription, IUserSubscription } from '../models/UserSubscription';
import { DigestHistory } from '../models/DigestHistory';
import { digestGenerator, DigestResult } from './DigestGenerator';
import { errorNotifier } from './ErrorNotifier';
import { RateLimiter } from '../utils/rateLimiter';
import { logger } from '../utils/logger';
import { DigestConfig } from '../models/DigestConfig';

function isSendableChannel(channel: unknown): channel is { send: (payload: any) => Promise<unknown> } {
  return Boolean(channel) && typeof (channel as any).send === 'function';
}

export class NotificationService {
  private client: Client | null = null;
  private dmRateLimiter = new RateLimiter(1000); // 1 message per second

  initialize(client: Client): void {
    this.client = client;
  }

  /**
   * Notify a single user if cooldown has passed
   */
  async notifyUser(
    userId: string,
    guildId: string,
    hours = 24
  ): Promise<{ success: boolean; reason?: string }> {
    try {
      if (!this.client) {
        throw new Error('NotificationService not initialized');
      }

      // Get user subscription
      const subscription = await UserSubscription.findOne({ userId, guildId });

      return this.deliverSubscriptionDigest({
        subscription,
        guildId,
            hours,
        requestLabel: `user:${userId}`,
      });

    } catch (error: any) {
      logger.error('Failed to notify user', {
        userId,
        guildId,
        error: error.message,
      });

      // Save failed attempt to history
      await DigestHistory.create({
        guildId,
        recipientUserId: userId,
        topicClusters: [],
        threadScores: [],
        topTopics: [],
        clusterLabels: [],
        tokensUsed: { input: 0, output: 0 },
        costUSD: 0,
        deliveryMethod: 'dm',
        success: false,
        errorMessage: error.message,
      });

      return { success: false, reason: error.message };
    }
  }

  /**
   * Send digest via DM with rate limiting
   */
  private async sendDigestDM(
    userId: string,
    digest: DigestResult
  ): Promise<{ success: boolean; reason?: string }> {
    try {
      if (!this.client) {
        throw new Error('NotificationService not initialized');
      }

      const user = await this.client.users.fetch(userId);

      // Use rate limiter to avoid Discord rate limits
      await this.dmRateLimiter.schedule(async () => {
        await user.send({ embeds: digest.embeds });
      });

      return { success: true };

    } catch (error: any) {
      // Handle closed DMs (error code 50007)
      if (error.code === 50007) {
        return { success: false, reason: 'DMs closed' };
      }

      logger.error('Failed to send DM', {
        userId,
        error: error.message,
      });

      return { success: false, reason: error.message };
    }
  }

  /**
   * Notify all eligible subscribers (for scheduled digests)
   */
  async notifyAllSubscribers(
    guildId: string,
    hours = 24
  ): Promise<{ successful: number; failed: number; skipped: number }> {
    try {
      const config = await DigestConfig.findOne({ guildId });
      const subscriptions = await UserSubscription.find({
        guildId,
        dmEnabled: true,
      });

      let successful = 0;
      let failed = 0;
      let skipped = 0;
      const broadcastKeywords = new Set<string>();

      logger.info('Starting batch notification', {
        guildId,
        totalSubscribers: subscriptions.length,
      });

      const grouped = this.groupSubscriptionsByKeywords(subscriptions);

      for (const group of grouped.values()) {
        const eligible: IUserSubscription[] = [];
        const ineligible: Array<{ subscription: IUserSubscription; reason: string }> = [];

        for (const subscription of group.subscribers) {
          subscription.keywords.forEach(keyword => broadcastKeywords.add(keyword));
              const assessment = this.assessEligibility(subscription);
          if (assessment.eligible) {
            eligible.push(subscription);
          } else if (assessment.reason) {
            ineligible.push({ subscription, reason: assessment.reason });
          }
        }

        skipped += ineligible.length;

        if (eligible.length === 0) {
          continue;
        }

        const summaryCacheTtlHours = eligible.reduce((max, entry) => (
          Math.max(max, entry.cooldownHours)
        ), hours);

        const digest = await digestGenerator.generateForKeywords(
          guildId,
          group.keywords,
          hours,
          `batch:${group.key}`,
          { summaryCacheTtlHours },
        );

        if (digest.stats.messageCount === 0) {
          skipped += eligible.length;
          continue;
        }

        for (const subscription of eligible) {
          const result = await this.deliverSubscriptionDigest({
            subscription,
            guildId,
            hours,
            precomputedDigest: digest,
            requestLabel: `batch:${group.key}`,
            skipEligibility: true,
          });

          if (result.success) {
            successful++;
          } else if (result.reason?.includes('Cooldown') || result.reason === 'No new messages') {
            skipped++;
          } else {
            failed++;
          }

          // Small delay between deliveries to smooth throughput (still rate-limited per DM)
          await this.sleep(100);
        }
      }

      logger.info('Batch notification completed', {
        guildId,
        successful,
        failed,
        skipped,
      });

      // Notify errors if any failures
      if (failed > 0) {
        await errorNotifier.notifyWarning(
          guildId,
          'Digest Delivery Failures',
          `${failed} out of ${subscriptions.length} digest deliveries failed.`,
          { successful, failed, skipped }
        );
      }

      if (config?.digestChannelId && broadcastKeywords.size > 0) {
        await this.deliverChannelDigest(
          guildId,
          config.digestChannelId,
          Array.from(broadcastKeywords).slice(0, 25),
          hours,
        );
      }

      return { successful, failed, skipped };

    } catch (error: any) {
      logger.error('Batch notification failed', {
        guildId,
        error: error.message,
      });

      await errorNotifier.notify(guildId, error, {
        context: 'notifyAllSubscribers',
        guildId,
      });

      throw error;
    }
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async deliverChannelDigest(
    guildId: string,
    channelId: string,
    keywords: string[],
    hours: number,
  ): Promise<void> {
    if (!this.client) {
      logger.warn('Skipping channel digest delivery: client not initialized', { guildId, channelId });
      return;
    }

    try {
      const channel = await this.client.channels.fetch(channelId);
      if (!channel || !channel.isTextBased() || !isSendableChannel(channel)) {
        logger.warn('Configured digest channel is not text-based', { guildId, channelId });
        return;
      }

      if (keywords.length === 0) {
        logger.debug('Skipping channel digest delivery due to empty keyword set', { guildId, channelId });
        return;
      }

      const digest = await digestGenerator.generateForUser(
        `channel-broadcast:${channelId}`,
        guildId,
        keywords,
        hours,
      );

      if (digest.stats.messageCount === 0) {
        logger.info('No channel digest generated (no matches)', { guildId, channelId });
        return;
      }

      const sendableChannel = channel as unknown as { send: (payload: any) => Promise<unknown> };
      await sendableChannel.send({ embeds: digest.embeds });

      await DigestHistory.create({
        guildId,
        recipientUserId: `channel:${channelId}`,
        topicClusters: digest.threadDetails.map(detail => ({
          keyword: detail.primaryTopic,
          messageCount: detail.messageCount,
          crossRefs: detail.topics.map(topic => ({ keyword: topic.slug, count: Math.round(topic.weight) })),
        })),
        threadScores: digest.stats.threadScores,
        topTopics: digest.stats.topTopics,
        clusterLabels: digest.stats.clusterLabels,
        tokensUsed: digest.stats.tokensUsed,
        costUSD: digest.stats.cost,
        deliveryMethod: 'channel',
        success: true,
      });

      logger.info('Channel digest delivered', {
        guildId,
        channelId,
        topics: digest.stats.topicCount,
        messages: digest.stats.messageCount,
      });
    } catch (error: any) {
      logger.error('Channel digest delivery failed', {
        guildId,
        channelId,
        error: error.message,
      });

      await DigestHistory.create({
        guildId,
        recipientUserId: `channel:${channelId}`,
        topicClusters: [],
        threadScores: [],
        topTopics: [],
        clusterLabels: [],
        tokensUsed: { input: 0, output: 0 },
        costUSD: 0,
        deliveryMethod: 'channel',
        success: false,
        errorMessage: error.message,
      });

      await errorNotifier.notifyWarning(
        guildId,
        'Channel Digest Failed',
        `Unable to post digest to <#${channelId}>`,
        { error: error.message },
      );
    }
  }

  private groupSubscriptionsByKeywords(subscriptions: IUserSubscription[]): Array<{
    key: string;
    keywords: string[];
    subscribers: IUserSubscription[];
  }> {
    const groups = new Map<string, { keywords: string[]; subscribers: IUserSubscription[] }>();

    for (const subscription of subscriptions) {
      const normalizedKeywords = this.normalizeKeywords(subscription.keywords);
      const key = normalizedKeywords.join('|');

      if (!groups.has(key)) {
        groups.set(key, { keywords: normalizedKeywords, subscribers: [] });
      }

      groups.get(key)!.subscribers.push(subscription);
    }

    return Array.from(groups.entries()).map(([key, value]) => ({ key, ...value }));
  }

  private normalizeKeywords(keywords: string[]): string[] {
    return Array.from(new Set(keywords.map(keyword => keyword.trim().toLowerCase()))).sort();
  }

  private assessEligibility(
    subscription: IUserSubscription
  ): { eligible: boolean; reason?: string } {
    if (!subscription || !subscription.dmEnabled) {
      return { eligible: false, reason: 'DMs not enabled' };
    }

    if (subscription.keywords.length === 0) {
      return { eligible: false, reason: 'No keywords subscribed' };
    }

    const now = Date.now();
    const cooldownMs = subscription.cooldownHours * 60 * 60 * 1000;

    for (const keyword of subscription.keywords) {
      const lastNotified = subscription.lastNotified.get(keyword);
      if (!lastNotified) {
        continue;
      }

      const timeSinceNotified = now - lastNotified.getTime();
      if (timeSinceNotified < cooldownMs) {
        const remainingHours = Math.ceil((cooldownMs - timeSinceNotified) / (1000 * 60 * 60));
        return {
          eligible: false,
          reason: `Cooldown active (${remainingHours}h remaining for "${keyword}")`,
        };
      }
    }

    return { eligible: true };
  }

  private async deliverSubscriptionDigest(params: {
    subscription: IUserSubscription | null;
    guildId: string;
    hours: number;
    precomputedDigest?: DigestResult;
    requestLabel: string;
    skipEligibility?: boolean;
  }): Promise<{ success: boolean; reason?: string }> {
    const { subscription, guildId, hours, precomputedDigest, requestLabel, skipEligibility } = params;

    if (!subscription) {
      return { success: false, reason: 'Subscription not found' };
    }

    if (!skipEligibility) {
      const eligibility = this.assessEligibility(subscription);
      if (!eligibility.eligible) {
        return { success: false, reason: eligibility.reason };
      }
    }

    const summaryCacheTtlHours = Math.max(hours, subscription.cooldownHours);

    const digest = precomputedDigest ?? await digestGenerator.generateForKeywords(
      guildId,
      subscription.keywords,
      hours,
      requestLabel,
      { summaryCacheTtlHours },
    );

    if (digest.stats.messageCount === 0) {
      return { success: false, reason: 'No new messages' };
    }

    const dmResult = await this.sendDigestDM(subscription.userId, digest);

    if (!dmResult.success) {
      if (dmResult.reason === 'DMs closed') {
        subscription.dmEnabled = false;
        await subscription.save();
        logger.warn('User DMs closed, disabled notifications', { userId: subscription.userId });
      }

      await this.recordDigestHistory({
        guildId,
        recipientUserId: subscription.userId,
        digest,
        success: false,
        reason: dmResult.reason,
      });

      return dmResult;
    }

    const updateTime = new Date();
    for (const keyword of subscription.keywords) {
      subscription.lastNotified.set(keyword, updateTime);
    }
    await subscription.save();

    await this.recordDigestHistory({
      guildId,
      recipientUserId: subscription.userId,
      digest,
      success: true,
    });

    logger.info('Digest delivered', {
      userId: subscription.userId,
      topics: digest.stats.topicCount,
      messages: digest.stats.messageCount,
      cost: digest.stats.cost.toFixed(4),
      requestLabel,
    });

    return { success: true };
  }

  private async recordDigestHistory(params: {
    guildId: string;
    recipientUserId: string;
    digest: DigestResult;
    success: boolean;
    reason?: string;
  }): Promise<void> {
    const { guildId, recipientUserId, digest, success, reason } = params;

    await DigestHistory.create({
      guildId,
      recipientUserId,
      topicClusters: digest.threadDetails.map(detail => ({
        keyword: detail.primaryTopic,
        messageCount: detail.messageCount,
        crossRefs: detail.topics.map(topic => ({ keyword: topic.slug, count: Math.round(topic.weight) })),
      })),
      threadScores: digest.stats.threadScores,
      topTopics: digest.stats.topTopics,
      clusterLabels: digest.stats.clusterLabels,
      tokensUsed: digest.stats.tokensUsed,
      costUSD: digest.stats.cost,
      deliveryMethod: 'dm',
      success,
      errorMessage: success ? undefined : reason,
    });
  }
}

// Export singleton instance
export const notificationService = new NotificationService();
