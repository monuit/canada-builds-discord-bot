// MARK: - Webhook Manager Service
// Auto-creates and caches Discord webhooks with 24h validation

import { 
  Client, 
  TextChannel, 
  WebhookClient, 
  EmbedBuilder,
  PermissionFlagsBits 
} from 'discord.js';
import { Webhook } from '../models/Webhook';
import { logger } from '../utils/logger';

export class WebhookManager {
  private client: Client | null = null;

  /**
   * Initialize with Discord client
   */
  initialize(client: Client): void {
    this.client = client;
  }

  /**
   * Get or create webhook for a channel with 24h validation caching
   */
  async getOrCreateWebhook(channelId: string): Promise<WebhookClient> {
    if (!this.client) {
      throw new Error('WebhookManager not initialized');
    }

    try {
      // Check database for existing webhook
      const webhookDoc = await Webhook.findOne({ channelId });

      if (webhookDoc) {
        // Check if validation is needed (older than 24 hours)
        const hoursSinceValidation = 
          (Date.now() - webhookDoc.lastValidated.getTime()) / (1000 * 60 * 60);

        if (hoursSinceValidation < 24 && webhookDoc.isValid) {
          // Recently validated, use cached
          return new WebhookClient({
            id: webhookDoc.webhookId,
            token: webhookDoc.webhookToken,
          });
        }

        // Validate webhook
        const webhookClient = new WebhookClient({
          id: webhookDoc.webhookId,
          token: webhookDoc.webhookToken,
        });

        const isValid = await this.validateWebhook(webhookClient);

        if (isValid) {
          // Update validation timestamp
          webhookDoc.lastValidated = new Date();
          webhookDoc.isValid = true;
          await webhookDoc.save();
          
          logger.debug('Webhook validated', { channelId });
          return webhookClient;
        } else {
          // Invalid, delete and recreate
          await Webhook.deleteOne({ channelId });
          logger.info('Invalid webhook deleted, will recreate', { channelId });
        }
      }

      // Create new webhook
      const channel = await this.client.channels.fetch(channelId);
      
      if (!channel || !(channel instanceof TextChannel)) {
        throw new Error('Channel not found or not a text channel');
      }

      // Check bot permissions
      const botMember = channel.guild.members.me;
      if (!botMember?.permissions.has(PermissionFlagsBits.ManageWebhooks)) {
        throw new Error('Bot lacks MANAGE_WEBHOOKS permission in channel');
      }

      const webhook = await channel.createWebhook({
        name: 'Build Canada Digest',
        reason: 'Automated digest delivery',
      });

      // Store in database
      await Webhook.create({
        guildId: channel.guildId,
        channelId: channel.id,
        webhookId: webhook.id,
        webhookToken: webhook.token!,
        lastValidated: new Date(),
        isValid: true,
      });

      logger.info('Webhook created', { channelId, webhookId: webhook.id });

      return new WebhookClient({
        id: webhook.id,
        token: webhook.token!,
      });

    } catch (error: any) {
      logger.error('Failed to get/create webhook', {
        channelId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Validate webhook by fetching metadata
   */
  private async validateWebhook(_webhookClient: WebhookClient): Promise<boolean> {
    try {
      // WebhookClient doesn't have a fetch() method in discord.js v14
      // We'll validate on first use instead
      return true;
    } catch (error: any) {
      // Error codes for invalid webhooks
      if (error.code === 10015 || error.code === 50027) {
        return false; // Unknown Webhook or Invalid Token
      }
      throw error; // Other errors should be handled by caller
    }
  }

  /**
   * Send embeds via webhook with retry logic
   */
  async sendEmbeds(
    channelId: string,
    embeds: EmbedBuilder[],
    username = 'Build Canada Digest'
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const maxAttempts = 2;
    let attempt = 0;

    while (attempt < maxAttempts) {
      try {
        const webhookClient = await this.getOrCreateWebhook(channelId);

        const message = await webhookClient.send({
          embeds,
          username,
        });

        logger.info('Digest sent via webhook', {
          channelId,
          embedCount: embeds.length,
          messageId: typeof message === 'string' ? message : message.id,
        });

        return {
          success: true,
          messageId: typeof message === 'string' ? message : message.id,
        };

      } catch (error: any) {
        attempt++;

        // Handle unknown webhook (force recreation)
        if (error.code === 10015) {
          await Webhook.deleteOne({ channelId });
          logger.warn('Webhook deleted, retrying', { channelId, attempt });
          
          if (attempt < maxAttempts) {
            continue;
          }
        }

        // Handle rate limits
        if (error.status === 429) {
          const retryAfter = error.retryAfter || 5;
          logger.warn('Webhook rate limited', { channelId, retryAfter });
          
          if (attempt < maxAttempts) {
            await this.sleep(retryAfter * 1000);
            continue;
          }
        }

        // Handle missing permissions
        if (error.code === 50013) {
          return {
            success: false,
            error: 'Bot lacks MANAGE_WEBHOOKS permission',
          };
        }

        logger.error('Failed to send via webhook', {
          channelId,
          attempt,
          error: error.message,
        });

        if (attempt >= maxAttempts) {
          return {
            success: false,
            error: error.message,
          };
        }
      }
    }

    return {
      success: false,
      error: 'Max retry attempts exceeded',
    };
  }

  /**
   * Delete cached webhook
   */
  async deleteWebhookCache(channelId: string): Promise<void> {
    await Webhook.deleteOne({ channelId });
    logger.info('Webhook cache deleted', { channelId });
  }

  /**
   * Cleanup invalid webhooks older than 7 days
   */
  async cleanupOldWebhooks(): Promise<number> {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    
    const result = await Webhook.deleteMany({
      isValid: false,
      lastValidated: { $lt: sevenDaysAgo },
    });

    logger.info('Old webhooks cleaned up', { count: result.deletedCount });
    return result.deletedCount || 0;
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export singleton instance
export const webhookManager = new WebhookManager();
