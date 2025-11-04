import { describe, expect, it } from 'vitest';
import { ActivityType } from 'discord.js';
import { buildPresenceActivities, presenceFallbackActivity } from '../../src/services/PresenceActivityBuilder';

describe('PresenceActivityBuilder', () => {
  it('prioritizes trending topics when available', () => {
    const activities = buildPresenceActivities({
      trendingTopic: { label: 'Housing', mentions: 12 },
      guildCount: 3,
    });

    expect(activities[0]).toEqual({
      name: '/topics trending · housing (12)',
      type: ActivityType.Listening,
    });
  });

  it('falls back to keyword trends when no mapped topic exists', () => {
    const activities = buildPresenceActivities({
      trendingKeyword: { keyword: 'biotech', mentions: 4 },
      guildCount: 2,
    });

    expect(activities[0]).toEqual({
      name: '/where biotech · 4 mentions',
      type: ActivityType.Watching,
    });
  });

  it('always returns at least the fallback activity', () => {
    const activities = buildPresenceActivities({
      guildCount: 1,
    });

    expect(activities).toContainEqual(presenceFallbackActivity);
    expect(activities.some(activity => activity.type === ActivityType.Playing)).toBe(true);
  });
});
