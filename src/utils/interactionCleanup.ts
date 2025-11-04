// MARK: - Interaction Cleanup Utilities
// Ensures ephemeral responses are auto-deleted after a TTL

import {
  InteractionEditReplyOptions,
  InteractionReplyOptions,
  MessageFlags,
  RepliableInteraction,
} from 'discord.js';

const DEFAULT_TTL_MS = 30_000;
const cleanupTimers = new WeakMap<RepliableInteraction, NodeJS.Timeout>();

export function scheduleInteractionCleanup(
  interaction: RepliableInteraction,
  options: { messageId?: string; ttlMs?: number } = {},
): void {
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const existing = cleanupTimers.get(interaction);
  if (existing) {
    clearTimeout(existing);
  }

  const timeout = setTimeout(() => {
    if (options.messageId) {
      interaction.webhook?.deleteMessage(options.messageId).catch(() => undefined);
      return;
    }

    interaction.deleteReply().catch(() => undefined);
    cleanupTimers.delete(interaction);
  }, ttlMs) as NodeJS.Timeout;

  cleanupTimers.set(interaction, timeout);

  if (typeof timeout.unref === 'function') {
    timeout.unref();
  }
}

export async function replyEphemeral(
  interaction: RepliableInteraction,
  options: InteractionReplyOptions,
  ttlMs = DEFAULT_TTL_MS,
): Promise<void> {
  await interaction.reply({ ...options, flags: MessageFlags.Ephemeral });
  scheduleInteractionCleanup(interaction, { ttlMs });
}

export async function editEphemeral(
  interaction: RepliableInteraction,
  options: InteractionEditReplyOptions,
  ttlMs = DEFAULT_TTL_MS,
): Promise<void> {
  await interaction.editReply(options);
  scheduleInteractionCleanup(interaction, { ttlMs });
}
