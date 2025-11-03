// MARK: - Admin Channel Weight Command
// Manage per-channel digest score multipliers (admin only)

import { ChannelType, ChatInputCommandInteraction, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { guildFeatureConfigService } from '../services/GuildFeatureConfigService';
import { logger } from '../utils/logger';

const SUPPORTED_CHANNEL_TYPES = [
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.GuildForum,
  ChannelType.PublicThread,
  ChannelType.PrivateThread,
  ChannelType.AnnouncementThread,
] as const;

export const data = new SlashCommandBuilder()
  .setName('admin-channel-weight')
  .setDescription('Adjust digest scoring weights for specific channels or threads (admin only)')
  .addSubcommand(sub =>
    sub
      .setName('set')
      .setDescription('Set a weight multiplier for a channel (0-5, default 1)')
      .addChannelOption(option =>
        option
          .setName('channel')
          .setDescription('Channel or thread to weight')
          .addChannelTypes(...SUPPORTED_CHANNEL_TYPES)
          .setRequired(true),
      )
      .addNumberOption(option =>
        option
          .setName('multiplier')
          .setDescription('Multiplier between 0 (mute) and 5 (boost)')
          .setMinValue(0)
          .setMaxValue(5)
          .setRequired(true),
      ),
  )
  .addSubcommand(sub =>
    sub
      .setName('clear')
      .setDescription('Remove a custom weight and revert to default')
      .addChannelOption(option =>
        option
          .setName('channel')
          .setDescription('Channel or thread to reset')
          .addChannelTypes(...SUPPORTED_CHANNEL_TYPES)
          .setRequired(true),
      ),
  )
  .addSubcommand(sub =>
    sub
      .setName('list')
      .setDescription('List all channels with custom weights'));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({
      content: '❌ Run this command inside the server.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (!interaction.memberPermissions?.has('Administrator')) {
    await interaction.reply({
      content: '❌ Administrator permission required.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const sub = interaction.options.getSubcommand(true) as 'set' | 'clear' | 'list';

  try {
    if (sub === 'set') {
      const channel = interaction.options.getChannel('channel', true);
      const multiplier = interaction.options.getNumber('multiplier', true);

      await guildFeatureConfigService.setChannelMultiplier(interaction.guildId, channel.id, multiplier);

      await interaction.reply({
        content: `✅ Weight for ${channel} set to **${multiplier.toFixed(2)}x**.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (sub === 'clear') {
      const channel = interaction.options.getChannel('channel', true);

      await guildFeatureConfigService.clearChannelMultiplier(interaction.guildId, channel.id);

      await interaction.reply({
        content: `✅ Weight for ${channel} reset to **1x**.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const entries = await guildFeatureConfigService.listChannelMultipliers(interaction.guildId);
    const channelIds = Object.keys(entries);

    if (channelIds.length === 0) {
      await interaction.reply({
        content: 'ℹ️ No custom channel weights configured. All channels use the default 1x weight.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const lines = channelIds
      .sort()
      .map(id => `• <#${id}> — **${entries[id].toFixed(2)}x**`)
      .join('\n');

    await interaction.reply({
      content: `📊 **Custom Channel Weights**\n${lines}`,
      flags: MessageFlags.Ephemeral,
    });
  } catch (error: any) {
    logger.error('admin-channel-weight failed', {
      guildId: interaction.guildId,
      subcommand: sub,
      error: error.message,
    });

    await interaction.reply({
      content: '❌ Could not update channel weights right now. Please try again later.',
      flags: MessageFlags.Ephemeral,
    });
  }
}
