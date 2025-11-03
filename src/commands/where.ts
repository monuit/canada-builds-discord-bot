// MARK: - Where Command
// User discovery command to surface tagged threads and recent discussions

import { ChatInputCommandInteraction, EmbedBuilder, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { searchService } from '../services/SearchService';
import { logger } from '../utils/logger';

export const data = new SlashCommandBuilder()
  .setName('where')
  .setDescription('Search tagged threads and indexed discussions by topic keyword')
  .addStringOption(option =>
    option
      .setName('topic')
      .setDescription('Topic keyword to search for (e.g. grants, funding, ai)')
      .setRequired(true),
  )
  .addIntegerOption(option =>
    option
      .setName('limit')
      .setDescription('Maximum number of matches (default: 5)')
      .setMinValue(1)
      .setMaxValue(10),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({
      content: '❌ This command can only be used in a server.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const query = interaction.options.getString('topic', true);
  const limit = interaction.options.getInteger('limit') ?? 5;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const matches = await searchService.search(interaction.guildId, query, limit);

    if (matches.length === 0) {
      await interaction.editReply(`🔍 No matches found for **${query}** yet. Try tagging a thread with \`/thread-tag\`.`);
      return;
    }

    const embeds = await Promise.all(matches.map(async match => {
      const timestamp = match.timestamp ?? new Date();
      const relativeTime = `<t:${Math.floor(timestamp.getTime() / 1000)}:R>`;

      if (match.type === 'thread') {
        const thread = await interaction.guild?.channels.fetch(match.threadId!).catch(() => null);
        const threadMention = match.threadId ? `<#${match.threadId}>` : 'Conversation Thread';
        const parentMention = match.channelId ? `<#${match.channelId}>` : 'channel';
        const link = `https://discord.com/channels/${interaction.guildId}/${match.threadId}`;

        const lines = [
          match.tags.length > 0 ? match.tags.map(tag => `#${tag}`).join(' ') : 'Tagged thread',
          `• Thread: ${threadMention}`,
          `• Channel: ${parentMention}`,
          `• Last activity: ${relativeTime}`,
          `• Jump: [Open thread](${link})`,
        ];

        return new EmbedBuilder()
          .setTitle(thread?.name ?? 'Conversation Thread')
          .setDescription(lines.join('\n'))
          .setFooter({
            text: `Score ${match.score.toFixed(2)}`,
          })
          .setTimestamp(timestamp)
          .setURL(link);
      }

      const channel = await interaction.guild?.channels.fetch(match.channelId).catch(() => null);
      const channelName = channel?.isTextBased() ? `#${channel.name}` : 'Message';
      const link = `https://discord.com/channels/${interaction.guildId}/${match.channelId}/${match.messageId}`;
      const description = match.snippet ?? 'Relevant message';

      const lines = [
        description,
        '',
        `• Channel: <#${match.channelId}>`,
        `• When: ${relativeTime}`,
        `• Jump: [Open message](${link})`,
      ];

      return new EmbedBuilder()
        .setTitle(`${match.author ?? 'Member'} in ${channelName}`)
        .setDescription(lines.join('\n'))
        .setURL(link)
        .setFooter({ text: `Score ${match.score.toFixed(2)} · Tags: ${match.tags.slice(0, 5).join(', ')}` })
        .setTimestamp(timestamp);
    }));

    await interaction.editReply({ embeds });
  } catch (error: any) {
    logger.error('Where command failed', {
      guildId: interaction.guildId,
      userId: interaction.user.id,
      error: error.message,
    });

    await interaction.editReply('❌ Unable to search right now. Please try again later.');
  }
}
