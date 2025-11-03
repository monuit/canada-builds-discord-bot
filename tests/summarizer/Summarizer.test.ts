import { describe, expect, it } from 'vitest';
import { summarizer } from '../../src/services/Summarizer';
import { MessageForSummary } from '../../src/services/OpenAIService';

const factory = (overrides: Partial<MessageForSummary> = {}): MessageForSummary => ({
  id: overrides.id ?? Math.random().toString(36).slice(2),
  authorUsername: overrides.authorUsername ?? 'alice',
  content: overrides.content ?? 'Default content about policy updates in canada.',
  timestamp: overrides.timestamp ?? new Date('2024-01-01T12:00:00Z'),
  url: overrides.url ?? 'https://discord.com',
});

describe('Summarizer', () => {
  it('returns bullet summary with selected messages', () => {
    const messages: MessageForSummary[] = [
      factory({
        id: '1',
        authorUsername: 'maya',
        content: 'We published the clean energy roadmap and need feedback on incentives.',
      }),
      factory({
        id: '2',
        authorUsername: 'jules',
        content: 'Reminder: policy roundtable on grid modernization happens Friday at noon.',
      }),
      factory({
        id: '3',
        authorUsername: 'sam',
        content: 'Budget request submitted for renewable pilot project in Alberta.',
      }),
    ];

    const result = summarizer.summarize(messages, 'energy');

    expect(result.summary).toContain('maya');
    expect(result.summary.split('\n').length).toBeGreaterThanOrEqual(2);
    expect(result.cost).toBe(0);
    expect(result.tokensUsed.input).toBe(0);
    expect(result.tokensUsed.output).toBe(0);
    expect(result.selectedIds.length).toBeGreaterThan(0);
  });

  it('provides fallback summary when no messages', () => {
    const result = summarizer.summarize([], 'policy');
    expect(result.summary).toContain('No notable discussion');
    expect(result.selectedIds).toHaveLength(0);
  });
});
