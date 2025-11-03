// MARK: - Onboarding Command
// Allows members to re-run, inspect, or revoke onboarding flows

import { ChatInputCommandInteraction, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { onboardingManager } from '../services/OnboardingManager';
import { logger } from '../utils/logger';

export const data = new SlashCommandBuilder()
  .setName('onboarding')
  .setDescription('Manage DM onboarding consent and automated subscriptions')
  .addSubcommand(sub =>
    sub
      .setName('start')
      .setDescription('Restart the onboarding DM flow to review consent and pick topics'),
  )
  .addSubcommand(sub =>
    sub
      .setName('status')
      .setDescription('View your current consent status and default topics'),
  )
  .addSubcommand(sub =>
    sub
      .setName('revoke')
      .setDescription('Revoke consent and disable automated DMs'),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({
      content: '❌ This command can only be used inside the Build Canada server.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const subcommand = interaction.options.getSubcommand(true) as 'start' | 'status' | 'revoke';

  try {
    const response = await onboardingManager.handleOnboardingCommand(
      interaction.guildId,
      interaction.user.id,
      subcommand,
    );

    await interaction.reply({
      content: response.content,
      flags: response.ephemeral ? MessageFlags.Ephemeral : undefined,
    });
  } catch (error: any) {
    logger.error('Onboarding command failed', {
      guildId: interaction.guildId,
      userId: interaction.user.id,
      subcommand,
      error: error.message,
    });

    await interaction.reply({
      content: '❌ Unable to process your onboarding request. Please try again shortly.',
      flags: MessageFlags.Ephemeral,
    });
  }
}
