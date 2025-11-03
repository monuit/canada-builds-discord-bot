// MARK: - Schedule Command
// Admin setup scheduled digests with cron

import { ChatInputCommandInteraction, SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { isValidCron } from 'cron-validator';
import parser from 'cron-parser';
import { DigestConfig } from '../models/DigestConfig';
import { cronManager } from '../services/CronManager';
import { logger } from '../utils/logger';

export const data = new SlashCommandBuilder()
  .setName('schedule')
  .setDescription('Setup or modify scheduled digest delivery (Admin only)')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addBooleanOption(option =>
    option
      .setName('enable')
      .setDescription('Enable or disable scheduled digests')
      .setRequired(true)
  )
  .addStringOption(option =>
    option
      .setName('cron')
      .setDescription('Cron expression (e.g., "0 9 * * *" for 9 AM daily)')
      .setRequired(false)
  )
  .addStringOption(option =>
    option
      .setName('timezone')
      .setDescription('Timezone (e.g., "America/New_York", default: UTC)')
      .setRequired(false)
  );

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

    const enable = interaction.options.getBoolean('enable', true);
    const cronExpression = interaction.options.getString('cron');
    const timezone = interaction.options.getString('timezone') ?? 'UTC';

    // Get server configuration
    const config = await DigestConfig.findOne({ guildId });

    if (!config) {
      await interaction.reply({
        content:
          '❌ Server configuration not found. Please ensure the bot is properly initialized.',
        ephemeral: true,
      });
      return;
    }

    // If disabling, just disable
    if (!enable) {
      config.schedule.enabled = false;
      await config.save();

      await cronManager.cancelJob(guildId);

      logger.info('Scheduled digests disabled', { guildId, userId: interaction.user.id });

      await interaction.reply({
        content: '✅ **Scheduled Digests Disabled**\n\nAutomatic digest delivery has been turned off.',
        ephemeral: true,
      });
      return;
    }

    // If enabling, validate and setup cron
    const finalCron = cronExpression ?? config.schedule.cron ?? '0 9 * * *';

    // Validate cron expression
    if (!isValidCron(finalCron)) {
      await interaction.reply({
        content:
          `❌ **Invalid Cron Expression**\n\n` +
          `\`${finalCron}\` is not a valid cron expression.\n\n` +
          `**Examples**:\n` +
          `• \`0 9 * * *\` - Daily at 9:00 AM\n` +
          `• \`0 */6 * * *\` - Every 6 hours\n` +
          `• \`0 9 * * 1-5\` - Weekdays at 9:00 AM\n` +
          `• \`0 9,17 * * *\` - Daily at 9 AM and 5 PM`,
        ephemeral: true,
      });
      return;
    }

    // Validate timezone (attempt to parse)
    try {
      parser.parseExpression(finalCron, { tz: timezone });
    } catch (_error) {
      await interaction.reply({
        content:
          `❌ **Invalid Timezone**\n\n` +
          `\`${timezone}\` is not a valid timezone.\n\n` +
          `**Examples**:\n` +
          `• \`UTC\`\n` +
          `• \`America/New_York\`\n` +
          `• \`Europe/London\`\n` +
          `• \`Asia/Tokyo\``,
        ephemeral: true,
      });
      return;
    }

    // Update config
    config.schedule.enabled = true;
    config.schedule.cron = finalCron;
    config.schedule.timezone = timezone;
    await config.save();

    // Update cron manager
    await cronManager.updateJob(guildId, finalCron, timezone);

    // Calculate next run time
    const nextRun = parser.parseExpression(finalCron, { tz: timezone }).next().toDate();
    const nextRunStr = nextRun.toLocaleString('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: timezone,
    });

    logger.info('Scheduled digests configured', {
      guildId,
      userId: interaction.user.id,
      cron: finalCron,
      timezone,
      nextRun,
    });

    await interaction.reply({
      content:
        `✅ **Scheduled Digests Enabled**\n\n` +
        `**Cron Expression**: \`${finalCron}\`\n` +
        `**Timezone**: ${timezone}\n` +
        `**Next Run**: ${nextRunStr}\n\n` +
        `All subscribed users will receive automatic digests based on this schedule.`,
      ephemeral: true,
    });

  } catch (error: any) {
    logger.error('Schedule command failed', {
      userId: interaction.user.id,
      error: error.message,
    });

    await interaction.reply({
      content: '❌ An error occurred while configuring the schedule. Please try again.',
      ephemeral: true,
    });
  }
}
