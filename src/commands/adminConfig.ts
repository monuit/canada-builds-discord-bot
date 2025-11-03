// MARK: - Admin Config Command
// Allows administrators to update highlight channel and onboarding defaults

import { ChannelType, ChatInputCommandInteraction, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { guildFeatureConfigService } from '../services/GuildFeatureConfigService';
import { logger } from '../utils/logger';

export const data = new SlashCommandBuilder()
  .setName('admin-config')
  .setDescription('Update guild-level automation settings (admin only)')
  .addSubcommand(sub =>
    sub
      .setName('highlight-channel')
      .setDescription('Set the channel that receives ⭐ highlight relays')
      .addChannelOption(option =>
        option
          .setName('channel')
          .setDescription('Channel that should receive highlights')
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
          .setRequired(true),
      ),
  )
  .addSubcommand(sub =>
    sub
      .setName('error-channel')
      .setDescription('Set the channel where admin errors will be reported')
      .addChannelOption(option =>
        option.setName('channel').setDescription('Channel for error reports').addChannelTypes(ChannelType.GuildText).setRequired(true),
      ),
  )
  .addSubcommand(sub =>
    sub
      .setName('onboarding-defaults')
      .setDescription('Update default onboarding keywords and consent version')
      .addStringOption(option =>
        option
          .setName('keywords')
          .setDescription('Comma-separated keywords to auto-subscribe on consent')
          .setRequired(false),
      )
      .addStringOption(option =>
        option
          .setName('consent_version')
          .setDescription('Consent copy version identifier (e.g., v1.1)')
          .setRequired(false),
      ),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({
      content: '❌ This command must be used inside the server.',
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

  const sub = interaction.options.getSubcommand(true) as 'highlight-channel' | 'onboarding-defaults' | 'error-channel';

  try {
    if (sub === 'highlight-channel') {
      const channel = interaction.options.getChannel('channel', true);

      if (!channel || !('isTextBased' in channel) || !(channel as any).isTextBased()) {
        await interaction.reply({
          content: '⚠️ Please pick a text-based channel.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      await guildFeatureConfigService.setHighlightChannelId(interaction.guildId, channel.id);
      await interaction.reply({
        content: `✅ Highlights will now be relayed to ${channel}.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (sub === 'error-channel') {
      const channel = interaction.options.getChannel('channel', true);

      if (!channel || !('isTextBased' in channel) || !(channel as any).isTextBased()) {
        await interaction.reply({
          content: '⚠️ Please pick a text-based channel.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      await guildFeatureConfigService.setErrorChannelId(interaction.guildId, channel.id);
      await interaction.reply({ content: `✅ Error reports will be posted to ${channel}.`, flags: MessageFlags.Ephemeral });
      return;
    }

    const keywordsRaw = interaction.options.getString('keywords') ?? '';
    const consentVersion = interaction.options.getString('consent_version') ?? undefined;

    const keywords = keywordsRaw
      .split(',')
      .map(keyword => keyword.trim().toLowerCase())
      .filter(Boolean);

    await guildFeatureConfigService.updateOnboardingDefaults(interaction.guildId, {
      autoSubscribeKeywords: keywords.length > 0 ? keywords : undefined,
      consentVersion,
    });

    await interaction.reply({
      content: '✅ Onboarding defaults updated.',
      flags: MessageFlags.Ephemeral,
    });
  } catch (error: any) {
    logger.error('Admin config command failed', {
      guildId: interaction.guildId,
      subcommand: sub,
      error: error.message,
    });

    await interaction.reply({
      content: '❌ Unable to update configuration just now. Please try again later.',
      flags: MessageFlags.Ephemeral,
    });
  }
}
