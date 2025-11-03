// MARK: - Thread Feature Extractor
// Aggregates indexed messages into thread-level features for digest scoring

import { Message } from '../../models/Message';
import { MessageForSummary } from '../OpenAIService';
import { topicService } from '../TopicService';

export interface TopicHitMetric {
  slug: string;
  keywordHits: number;
  bigramHits: number;
  boost: number;
}

export interface ThreadFeature {
  key: string;
  guildId: string;
  channelId: string;
  threadId?: string;
  parentChannelId?: string;
  uniqueParticipants: number;
  messageCount: number;
  reactionWeighted: number;
  topicHits: TopicHitMetric[];
  linkCount: number;
  decisionVerbHits: number;
  hasLinks: boolean;
  firstMessageAt: Date;
  lastMessageAt: Date;
  matchedKeywords: string[];
  messages: MessageForSummary[];
}

const DECISION_VERB_REGEX = /(decide|decided|approve|approved|ship|shipping|shipped|blocked|blocker|eta|owner)/gi;

const REACTION_WEIGHTS: Record<string, number> = {
  '👍': 2,
  '✅': 2,
  '🔥': 2,
  '💡': 1.5,
  '❤️': 1.5,
  '🎉': 1.5,
  '😂': 0.75,
};

export class ThreadFeatureExtractor {
  async fetchFeatures(
    guildId: string,
    keywords: string[],
    cutoffDate: Date,
    limit = 500,
  ): Promise<ThreadFeature[]> {
    const messages = await Message.find({
      guildId,
      timestamp: { $gte: cutoffDate },
      matchedKeywords: { $in: keywords },
    })
      .sort({ timestamp: 1 })
      .limit(limit)
      .lean();

    if (messages.length === 0) {
      return [];
    }

    const topics = topicService.list();
    const grouped = new Map<string, InternalAccumulator>();

    for (const doc of messages) {
      const key = doc.threadId ?? doc.channelId;
      const acc = grouped.get(key) ?? this.createAccumulator(doc, guildId);

      acc.messageCount += 1;
      acc.linkCount += doc.linkCount ?? 0;
      acc.participants.add(doc.authorId);
      acc.lastMessageAt = doc.timestamp > acc.lastMessageAt ? doc.timestamp : acc.lastMessageAt;
      for (const keyword of doc.matchedKeywords ?? []) {
        acc.keywordSet.add(keyword);
      }
      acc.messages.push(this.toSummaryMessage(doc));
      acc.reactionWeighted += this.calculateReactionWeight(doc.reactionSummary ?? []);
      acc.decisionVerbHits += this.countDecisionVerbs(doc.content ?? '');

      for (const topic of topics) {
        const keywordHits = (doc.matchedKeywords ?? []).filter(keyword => topic.keywords.includes(keyword)).length;
        let bigramHits = 0;
        if ((topic.bigrams ?? []).length > 0 && doc.normalizedContent) {
          for (const bigram of topic.bigrams ?? []) {
            if (doc.normalizedContent.includes(bigram.toLowerCase())) {
              bigramHits += 1;
            }
          }
        }

        if (keywordHits > 0 || bigramHits > 0) {
          const metric = acc.topicStats.get(topic.slug) ?? {
            slug: topic.slug,
            keywordHits: 0,
            bigramHits: 0,
            boost: topic.boost ?? 1,
          };
          metric.keywordHits += keywordHits;
          metric.bigramHits += bigramHits;
          acc.topicStats.set(topic.slug, metric);
        }
      }

      grouped.set(key, acc);
    }

    return Array.from(grouped.values()).map(acc => ({
      key: acc.key,
      guildId,
      channelId: acc.channelId,
      threadId: acc.threadId,
      parentChannelId: acc.parentChannelId,
      uniqueParticipants: acc.participants.size,
      messageCount: acc.messageCount,
      reactionWeighted: acc.reactionWeighted,
      topicHits: Array.from(acc.topicStats.values()),
      linkCount: acc.linkCount,
      decisionVerbHits: acc.decisionVerbHits,
      hasLinks: acc.linkCount >= 2,
      firstMessageAt: acc.firstMessageAt,
      lastMessageAt: acc.lastMessageAt,
      matchedKeywords: Array.from(acc.keywordSet),
      messages: acc.messages,
    }));
  }

  private createAccumulator(doc: any, guildId: string): InternalAccumulator {
    return {
      key: doc.threadId ?? doc.channelId,
      guildId,
      channelId: doc.channelId,
      threadId: doc.threadId ?? undefined,
      parentChannelId: doc.parentChannelId ?? undefined,
      messageCount: 0,
      linkCount: 0,
      reactionWeighted: 0,
      participants: new Set<string>(),
      topicStats: new Map(),
      keywordSet: new Set(),
      messages: [],
      decisionVerbHits: 0,
      firstMessageAt: doc.timestamp,
      lastMessageAt: doc.timestamp,
    };
  }

  private calculateReactionWeight(summary: Array<{ emoji: string; count: number }>): number {
    if (!summary || summary.length === 0) {
      return 0;
    }

    return summary.reduce((total, reaction) => {
      const weight = REACTION_WEIGHTS[reaction.emoji] ?? 1;
      return total + weight * (reaction.count ?? 0);
    }, 0);
  }

  private countDecisionVerbs(content: string): number {
    if (!content) {
      return 0;
    }

    const matches = content.match(DECISION_VERB_REGEX);
    return matches?.length ?? 0;
  }

  private toSummaryMessage(doc: any): MessageForSummary {
    const channelId = doc.threadId ?? doc.channelId;
    return {
      id: doc.messageId,
      authorUsername: doc.authorUsername,
      content: doc.content,
      timestamp: doc.timestamp,
      url: `https://discord.com/channels/${doc.guildId}/${channelId}/${doc.messageId}`,
    };
  }
}

interface InternalAccumulator {
  key: string;
  guildId: string;
  channelId: string;
  threadId?: string;
  parentChannelId?: string;
  messageCount: number;
  linkCount: number;
  reactionWeighted: number;
  participants: Set<string>;
  topicStats: Map<string, TopicHitMetric>;
  keywordSet: Set<string>;
  messages: MessageForSummary[];
  decisionVerbHits: number;
  firstMessageAt: Date;
  lastMessageAt: Date;
}

export const threadFeatureExtractor = new ThreadFeatureExtractor();
