import { describe, expect, it } from 'vitest';
import { buildDigestHistoryEmbed, formatDigestHistoryLine } from '../../src/commands/digestHistory';

const baseEntry = {
  generatedAt: new Date('2024-06-01T12:00:00Z'),
  deliveryMethod: 'dm' as const,
  success: true,
  topTopics: [
    { slug: 'POLICY', count: 4 },
    { slug: 'GRANTS', count: 2 },
  ],
  costUSD: 0.42,
  messageCount: 12,
};

describe('digestHistory formatting helpers', () => {
  it('formats a digest history line with topics and stats', () => {
    const line = formatDigestHistoryLine(baseEntry);
    expect(line).toContain('✅');
    expect(line).toContain('DM');
    expect(line).toContain('policy (4)');
    expect(line).toContain('Messages: 12');
    expect(line).toContain('Cost: $0.420');
  });

  it('includes error details when the digest failed', () => {
    const line = formatDigestHistoryLine({
      ...baseEntry,
      success: false,
      errorMessage: 'DMs closed',
    });

    expect(line).toContain('⚠️');
    expect(line).toContain('Error: DMs closed');
  });

  it('builds an embed with colored status based on entries', () => {
    const embed = buildDigestHistoryEmbed([
      baseEntry,
      { ...baseEntry, success: false },
    ]);

    const json = embed.toJSON();
    expect(json.title).toBe('Recent Digests');
    expect(json.description).toContain('✅');
    expect(json.description).toContain('⚠️');
    expect(json.color).toBe(0xffa500);
  });
});
