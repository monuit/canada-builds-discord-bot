// MARK: - Digest Instrumentation Service
// Centralizes structured logging for digest generation pipeline

import { logger } from '../../utils/logger';
import { ThreadScore } from './ThreadScoringService';
import { ThreadCluster } from './ThemeClusterService';

export class DigestInstrumentation {
  logThreadScores(guildId: string, scores: ThreadScore[]): void {
    const topFive = scores.slice(0, 5).map(score => ({
      key: score.feature.key,
      score: Number(score.score.toFixed(2)),
      participants: score.feature.uniqueParticipants,
      messages: score.feature.messageCount,
      reactions: Number(score.breakdown.reactions.toFixed(2)),
      decisionVerbHits: score.feature.decisionVerbHits,
      topTopics: score.feature.topicHits.map(hit => hit.slug).slice(0, 3),
    }));

    logger.info('Digest scoring snapshot', {
      guildId,
      rankedThreads: topFive,
    });
  }

  logClusters(guildId: string, clusters: ThreadCluster[]): void {
    const summary = clusters.map(cluster => ({
      id: cluster.id,
      label: cluster.label,
      members: cluster.members.length,
      topTokens: cluster.topTokens,
    }));

    logger.info('Digest theme clusters', { guildId, clusters: summary });
  }
}

export const digestInstrumentation = new DigestInstrumentation();
