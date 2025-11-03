// MARK: - Unsubscribe Command
// Remove keywords or all subscriptions

import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { UserSubscription } from '../models/UserSubscription';
import { messageIndexer } from '../services/MessageIndexer';
import { logger } from '../utils/logger';

export const data = new SlashCommandBuilder()
  .setName('unsubscribe')
  .setDescription('Remove keyword subscriptions')
  .addStringOption(option =>
    option
      .setName('keywords')
      .setDescription('Comma-separated keywords to remove (leave empty to remove all)')
      .setRequired(false)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  try {
    const keywordsInput = interaction.options.getString('keywords');
    const guildId = interaction.guildId;
    const userId = interaction.user.id;

    if (!guildId) {
      await interaction.reply({
        content: '❌ This command can only be used in a server.',
        ephemeral: true,
      });
      return;
    }

    // Get existing subscription
    const subscription = await UserSubscription.findOne({ userId, guildId });

    if (!subscription) {
      await interaction.reply({
        content: '❌ You have no active subscriptions. Use `/subscribe` to create one.',
        ephemeral: true,
      });
      return;
    }

    // If no keywords provided, remove all
    if (!keywordsInput || keywordsInput.trim().length === 0) {
      await UserSubscription.deleteOne({ userId, guildId });
      await messageIndexer.refreshKeywords(guildId);

      logger.info('User unsubscribed from all keywords', {
        userId,
        guildId,
        removedKeywords: subscription.keywords,
      });

      await interaction.reply({
        content:
          `✅ **All Subscriptions Removed**\n\n` +
          `You've been unsubscribed from all keywords.\n\n` +
          `Previously subscribed to: ${subscription.keywords.join(', ')}\n\n` +
          `Use \`/subscribe\` to create a new subscription anytime.`,
        ephemeral: true,
      });
      return;
    }

    // Parse keywords to remove
    const keywordsToRemove = keywordsInput
      .split(',')
      .map(kw => kw.trim().toLowerCase())
      .filter(kw => kw.length > 0);

    if (keywordsToRemove.length === 0) {
      await interaction.reply({
        content: '❌ Please provide valid keywords to remove.',
        ephemeral: true,
      });
      return;
    }

    // Filter out keywords
    const originalKeywords = [...subscription.keywords];
    const updatedKeywords = subscription.keywords.filter(
      kw => !keywordsToRemove.includes(kw.toLowerCase())
    );

    // Check if any keywords were actually removed
    const removedKeywords = originalKeywords.filter(
      kw => !updatedKeywords.includes(kw)
    );

    if (removedKeywords.length === 0) {
      await interaction.reply({
        content:
          `❌ None of the specified keywords were found in your subscription.\n\n` +
          `**Your current keywords**: ${originalKeywords.join(', ')}\n` +
          `**Tried to remove**: ${keywordsToRemove.join(', ')}`,
        ephemeral: true,
      });
      return;
    }

    // If all keywords removed, delete subscription
    if (updatedKeywords.length === 0) {
      await UserSubscription.deleteOne({ userId, guildId });
      await messageIndexer.refreshKeywords(guildId);

      logger.info('User unsubscribed (all keywords removed)', {
        userId,
        guildId,
        removedKeywords,
      });

      await interaction.reply({
        content:
          `✅ **All Keywords Removed**\n\n` +
          `Removed: ${removedKeywords.join(', ')}\n\n` +
          `You have no active subscriptions. Use \`/subscribe\` to create a new one.`,
        ephemeral: true,
      });
      return;
    }

    // Update subscription with remaining keywords
    subscription.keywords = updatedKeywords;
    subscription.updatedAt = new Date();
    await subscription.save();
    await messageIndexer.refreshKeywords(guildId);

    logger.info('User unsubscribed from keywords', {
      userId,
      guildId,
      removedKeywords,
      remainingKeywords: updatedKeywords,
    });

    await interaction.reply({
      content:
        `✅ **Keywords Removed**\n\n` +
        `**Removed**: ${removedKeywords.join(', ')}\n` +
        `**Remaining**: ${updatedKeywords.join(', ')}\n\n` +
        `Use \`/my-subscriptions\` to view your current settings.`,
      ephemeral: true,
    });

  } catch (error: any) {
    logger.error('Unsubscribe command failed', {
      userId: interaction.user.id,
      error: error.message,
    });

    await interaction.reply({
      content: '❌ An error occurred while updating your subscription. Please try again.',
      ephemeral: true,
    });
  }
}
