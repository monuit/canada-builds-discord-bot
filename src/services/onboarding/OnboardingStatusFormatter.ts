// MARK: - Onboarding Status Formatter
// Presents consent ledger status summaries

import { IConsentLedger } from '../../models/ConsentLedger';

export class OnboardingStatusFormatter {
  static format(ledger: IConsentLedger): { content: string; ephemeral: boolean } {
    const statusEmoji = ledger.status === 'consented' ? '✅' : ledger.status === 'pending' ? '⏳' : '🚫';

    const consentedAt = ledger.consentedAt
      ? `<t:${Math.floor(ledger.consentedAt.getTime() / 1000)}:R>`
      : 'not yet';

    const revokedAt = ledger.revokedAt
      ? `<t:${Math.floor(ledger.revokedAt.getTime() / 1000)}:R>`
      : '—';

    const keywords = ledger.defaultSubscriptions.length
      ? ledger.defaultSubscriptions.join(', ')
      : 'none';

    return {
      content:
        `${statusEmoji} **Consent status:** ${ledger.status}\n` +
        `• Consented: ${consentedAt}\n` +
        `• Revoked: ${revokedAt}\n` +
        `• Default topics: ${keywords}\n\n` +
        'Use `/onboarding revoke` to opt out or `/subscribe` to manage keywords.',
      ephemeral: true,
    };
  }
}
