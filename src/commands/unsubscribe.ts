// MARK: - Unsubscribe Command
// Remove keywords or all subscriptions

import { AutocompleteInteraction, ChatInputCommandInteraction, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { UserSubscription } from '../models/UserSubscription';
import { messageIndexer } from '../services/MessageIndexer';
import { logger } from '../utils/logger';

export const data = new SlashCommandBuilder()
  .setName('unsubscribe')
  .setDescription('Remove keyword subscriptions')
  .addSubcommand(subcommand =>
    subcommand
      .setName('keywords')
      .setDescription('Remove specific keywords from your subscription')
      .addStringOption(option =>
        option
          .setName('keywords')
          .setDescription('Comma-separated keywords to remove')
          .setRequired(true)
          .setAutocomplete(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('all')
      .setDescription('Remove all keywords and delete your subscription')
  );

// MARK: - Autocomplete Handler
export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  let subcommand: string | null = null;
  try {
    subcommand = interaction.options.getSubcommand();
  } catch (_error) {
    subcommand = null;
  }

  if (subcommand !== 'keywords') {
    await interaction.respond([]);
    return;
  }

  const focused = interaction.options.getFocused(true);

  if (focused.name !== 'keywords') {
    await interaction.respond([]);
    return;
  }

  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.respond([]);
    return;
  }

  try {
    const subscription = await UserSubscription.findOne({
      userId: interaction.user.id,
      guildId,
    }).lean();

    if (!subscription || !Array.isArray(subscription.keywords) || subscription.keywords.length === 0) {
      await interaction.respond([]);
      return;
    }

    const rawValue = typeof focused.value === 'string' ? focused.value : '';
    const segments = rawValue.split(',').map(segment => segment.trim());
    const currentFragment = segments.pop() ?? '';
    const settledFragments = segments.filter(Boolean);

    const usedKeywords = new Set(settledFragments.map(fragment => fragment.toLowerCase()));
    const normalizedCurrent = currentFragment.toLowerCase();

    const availableKeywords = subscription.keywords
      .filter(keyword => typeof keyword === 'string')
      .filter(keyword => !usedKeywords.has(keyword.toLowerCase()));

    const matches = availableKeywords
      .filter(keyword =>
        normalizedCurrent.length === 0
          ? true
          : keyword.toLowerCase().includes(normalizedCurrent)
      );

    const shortlist = (matches.length > 0 ? matches : availableKeywords).slice(0, 25);

    const choices = shortlist.map(keyword => {
      const combinedParts = [...settledFragments, keyword].join(', ');
      return {
        name: keyword,
        value: combinedParts,
      };
    });

    await interaction.respond(choices);
  } catch (error: any) {
    logger.error('Unsubscribe autocomplete failed', {
      userId: interaction.user.id,
      guildId,
      error: error.message,
    });
    await interaction.respond([]);
  }
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  try {
    const guildId = interaction.guildId;
    const userId = interaction.user.id;
    const subcommand = interaction.options.getSubcommand();

    if (!guildId) {
      await interaction.reply({
        content: '❌ This command can only be used in a server.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Get existing subscription
    const subscription = await UserSubscription.findOne({ userId, guildId });

    if (!subscription) {
      await interaction.reply({
        content: '❌ You have no active subscriptions. Use `/subscribe` to create one.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (subcommand === 'all') {
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
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const keywordsInput = interaction.options.getString('keywords', true);

    const keywordsToRemove = keywordsInput
      .split(',')
      .map(kw => kw.trim().toLowerCase())
      .filter(kw => kw.length > 0);

    if (keywordsToRemove.length === 0) {
      await interaction.reply({
        content: '❌ Please provide valid keywords to remove.',
        flags: MessageFlags.Ephemeral,
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
        flags: MessageFlags.Ephemeral,
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
        flags: MessageFlags.Ephemeral,
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
      flags: MessageFlags.Ephemeral,
    });

  } catch (error: any) {
    logger.error('Unsubscribe command failed', {
      userId: interaction.user.id,
      error: error.message,
    });

    await interaction.reply({
      content: '❌ An error occurred while updating your subscription. Please try again.',
      flags: MessageFlags.Ephemeral,
    });
  }
}
