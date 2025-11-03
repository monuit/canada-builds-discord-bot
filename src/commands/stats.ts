// MARK: - Stats Command
// Admin analytics dashboard with comprehensive metrics

import { ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { DigestHistory } from '../models/DigestHistory';
import { UserSubscription } from '../models/UserSubscription';
import { logger } from '../utils/logger';

export const data = new SlashCommandBuilder()
  .setName('stats')
  .setDescription('View comprehensive analytics dashboard (Admin only)')
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

    // Defer reply (queries can take time)
    await interaction.deferReply({ ephemeral: true });

    // Aggregate stats for different time periods
    const stats7d = await aggregateStats(guildId, 7);
    const stats30d = await aggregateStats(guildId, 30);
    const stats90d = await aggregateStats(guildId, 90);

    // Get subscriber count
    const subscriberCount = await UserSubscription.countDocuments({ guildId });

    // Get top keywords
    const topKeywords = await getTopKeywords(guildId, 30);

    // Build stats embed
    const embed = new EmbedBuilder()
      .setTitle('📊 Analytics Dashboard')
      .setDescription(`**Server**: ${interaction.guild?.name}\n**Report Generated**: ${new Date().toLocaleString()}`)
      .setColor(0x3498DB)
      .setTimestamp();

    // 7-day stats
    embed.addFields({
      name: '📅 Last 7 Days',
      value:
        `**Digests**: ${stats7d.totalDigests}\n` +
        `**Unique Users**: ${stats7d.uniqueUsers}\n` +
        `**Messages**: ${stats7d.totalMessages}\n` +
        `**Tokens**: ${formatNumber(stats7d.totalTokens)}\n` +
        `**Cost**: $${stats7d.totalCost.toFixed(4)}`,
      inline: true,
    });

    // 30-day stats
    embed.addFields({
      name: '📅 Last 30 Days',
      value:
        `**Digests**: ${stats30d.totalDigests}\n` +
        `**Unique Users**: ${stats30d.uniqueUsers}\n` +
        `**Messages**: ${stats30d.totalMessages}\n` +
        `**Tokens**: ${formatNumber(stats30d.totalTokens)}\n` +
        `**Cost**: $${stats30d.totalCost.toFixed(4)}`,
      inline: true,
    });

    // 90-day stats
    embed.addFields({
      name: '📅 Last 90 Days',
      value:
        `**Digests**: ${stats90d.totalDigests}\n` +
        `**Unique Users**: ${stats90d.uniqueUsers}\n` +
        `**Messages**: ${stats90d.totalMessages}\n` +
        `**Tokens**: ${formatNumber(stats90d.totalTokens)}\n` +
        `**Cost**: $${stats90d.totalCost.toFixed(4)}`,
      inline: true,
    });

    // Current subscriptions
    embed.addFields({
      name: '👥 Active Subscriptions',
      value: `${subscriberCount} user${subscriberCount === 1 ? '' : 's'}`,
      inline: false,
    });

    // Top keywords
    if (topKeywords.length > 0) {
      const keywordList = topKeywords
        .map((kw, idx) => {
          const bar = createProgressBar(kw.count, topKeywords[0].count, 10);
          return `${idx + 1}. **${kw.keyword}** ${bar} ${kw.count}`;
        })
        .join('\n');

      embed.addFields({
        name: '🔑 Top Keywords (Last 30 Days)',
        value: keywordList,
        inline: false,
      });
    }

    // Averages
    const avgCostPerDigest = stats30d.totalDigests > 0 
      ? (stats30d.totalCost / stats30d.totalDigests).toFixed(4)
      : '0.0000';
    
    const avgMessagesPerDigest = stats30d.totalDigests > 0
      ? Math.round(stats30d.totalMessages / stats30d.totalDigests)
      : 0;

    embed.addFields({
      name: '📈 Averages (30 Days)',
      value:
        `**Cost per Digest**: $${avgCostPerDigest}\n` +
        `**Messages per Digest**: ${avgMessagesPerDigest}\n` +
        `**Digests per Day**: ${(stats30d.totalDigests / 30).toFixed(1)}`,
      inline: false,
    });

    logger.info('Stats command executed', {
      guildId,
      userId: interaction.user.id,
    });

    await interaction.editReply({ embeds: [embed] });

  } catch (error: any) {
    logger.error('Stats command failed', {
      userId: interaction.user.id,
      error: error.message,
    });

    if (interaction.deferred) {
      await interaction.editReply({
        content: '❌ An error occurred while fetching stats. Please try again.',
      });
    } else {
      await interaction.reply({
        content: '❌ An error occurred while fetching stats. Please try again.',
        ephemeral: true,
      });
    }
  }
}

/**
 * Aggregate stats for a time period
 */
async function aggregateStats(guildId: string, days: number) {
  const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const results = await DigestHistory.aggregate([
    {
      $match: {
        guildId,
        generatedAt: { $gte: cutoffDate },
        success: true,
      },
    },
    {
      $group: {
        _id: null,
        totalDigests: { $sum: 1 },
        uniqueUsers: { $addToSet: '$recipientUserId' },
        totalMessages: {
          $sum: {
            $sum: '$topicClusters.messageCount',
          },
        },
        totalTokens: {
          $sum: {
            $add: ['$tokensUsed.input', '$tokensUsed.output'],
          },
        },
        totalCost: { $sum: '$costUSD' },
      },
    },
  ]);

  if (results.length === 0) {
    return {
      totalDigests: 0,
      uniqueUsers: 0,
      totalMessages: 0,
      totalTokens: 0,
      totalCost: 0,
    };
  }

  const result = results[0];
  return {
    totalDigests: result.totalDigests,
    uniqueUsers: result.uniqueUsers.length,
    totalMessages: result.totalMessages,
    totalTokens: result.totalTokens,
    totalCost: result.totalCost,
  };
}

/**
 * Get top keywords by usage
 */
async function getTopKeywords(guildId: string, days: number): Promise<Array<{ keyword: string; count: number }>> {
  const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const results = await DigestHistory.aggregate([
    {
      $match: {
        guildId,
        generatedAt: { $gte: cutoffDate },
        success: true,
      },
    },
    { $unwind: '$topicClusters' },
    {
      $group: {
        _id: '$topicClusters.keyword',
        count: { $sum: 1 },
      },
    },
    { $sort: { count: -1 } },
    { $limit: 10 },
  ]);

  return results.map(r => ({
    keyword: r._id,
    count: r.count,
  }));
}

/**
 * Format number with commas
 */
function formatNumber(num: number): string {
  return num.toLocaleString('en-US');
}

/**
 * Create progress bar using Unicode blocks
 */
function createProgressBar(value: number, max: number, length: number): string {
  const filled = Math.round((value / max) * length);
  const empty = length - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}
