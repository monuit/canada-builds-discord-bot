// MARK: - Admin Clear User Command
// Admin remove all subscriptions for a user

import { ChatInputCommandInteraction, MessageFlags, SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { UserSubscription } from '../models/UserSubscription';
import { messageIndexer } from '../services/MessageIndexer';
import { logger } from '../utils/logger';

export const data = new SlashCommandBuilder()
  .setName('admin-clear-user')
  .setDescription('Remove all subscriptions for a specific user (Admin only)')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addUserOption(option =>
    option
      .setName('user')
      .setDescription('User to clear subscriptions for')
      .setRequired(true)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  try {
    const guildId = interaction.guildId;

    if (!guildId) {
      await interaction.reply({
        content: '❌ This command can only be used in a server.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Verify admin permissions
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({
        content: '❌ This command requires Administrator permissions.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const targetUser = interaction.options.getUser('user', true);
    const userId = targetUser.id;

    // Get existing subscription
    const subscription = await UserSubscription.findOne({ userId, guildId });

    if (!subscription) {
      await interaction.reply({
        content: `⚠️ User ${targetUser.tag} has no active subscriptions.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Store keywords for logging
    const clearedKeywords = [...subscription.keywords];

    // Delete subscription
    await UserSubscription.deleteOne({ userId, guildId });

    // Refresh message indexer
    await messageIndexer.refreshKeywords(guildId);

    logger.info('Admin cleared user subscriptions', {
      adminId: interaction.user.id,
      targetUserId: userId,
      guildId,
      clearedKeywords,
    });

    await interaction.reply({
      content:
        `✅ **User Subscriptions Cleared**\n\n` +
        `**User**: ${targetUser.tag}\n` +
        `**Cleared Keywords**: ${clearedKeywords.join(', ')}\n\n` +
        `All subscriptions for this user have been removed.`,
      flags: MessageFlags.Ephemeral,
    });

  } catch (error: any) {
    logger.error('Admin clear user command failed', {
      userId: interaction.user.id,
      error: error.message,
    });

    await interaction.reply({
      content: '❌ An error occurred while clearing user subscriptions. Please try again.',
      flags: MessageFlags.Ephemeral,
    });
  }
}
