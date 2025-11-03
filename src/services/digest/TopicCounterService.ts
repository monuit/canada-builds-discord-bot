// MARK: - Topic Counter Service
// Aggregates topic frequencies for digest headers

import { ThreadScore } from './ThreadScoringService';

export interface TopicCounterResult {
  slug: string;
  count: number;
}

export class TopicCounterService {
  count(scores: ThreadScore[]): TopicCounterResult[] {
    const totals = new Map<string, number>();

    for (const score of scores) {
      for (const hit of score.feature.topicHits) {
        const weight = hit.keywordHits + hit.bigramHits * 2;
        totals.set(hit.slug, (totals.get(hit.slug) ?? 0) + weight);
      }
    }

    return Array.from(totals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([slug, count]) => ({ slug, count }));
  }
}

export const topicCounterService = new TopicCounterService();
