import { describe, expect, it } from 'vitest';
import { buildReminderMessage, sanitizeNote } from '../../src/services/ReminderService';

describe('ReminderService helper utilities', () => {
  it('trims and caps notes when sanitizing', () => {
    expect(sanitizeNote('  hello ')).toBe('hello');
    expect(sanitizeNote('')).toBeUndefined();
    expect(sanitizeNote(null)).toBeUndefined();

    const long = 'a'.repeat(500);
    expect(sanitizeNote(long)).toHaveLength(240);
  });

  it('builds reminder message with optional fields', () => {
    const message = buildReminderMessage({
      guildId: '123',
      userId: 'u1',
      deliveryMethod: 'dm',
      remindAt: new Date('2024-06-01T12:00:00Z'),
      status: 'pending',
      createdAt: new Date('2024-05-31T12:00:00Z'),
      note: 'Prepare project update',
      messageLink: 'https://discord.com/channels/123/456/789',
    } as any);

    expect(message).toContain('Reminder');
    expect(message).toContain('Prepare project update');
    expect(message).toContain('https://discord.com/channels/123/456/789');
  });
});
