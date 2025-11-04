// MARK: - Bot Info Command
// Provide rich metadata about the bot instance

import { ChatInputCommandInteraction, EmbedBuilder, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { logger } from '../utils/logger';
import { scheduleInteractionCleanup } from '../utils/interactionCleanup';

const DEVELOPER_ID = '222463379770572811';

export const data = new SlashCommandBuilder()
  .setName('botinfo')
  .setDescription('Display bot metadata, uptime, and developer credits');

function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const totalHours = Math.floor(totalMinutes / 60);
  const hours = totalHours % 24;
  const days = Math.floor(totalHours / 24);
  const parts: string[] = [];

  if (days > 0) {
    parts.push(`${days}d`);
  }
  if (hours > 0 || parts.length > 0) {
    parts.push(`${hours}h`);
  }
  if (minutes > 0 || parts.length > 0) {
    parts.push(`${minutes}m`);
  }
  parts.push(`${seconds}s`);
  return parts.join(' ');
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  try {
    const botUser = interaction.client.user;

    if (!botUser) {
      await interaction.reply({
        content: '❌ Unable to load bot metadata right now. Please try again later.',
        flags: MessageFlags.Ephemeral,
      });
      scheduleInteractionCleanup(interaction);
      return;
    }

    const guildCount = interaction.client.guilds.cache.size;
    const channelCount = interaction.client.channels.cache.size;
    const uptime = typeof interaction.client.uptime === 'number'
      ? formatDuration(interaction.client.uptime)
      : 'Unknown';
    const version = process.env.npm_package_version ?? 'Unknown';
    const nodeVersion = process.version;

    const embed = new EmbedBuilder()
      .setTitle('🤖 Build Canada Bot')
      .setThumbnail(botUser.displayAvatarURL())
      .setColor(0x4e6cff)
      .addFields(
        { name: 'Tag', value: botUser.tag, inline: true },
        { name: 'ID', value: botUser.id, inline: true },
        { name: 'Created', value: botUser.createdAt.toLocaleString('en-US'), inline: true },
        { name: 'Guilds', value: formatNumber(guildCount), inline: true },
        { name: 'Channels (cached)', value: formatNumber(channelCount), inline: true },
        { name: 'Uptime', value: uptime, inline: true },
        { name: 'Version', value: version, inline: true },
        { name: 'Node.js', value: nodeVersion, inline: true },
        { name: 'Developer', value: `<@${DEVELOPER_ID}>`, inline: true },
      )
      .setFooter({ text: 'Build Canada Discord Bot' })
      .setTimestamp(new Date());

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    scheduleInteractionCleanup(interaction);

    logger.debug('Bot info command executed', {
      userId: interaction.user.id,
      guildId: interaction.guildId,
    });
  } catch (error: any) {
    logger.error('Bot info command failed', {
      userId: interaction.user.id,
      error: error.message,
    });

    const payload = {
      content: '❌ Failed to load bot info. Please try again shortly.',
    } as const;

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(payload);
    } else {
      await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
    }

    scheduleInteractionCleanup(interaction);
  }
}
