import { describe, expect, it } from 'vitest';
import { buildReminderConfirmation, normalizeDelayMinutes, parseMessageLink } from '../../src/commands/remind';

describe('remind command helpers', () => {
  it('normalizes delay minutes within allowed bounds', () => {
    expect(normalizeDelayMinutes(2)).toBe(5);
    expect(normalizeDelayMinutes(50000)).toBe(10_080);
    expect(normalizeDelayMinutes(null)).toBe(60);
  });

  it('parses valid message links within the same guild', () => {
    const result = parseMessageLink('https://discord.com/channels/123/456/789', '123');
    expect(result).toEqual({ channelId: '456', messageId: '789' });
  });

  it('throws for message links referencing other guilds', () => {
    expect(() => parseMessageLink('https://discord.com/channels/321/456/789', '123')).toThrow(
      'Message link must reference a message in this server.',
    );
  });

  it('builds a confirmation string with contextual details', () => {
    const message = buildReminderConfirmation(
      {
        delayMinutes: 30,
        deliveryMethod: 'channel',
        channelId: '456',
        note: 'Draft response to proposal',
        messageLink: 'https://discord.com/channels/123/456/789',
      },
      new Date('2024-06-01T12:00:00Z'),
    );

    expect(message).toContain('<#456>');
    expect(message).toContain('Draft response to proposal');
    expect(message).toContain('https://discord.com/channels/123/456/789');
  });
});
