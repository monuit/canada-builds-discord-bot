// MARK: - Thread Tag Command
// Admin tool to apply AI-assisted tags to discussion threads

import { ChatInputCommandInteraction, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { threadTagService } from '../services/ThreadTagService';
import { logger } from '../utils/logger';

export const data = new SlashCommandBuilder()
  .setName('thread-tag')
  .setDescription('Apply or refresh tags on the current thread for discovery')
  .addStringOption(option =>
    option
      .setName('tags')
      .setDescription('Comma-separated tags. Leave blank to request AI suggestions.')
      .setRequired(false),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({
      content: '❌ This command is only available inside the server.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (!interaction.channel || !interaction.channel.isThread()) {
    await interaction.reply({
      content: '⚠️ Run this command inside the thread you want to tag.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (!interaction.memberPermissions?.has('Administrator')) {
    await interaction.reply({
      content: '❌ Administrator permission required to manage thread tags.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const manualTags = interaction.options.getString('tags');

  try {
    const thread = interaction.channel;

    const result = manualTags
      ? await threadTagService.setManualTags(thread, manualTags.split(',').map(tag => tag.trim()).filter(Boolean), interaction.user.id)
      : await threadTagService.suggestTagsForThread(thread, interaction.user.id);

    const embedPayload = await threadTagService.buildTagEmbed(thread, result);

    await interaction.reply({
      content: manualTags ? '✅ Tags updated.' : '✅ AI suggestions applied.',
      embeds: embedPayload.embeds,
      flags: MessageFlags.Ephemeral,
    });
  } catch (error: any) {
    logger.error('Thread tagging failed', {
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      error: error.message,
    });

    await interaction.reply({
      content: '❌ Unable to update tags for this thread. Please try again later.',
      flags: MessageFlags.Ephemeral,
    });
  }
}
