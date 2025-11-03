// MARK: - Guild Feature Config Service
// Manages cached guild configuration for highlight relays and onboarding defaults

import { GuildFeatureConfig, IGuildFeatureConfig } from '../models/GuildFeatureConfig';
import { logger } from '../utils/logger';

const FALLBACK_KEYWORDS = ['announcements', 'events', 'resources'];

class GuildFeatureConfigService {
  private cache = new Map<string, IGuildFeatureConfig>();

  async initialize(guildId: string): Promise<void> {
    const config = await GuildFeatureConfig.findOne({ guildId });

    if (config) {
      this.cache.set(guildId, config);
      return;
    }

    const created = await GuildFeatureConfig.create({ guildId });
    this.cache.set(guildId, created);
    logger.info('GuildFeatureConfig created with defaults', { guildId });
  }

  getConfig(guildId: string): IGuildFeatureConfig | null {
    return this.cache.get(guildId) ?? null;
  }

  async refresh(guildId: string): Promise<IGuildFeatureConfig> {
    const config = await GuildFeatureConfig.findOne({ guildId });

    if (!config) {
      const created = await GuildFeatureConfig.create({ guildId });
      this.cache.set(guildId, created);
      return created;
    }

    this.cache.set(guildId, config);
    return config;
  }

  getHighlightChannelId(guildId: string): string | null {
    return this.cache.get(guildId)?.highlightChannelId ?? null;
  }

  getErrorChannelId(guildId: string): string | null {
    return this.cache.get(guildId)?.errorChannelId ?? null;
  }

  async setHighlightChannelId(guildId: string, channelId: string): Promise<void> {
    const updated = await GuildFeatureConfig.findOneAndUpdate(
      { guildId },
      {
        $set: {
          highlightChannelId: channelId,
          updatedAt: new Date(),
        },
      },
      { upsert: true, new: true },
    );

    this.cache.set(guildId, updated);
    logger.info('Highlight channel updated', { guildId, channelId });
  }

  async setErrorChannelId(guildId: string, channelId: string): Promise<void> {
    const updated = await GuildFeatureConfig.findOneAndUpdate(
      { guildId },
      {
        $set: {
          errorChannelId: channelId,
          updatedAt: new Date(),
        },
      },
      { upsert: true, new: true },
    );

    this.cache.set(guildId, updated);
    logger.info('Error channel updated', { guildId, channelId });
  }

  getOnboardingDefaults(guildId: string): { autoSubscribeKeywords: string[]; consentVersion: string } {
    const config = this.cache.get(guildId);

    if (!config) {
      return {
        autoSubscribeKeywords: FALLBACK_KEYWORDS,
        consentVersion: 'v1',
      };
    }

    return {
      autoSubscribeKeywords: config.onboardingDefaults.autoSubscribeKeywords?.length > 0
        ? config.onboardingDefaults.autoSubscribeKeywords
        : FALLBACK_KEYWORDS,
      consentVersion: config.onboardingDefaults.consentVersion ?? 'v1',
    };
  }

  async updateOnboardingDefaults(
    guildId: string,
    defaults: { autoSubscribeKeywords?: string[]; consentVersion?: string },
  ): Promise<void> {
    const update: Partial<IGuildFeatureConfig['onboardingDefaults']> = {};

    if (defaults.autoSubscribeKeywords) {
      update.autoSubscribeKeywords = defaults.autoSubscribeKeywords.map(keyword => keyword.toLowerCase());
    }

    if (defaults.consentVersion) {
      update.consentVersion = defaults.consentVersion;
    }

    const updated = await GuildFeatureConfig.findOneAndUpdate(
      { guildId },
      {
        $set: {
          'onboardingDefaults.autoSubscribeKeywords': update.autoSubscribeKeywords ?? FALLBACK_KEYWORDS,
          'onboardingDefaults.consentVersion': update.consentVersion ?? 'v1',
          updatedAt: new Date(),
        },
      },
      { new: true, upsert: true },
    );

    this.cache.set(guildId, updated);
    logger.info('Onboarding defaults updated', { guildId, defaults });
  }

  getChannelMultiplier(guildId: string, channelId: string): number {
    const config = this.cache.get(guildId);
    if (!config) {
      return 1;
    }

    return config.channelMultipliers?.[channelId] ?? 1;
  }

  async listChannelMultipliers(guildId: string): Promise<Record<string, number>> {
    const config = this.cache.get(guildId) ?? await this.refresh(guildId);
    return { ...(config.channelMultipliers ?? {}) };
  }

  async setChannelMultiplier(guildId: string, channelId: string, weight: number): Promise<void> {
    const sanitizedWeight = Math.max(0, Math.min(5, Number.isFinite(weight) ? weight : 1));

    const updated = await GuildFeatureConfig.findOneAndUpdate(
      { guildId },
      {
        $set: {
          [`channelMultipliers.${channelId}`]: sanitizedWeight,
          updatedAt: new Date(),
        },
      },
      { upsert: true, new: true },
    );

    this.cache.set(guildId, updated);
    logger.info('Channel multiplier set', { guildId, channelId, weight: sanitizedWeight });
  }

  async clearChannelMultiplier(guildId: string, channelId: string): Promise<void> {
    const updated = await GuildFeatureConfig.findOneAndUpdate(
      { guildId },
      {
        $unset: { [`channelMultipliers.${channelId}`]: '' },
        $set: { updatedAt: new Date() },
      },
      { new: true },
    );

    if (updated) {
      this.cache.set(guildId, updated);
      logger.info('Channel multiplier cleared', { guildId, channelId });
    }
  }

  async updateChannelMultipliers(
    guildId: string,
    multipliers: Record<string, number>,
  ): Promise<void> {
    const existing = await this.listChannelMultipliers(guildId);
    const sanitized = Object.entries(multipliers).reduce<Record<string, number>>((acc, [channelId, weight]) => {
      if (!channelId) {
        return acc;
      }
      const bounded = Math.max(0, Math.min(5, Number.isFinite(weight) ? Number(weight) : 1));
      acc[channelId] = bounded;
      return acc;
    }, {});

    const merged = { ...existing, ...sanitized };

    const updated = await GuildFeatureConfig.findOneAndUpdate(
      { guildId },
      {
        $set: {
          channelMultipliers: merged,
          updatedAt: new Date(),
        },
      },
      { upsert: true, new: true },
    );

    this.cache.set(guildId, updated);
    logger.info('Channel multipliers updated', { guildId, count: Object.keys(sanitized).length });
  }
}

export const guildFeatureConfigService = new GuildFeatureConfigService();
