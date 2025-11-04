// MARK: - Digest History Command
// Allows users to review recent digest deliveries

import { ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { DigestHistory } from '../models/DigestHistory';
import { logger } from '../utils/logger';
import { replyEphemeral } from '../utils/interactionCleanup';

const MIN_LIMIT = 1;
const MAX_LIMIT = 10;
const DEFAULT_LIMIT = 5;

export interface DigestHistorySummary {
  generatedAt: Date;
  deliveryMethod: 'dm' | 'channel';
  success: boolean;
  topTopics: Array<{ slug: string; count: number }>;
  costUSD: number;
  messageCount: number;
  errorMessage?: string;
}

export function formatDigestHistoryLine(entry: DigestHistorySummary): string {
  const timestamp = Math.floor(entry.generatedAt.getTime() / 1000);
  const statusIcon = entry.success ? '✅' : '⚠️';
  const delivery = entry.deliveryMethod === 'channel' ? 'channel' : 'DM';
  const topics = entry.topTopics.slice(0, 3).map(topic => `${topic.slug.toLowerCase()} (${topic.count})`).join(', ');
  const topicSection = topics ? ` • Top: ${topics}` : '';
  const messageSection = entry.messageCount > 0 ? ` • Messages: ${entry.messageCount}` : '';
  const costSection = entry.costUSD > 0 ? ` • Cost: $${entry.costUSD.toFixed(3)}` : '';
  const errorSection = entry.success || !entry.errorMessage ? '' : ` • Error: ${entry.errorMessage}`;

  return `${statusIcon} <t:${timestamp}:f> • ${delivery}${topicSection}${messageSection}${costSection}${errorSection}`;
}

function buildDigestHistoryEmbed(entries: DigestHistorySummary[]): EmbedBuilder {
  const description = entries.map(formatDigestHistoryLine).join('\n');

  return new EmbedBuilder()
    .setTitle('Recent Digests')
    .setDescription(description)
    .setColor(entries.some(entry => !entry.success) ? 0xffa500 : 0x00bfa5);
}

export const data = new SlashCommandBuilder()
  .setName('digest-history')
  .setDescription('Review your recent digest deliveries')
  .addIntegerOption(option =>
    option
      .setName('limit')
      .setDescription('Number of records to display (1-10, default 5)')
      .setRequired(false)
      .setMinValue(MIN_LIMIT)
      .setMaxValue(MAX_LIMIT)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  try {
    const guildId = interaction.guildId;
    const userId = interaction.user.id;

    if (!guildId) {
      await replyEphemeral(interaction, {
        content: '❌ This command can only be used in a server.',
      });
      return;
    }

    const limit = interaction.options.getInteger('limit') ?? DEFAULT_LIMIT;
    const clampedLimit = Math.min(Math.max(limit, MIN_LIMIT), MAX_LIMIT);

    const history = await DigestHistory.find({
      guildId,
      recipientUserId: userId,
    })
      .sort({ generatedAt: -1, createdAt: -1 })
      .limit(clampedLimit)
      .lean();

    if (!history || history.length === 0) {
      await replyEphemeral(interaction, {
        content:
          `📭 **No Digest History Found**\n\n` +
          `We haven't delivered any digests to you yet.\n` +
          `Run \`/digest-now\` or wait for your next scheduled digest to populate this list.`,
      });
      return;
    }

    const summaries: DigestHistorySummary[] = history.map(entry => ({
      generatedAt: entry.generatedAt ?? entry.createdAt ?? new Date(),
      deliveryMethod: entry.deliveryMethod,
      success: entry.success,
      topTopics: entry.topTopics ?? [],
      costUSD: entry.costUSD ?? 0,
      messageCount: entry.threadScores?.reduce((total, thread) => total + (thread.messages ?? 0), 0) ?? 0,
      errorMessage: entry.errorMessage,
    }));

    const embed = buildDigestHistoryEmbed(summaries);

    await replyEphemeral(interaction, {
      embeds: [embed],
    });
  } catch (error: any) {
    logger.error('Digest history command failed', {
      userId: interaction.user.id,
      error: error.message,
    });

    await replyEphemeral(interaction, {
      content: '❌ Unable to load your digest history right now. Please try again shortly.',
    });
  }
}

export { buildDigestHistoryEmbed };
