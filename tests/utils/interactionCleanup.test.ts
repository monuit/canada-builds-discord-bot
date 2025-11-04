import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MessageFlags, RepliableInteraction } from 'discord.js';
import { editEphemeral, replyEphemeral, scheduleInteractionCleanup } from '../../src/utils/interactionCleanup';

type InteractionMocks = {
  reply: ReturnType<typeof vi.fn>;
  editReply: ReturnType<typeof vi.fn>;
  deleteReply: ReturnType<typeof vi.fn>;
  deleteMessage: ReturnType<typeof vi.fn>;
  interaction: RepliableInteraction;
};

function createInteractionMocks(): InteractionMocks {
  const reply = vi.fn().mockResolvedValue(undefined);
  const editReply = vi.fn().mockResolvedValue(undefined);
  const deleteReply = vi.fn().mockResolvedValue(undefined);
  const deleteMessage = vi.fn().mockResolvedValue(undefined);

  const interaction = {
    reply,
    editReply,
    deleteReply,
    webhook: {
      deleteMessage,
    },
  } as unknown as RepliableInteraction;

  return { reply, editReply, deleteReply, deleteMessage, interaction };
}

describe('interactionCleanup utilities', () => {
  let mocks: InteractionMocks;

  beforeEach(() => {
    vi.useFakeTimers();
    mocks = createInteractionMocks();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('replies ephemerally and deletes after the default TTL', async () => {
    await replyEphemeral(mocks.interaction, { content: 'Testing TTL' });

    expect(mocks.reply).toHaveBeenCalledWith({ content: 'Testing TTL', flags: MessageFlags.Ephemeral });
    expect(mocks.deleteReply).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(30_000);

    expect(mocks.deleteReply).toHaveBeenCalledTimes(1);
    expect(mocks.deleteMessage).not.toHaveBeenCalled();
  });

  it('resets the cleanup timer when editing the response', async () => {
    await replyEphemeral(mocks.interaction, { content: 'Initial' });
    mocks.deleteReply.mockClear();

    await editEphemeral(mocks.interaction, { content: 'Updated' }, 1_000);

    await vi.advanceTimersByTimeAsync(999);
    expect(mocks.deleteReply).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(mocks.deleteReply).toHaveBeenCalledTimes(1);
  });

  it('routes cleanup through the webhook when a message id is provided', async () => {
    scheduleInteractionCleanup(mocks.interaction, { messageId: '123', ttlMs: 500 });

    await vi.advanceTimersByTimeAsync(500);

    expect(mocks.deleteMessage).toHaveBeenCalledWith('123');
    expect(mocks.deleteReply).not.toHaveBeenCalled();
  });
});
