// MARK: - Ping Command
// Surface latency metrics for quick health checks

import { ChatInputCommandInteraction, EmbedBuilder, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { logger } from '../utils/logger';
import { scheduleInteractionCleanup } from '../utils/interactionCleanup';

export const data = new SlashCommandBuilder()
  .setName('ping')
  .setDescription('Check bot latency and uptime');

function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const totalHours = Math.floor(totalMinutes / 60);
  const hours = totalHours % 24;
  const days = Math.floor(totalHours / 24);
  const segments: string[] = [];

  if (days > 0) {
    segments.push(`${days}d`);
  }
  if (hours > 0 || segments.length > 0) {
    segments.push(`${hours}h`);
  }
  if (minutes > 0 || segments.length > 0) {
    segments.push(`${minutes}m`);
  }
  segments.push(`${seconds}s`);
  return segments.join(' ');
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  try {
    await interaction.reply({
      content: '⏱️ Measuring latency...',
      flags: MessageFlags.Ephemeral,
    });

    const placeholderMessage = await interaction.fetchReply();

    const roundTrip = placeholderMessage.createdTimestamp - interaction.createdTimestamp;
    const wsPing = Math.round(interaction.client.ws.ping);
    const uptime = typeof interaction.client.uptime === 'number'
      ? formatDuration(interaction.client.uptime)
      : 'Unknown';

    const embed = new EmbedBuilder()
      .setTitle('🏓 Pong!')
      .setColor(0x4e6cff)
      .addFields(
        { name: 'Gateway Latency', value: `${wsPing} ms`, inline: true },
        { name: 'Round Trip', value: `${roundTrip} ms`, inline: true },
        { name: 'Uptime', value: uptime, inline: true },
      )
      .setTimestamp(new Date());

    await interaction.editReply({
      content: '',
      embeds: [embed],
    });
    scheduleInteractionCleanup(interaction);

    logger.debug('Ping command executed', {
      userId: interaction.user.id,
      guildId: interaction.guildId,
      roundTrip,
      wsPing,
    });
  } catch (error: any) {
    logger.error('Ping command failed', {
      userId: interaction.user.id,
      error: error.message,
    });

    const payload = {
      content: '❌ Failed to measure latency. Try again shortly.',
    } as const;

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(payload);
    } else {
      await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
    }

    scheduleInteractionCleanup(interaction);
  }
}
