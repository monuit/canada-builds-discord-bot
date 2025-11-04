// MARK: - Admin Remove Channel Command
// Admin exclude channel from indexing

import { ChatInputCommandInteraction, MessageFlags, SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import { DigestConfig } from '../models/DigestConfig';
import { Webhook } from '../models/Webhook';
import { messageIndexer } from '../services/MessageIndexer';
import { logger } from '../utils/logger';

export const data = new SlashCommandBuilder()
  .setName('admin-remove-channel')
  .setDescription('Exclude a channel from message indexing (Admin only)')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addChannelOption(option =>
    option
      .setName('channel')
      .setDescription('Channel to exclude from indexing')
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
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

    const channel = interaction.options.getChannel('channel', true);
    const channelId = channel.id;

    // Get config
    const config = await DigestConfig.findOne({ guildId });

    if (!config) {
      await interaction.reply({
        content: '❌ Server configuration not found.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Check if already excluded
    if (config.excludedChannelIds.includes(channelId)) {
      await interaction.reply({
        content: `⚠️ Channel <#${channelId}> is already excluded from indexing.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Add to excluded channels
    config.excludedChannelIds.push(channelId);
    await config.save();

    // Delete webhook cache for this channel (if exists)
    await Webhook.deleteOne({ guildId, channelId });

    // Update message indexer
    messageIndexer.addExcludedChannel(channelId);

    logger.info('Admin excluded channel from indexing', {
      adminId: interaction.user.id,
      guildId,
      channelId,
      channelName: channel.name,
    });

    await interaction.reply({
      content:
        `✅ **Channel Excluded**\n\n` +
        `**Channel**: <#${channelId}>\n\n` +
        `Messages from this channel will no longer be indexed.\n` +
        `Existing messages from this channel remain in the database but won't appear in future digests.`,
      flags: MessageFlags.Ephemeral,
    });

  } catch (error: any) {
    logger.error('Admin remove channel command failed', {
      userId: interaction.user.id,
      error: error.message,
    });

    await interaction.reply({
      content: '❌ An error occurred while excluding the channel. Please try again.',
      flags: MessageFlags.Ephemeral,
    });
  }
}
