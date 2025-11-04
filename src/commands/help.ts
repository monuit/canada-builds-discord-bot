// MARK: - Help Command
// Interactive help with multi-page navigation

import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  MessageFlags,
} from 'discord.js';
import { logger } from '../utils/logger';

const COLLECTOR_TIMEOUT = 300000; // 5 minutes

export const data = new SlashCommandBuilder()
  .setName('help')
  .setDescription('View comprehensive help and documentation');

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  try {
    let currentPage = 0;
    const pages = createHelpPages();

    const message = await interaction.reply({
      embeds: [pages[currentPage]],
      components: [createNavigationRow(currentPage, pages.length)],
      flags: MessageFlags.Ephemeral,
      fetchReply: true,
    });

    // Create collector for button interactions
    const collector = message.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: COLLECTOR_TIMEOUT,
    });

    collector.on('collect', async (buttonInteraction) => {
      // Verify it's the same user
      if (buttonInteraction.user.id !== interaction.user.id) {
        await buttonInteraction.reply({
          content: '❌ This help menu is not for you. Use `/help` to open your own.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      // Update page based on button
      if (buttonInteraction.customId === 'help_previous') {
        currentPage = Math.max(0, currentPage - 1);
      } else if (buttonInteraction.customId === 'help_next') {
        currentPage = Math.min(pages.length - 1, currentPage + 1);
      } else if (buttonInteraction.customId === 'help_close') {
        collector.stop('user_closed');
        await buttonInteraction.update({
          content: '✅ Help menu closed.',
          embeds: [],
          components: [],
        });
        return;
      }

      // Update message
      await buttonInteraction.update({
        embeds: [pages[currentPage]],
        components: [createNavigationRow(currentPage, pages.length)],
      });
    });

    collector.on('end', async (_, reason) => {
      if (reason === 'time') {
        try {
          await interaction.editReply({
            content: '⏱️ Help menu timed out.',
            embeds: [],
            components: [],
          });
        } catch (_error) {
          // Message may have been deleted
          logger.debug('Failed to update timed-out help menu', { reason: 'message_deleted' });
        }
      }
    });

    logger.info('Help command executed', { userId: interaction.user.id });

  } catch (error: any) {
    logger.error('Help command failed', {
      userId: interaction.user.id,
      error: error.message,
    });

    await interaction.reply({
      content: '❌ An error occurred while loading help. Please try again.',
      flags: MessageFlags.Ephemeral,
    });
  }
}

/**
 * Create help pages
 */
function createHelpPages(): EmbedBuilder[] {
  const pages: EmbedBuilder[] = [];

  // Page 1: Overview
  pages.push(
    new EmbedBuilder()
      .setTitle('📚 Build Canada Discord Bot - Help')
      .setDescription(
        `Welcome to the **Build Canada Discord Bot**! This bot provides AI-powered digest notifications to help you stay updated on topics you care about.\n\n` +
        `**Key Features**:\n` +
        `• 🔔 Keyword-based subscriptions\n` +
        `• 🤖 AI-generated topic summaries\n` +
        `• 📊 Smart message clustering\n` +
        `• ⏰ Customizable notification cooldowns\n` +
        `• 📬 DM or channel delivery\n\n` +
        `Use the buttons below to navigate through different sections.`
      )
      .setColor(0x3498DB)
      .addFields({
        name: '📖 Pages',
        value:
          `1️⃣ Overview (current)\n` +
          `2️⃣ User Commands\n` +
          `3️⃣ Admin Commands\n` +
          `4️⃣ Examples\n` +
          `5️⃣ FAQ`,
        inline: false,
      })
      .setFooter({ text: 'Page 1 of 5' })
      .setTimestamp()
  );

  // Page 2: User Commands
  pages.push(
    new EmbedBuilder()
      .setTitle('👤 User Commands')
      .setDescription('Commands available to all users:')
      .setColor(0x2ECC71)
      .addFields(
        {
          name: '/subscribe',
          value:
            `Subscribe to keywords and set notification preferences.\n` +
            `**Options**:\n` +
            `• \`keywords\`: Comma-separated keywords (required)\n` +
            `• \`cooldown_hours\`: 1-168 hours (default: 24)\n` +
            `• \`dm_enabled\`: Receive DMs (default: true)`,
          inline: false,
        },
        {
          name: '/unsubscribe',
          value:
            `Remove keywords or all subscriptions.\n` +
            `**Options**:\n` +
            `• \`keywords\`: Keywords to remove (leave empty for all)`,
          inline: false,
        },
        {
          name: '/my-subscriptions',
          value: `View your current subscriptions and settings.`,
          inline: false,
        },
        {
          name: '/digest-now',
          value:
            `Generate an instant digest (bypasses cooldown).\n` +
            `**Options**:\n` +
            `• \`hours\`: Look back 1-168 hours (default: 24)`,
          inline: false,
        },
        {
          name: '/help',
          value: `View this help menu.`,
          inline: false,
        }
      )
      .setFooter({ text: 'Page 2 of 5' })
      .setTimestamp()
  );

  // Page 3: Admin Commands
  pages.push(
    new EmbedBuilder()
      .setTitle('⚙️ Admin Commands')
      .setDescription('Commands restricted to server administrators:')
      .setColor(0xE74C3C)
      .addFields(
        {
          name: '/stats',
          value:
            `View comprehensive analytics dashboard.\n` +
            `Shows: digest counts, user activity, token usage, costs, and top keywords.`,
          inline: false,
        },
        {
          name: '/schedule',
          value:
            `Setup or modify scheduled digest delivery.\n` +
            `**Options**:\n` +
            `• \`enable\`: Enable/disable schedule\n` +
            `• \`cron\`: Cron expression (e.g., "0 9 * * *")\n` +
            `• \`timezone\`: Timezone (default: UTC)`,
          inline: false,
        },
        {
          name: '/unschedule',
          value: `Disable scheduled digest delivery.`,
          inline: false,
        },
        {
          name: '/admin-clear-user',
          value:
            `Remove all subscriptions for a specific user.\n` +
            `**Options**:\n` +
            `• \`user\`: User to clear`,
          inline: false,
        },
        {
          name: '/admin-remove-channel',
          value:
            `Exclude a channel from message indexing.\n` +
            `**Options**:\n` +
            `• \`channel\`: Channel to exclude`,
          inline: false,
        },
        {
          name: '/admin-list-channels',
          value: `View server configuration and excluded channels.`,
          inline: false,
        }
      )
      .setFooter({ text: 'Page 3 of 5' })
      .setTimestamp()
  );

  // Page 4: Examples
  pages.push(
    new EmbedBuilder()
      .setTitle('💡 Usage Examples')
      .setDescription('Common usage patterns and workflows:')
      .setColor(0xF39C12)
      .addFields(
        {
          name: '🎯 Basic Subscription',
          value:
            `\`\`\`\n` +
            `/subscribe keywords:rust,web3,backend\n` +
            `\`\`\`\n` +
            `Subscribe to three keywords with default settings (24h cooldown, DMs enabled).`,
          inline: false,
        },
        {
          name: '⏰ Custom Cooldown',
          value:
            `\`\`\`\n` +
            `/subscribe keywords:typescript cooldown_hours:48\n` +
            `\`\`\`\n` +
            `Get notified every 48 hours about TypeScript discussions.`,
          inline: false,
        },
        {
          name: '🔕 No DMs',
          value:
            `\`\`\`\n` +
            `/subscribe keywords:devops dm_enabled:false\n` +
            `\`\`\`\n` +
            `Subscribe without DM notifications (for future channel delivery).`,
          inline: false,
        },
        {
          name: '🔄 Update Subscription',
          value:
            `\`\`\`\n` +
            `/unsubscribe keywords:web3\n` +
            `/subscribe keywords:solidity,smart-contracts\n` +
            `\`\`\`\n` +
            `Remove a keyword and add new ones.`,
          inline: false,
        },
        {
          name: '⚡ Instant Digest',
          value:
            `\`\`\`\n` +
            `/digest-now hours:72\n` +
            `\`\`\`\n` +
            `Get a digest covering the last 3 days, ignoring cooldown.`,
          inline: false,
        },
        {
          name: '📅 Schedule Setup (Admin)',
          value:
            `\`\`\`\n` +
            `/schedule enable:true cron:0 9 * * * timezone:America/New_York\n` +
            `\`\`\`\n` +
            `Send digests daily at 9 AM EST.`,
          inline: false,
        }
      )
      .setFooter({ text: 'Page 4 of 5' })
      .setTimestamp()
  );

  // Page 5: FAQ
  pages.push(
    new EmbedBuilder()
      .setTitle('❓ Frequently Asked Questions')
      .setDescription('Common questions and answers:')
      .setColor(0x9B59B6)
      .addFields(
        {
          name: 'Q: How many keywords can I subscribe to?',
          value: `A: Maximum 20 keywords per user.`,
          inline: false,
        },
        {
          name: 'Q: What is the cooldown period?',
          value:
            `A: The cooldown prevents spam by limiting digest frequency. You can set 1-168 hours (1 week). Use \`/digest-now\` to bypass it.`,
          inline: false,
        },
        {
          name: 'Q: How does keyword matching work?',
          value:
            `A: Keywords are matched case-insensitively as substrings. For example, "rust" matches "Rust", "rustacean", and "trust".`,
          inline: false,
        },
        {
          name: 'Q: What if my DMs are closed?',
          value:
            `A: Enable DMs from server members in Privacy Settings. If delivery fails, your DM notifications will be automatically disabled.`,
          inline: false,
        },
        {
          name: 'Q: How are topics clustered?',
          value:
            `A: The AI analyzes messages and groups them by primary keyword, showing cross-references when messages match multiple keywords.`,
          inline: false,
        },
        {
          name: 'Q: What does the digest cost?',
          value:
            `A: Each digest uses OpenAI's API. Costs are tracked per-digest (typically $0.001-0.01) and shown in stats.`,
          inline: false,
        },
        {
          name: 'Q: Can admins schedule automatic digests?',
          value:
            `A: Yes! Use \`/schedule\` to set up cron-based delivery for all subscribers.`,
          inline: false,
        }
      )
      .setFooter({ text: 'Page 5 of 5' })
      .setTimestamp()
  );

  return pages;
}

/**
 * Create navigation button row
 */
function createNavigationRow(currentPage: number, totalPages: number): ActionRowBuilder<ButtonBuilder> {
  const row = new ActionRowBuilder<ButtonBuilder>();

  // Previous button
  row.addComponents(
    new ButtonBuilder()
      .setCustomId('help_previous')
      .setLabel('Previous')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('◀️')
      .setDisabled(currentPage === 0)
  );

  // Next button
  row.addComponents(
    new ButtonBuilder()
      .setCustomId('help_next')
      .setLabel('Next')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('▶️')
      .setDisabled(currentPage === totalPages - 1)
  );

  // Close button
  row.addComponents(
    new ButtonBuilder()
      .setCustomId('help_close')
      .setLabel('Close')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('❌')
  );

  return row;
}
