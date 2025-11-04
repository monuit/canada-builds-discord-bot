// MARK: - Reminder Service
// Handles scheduling and delivery of reminder notifications

import { Client } from 'discord.js';
import { Reminder, IReminder, ReminderDeliveryMethod } from '../models/Reminder';
import { logger } from '../utils/logger';

const POLL_INTERVAL_MS = 30_000;
const BATCH_LIMIT = 10;

type ReminderScheduleOptions = {
  guildId: string;
  userId: string;
  remindAt: Date;
  deliveryMethod: ReminderDeliveryMethod;
  note?: string;
  messageLink?: string;
  targetChannelId?: string;
};

export type ReminderDeliveryResult = {
  success: boolean;
  reason?: string;
};

function buildReminderMessage(reminder: IReminder): string {
  const timestamp = Math.floor(reminder.remindAt.getTime() / 1000);
  const header = reminder.deliveryMethod === 'channel'
    ? `<@${reminder.userId}> ⏰ Reminder`
    : '⏰ Reminder';

  const lines: string[] = [header, `• Scheduled for <t:${timestamp}:F>`];

  if (reminder.note) {
    lines.push(`• Note: ${reminder.note}`);
  }

  if (reminder.messageLink) {
    lines.push(`• Jump back: ${reminder.messageLink}`);
  }

  lines.push('• Tip: Use `/remind` anytime to queue another follow-up.');
  return lines.join('\n');
}

export function sanitizeNote(note?: string | null): string | undefined {
  if (!note) {
    return undefined;
  }
  const trimmed = note.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.slice(0, 240);
}

function isSendableChannel(channel: unknown): channel is { send: (payload: string) => Promise<unknown> } {
  return Boolean(channel) && typeof (channel as any).send === 'function';
}

export class ReminderService {
  private client: Client | null = null;
  private poller: NodeJS.Timeout | null = null;
  private processing = false;

  initialize(client: Client): void {
    this.client = client;
    this.startPoller();
  }

  shutdown(): void {
    if (this.poller) {
      clearInterval(this.poller);
      this.poller = null;
    }
    this.processing = false;
  }

  async scheduleReminder(options: ReminderScheduleOptions): Promise<IReminder> {
    const { guildId, userId, remindAt, deliveryMethod, note, messageLink, targetChannelId } = options;

    if (!guildId || !userId) {
      throw new Error('Missing guildId or userId for reminder');
    }

    if (deliveryMethod === 'channel' && !targetChannelId) {
      throw new Error('Channel reminders require a target channel id');
    }

    const reminder = await Reminder.create({
      guildId,
      userId,
      remindAt,
      deliveryMethod,
      targetChannelId,
      note: sanitizeNote(note),
      messageLink,
    });

    logger.info('Reminder scheduled', {
      guildId,
      userId,
      remindAt: reminder.remindAt.toISOString(),
      deliveryMethod,
      targetChannelId,
    });

    return reminder;
  }

  private startPoller(): void {
    if (this.poller) {
      return;
    }

    this.poller = setInterval(() => {
      this.processDueReminders().catch(error => {
        logger.error('Reminder processing failed', {
          error: (error as Error).message,
        });
      });
    }, POLL_INTERVAL_MS);

    if (typeof this.poller.unref === 'function') {
      this.poller.unref();
    }
  }

  private async processDueReminders(): Promise<void> {
    if (this.processing) {
      return;
    }

    if (!this.client) {
      return;
    }

    this.processing = true;
    try {
      let processed = 0;
      while (processed < BATCH_LIMIT) {
        const reminder = await Reminder.findOneAndUpdate(
          {
            status: 'pending',
            remindAt: { $lte: new Date() },
          },
          {
            status: 'processing',
            processingStartedAt: new Date(),
          },
          {
            sort: { remindAt: 1 },
            new: true,
          }
        );

        if (!reminder) {
          break;
        }

        const result = await this.deliver(reminder);
        reminder.status = result.success ? 'sent' : 'failed';
        reminder.sentAt = new Date();
        reminder.failureReason = result.success ? undefined : result.reason?.slice(0, 300);
        reminder.processingStartedAt = undefined;

        await reminder.save();
        processed += 1;
      }
    } finally {
      this.processing = false;
    }
  }

  private async deliver(reminder: IReminder): Promise<ReminderDeliveryResult> {
    if (!this.client) {
      return { success: false, reason: 'Client not ready' };
    }

    try {
      if (reminder.deliveryMethod === 'dm') {
        const user = await this.client.users.fetch(reminder.userId);
        await user.send(buildReminderMessage(reminder));
        return { success: true };
      }

      if (!reminder.targetChannelId) {
        return { success: false, reason: 'Missing channel id' };
      }

      const channel = await this.client.channels.fetch(reminder.targetChannelId);
      if (!channel || !channel.isTextBased() || !isSendableChannel(channel)) {
        return { success: false, reason: 'Channel not found or not text-based' };
      }

      await channel.send(buildReminderMessage(reminder));
      return { success: true };
    } catch (error: any) {
      const message = error?.message ?? 'Unknown error';
      if (error?.code === 50007) {
        return { success: false, reason: 'DMs closed' };
      }

      logger.error('Reminder delivery failed', {
        reminderId: reminder.id,
        guildId: reminder.guildId,
        userId: reminder.userId,
        error: message,
      });

      return { success: false, reason: message };
    }
  }
}

export const reminderService = new ReminderService();
export { buildReminderMessage };
