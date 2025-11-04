// MARK: - Digest Now Command
// Generate instant digest ignoring cooldown

import { ChatInputCommandInteraction, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { UserSubscription } from '../models/UserSubscription';
import { digestGenerator } from '../services/DigestGenerator';
import { DigestHistory } from '../models/DigestHistory';
import { logger } from '../utils/logger';
import { editEphemeral, replyEphemeral } from '../utils/interactionCleanup';

const MIN_HOURS = 1;
const MAX_HOURS = 168;

export const data = new SlashCommandBuilder()
  .setName('digest-now')
  .setDescription('Generate an instant digest (ignores cooldown)')
  .addIntegerOption(option =>
    option
      .setName('hours')
      .setDescription('Look back this many hours (1-168, default: 24)')
      .setMinValue(MIN_HOURS)
      .setMaxValue(MAX_HOURS)
      .setRequired(false)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  try {
    const hours = interaction.options.getInteger('hours') ?? 24;
    const guildId = interaction.guildId;
    const userId = interaction.user.id;

    if (!guildId) {
      await replyEphemeral(interaction, {
        content: '❌ This command can only be used in a server.',
      });
      return;
    }

    // Get user subscription
    const subscription = await UserSubscription.findOne({ userId, guildId });

    if (!subscription) {
        await replyEphemeral(interaction, {
          content:
            `❌ You have no active subscriptions.\n\n` +
            `Use \`/subscribe keywords:rust,web3\` to get started.`,
        });
      return;
    }

    if (subscription.keywords.length === 0) {
      await replyEphemeral(interaction, {
        content:
          `❌ You have no keywords subscribed.\n\n` +
          `Use \`/subscribe\` to add keywords.`,
      });
      return;
    }

    // Defer reply (digest generation can take time)
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    logger.info('Digest now requested', {
      userId,
      guildId,
      hours,
      keywords: subscription.keywords,
    });

    // Generate digest (ignoring cooldown)
    const digest = await digestGenerator.generateForUser(
      userId,
      guildId,
      subscription.keywords,
      hours
    );

    // Check if any messages found
    if (digest.stats.messageCount === 0) {
      await editEphemeral(interaction, {
        content:
          `📭 **No New Messages**\n\n` +
          `No messages found matching your keywords in the last ${hours} hour${hours === 1 ? '' : 's'}.\n\n` +
          `**Your keywords**: ${subscription.keywords.join(', ')}\n\n` +
          `💡 Try:\n` +
          `• Increasing the lookback period: \`/digest-now hours:48\`\n` +
          `• Adding more keywords: \`/subscribe\`\n` +
          `• Checking back later`,
      });

      logger.info('Digest now: no messages found', {
        userId,
        guildId,
        hours,
      });
      return;
    }

    // Send digest embeds to user via DM
    try {
      const user = await interaction.client.users.fetch(userId);
      await user.send({ embeds: digest.embeds });

      // Save to history
      await DigestHistory.create({
        guildId,
        recipientUserId: userId,
        topicClusters: digest.threadDetails.map(detail => ({
          keyword: detail.primaryTopic,
          messageCount: detail.messageCount,
          crossRefs: detail.topics.map(topic => ({ keyword: topic.slug, count: Math.round(topic.weight) })),
        })),
        threadScores: digest.stats.threadScores,
        topTopics: digest.stats.topTopics,
        clusterLabels: digest.stats.clusterLabels,
        tokensUsed: digest.stats.tokensUsed,
        costUSD: digest.stats.cost,
        deliveryMethod: 'dm',
        success: true,
      });

      // Update reply with success
      await editEphemeral(interaction, {
        content:
          `✅ **Digest Delivered**\n\n` +
          `📊 **Stats**:\n` +
          `• Topics: ${digest.stats.topicCount}\n` +
          `• Messages: ${digest.stats.messageCount}\n\n` +
          `Check your DMs for the full digest!\n\n` +
          `💡 This command bypasses your cooldown timer.`,
      });

      logger.info('Digest now delivered', {
        userId,
        guildId,
        topics: digest.stats.topicCount,
        messages: digest.stats.messageCount,
        cost: digest.stats.cost,
      });

    } catch (dmError: any) {
      // Handle DM failure
      if (dmError.code === 50007) {
        await editEphemeral(interaction, {
          content:
            `❌ **Cannot Send DM**\n\n` +
            `Your DMs are closed. Please enable DMs from server members to receive digests.\n\n` +
            `**How to enable**:\n` +
            `1. Right-click the server name\n` +
            `2. Privacy Settings\n` +
            `3. Enable "Direct Messages"`,
        });
      } else {
        throw dmError;
      }
    }

  } catch (error: any) {
    logger.error('Digest now command failed', {
      userId: interaction.user.id,
      error: error.message,
    });

    // Check if already replied
    const payload = {
      content: '❌ An error occurred while generating your digest. Please try again.',
    } as const;

    if (interaction.deferred || interaction.replied) {
      await editEphemeral(interaction, payload);
    } else {
      await replyEphemeral(interaction, payload);
    }
  }
}
