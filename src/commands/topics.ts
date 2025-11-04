// MARK: - Topics Command
// Surfaces trending topics and keyword activity across the guild

import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import { topicTrendService } from '../services/TopicTrendService';
import { logger } from '../utils/logger';

const DEFAULT_WINDOW_HOURS = 48;
const DEFAULT_LIMIT = 5;

export const data = new SlashCommandBuilder()
  .setName('topics')
  .setDescription('Explore curated topics, trending keywords, and discovery tools')
  .addSubcommand(sub =>
    sub
      .setName('trending')
      .setDescription('Show trending topics and keywords from indexed discussions')
      .addIntegerOption(option =>
        option
          .setName('hours')
          .setDescription('Lookback window in hours (default: 48)')
          .setMinValue(1)
          .setMaxValue(168),
      )
      .addIntegerOption(option =>
        option
          .setName('limit')
          .setDescription('Number of topics to include (default: 5)')
          .setMinValue(1)
          .setMaxValue(10),
      ),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({
      content: '❌ This command can only be used inside the guild.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const subcommand = interaction.options.getSubcommand(true);

  if (subcommand !== 'trending') {
    await interaction.reply({
      content: '⚠️ That topics subcommand is not supported yet.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const windowHours = interaction.options.getInteger('hours') ?? DEFAULT_WINDOW_HOURS;
  const limit = interaction.options.getInteger('limit') ?? DEFAULT_LIMIT;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const trends = await topicTrendService.getTrendingTopics(interaction.guildId, {
      windowHours,
      limit,
    });

    if (trends.topics.length === 0 && trends.keywords.length === 0) {
      await interaction.editReply(
        `There is no indexed activity in the last ${windowHours} hours yet. Try again later once discussions pick up.`,
      );
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle(`Trending topics · last ${windowHours}h`)
      .setDescription('Trends are based on indexed keywords from active channels and threads.')
      .setColor(0x0099ff)
      .setTimestamp(new Date());

    if (trends.topics.length > 0) {
      trends.topics.forEach((topic, index) => {
        const channelSummary = topic.topChannels.length > 0
          ? topic.topChannels.map(channel => formatChannelMention(channel.channelId, channel.name)).join(', ')
          : 'Across multiple channels';
        const keywords = topic.keywords.slice(0, 5).map(kw => `\`${kw}\``).join(', ');
        const latest = topic.lastMentionAt
          ? `<t:${Math.floor(topic.lastMentionAt.getTime() / 1000)}:R>`
          : 'recently';

        embed.addFields({
          name: `${index + 1}. ${topic.label}`,
          value: [
            `• Mentions: **${topic.totalMentions}** (last ${latest})`,
            `• Hot channels: ${channelSummary}`,
            keywords ? `• Keywords: ${keywords}` : null,
          ].filter(Boolean).join('\n'),
        });
      });
    }

    if (trends.keywords.length > 0) {
      const keywordLines = trends.keywords.map(keyword => {
        const channelSummary = keyword.topChannels.length > 0
          ? keyword.topChannels.map(channel => formatChannelMention(channel.channelId, channel.name)).join(', ')
          : 'multiple channels';
        const latest = keyword.lastMentionAt
          ? `<t:${Math.floor(keyword.lastMentionAt.getTime() / 1000)}:R>`
          : 'recently';
        return `• **${keyword.keyword}** – ${keyword.count} hits (last ${latest}) in ${channelSummary}`;
      });

      embed.addFields({
        name: 'Other hot keywords',
        value: keywordLines.join('\n').slice(0, 1024) || 'We are collecting more data now…',
      });
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error: any) {
    logger.error('Topics trending command failed', {
      guildId: interaction.guildId,
      userId: interaction.user.id,
      error: error.message,
    });

    await interaction.editReply('❌ Unable to load trending topics right now. Please try again later.');
  }
}

function formatChannelMention(channelId: string, name?: string): string {
  if (name) {
    return `#${name}`;
  }
  return `<#${channelId}>`;
}
