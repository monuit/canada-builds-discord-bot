// MARK: - Search Service
// Provides discovery helpers over thread tags and indexed messages

import { ThreadTag } from '../models/ThreadTag';
import { Message } from '../models/Message';
import { logger } from '../utils/logger';
import { topicService } from './TopicService';

export interface TopicSearchResult {
  type: 'thread' | 'message';
  channelId: string;
  threadId?: string;
  messageId?: string;
  tags: string[];
  score: number;
  snippet?: string;
  author?: string;
  timestamp?: Date;
}

const MAX_RESULTS = 5;

class SearchService {
  async search(guildId: string, query: string, limit = MAX_RESULTS): Promise<TopicSearchResult[]> {
    const normalizedQuery = query.trim().toLowerCase();
    const topic = topicService.list().find(t => t.slug === normalizedQuery || t.keywords.includes(normalizedQuery));
    const searchTerms = this.buildSearchTerms(normalizedQuery, topic?.keywords ?? [], topic?.bigrams ?? []);
    const regex = new RegExp(searchTerms.join('|'), 'i');

    const tagMatches = await ThreadTag.find({ guildId, tags: regex })
      .sort({ updatedAt: -1 })
      .limit(limit);

    const results: TopicSearchResult[] = tagMatches.map(match => ({
      type: 'thread',
      threadId: match.threadId,
      channelId: match.parentChannelId,
      tags: match.tags,
      score: 1.2,
      timestamp: match.updatedAt,
    }));

    const remaining = Math.max(limit - results.length, 0);

    if (remaining > 0) {
      const messageHits = await Message.find({
        guildId,
        normalizedContent: regex,
      })
        .sort({ timestamp: -1 })
        .limit(remaining * 4);

      for (const hit of messageHits) {
        const recencyBoost = this.computeRecencyBoost(hit.timestamp);
        const keywordBoost = hit.matchedKeywords.some(word => searchTerms.includes(word)) ? 0.4 : 0;

        results.push({
          type: 'message',
          channelId: hit.channelId,
          messageId: hit.messageId,
          tags: hit.matchedKeywords.slice(0, 5),
          snippet: this.highlightSnippet(hit.content, normalizedQuery),
          author: hit.authorUsername,
          timestamp: hit.timestamp,
          score: 0.8 + recencyBoost + keywordBoost,
        });
      }
    }

    const deduped = this.dedupe(results)
      .sort((a, b) => (b.timestamp?.getTime() ?? 0) - (a.timestamp?.getTime() ?? 0) || b.score - a.score)
      .slice(0, limit);

    logger.debug('Search results generated', {
      guildId,
      query,
      resultCount: deduped.length,
    });

    return deduped;
  }

  private buildSearchTerms(query: string, keywords: string[], bigrams: string[]): string[] {
    const terms = new Set<string>([this.escapeRegex(query)]);
    keywords.forEach(keyword => terms.add(this.escapeRegex(keyword)));
    bigrams.forEach(bigram => terms.add(this.escapeRegex(bigram.replace(/\s+/g, ' '))));
    return Array.from(terms).filter(Boolean);
  }

  private escapeRegex(term: string): string {
    return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private computeRecencyBoost(timestamp: Date): number {
    const hoursAgo = (Date.now() - timestamp.getTime()) / (1000 * 60 * 60);
    if (hoursAgo <= 6) return 0.4;
    if (hoursAgo <= 24) return 0.2;
    if (hoursAgo <= 72) return 0.1;
    return 0;
  }

  private highlightSnippet(content: string, query: string): string {
    const trimmed = content.slice(0, 160);
    const regex = new RegExp(`(${this.escapeRegex(query)})`, 'ig');
    return trimmed.replace(regex, '**$1**');
  }

  private dedupe(results: TopicSearchResult[]): TopicSearchResult[] {
    const seen = new Map<string, TopicSearchResult>();
    for (const result of results) {
      const key = result.type === 'thread'
        ? `thread:${result.threadId}`
        : `message:${result.messageId}`;

      if (!key) {
        continue;
      }

      const existing = seen.get(key);
      if (!existing || (result.score > existing.score)) {
        seen.set(key, result);
      }
    }
    return Array.from(seen.values());
  }
}

export const searchService = new SearchService();
