import { describe, expect, it } from 'vitest';
import { OnboardingPromptBuilder } from '../../src/services/onboarding/OnboardingPromptBuilder';

const defaults = {
  consentVersion: 'v42',
  autoSubscribeKeywords: ['ai', 'events', 'funding'],
};

describe('OnboardingPromptBuilder', () => {
  it('creates a consent prompt with expected metadata', () => {
    const sessionId = 'session-123';
    const prompt = OnboardingPromptBuilder.buildConsentPrompt(defaults, sessionId);
    const embed = prompt.embed.toJSON();
    const buttons = prompt.components[0].toJSON() as any;

    expect(embed.title).toBe('Welcome to Build Canada!');
    expect(embed.footer?.text).toBe('Consent version v42');
    expect(buttons.components).toHaveLength(2);
    expect(buttons.components?.[0]?.custom_id).toBe(`onboarding:consent:${sessionId}:accept`);
    expect(buttons.components?.[1]?.custom_id).toBe(`onboarding:consent:${sessionId}:decline`);
  });

  it('creates a topic prompt capped to five keywords', () => {
    const prompt = OnboardingPromptBuilder.buildTopicPrompt(
      { ...defaults, autoSubscribeKeywords: ['a', 'b', 'c', 'd', 'e', 'f'] },
      'session-987',
    );

    const selectRow = prompt.components[0].toJSON() as any;
    const select = selectRow.components?.[0];

    expect(prompt.content).toContain('Thanks for consenting');
    expect(select?.options?.length).toBe(6);
    expect(select?.max_values).toBe(5);
  });

  it('includes builder-mp keyword metadata when available', () => {
    const prompt = OnboardingPromptBuilder.buildTopicPrompt(defaults, 'session-222', [
      {
        label: 'BUILDER-MP',
        value: 'builder-mp',
        keywords: ['builder-mp', 'milestone', 'release', 'deploy', 'rollback', 'bugfix'],
        bigrams: ['feature flag', 'release notes'],
      },
    ]);

    expect(prompt.content).toContain('BUILDER-MP');
    expect(prompt.content).toContain('deployment feed');
    expect(prompt.content).toContain('Keywords: builder-mp, milestone, release, deploy, rollback, bugfix');
    expect(prompt.content).toContain('Phrases: feature flag, release notes');
  });
});
