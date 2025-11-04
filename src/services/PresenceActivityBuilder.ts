// MARK: - Presence Activity Builder
// Produces activity sequences for the bot presence based on trends and metrics

import { ActivityType } from 'discord.js';

export interface PresenceBuilderContext {
  trendingTopic?: {
    label: string;
    mentions: number;
  };
  trendingKeyword?: {
    keyword: string;
    mentions: number;
  };
  guildCount: number;
}

export type PresenceActivity = {
  name: string;
  type: ActivityType;
};

const FALLBACK_ACTIVITY: PresenceActivity = {
  name: '/help · explore commands',
  type: ActivityType.Listening,
};

const COMMAND_HINTS: PresenceActivity[] = [
  {
    name: '/subscribe · personalize digests',
    type: ActivityType.Listening,
  },
  {
    name: '/digest-now · preview the latest',
    type: ActivityType.Playing,
  },
  {
    name: '/todo add · capture action items',
    type: ActivityType.Competing,
  },
];

function addUniqueActivity(target: PresenceActivity[], activity: PresenceActivity | undefined): void {
  if (!activity) {
    return;
  }
  const exists = target.some(existing => existing.name === activity.name);
  if (!exists) {
    target.push(activity);
  }
}

function buildTrendActivity(context: PresenceBuilderContext): PresenceActivity | undefined {
  if (context.trendingTopic) {
    const { label, mentions } = context.trendingTopic;
    return {
      name: `/topics trending · ${label.toLowerCase()} (${mentions})`,
      type: ActivityType.Listening,
    };
  }

  if (context.trendingKeyword) {
    const { keyword, mentions } = context.trendingKeyword;
    return {
      name: `/where ${keyword.toLowerCase()} · ${mentions} mentions`,
      type: ActivityType.Watching,
    };
  }

  return undefined;
}

function buildGuildActivity(guildCount: number): PresenceActivity {
  const label = guildCount === 1 ? 'community' : 'communities';
  return {
    name: `Serving ${guildCount} ${label} across Canada`,
    type: ActivityType.Playing,
  };
}

export function buildPresenceActivities(context: PresenceBuilderContext): PresenceActivity[] {
  const activities: PresenceActivity[] = [];

  addUniqueActivity(activities, buildTrendActivity(context));
  addUniqueActivity(activities, buildGuildActivity(context.guildCount));

  for (const hint of COMMAND_HINTS) {
    addUniqueActivity(activities, hint);
  }

  addUniqueActivity(activities, FALLBACK_ACTIVITY);

  return activities;
}

export const presenceFallbackActivity = FALLBACK_ACTIVITY;
