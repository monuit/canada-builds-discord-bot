// MARK: - Subscribe Command
// User subscribes to keywords with cooldown and DM preferences

import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { UserSubscription } from '../models/UserSubscription';
import { messageIndexer } from '../services/MessageIndexer';
import { logger } from '../utils/logger';
import { editEphemeral, replyEphemeral } from '../utils/interactionCleanup';

const MAX_KEYWORDS = 20;
const MIN_COOLDOWN = 1;
const MAX_COOLDOWN = 168;

export const data = new SlashCommandBuilder()
  .setName('subscribe')
  .setDescription('Subscribe to keyword notifications with AI-powered digests')
  .addStringOption(option =>
    option
      .setName('keywords')
      .setDescription('Comma-separated keywords (e.g., "rust, web3, backend")')
      .setRequired(true)
  )
  .addIntegerOption(option =>
    option
      .setName('cooldown_hours')
      .setDescription('Hours between notifications (1-168, default: 24)')
      .setMinValue(MIN_COOLDOWN)
      .setMaxValue(MAX_COOLDOWN)
      .setRequired(false)
  )
  .addBooleanOption(option =>
    option
      .setName('dm_enabled')
      .setDescription('Receive notifications via DM (default: true)')
      .setRequired(false)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  try {
    const keywordsInput = interaction.options.getString('keywords', true);

    const guildId = interaction.guildId;
    const userId = interaction.user.id;

    if (!guildId) {
      await replyEphemeral(interaction, {
        content: '❌ This command can only be used in a server.',
      });
      return;
    }

    const keywords = keywordsInput
      .split(',')
      .map(keyword => keyword.trim().toLowerCase())
      .filter(keyword => keyword.length > 0);

    if (keywords.length === 0) {
      await replyEphemeral(interaction, {
        content: '❌ Please provide at least one keyword.',
      });
      return;
    }

    if (keywords.length > MAX_KEYWORDS) {
      await replyEphemeral(interaction, {
        content: `❌ Maximum ${MAX_KEYWORDS} keywords allowed. You provided ${keywords.length}.`,
      });
      return;
    }

    const uniqueKeywords = [...new Set(keywords)];
    if (uniqueKeywords.length !== keywords.length) {
      await replyEphemeral(interaction, {
        content: '❌ Duplicate keywords detected. Please provide unique keywords only.',
      });
      return;
    }

    const invalidKeywords = uniqueKeywords.filter(keyword => keyword.length < 2 || keyword.length > 50);
    if (invalidKeywords.length > 0) {
      await replyEphemeral(interaction, {
        content: `❌ Keywords must be 2-50 characters. Invalid: ${invalidKeywords.join(', ')}`,
      });
      return;
    }

    const subscription = await UserSubscription.findOne({ userId, guildId });

    const cooldownHours = interaction.options.getInteger('cooldown_hours') ?? subscription?.cooldownHours ?? 24;
    const dmEnabled = interaction.options.getBoolean('dm_enabled') ?? subscription?.dmEnabled ?? true;

    const existingKeywords = subscription?.keywords ?? [];
    const mergedKeywords = Array.from(new Set([...existingKeywords, ...uniqueKeywords]));

    if (mergedKeywords.length > MAX_KEYWORDS) {
      await replyEphemeral(interaction, {
        content: `❌ Adding those keywords would exceed the maximum of ${MAX_KEYWORDS}. You currently have ${existingKeywords.length} and tried to add ${uniqueKeywords.length}.`,
      });
      return;
    }

    const newlyAdded = mergedKeywords.filter(keyword => !existingKeywords.includes(keyword));

    await UserSubscription.findOneAndUpdate(
      { userId, guildId },
      {
        keywords: mergedKeywords,
        cooldownHours,
        dmEnabled,
        updatedAt: new Date(),
      },
      { upsert: true, new: true }
    );

    await messageIndexer.refreshKeywords(guildId);

    const nextDigestTime = new Date(Date.now() + cooldownHours * 60 * 60 * 1000);
    const nextDigestStr = nextDigestTime.toLocaleString('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });

    logger.info('User subscribed to keywords', {
      userId,
      guildId,
      keywords: mergedKeywords,
      newlyAdded,
      cooldownHours,
      dmEnabled,
    });

    await replyEphemeral(interaction, {
      content:
        `✅ **Subscription Updated**\n\n` +
        `**Keywords**: ${mergedKeywords.join(', ')}\n` +
        (newlyAdded.length > 0 ? `**New**: ${newlyAdded.join(', ')}\n` : '') +
        `**Cooldown**: ${cooldownHours} hour${cooldownHours === 1 ? '' : 's'}\n` +
        `**DM Notifications**: ${dmEnabled ? 'Enabled ✓' : 'Disabled ✗'}\n\n` +
        `🔔 You'll receive your next digest around **${nextDigestStr}** (or use \`/digest-now\` for an instant update).\n\n` +
        `💡 **Tip**: Existing keywords are preserved automatically. Use \`/unsubscribe\` to remove any you no longer need.`,
    });

  } catch (error: any) {
    logger.error('Subscribe command failed', {
      userId: interaction.user.id,
      error: error.message,
    });

    const payload = {
      content: '❌ An unexpected error occurred while updating your subscription. Please try again.',
    } as const;

    if (interaction.deferred || interaction.replied) {
      try {
        await editEphemeral(interaction, payload);
      } catch {
        // noop: interaction may already be cleaned up
      }
    } else {
      await replyEphemeral(interaction, payload);
    }
  }
}
