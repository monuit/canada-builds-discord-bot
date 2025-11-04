// MARK: - Remind Command
// Schedule a reminder delivered via DM or a specific channel

import {
  ChatInputCommandInteraction,
  ChannelType,
  SlashCommandBuilder,
} from 'discord.js';
import { reminderService, sanitizeNote } from '../services/ReminderService';
import { logger } from '../utils/logger';
import { replyEphemeral } from '../utils/interactionCleanup';

const MIN_DELAY_MINUTES = 5;
const MAX_DELAY_MINUTES = 10_080; // 7 days
const DEFAULT_DELAY_MINUTES = 60;

export interface ReminderCommandOptions {
  delayMinutes: number;
  note?: string;
  deliveryMethod: 'dm' | 'channel';
  channelId?: string;
  messageLink?: string;
}

export function parseMessageLink(link: string, expectedGuildId: string): { channelId: string; messageId: string } | null {
  if (!link) {
    return null;
  }

  try {
    const url = new URL(link);
    const host = url.hostname;
    if (!host.endsWith('discord.com') && !host.endsWith('discordapp.com')) {
      return null;
    }

    const segments = url.pathname.split('/').filter(Boolean);
    if (segments.length < 4 || segments[0] !== 'channels') {
      return null;
    }

    const [, guildId, channelId, messageId] = segments;
    if (!guildId || guildId !== expectedGuildId) {
      throw new Error('Message link must reference a message in this server.');
    }

    if (!channelId || !messageId) {
      return null;
    }

    return { channelId, messageId };
  } catch (error: any) {
    if (error?.message?.includes('Message link must reference')) {
      throw error;
    }
    return null;
  }
}

export function normalizeDelayMinutes(raw: number | null | undefined): number {
  const fallback = DEFAULT_DELAY_MINUTES;
  const value = typeof raw === 'number' ? raw : fallback;
  if (Number.isNaN(value)) {
    return fallback;
  }
  return Math.min(Math.max(value, MIN_DELAY_MINUTES), MAX_DELAY_MINUTES);
}

function buildReminderConfirmation(options: ReminderCommandOptions, remindAt: Date): string {
  const timestamp = Math.floor(remindAt.getTime() / 1000);
  const destination = options.deliveryMethod === 'channel'
    ? `<#${options.channelId}>`
    : 'your DMs';

  const lines: string[] = [
    `⏰ **Reminder Scheduled**`,
    `• Delivery: ${destination}`,
    `• When: <t:${timestamp}:f> (<t:${timestamp}:R>)`,
  ];

  if (options.note) {
    lines.push(`• Note: ${options.note}`);
  }

  if (options.messageLink) {
    lines.push(`• Jump back: ${options.messageLink}`);
  }

  lines.push('\nYou can queue additional reminders anytime with `/remind`.');
  return lines.join('\n');
}

function resolveChannelId(channel: unknown): string | undefined {
  if (!channel) {
    return undefined;
  }
  if (typeof (channel as any).id === 'string') {
    return (channel as any).id;
  }
  return undefined;
}

function resolveChannelGuildId(channel: unknown): string | undefined {
  if (!channel) {
    return undefined;
  }
  if (typeof (channel as any).guildId === 'string') {
    return (channel as any).guildId;
  }
  if (typeof (channel as any).guild_id === 'string') {
    return (channel as any).guild_id;
  }
  return undefined;
}

function channelSupportsText(channel: unknown): boolean {
  if (!channel) {
    return false;
  }
  if (typeof (channel as any).isTextBased === 'function') {
    return (channel as any).isTextBased();
  }
  const channelType = (channel as any).type;
  if (typeof channelType !== 'number') {
    return false;
  }
  return [
    ChannelType.GuildText,
    ChannelType.GuildAnnouncement,
    ChannelType.PublicThread,
    ChannelType.PrivateThread,
    ChannelType.AnnouncementThread,
  ].includes(channelType);
}

export const data = new SlashCommandBuilder()
  .setName('remind')
  .setDescription('Schedule a reminder delivered as a DM or channel message')
  .addIntegerOption(option =>
    option
      .setName('in_minutes')
      .setDescription('How many minutes from now to fire (5-10080, default: 60)')
      .setMinValue(MIN_DELAY_MINUTES)
      .setMaxValue(MAX_DELAY_MINUTES)
      .setRequired(false)
  )
  .addStringOption(option =>
    option
      .setName('note')
      .setDescription('Optional note to include (max 240 characters)')
      .setRequired(false)
  )
  .addChannelOption(option =>
    option
      .setName('channel')
      .setDescription('Deliver reminder into this channel instead of a DM')
      .addChannelTypes(
        ChannelType.GuildText,
        ChannelType.GuildAnnouncement,
        ChannelType.PublicThread,
        ChannelType.PrivateThread,
        ChannelType.AnnouncementThread,
      )
      .setRequired(false)
  )
  .addStringOption(option =>
    option
      .setName('message_link')
      .setDescription('Paste a message link to include a jump-back reference')
      .setRequired(false)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  try {
    const guildId = interaction.guildId;
    const userId = interaction.user.id;

    if (!guildId) {
      await replyEphemeral(interaction, {
        content: '❌ This command can only be used within a server.',
      });
      return;
    }

    const delayMinutes = normalizeDelayMinutes(interaction.options.getInteger('in_minutes'));
    const rawNote = interaction.options.getString('note');
    const note = sanitizeNote(rawNote);

    const channelOption = interaction.options.getChannel('channel');
    const messageLinkInput = interaction.options.getString('message_link');

    const messageLinkMeta = messageLinkInput ? parseMessageLink(messageLinkInput, guildId) : null;
    const messageLink = messageLinkMeta ? messageLinkInput ?? undefined : undefined;

    const targetChannelId = resolveChannelId(channelOption);
    const targetGuildId = resolveChannelGuildId(channelOption);

    if (channelOption && targetGuildId && targetGuildId !== guildId) {
      await replyEphemeral(interaction, {
        content: '❌ The selected channel must belong to this server.',
      });
      return;
    }

    if (channelOption && !channelSupportsText(channelOption)) {
      await replyEphemeral(interaction, {
        content: '❌ Only text channels and threads can receive reminders.',
      });
      return;
    }

    if (messageLinkMeta && targetChannelId && messageLinkMeta.channelId !== targetChannelId) {
      await replyEphemeral(interaction, {
        content: '❌ Message link must reference the same channel selected for delivery.',
      });
      return;
    }

    const deliveryMethod = targetChannelId ? 'channel' : 'dm';
    const remindAt = new Date(Date.now() + delayMinutes * 60_000);

    await reminderService.scheduleReminder({
      guildId,
      userId,
      remindAt,
      deliveryMethod,
      targetChannelId,
      note,
      messageLink,
    });

    const confirmation = buildReminderConfirmation(
      {
        delayMinutes,
        note,
        deliveryMethod,
        channelId: targetChannelId,
        messageLink,
      },
      remindAt,
    );

    await replyEphemeral(interaction, {
      content: confirmation,
    });

    logger.info('Reminder scheduled via command', {
      userId,
      guildId,
      delayMinutes,
      deliveryMethod,
      channelId: targetChannelId,
    });
  } catch (error: any) {
    if (error?.message === 'Message link must reference a message in this server.') {
      await replyEphemeral(interaction, {
        content: '❌ Message link must reference a message from this server.',
      });
      return;
    }

    logger.error('Remind command failed', {
      userId: interaction.user.id,
      error: error?.message,
    });

    await replyEphemeral(interaction, {
      content: '❌ Unable to schedule that reminder right now. Please try again later.',
    });
  }
}

export { buildReminderConfirmation };
