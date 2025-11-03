// MARK: - Onboarding Prompt Builder
// Creates reusable message components for onboarding flows

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
} from 'discord.js';

export interface OnboardingDefaults {
  consentVersion: string;
  autoSubscribeKeywords: string[];
}

export interface TopicOption {
  label: string;
  value: string;
  keywords?: string[];
  bigrams?: string[];
}

export interface ConsentPrompt {
  embed: EmbedBuilder;
  components: ActionRowBuilder<ButtonBuilder>[];
}

export interface TopicPrompt {
  content: string;
  components: ActionRowBuilder<StringSelectMenuBuilder>[];
}

export interface SchedulePrompt {
  content: string;
  components: ActionRowBuilder<StringSelectMenuBuilder>[];
}

export class OnboardingPromptBuilder {
  private static readonly TOPIC_DESCRIPTIONS: Record<string, string> = {
    policy: '**POLICY** – Permits, legislation, and regulatory notices for builders.',
    energy: '**ENERGY** – Grid, generation, and fuel updates that affect construction timelines.',
    'builder-mp': '**BUILDER-MP** – Release, rollback, and milestone data synced from the Builder MP deployment feed.',
  };

  static buildConsentPrompt(defaults: OnboardingDefaults, sessionId: string): ConsentPrompt {
    const embed = new EmbedBuilder()
      .setTitle('Welcome to Build Canada!')
      .setDescription(
        'We send tailored digests and bookmarks based on your interests. Please review and consent to receive DMs and have your onboarding preferences stored.',
      )
      .addFields(
        { name: 'Why we ask', value: 'We store your topic selections to auto-subscribe you and keep a ledger so you can revoke anytime.' },
        { name: 'What we store', value: 'Discord user ID, guild ID, selected topics, timestamps, and consent status. Content summaries are cached up to 7 days.' },
        { name: 'Opt-out', value: 'Use `/onboarding revoke` or DM “stop” to disable notifications and purge stored preferences.' },
      )
      .setFooter({ text: `Consent version ${defaults.consentVersion}` });

    const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`onboarding:consent:${sessionId}:accept`)
        .setLabel('I Consent')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`onboarding:consent:${sessionId}:decline`)
        .setLabel('No Thanks')
        .setStyle(ButtonStyle.Secondary),
    );

    return {
      embed,
      components: [buttons],
    };
  }

  static buildTopicPrompt(
    defaults: OnboardingDefaults,
    sessionId: string,
    topics: TopicOption[] = [],
  ): TopicPrompt {
    const select = new StringSelectMenuBuilder()
      .setCustomId(`onboarding:topics:${sessionId}`)
      .setPlaceholder('Select the topics you want to auto-follow')
      .setMinValues(0)
      .setMaxValues(Math.min(5, Math.max(topics.length, defaults.autoSubscribeKeywords.length) || 1));

    const merged = topics.length > 0
      ? topics
      : defaults.autoSubscribeKeywords.map(keyword => ({ label: keyword.toUpperCase(), value: keyword }));

    merged.forEach(option => {
      select.addOptions({ label: option.label, value: option.value });
    });

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);

    const topicDetails = OnboardingPromptBuilder.buildTopicDetails(merged);

    return {
      content:
        '✅ Thanks for consenting! Choose the topics that matter to you (or skip to stay unsubscribed).' +
        (topicDetails ? `\n\n${topicDetails}` : ''),
      components: [row],
    };
  }

  static buildSchedulePrompt(sessionId: string): SchedulePrompt {
    const select = new StringSelectMenuBuilder()
      .setCustomId(`onboarding:schedule:${sessionId}`)
      .setPlaceholder('When should we send your digests? (Eastern Time)')
      .addOptions(
        { label: 'Daily – Morning (09:00 EST)', value: 'daily-morning' },
        { label: 'Daily – Evening (20:00 EST)', value: 'daily-evening' },
        { label: 'Twice Weekly (Mon/Thu at 18:00 EST)', value: 'twice-weekly' },
        { label: 'Weekly Recap (Monday 15:00 EST)', value: 'weekly' },
        { label: 'Manual only (no automatic DMs)', value: 'manual' },
      );

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);

    return {
      content: '⏰ When would you like to receive digest DMs? Pick an option in Eastern Time (EST/EDT).',
      components: [row],
    };
  }

  private static buildTopicDetails(options: TopicOption[]): string {
    const unique = new Map<string, TopicOption>();

    for (const option of options) {
      const key = option.value.toLowerCase();
      if (!unique.has(key)) {
        unique.set(key, option);
      }
    }

    if (unique.size === 0) {
      return '';
    }

    const lines: string[] = [];

    for (const [slug, option] of unique.entries()) {
      const intro = OnboardingPromptBuilder.TOPIC_DESCRIPTIONS[slug] ?? `**${option.label.toUpperCase()}**`;
      const keywordList = option.keywords && option.keywords.length > 0
        ? `Keywords: ${option.keywords.join(', ')}`
        : null;
      const bigramList = option.bigrams && option.bigrams.length > 0
        ? `Phrases: ${option.bigrams.join(', ')}`
        : null;

      const segments = [intro, keywordList, bigramList].filter(Boolean).join(' — ');
      lines.push(`• ${segments}`);
    }

    return `📘 What you're signing up for:\n${lines.join('\n')}`;
  }
}
