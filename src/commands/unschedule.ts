// MARK: - Unschedule Command
// Admin disable scheduled digests

import { ChatInputCommandInteraction, SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { DigestConfig } from '../models/DigestConfig';
import { cronManager } from '../services/CronManager';
import { logger } from '../utils/logger';

export const data = new SlashCommandBuilder()
  .setName('unschedule')
  .setDescription('Disable scheduled digest delivery (Admin only)')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  try {
    const guildId = interaction.guildId;

    if (!guildId) {
      await interaction.reply({
        content: '❌ This command can only be used in a server.',
        ephemeral: true,
      });
      return;
    }

    // Verify admin permissions
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({
        content: '❌ This command requires Administrator permissions.',
        ephemeral: true,
      });
      return;
    }

    // Get config
    const config = await DigestConfig.findOne({ guildId });

    if (!config) {
      await interaction.reply({
        content: '❌ Server configuration not found.',
        ephemeral: true,
      });
      return;
    }

    // Check if already disabled
    if (!config.schedule.enabled) {
      await interaction.reply({
        content: '⚠️ Scheduled digests are already disabled.',
        ephemeral: true,
      });
      return;
    }

    // Disable schedule
    config.schedule.enabled = false;
    await config.save();

    // Cancel cron job
    cronManager.cancelJob(guildId);

    logger.info('Scheduled digests disabled', {
      guildId,
      userId: interaction.user.id,
    });

    await interaction.reply({
      content:
        `✅ **Scheduled Digests Disabled**\n\n` +
        `Automatic digest delivery has been turned off.\n\n` +
        `Users can still use \`/digest-now\` for manual digests.\n` +
        `Use \`/schedule\` to re-enable automatic delivery.`,
      ephemeral: true,
    });

  } catch (error: any) {
    logger.error('Unschedule command failed', {
      userId: interaction.user.id,
      error: error.message,
    });

    await interaction.reply({
      content: '❌ An error occurred while disabling the schedule. Please try again.',
      ephemeral: true,
    });
  }
}
