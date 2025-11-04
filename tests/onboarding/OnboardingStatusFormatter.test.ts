import { describe, expect, it } from 'vitest';
import { MessageFlags } from 'discord.js';
import { OnboardingStatusFormatter } from '../../src/services/onboarding/OnboardingStatusFormatter';
import { IConsentLedger } from '../../src/models/ConsentLedger';

const createLedger = (overrides: Partial<IConsentLedger>): IConsentLedger => ({
  guildId: 'guild',
  userId: 'user',
  status: 'pending',
  consentVersion: 'v1',
  defaultSubscriptions: [],
  metadata: {},
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
}) as unknown as IConsentLedger;

describe('OnboardingStatusFormatter', () => {
  it('labels consented users with emoji and timestamps', () => {
    const consentedAt = new Date('2025-01-01T00:00:00Z');
    const ledger = createLedger({ status: 'consented', consentedAt, defaultSubscriptions: ['ai'] });

    const status = OnboardingStatusFormatter.format(ledger);

    expect(status.flags).toBe(MessageFlags.Ephemeral);
    expect(status.content).toContain('✅');
    expect(status.content).toContain('ai');
  });

  it('shows revoked state and placeholder topics', () => {
    const revokedAt = new Date('2025-02-01T00:00:00Z');
    const ledger = createLedger({ status: 'revoked', revokedAt });

    const status = OnboardingStatusFormatter.format(ledger);

    expect(status.flags).toBe(MessageFlags.Ephemeral);
    expect(status.content).toContain('🚫');
    expect(status.content).toContain('none');
  });
});
