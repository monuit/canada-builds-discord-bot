// MARK: - Thread Scoring Service
// Combines thread features into a weighted heuristic score

import { guildFeatureConfigService } from '../GuildFeatureConfigService';
import { ThreadFeature } from './ThreadFeatureExtractor';

export interface ThreadScore {
  feature: ThreadFeature;
  score: number;
  breakdown: {
    participants: number;
    messageCount: number;
    reactions: number;
    topicHits: number;
    links: number;
    decisions: number;
    timeDecay: number;
  };
}

export class ThreadScoringService {
  scoreThreads(guildId: string, features: ThreadFeature[]): ThreadScore[] {
    const now = Date.now();

    return features.map(feature => {
      const participants = 1.2 * feature.uniqueParticipants;
      const messageCount = Math.log(1 + feature.messageCount);
      const reactions = 0.8 * feature.reactionWeighted;
      const topicHits = 1.3 * this.computeTopicHitScore(feature);
      const links = 1.1 * (feature.hasLinks ? 2 : 0);
      const decisions = 1.4 * feature.decisionVerbHits * 3;
      const hoursSinceLast = (now - feature.lastMessageAt.getTime()) / (1000 * 60 * 60);
      const timeDecay = Math.max(0, hoursSinceLast / 72);

      const rawScore =
        participants +
        messageCount +
        reactions +
        topicHits +
        links +
        decisions -
        timeDecay;

      const multiplier = guildFeatureConfigService.getChannelMultiplier(guildId, feature.channelId);
      const score = rawScore * multiplier;

      return {
        feature,
        score,
        breakdown: {
          participants,
          messageCount,
          reactions,
          topicHits,
          links,
          decisions,
          timeDecay,
        },
      };
    }).sort((a, b) => b.score - a.score);
  }

  private computeTopicHitScore(feature: ThreadFeature): number {
    return feature.topicHits.reduce((total, hit) => {
      const keywordWeight = hit.keywordHits * 2;
      const bigramWeight = hit.bigramHits * 4;
      return total + (keywordWeight + bigramWeight) * (hit.boost ?? 1);
    }, 0);
  }
}

export const threadScoringService = new ThreadScoringService();
