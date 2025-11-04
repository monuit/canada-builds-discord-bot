// MARK: - Onboarding Manager Service
// Orchestrates DM onboarding, consent tracking, and auto-subscriptions

import { randomUUID } from 'crypto';
import {
  ButtonInteraction,
  Client,
  GuildMember,
  MessageFlags,
  StringSelectMenuInteraction,
} from 'discord.js';
import { ConsentLedger, IConsentLedger } from '../models/ConsentLedger';
import { OnboardingSession, IOnboardingSession } from '../models/OnboardingSession';
import { UserSubscription } from '../models/UserSubscription';
import { ConsentState, consentService } from './ConsentService';
import { guildFeatureConfigService } from './GuildFeatureConfigService';
import { messageIndexer } from './MessageIndexer';
import { logger } from '../utils/logger';
import { errorNotifier } from './ErrorNotifier';
import { OnboardingPromptBuilder, ConsentPrompt, TrendingTopicPreview } from './onboarding/OnboardingPromptBuilder';
import { OnboardingStatusFormatter } from './onboarding/OnboardingStatusFormatter';
import { topicService } from './TopicService';
import { buildScheduleConfirmation, resolveScheduleOption } from './onboarding/OnboardingSchedule';
import { onboardingSubscriptionService } from './onboarding/OnboardingSubscriptionService';
import { topicTrendService } from './TopicTrendService';

const SESSION_TTL_HOURS = 24;
const DEFAULT_TIMEZONE = 'UTC';

type LedgerSnapshot = {
  status: ConsentState;
  consentedAt?: Date;
  revokedAt?: Date;
};

type EphemeralFlag = typeof MessageFlags.Ephemeral;

class OnboardingManager {
  private client: Client | null = null;

  initialize(client: Client): void {
    this.client = client;
  }

  private ensureClient(): Client {
    if (!this.client) {
      throw new Error('OnboardingManager not initialized');
    }

    return this.client;
  }

  async resumePendingSessions(guildId: string): Promise<void> {
    const sessions = await OnboardingSession.find({
      guildId,
      status: 'pending',
      expiresAt: { $gt: new Date() },
    });

    if (sessions.length === 0) {
      return;
    }

    logger.info('Pending onboarding sessions detected', { guildId, count: sessions.length });
  }

  async handleMemberJoin(member: GuildMember): Promise<void> {
    const guildId = member.guild.id;
    const userId = member.id;

    try {
      await guildFeatureConfigService.initialize(guildId);
      await this.startOnboardingFlow(guildId, userId, 'guildMemberAdd');
    } catch (error: any) {
      logger.error('Failed to start onboarding for new member', {
        guildId,
        userId,
        error: error.message,
      });

      await errorNotifier.notify(guildId, error, {
        context: 'onboardingMemberJoin',
        userId,
      });
    }
  }

  async handleOnboardingCommand(
    guildId: string,
    userId: string,
    action: 'start' | 'status' | 'revoke',
  ): Promise<{ content: string; flags?: EphemeralFlag }> {
    await guildFeatureConfigService.initialize(guildId);

    const defaults = guildFeatureConfigService.getOnboardingDefaults(guildId);
    const ledger = await consentService.getOrCreate(guildId, userId, {
      consentVersion: defaults.consentVersion,
      defaultSubscriptions: defaults.autoSubscribeKeywords,
    });

    if (action === 'status') {
      return OnboardingStatusFormatter.format(ledger);
    }

    if (action === 'revoke') {
      if (ledger.status === 'revoked') {
        return {
          content: '⚠️ Your consent is already revoked. Use `/onboarding start` if you wish to rejoin.',
          flags: MessageFlags.Ephemeral,
        };
      }

      await this.revokeConsent(ledger);
      return {
        content: '✅ Consent revoked. DM notifications and auto-subscriptions are disabled.',
        flags: MessageFlags.Ephemeral,
      };
    }

    if (ledger.status === 'consented') {
      return {
        content: '✅ You are already onboarded. Use `/onboarding status` for details or `/onboarding revoke` to opt out.',
        flags: MessageFlags.Ephemeral,
      };
    }

    await this.startOnboardingFlow(guildId, userId, 'command');
    return {
      content: '✉️ Check your DMs for the onboarding flow. If DMs are closed, open them and run `/onboarding start` again.',
      flags: MessageFlags.Ephemeral,
    };
  }

  async handleComponentInteraction(interaction: ButtonInteraction | StringSelectMenuInteraction): Promise<boolean> {
    if (!interaction.customId.startsWith('onboarding:')) {
      return false;
    }

    const [, type, sessionId, action] = interaction.customId.split(':');
    const session = await OnboardingSession.findOne({ sessionId });

    if (!session || session.status !== 'pending') {
      await interaction.reply({
        content: '⚠️ This onboarding session is no longer active. Please run `/onboarding start` again.',
        flags: interaction.inGuild() ? MessageFlags.Ephemeral : undefined,
      });
      return true;
    }

    if (type === 'consent' && interaction.isButton()) {
      await this.handleConsentDecision(interaction, session, action === 'accept');
      return true;
    }

    if (type === 'topics' && interaction.isStringSelectMenu()) {
      await this.handleTopicSelection(interaction, session);
      return true;
    }

    if (type === 'schedule' && interaction.isStringSelectMenu()) {
      await this.handleScheduleSelection(interaction, session);
      return true;
    }

    return false;
  }

  private async startOnboardingFlow(
    guildId: string,
    userId: string,
    source: 'guildMemberAdd' | 'command',
  ): Promise<void> {
    const client = this.ensureClient();
    const defaults = guildFeatureConfigService.getOnboardingDefaults(guildId);
    const ledger = await consentService.getOrCreate(guildId, userId, {
      consentVersion: defaults.consentVersion,
      defaultSubscriptions: defaults.autoSubscribeKeywords,
    });

    if (ledger.status === 'consented' && source === 'guildMemberAdd') {
      logger.info('Skipping onboarding for already consented member', { guildId, userId });
      return;
    }

    const snapshot: LedgerSnapshot = {
      status: ledger.status as ConsentState,
      consentedAt: ledger.consentedAt ?? undefined,
      revokedAt: ledger.revokedAt ?? undefined,
    };

    const session = await this.createPendingSession(guildId, userId);
    await consentService.updateStatus(ledger, 'pending', { sessionId: session.sessionId });

    const prompt = OnboardingPromptBuilder.buildConsentPrompt(defaults, session.sessionId);
    const sent = await this.trySendConsentPrompt(client, userId, prompt, guildId, session.sessionId, source);

    if (!sent) {
      await this.handleConsentPromptFailure(session.sessionId, ledger, snapshot);
    }
  }

  private async createPendingSession(guildId: string, userId: string): Promise<IOnboardingSession> {
    const sessionId = randomUUID();
    const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 60 * 60 * 1000);

    return OnboardingSession.create({
      guildId,
      userId,
      sessionId,
      status: 'pending',
      currentStep: 'consent',
      lastPromptAt: new Date(),
      expiresAt,
    });
  }

  private async trySendConsentPrompt(
    client: Client,
    userId: string,
    prompt: ConsentPrompt,
    guildId: string,
    sessionId: string,
    source: 'guildMemberAdd' | 'command',
  ): Promise<boolean> {
    try {
      const user = await client.users.fetch(userId);
      await user.send({ embeds: [prompt.embed], components: prompt.components });
      logger.info('Onboarding consent prompt sent', { guildId, userId, sessionId, source });
      return true;
    } catch (error: any) {
      logger.warn('Failed to send onboarding DM', {
        guildId,
        userId,
        error: error.message,
      });

      await errorNotifier.notifyWarning(
        guildId,
        'DM consent failed',
        `Unable to DM <@${userId}> for onboarding (code: ${error.code ?? 'unknown'}).`,
      );

      return false;
    }
  }

  private async handleConsentPromptFailure(
    sessionId: string,
    ledger: IConsentLedger,
    snapshot: LedgerSnapshot,
  ): Promise<void> {
    await OnboardingSession.updateOne({ sessionId }, { status: 'expired', updatedAt: new Date() });

    ledger.status = snapshot.status;
    ledger.onboardingSessionId = undefined;
    ledger.lastInteractionAt = new Date();
    ledger.consentedAt = snapshot.consentedAt;
    ledger.revokedAt = snapshot.revokedAt;

    await ledger.save();
  }

  private async handleConsentDecision(
    interaction: ButtonInteraction,
    session: IOnboardingSession,
    accepted: boolean,
  ): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const ledger = await ConsentLedger.findOne({ guildId: session.guildId, userId: session.userId });

    if (!ledger) {
      await interaction.editReply('⚠️ Unable to locate consent record. Please try `/onboarding start` again.');
      return;
    }

    if (!accepted) {
      await this.handleConsentDecline(interaction, session, ledger);
      return;
    }

    await this.handleConsentAcceptance(interaction, session, ledger);
  }

  private async handleConsentDecline(
    interaction: ButtonInteraction,
    session: IOnboardingSession,
    ledger: IConsentLedger,
  ): Promise<void> {
    await consentService.updateStatus(ledger, 'revoked', { sessionId: session.sessionId });
    await OnboardingSession.updateOne(
      { sessionId: session.sessionId },
      { status: 'expired', currentStep: 'declined', updatedAt: new Date() },
    );

    await interaction.editReply(
      '✅ Understood. We will not DM you or store onboarding preferences. Use `/onboarding start` anytime to rejoin.',
    );
  }

  private async handleConsentAcceptance(
    interaction: ButtonInteraction,
    session: IOnboardingSession,
    ledger: IConsentLedger,
  ): Promise<void> {
    await consentService.updateStatus(ledger, 'pending', { sessionId: session.sessionId });

    await OnboardingSession.updateOne(
      { sessionId: session.sessionId },
      {
        currentStep: 'topics',
        lastPromptAt: new Date(),
        updatedAt: new Date(),
        $push: {
          responses: {
            step: 'consent',
            value: 'accepted',
            recordedAt: new Date(),
          },
        },
      },
    );

    const defaults = guildFeatureConfigService.getOnboardingDefaults(session.guildId);
    const topicOptions = topicService.list().map(topic => ({
      label: topic.slug.toUpperCase(),
      value: topic.slug,
      keywords: topic.keywords ?? [],
      bigrams: topic.bigrams ?? [],
    }));

    let trendingPreview: TrendingTopicPreview[] = [];
    try {
      const trends = await topicTrendService.getTrendingTopics(session.guildId, { limit: 3, windowHours: 72, minMentions: 1 });
      trendingPreview = trends.topics.map(trend => ({
        label: trend.label,
        mentions: trend.totalMentions,
        topChannels: trend.topChannels.map(channel => ({ channelId: channel.channelId, name: channel.name })),
        lastMentionAt: trend.lastMentionAt,
      }));
    } catch (error: any) {
      logger.debug('Unable to fetch trending topics for onboarding prompt', {
        guildId: session.guildId,
        error: error.message,
      });
    }

    const prompt = OnboardingPromptBuilder.buildTopicPrompt(
      defaults,
      session.sessionId,
      topicOptions,
      trendingPreview,
    );

    await interaction.editReply({
      content: prompt.content,
      components: prompt.components,
    });
  }

  private async handleTopicSelection(
    interaction: StringSelectMenuInteraction,
    session: IOnboardingSession,
  ): Promise<void> {
    const selected = interaction.values.map(value => value.toLowerCase());

    const ledger = await ConsentLedger.findOne({ guildId: session.guildId, userId: session.userId });

    if (!ledger) {
      await interaction.reply({
        content: '⚠️ Session expired. Please run `/onboarding start` again.',
        flags: interaction.inGuild() ? MessageFlags.Ephemeral : undefined,
      });
      return;
    }

    await consentService.updateStatus(ledger, 'pending', { sessionId: session.sessionId });
    await consentService.updateDefaultSubscriptions(ledger, selected);

    const subscriptionResult = await onboardingSubscriptionService.applyTopicSelections(
      session.guildId,
      session.userId,
      selected,
      DEFAULT_TIMEZONE,
    );

    await OnboardingSession.updateOne(
      { sessionId: session.sessionId },
      {
        currentStep: 'schedule',
        lastPromptAt: new Date(),
        $push: {
          responses: {
            step: 'topics',
            value: selected.join(',') || 'none',
            recordedAt: new Date(),
          },
        },
      },
    );

    const schedulePrompt = OnboardingPromptBuilder.buildSchedulePrompt(session.sessionId);
    const autoKeywords = subscriptionResult.newlyAdded.length > 0
      ? subscriptionResult.newlyAdded
      : subscriptionResult.finalKeywords;

    const formattedAutoKeywords = autoKeywords.map(keyword => `\`${keyword}\``).join(', ');
    const formattedSkipped = subscriptionResult.skippedKeywords.map(keyword => `\`${keyword}\``).join(', ');

    const summary = selected.length > 0
      ? `Selected topics: **${selected.map(topic => topic.toUpperCase()).join(', ')}**.\nAuto-subscribed keywords: ${formattedAutoKeywords || 'none'}` +
        (subscriptionResult.skippedKeywords.length > 0
          ? `\n⚠️ Skipped (limit reached): ${formattedSkipped}`
          : '')
      : 'No topics selected yet.';

    await interaction.update({
      content: `${summary}\n\n${schedulePrompt.content}`,
      components: schedulePrompt.components,
    });
  }

  private async handleScheduleSelection(
    interaction: StringSelectMenuInteraction,
    session: IOnboardingSession,
  ): Promise<void> {
    const choice = interaction.values[0];

    const ledger = await ConsentLedger.findOne({ guildId: session.guildId, userId: session.userId });

    if (!ledger) {
      await interaction.reply({
        content: '⚠️ Session expired. Please run `/onboarding start` again.',
        flags: interaction.inGuild() ? MessageFlags.Ephemeral : undefined,
      });
      return;
    }

    const preferences = resolveScheduleOption(choice);

    const setUpdate: Record<string, unknown> = {
      dmEnabled: preferences.dmEnabled,
      cooldownHours: preferences.cooldownHours,
      updatedAt: new Date(),
      'preferences.digestPreference': choice,
      'preferences.timezone': DEFAULT_TIMEZONE,
    };

    const unsetUpdate: Record<string, unknown> = {};

    if (typeof preferences.digestHourUTC === 'number') {
      setUpdate['preferences.digestHourUTC'] = preferences.digestHourUTC;
    } else {
      unsetUpdate['preferences.digestHourUTC'] = '';
    }

    const updateDoc: Record<string, unknown> = {
      $set: setUpdate,
      $setOnInsert: {
        keywords: [],
      },
    };

    if (Object.keys(unsetUpdate).length > 0) {
      updateDoc.$unset = unsetUpdate;
    }

    await UserSubscription.findOneAndUpdate(
      { guildId: session.guildId, userId: session.userId },
      updateDoc,
      { upsert: true, new: true },
    );

    ledger.metadata = {
      ...ledger.metadata,
      schedule: {
        choice,
        digestHourUTC: preferences.digestHourUTC,
        updatedAt: new Date(),
      },
    };
    ledger.markModified?.('metadata');
    await ledger.save();

    await consentService.updateStatus(ledger, 'consented', { sessionId: session.sessionId });

    await OnboardingSession.updateOne(
      { sessionId: session.sessionId },
      {
        status: 'completed',
        currentStep: 'completed',
        lastPromptAt: new Date(),
        $push: {
          responses: {
            step: 'schedule',
            value: choice,
            recordedAt: new Date(),
          },
        },
      },
    );

    await interaction.update({
      content: buildScheduleConfirmation(choice, preferences.dmEnabled),
      components: [],
    });

    logger.info('Onboarding schedule saved', {
      guildId: session.guildId,
      userId: session.userId,
      choice,
    });
  }

  private async revokeConsent(ledger: IConsentLedger): Promise<void> {
    await consentService.updateStatus(ledger, 'revoked');

    await UserSubscription.findOneAndUpdate(
      { guildId: ledger.guildId, userId: ledger.userId },
      {
        dmEnabled: false,
        keywords: [],
        updatedAt: new Date(),
      },
    );

    await messageIndexer.refreshKeywords(ledger.guildId);
  }

}

export const onboardingManager = new OnboardingManager();
