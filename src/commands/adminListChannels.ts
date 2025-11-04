// MARK: - Admin List Channels Command
// Admin view configuration and stats

import { ChatInputCommandInteraction, EmbedBuilder, MessageFlags, SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { DigestConfig } from '../models/DigestConfig';
import { UserSubscription } from '../models/UserSubscription';
import { messageIndexer } from '../services/MessageIndexer';
import { logger } from '../utils/logger';

export const data = new SlashCommandBuilder()
  .setName('admin-list-channels')
  .setDescription('View server configuration and channel settings (Admin only)')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

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

    // Get config
    const config = await DigestConfig.findOne({ guildId });

    if (!config) {
      await interaction.reply({
        content: '❌ Server configuration not found.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Get stats
    const subscriberCount = await UserSubscription.countDocuments({ guildId });
    const indexerStats = messageIndexer.getStats();

    // Build config embed
    const embed = new EmbedBuilder()
      .setTitle('⚙️ Server Configuration')
      .setDescription(`**Server**: ${interaction.guild?.name}`)
      .setColor(0x3498DB)
      .setTimestamp();

    // Error notification channel
    embed.addFields({
      name: '🚨 Error Notification Channel',
      value: config.errorChannelId ? `<#${config.errorChannelId}>` : 'Not configured',
      inline: false,
    });

    // Digest channel (optional)
    if (config.digestChannelId) {
      embed.addFields({
        name: '📬 Digest Channel',
        value: `<#${config.digestChannelId}>`,
        inline: false,
      });
    }

    // Excluded channels
    if (config.excludedChannelIds.length > 0) {
      const excludedList = config.excludedChannelIds
        .map(id => `• <#${id}>`)
        .join('\n');

      embed.addFields({
        name: `🚫 Excluded Channels (${config.excludedChannelIds.length})`,
        value: excludedList.length > 1024 
          ? excludedList.slice(0, 1021) + '...'
          : excludedList,
        inline: false,
      });
    } else {
      embed.addFields({
        name: '🚫 Excluded Channels',
        value: 'None',
        inline: false,
      });
    }

    // Schedule configuration
    const scheduleStatus = config.schedule.enabled
      ? `✅ Enabled\n**Cron**: \`${config.schedule.cron}\`\n**Timezone**: ${config.schedule.timezone}`
      : '❌ Disabled';

    embed.addFields({
      name: '⏰ Scheduled Digests',
      value: scheduleStatus,
      inline: false,
    });

    // Subscription stats
    embed.addFields({
      name: '📊 Statistics',
      value:
        `**Active Subscribers**: ${subscriberCount}\n` +
        `**Tracked Keywords**: ${indexerStats.keywordCount}\n` +
        `**Excluded Channels**: ${indexerStats.excludedChannelCount}`,
      inline: false,
    });

    // Usage instructions
    embed.addFields({
      name: '💡 Quick Actions',
      value:
        `• \`/schedule\` - Configure automatic digest delivery\n` +
        `• \`/admin-remove-channel\` - Exclude a channel\n` +
        `• \`/admin-clear-user\` - Remove user subscriptions\n` +
        `• \`/stats\` - View detailed analytics`,
      inline: false,
    });

    logger.info('Admin list channels command executed', {
      adminId: interaction.user.id,
      guildId,
    });

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });

  } catch (error: any) {
    logger.error('Admin list channels command failed', {
      userId: interaction.user.id,
      error: error.message,
    });

    await interaction.reply({
      content: '❌ An error occurred while fetching configuration. Please try again.',
      flags: MessageFlags.Ephemeral,
    });
  }
}
