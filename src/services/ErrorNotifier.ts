// MARK: - Error Notifier Service
// Posts critical errors to configured error channel

import { Client, EmbedBuilder, TextChannel } from 'discord.js';
import { DigestConfig } from '../models/DigestConfig';
import { logger } from '../utils/logger';

export class ErrorNotifier {
  private client: Client | null = null;

  /**
   * Initialize with Discord client
   */
  initialize(client: Client): void {
    this.client = client;
  }

  /**
   * Notify error to configured channel
   */
  async notify(
    guildId: string,
    error: Error,
    context: Record<string, any>
  ): Promise<void> {
    try {
      if (!this.client) {
        logger.warn('ErrorNotifier not initialized, skipping notification');
        return;
      }

      // Get error channel from config
      const config = await DigestConfig.findOne({ guildId });
      if (!config || !config.errorChannelId) {
        logger.warn('No error channel configured', { guildId });
        return;
      }

      const channel = await this.client.channels.fetch(config.errorChannelId);
      if (!channel || !(channel instanceof TextChannel)) {
        logger.warn('Error channel not found or not a text channel', {
          channelId: config.errorChannelId,
        });
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle('🚨 Bot Error')
        .setDescription(error.message)
        .setColor(0xFF0000) // Red
        .setTimestamp()
        .addFields(
          { name: 'Context', value: this.formatContext(context), inline: false },
          { 
            name: 'Stack Trace', 
            value: this.truncateStackTrace(error.stack || 'No stack trace'), 
            inline: false 
          }
        );

      await channel.send({ embeds: [embed] });

      logger.info('Error notification sent', { guildId, channelId: config.errorChannelId });

    } catch (notifyError: any) {
      logger.error('Failed to send error notification', {
        guildId,
        originalError: error.message,
        notifyError: notifyError.message,
      });
    }
  }

  /**
   * Notify warning to configured channel
   */
  async notifyWarning(
    guildId: string,
    title: string,
    message: string,
    context?: Record<string, any>
  ): Promise<void> {
    try {
      if (!this.client) return;

      const config = await DigestConfig.findOne({ guildId });
      if (!config || !config.errorChannelId) return;

      const channel = await this.client.channels.fetch(config.errorChannelId);
      if (!channel || !(channel instanceof TextChannel)) return;

      const embed = new EmbedBuilder()
        .setTitle(`⚠️ ${title}`)
        .setDescription(message)
        .setColor(0xFFAA00) // Orange
        .setTimestamp();

      if (context) {
        embed.addFields({
          name: 'Details',
          value: this.formatContext(context),
          inline: false,
        });
      }

      await channel.send({ embeds: [embed] });

    } catch (error: any) {
      logger.error('Failed to send warning notification', {
        guildId,
        error: error.message,
      });
    }
  }

  /**
   * Notify critical error with admin mention
   */
  async notifyCritical(
    guildId: string,
    error: Error,
    context: Record<string, any>
  ): Promise<void> {
    try {
      if (!this.client) return;

      const config = await DigestConfig.findOne({ guildId });
      if (!config || !config.errorChannelId) return;

      const channel = await this.client.channels.fetch(config.errorChannelId);
      if (!channel || !(channel instanceof TextChannel)) return;

      const embed = new EmbedBuilder()
        .setTitle('🔥 CRITICAL ERROR')
        .setDescription(`**${error.message}**\n\nImmediate attention required.`)
        .setColor(0xFF0000)
        .setTimestamp()
        .addFields(
          { name: 'Context', value: this.formatContext(context), inline: false },
          { 
            name: 'Stack Trace', 
            value: this.truncateStackTrace(error.stack || 'No stack trace'), 
            inline: false 
          }
        );

      await channel.send({
        content: '@here Critical bot error requires attention',
        embeds: [embed],
      });

    } catch (notifyError: any) {
      logger.error('Failed to send critical notification', {
        guildId,
        error: notifyError.message,
      });
    }
  }

  /**
   * Format context object as readable string
   */
  private formatContext(context: Record<string, any>): string {
    return Object.entries(context)
      .map(([key, value]) => `**${key}**: ${JSON.stringify(value)}`)
      .join('\n')
      .slice(0, 1024); // Discord field limit
  }

  /**
   * Truncate stack trace to fit Discord limits
   */
  private truncateStackTrace(stack: string): string {
    const maxLength = 1000;
    if (stack.length <= maxLength) {
      return `\`\`\`\n${stack}\n\`\`\``;
    }
    return `\`\`\`\n${stack.slice(0, maxLength)}...\n\`\`\``;
  }
}

// Export singleton instance
export const errorNotifier = new ErrorNotifier();
