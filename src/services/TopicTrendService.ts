// MARK: - Topic Trend Service
// Aggregates indexed messages to surface trending topics and keywords

import { PipelineStage } from 'mongoose';
import { Message } from '../models/Message';
import { GuildChannelIndex } from '../models/GuildChannelIndex';
import { topicService } from './TopicService';
import { logger } from '../utils/logger';

export type TopicTrendChannel = {
  channelId: string;
  name?: string;
  count: number;
};

export type TopicTrend = {
  slug: string;
  label: string;
  totalMentions: number;
  lastMentionAt?: Date;
  keywords: string[];
  topChannels: TopicTrendChannel[];
};

export type KeywordTrend = {
  keyword: string;
  count: number;
  lastMentionAt?: Date;
  topChannels: TopicTrendChannel[];
};

export interface TopicTrendOptions {
  limit?: number;
  windowHours?: number;
  minMentions?: number;
}

export interface TopicTrendResult {
  topics: TopicTrend[];
  keywords: KeywordTrend[];
  windowHours: number;
}

type AggregatedKeywordRow = {
  _id: {
    keyword: string;
    channelId: string;
  };
  count: number;
  latestTimestamp?: Date;
};

type TopicAccumulator = {
  slug: string;
  label: string;
  keywords: Set<string>;
  totalMentions: number;
  lastMentionAt?: Date;
  channelHits: Map<string, { count: number; lastMentionAt?: Date }>;
};

class TopicTrendService {
  async getTrendingTopics(
    guildId: string,
    options: TopicTrendOptions = {},
  ): Promise<TopicTrendResult> {
    const { limit = 5, windowHours = 48, minMentions = 2 } = options;
    const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);

    const pipeline: PipelineStage[] = [
      {
        $match: {
          guildId,
          timestamp: { $gte: since },
        },
      },
      {
        $project: {
          matchedKeywords: 1,
          channelId: 1,
          timestamp: 1,
        },
      },
      { $unwind: '$matchedKeywords' },
      {
        $group: {
          _id: {
            keyword: '$matchedKeywords',
            channelId: '$channelId',
          },
          count: { $sum: 1 },
          latestTimestamp: { $max: '$timestamp' },
        },
      },
    ];

    let rows: AggregatedKeywordRow[] = [];

    try {
      rows = await Message.aggregate<AggregatedKeywordRow>(pipeline).exec();
    } catch (error: any) {
      logger.error('Failed to aggregate trending topics', {
        guildId,
        error: error.message,
      });
      return { topics: [], keywords: [], windowHours };
    }

    if (rows.length === 0) {
      return { topics: [], keywords: [], windowHours };
    }

    const topics = topicService.list();
    const keywordToTopic = new Map<string, { slug: string; label: string }>();

    for (const topic of topics) {
      for (const keyword of topic.keywords ?? []) {
        keywordToTopic.set(keyword.toLowerCase(), { slug: topic.slug, label: topic.slug.toUpperCase() });
      }
      for (const phrase of topic.bigrams ?? []) {
        keywordToTopic.set(phrase.toLowerCase(), { slug: topic.slug, label: topic.slug.toUpperCase() });
      }
    }

    const topicAccumulators = new Map<string, TopicAccumulator>();
    const unmappedKeywords = new Map<string, { count: number; lastMentionAt?: Date; channels: Map<string, { count: number; lastMentionAt?: Date }> }>();

    for (const row of rows) {
      const keyword = row._id.keyword?.toLowerCase();
      if (!keyword) {
        continue;
      }

      const channelId = row._id.channelId;
      const lastMention = row.latestTimestamp ?? undefined;
      const topicMapping = keywordToTopic.get(keyword);

      if (topicMapping) {
        const acc = this.getOrCreateTopicAccumulator(topicAccumulators, topicMapping.slug, topicMapping.label);
        acc.totalMentions += row.count;
        acc.keywords.add(keyword);
        acc.lastMentionAt = this.getMostRecent(acc.lastMentionAt, lastMention);

        const channelEntry = acc.channelHits.get(channelId) ?? { count: 0 };
        channelEntry.count += row.count;
        channelEntry.lastMentionAt = this.getMostRecent(channelEntry.lastMentionAt, lastMention);
        acc.channelHits.set(channelId, channelEntry);
        continue;
      }

      const existing = unmappedKeywords.get(keyword) ?? {
        count: 0,
        lastMentionAt: undefined as Date | undefined,
        channels: new Map<string, { count: number; lastMentionAt?: Date }>(),
      };
      existing.count += row.count;
      existing.lastMentionAt = this.getMostRecent(existing.lastMentionAt, lastMention);
      const channelEntry = existing.channels.get(channelId) ?? { count: 0 };
      channelEntry.count += row.count;
      channelEntry.lastMentionAt = this.getMostRecent(channelEntry.lastMentionAt, lastMention);
      existing.channels.set(channelId, channelEntry);
      unmappedKeywords.set(keyword, existing);
    }

    const topicTrends = Array.from(topicAccumulators.values())
      .filter(topic => topic.totalMentions >= minMentions)
      .map(topic => ({
        slug: topic.slug,
        label: topic.label,
        totalMentions: topic.totalMentions,
        lastMentionAt: topic.lastMentionAt,
        keywords: Array.from(topic.keywords).sort(),
        topChannels: this.formatChannelHits(topic.channelHits),
      }))
      .sort((a, b) => {
        if (b.totalMentions !== a.totalMentions) {
          return b.totalMentions - a.totalMentions;
        }
        const bTime = b.lastMentionAt?.getTime() ?? 0;
        const aTime = a.lastMentionAt?.getTime() ?? 0;
        return bTime - aTime;
      })
      .slice(0, limit);

    const keywordTrends = Array.from(unmappedKeywords.entries())
      .filter(([, value]) => value.count >= minMentions)
      .map(([keyword, value]) => ({
        keyword,
        count: value.count,
        lastMentionAt: value.lastMentionAt,
        topChannels: this.formatChannelHits(value.channels),
      }))
      .sort((a, b) => {
        if (b.count !== a.count) {
          return b.count - a.count;
        }
        const bTime = b.lastMentionAt?.getTime() ?? 0;
        const aTime = a.lastMentionAt?.getTime() ?? 0;
        return bTime - aTime;
      })
      .slice(0, Math.max(3, limit));

    const allChannelIds = new Set<string>();
    for (const trend of topicTrends) {
      trend.topChannels.forEach(channel => allChannelIds.add(channel.channelId));
    }
    for (const keyword of keywordTrends) {
      keyword.topChannels.forEach(channel => allChannelIds.add(channel.channelId));
    }

    if (allChannelIds.size > 0) {
      const channelDocs = await GuildChannelIndex.find({
        guildId,
        channelId: { $in: Array.from(allChannelIds) },
      }).select('channelId name').lean();

      const nameLookup = new Map(channelDocs.map(doc => [doc.channelId, doc.name]));
      for (const trend of topicTrends) {
        trend.topChannels = trend.topChannels.map(channel => ({
          ...channel,
          name: nameLookup.get(channel.channelId) ?? channel.name,
        }));
      }
      for (const keyword of keywordTrends) {
        keyword.topChannels = keyword.topChannels.map(channel => ({
          ...channel,
          name: nameLookup.get(channel.channelId) ?? channel.name,
        }));
      }
    }

    return {
      topics: topicTrends,
      keywords: keywordTrends,
      windowHours,
    };
  }

  private getOrCreateTopicAccumulator(
    store: Map<string, TopicAccumulator>,
    slug: string,
    label: string,
  ): TopicAccumulator {
    const existing = store.get(slug);
    if (existing) {
      return existing;
    }

    const acc: TopicAccumulator = {
      slug,
      label,
      keywords: new Set<string>(),
      totalMentions: 0,
      channelHits: new Map(),
    };
    store.set(slug, acc);
    return acc;
  }

  private formatChannelHits(
    hits: Map<string, { count: number; lastMentionAt?: Date }>,
  ): TopicTrendChannel[] {
    return Array.from(hits.entries())
      .sort((a, b) => {
        if (b[1].count !== a[1].count) {
          return b[1].count - a[1].count;
        }
        const bTime = b[1].lastMentionAt?.getTime() ?? 0;
        const aTime = a[1].lastMentionAt?.getTime() ?? 0;
        return bTime - aTime;
      })
      .slice(0, 3)
      .map(([channelId, value]) => ({
        channelId,
        count: value.count,
      }));
  }

  private getMostRecent(current?: Date, candidate?: Date): Date | undefined {
    if (!candidate) {
      return current;
    }
    if (!current) {
      return candidate;
    }
    return candidate.getTime() > current.getTime() ? candidate : current;
  }
}

export const topicTrendService = new TopicTrendService();
