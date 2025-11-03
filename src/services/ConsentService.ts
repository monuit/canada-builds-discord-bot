// MARK: - Consent Service
// Centralized access layer for consent ledger operations

import { ConsentLedger, IConsentLedger } from '../models/ConsentLedger';
import { logger } from '../utils/logger';

export type ConsentState = 'pending' | 'consented' | 'revoked';

class ConsentService {
  async getOrCreate(
    guildId: string,
    userId: string,
    defaults: { consentVersion: string; defaultSubscriptions: string[] },
  ): Promise<IConsentLedger> {
    const existing = await ConsentLedger.findOne({ guildId, userId });

    if (existing) {
      return existing;
    }

    const created = await ConsentLedger.create({
      guildId,
      userId,
      consentVersion: defaults.consentVersion,
      defaultSubscriptions: defaults.defaultSubscriptions,
      status: 'pending',
    });

    logger.info('Consent ledger created', { guildId, userId });
    return created;
  }

  async updateStatus(
    ledger: IConsentLedger,
    status: ConsentState,
    options: { sessionId?: string; timestamp?: Date } = {},
  ): Promise<IConsentLedger> {
    const timestamp = options.timestamp ?? new Date();

    ledger.status = status;
    ledger.lastInteractionAt = timestamp;

    if (options.sessionId) {
      ledger.onboardingSessionId = options.sessionId;
    }

    if (status === 'consented') {
      ledger.consentedAt = timestamp;
      ledger.revokedAt = undefined;
    }

    if (status === 'revoked') {
      ledger.revokedAt = timestamp;
    }

    await ledger.save();
    logger.info('Consent status updated', { guildId: ledger.guildId, userId: ledger.userId, status });
    return ledger;
  }

  async updateDefaultSubscriptions(
    ledger: IConsentLedger,
    subscriptions: string[],
  ): Promise<IConsentLedger> {
    ledger.defaultSubscriptions = subscriptions;
    ledger.lastInteractionAt = new Date();
    await ledger.save();
    return ledger;
  }
}

export const consentService = new ConsentService();
