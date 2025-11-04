// MARK: - My Subscriptions Command
// List user's current subscriptions with status

import { ChatInputCommandInteraction, EmbedBuilder, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { UserSubscription, IUserSubscription } from '../models/UserSubscription';
import { logger } from '../utils/logger';

export const data = new SlashCommandBuilder()
  .setName('my-subscriptions')
  .setDescription('View your current keyword subscriptions and notification settings');

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  try {
    const guildId = interaction.guildId;
    const userId = interaction.user.id;

    if (!guildId) {
      await interaction.reply({
        content: '❌ This command can only be used in a server.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Get subscription
    const subscription = await UserSubscription.findOne({ userId, guildId });

    if (!subscription || subscription.keywords.length === 0) {
      const embed = new EmbedBuilder()
        .setTitle('📭 No Active Subscriptions')
        .setDescription(
          `You haven't subscribed to any keywords yet.\n\n` +
          `**Get started**: Use \`/subscribe keywords:rust,web3\` to begin receiving AI-powered digests.\n\n` +
          `**How it works**:\n` +
          `• Choose keywords you're interested in\n` +
          `• Set your notification frequency\n` +
          `• Receive intelligent summaries via DM\n` +
          `• Stay updated without the noise`
        )
        .setColor(0x95A5A6) // Gray
        .setTimestamp();

      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      return;
    }

    // Build status embed
    const embed = new EmbedBuilder()
      .setTitle('📋 Your Subscriptions')
      .setColor(0x3498DB) // Blue
      .setTimestamp()
      .setFooter({ text: `User ID: ${userId}` });

    // Keywords field
    embed.addFields({
      name: '🔑 Keywords',
      value: subscription.keywords.map(kw => `\`${kw}\``).join(', '),
      inline: false,
    });

    // Settings field
    const settingsValue =
      `**Cooldown**: ${subscription.cooldownHours} hour${subscription.cooldownHours === 1 ? '' : 's'}\n` +
      `**DM Notifications**: ${subscription.dmEnabled ? 'Enabled ✓' : 'Disabled ✗'}`;

    embed.addFields({
      name: '⚙️ Settings',
      value: settingsValue,
      inline: false,
    });

    // Last notification times
    const lastNotifiedEntries = Array.from(subscription.lastNotified.entries()) as [string, Date][];

    if (lastNotifiedEntries.length > 0) {
      const lastNotifiedList = lastNotifiedEntries
        .slice(0, 10) // Limit to 10 entries
        .map(([keyword, date]: [string, Date]) => {
          const timeAgo = formatTimeAgo(date);
          return `• \`${keyword}\`: ${timeAgo}`;
        })
        .join('\n');

      embed.addFields({
        name: '🕒 Last Notified',
        value: lastNotifiedList || 'No notifications sent yet',
        inline: false,
      });
    } else {
      embed.addFields({
        name: '🕒 Last Notified',
        value: 'No notifications sent yet',
        inline: false,
      });
    }

    // Next notification estimate
    const nextNotificationTime = calculateNextNotification(subscription);
    if (nextNotificationTime) {
      embed.addFields({
        name: '⏰ Next Notification',
        value: `Eligible after ${nextNotificationTime}`,
        inline: false,
      });
    }

    // Usage tips
    embed.addFields({
      name: '💡 Quick Actions',
      value:
        `• \`/subscribe\` - Update your keywords or settings\n` +
        `• \`/unsubscribe\` - Remove specific keywords or all\n` +
        `• \`/digest-now\` - Get an instant digest (ignores cooldown)`,
      inline: false,
    });

    logger.info('User viewed subscriptions', {
      userId,
      guildId,
      keywordCount: subscription.keywords.length,
    });

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });

  } catch (error: any) {
    logger.error('My-subscriptions command failed', {
      userId: interaction.user.id,
      error: error.message,
    });

    await interaction.reply({
      content: '❌ An error occurred while fetching your subscriptions. Please try again.',
      flags: MessageFlags.Ephemeral,
    });
  }
}

/**
 * Format time ago in human-readable format
 */
function formatTimeAgo(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days > 0) {
    return `${days} day${days === 1 ? '' : 's'} ago`;
  } else if (hours > 0) {
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  } else if (minutes > 0) {
    return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  } else {
    return 'Just now';
  }
}

/**
 * Calculate next eligible notification time
 */
function calculateNextNotification(subscription: IUserSubscription): string | null {
  const lastNotifiedEntries = Array.from(subscription.lastNotified.entries());

  if (lastNotifiedEntries.length === 0) {
    return null;
  }

  // Find the most recent notification
  let mostRecent = new Date(0);
  for (const [_, date] of lastNotifiedEntries) {
    if (date > mostRecent) {
      mostRecent = date;
    }
  }

  const cooldownMs = subscription.cooldownHours * 60 * 60 * 1000;
  const nextTime = new Date(mostRecent.getTime() + cooldownMs);

  return nextTime.toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}
