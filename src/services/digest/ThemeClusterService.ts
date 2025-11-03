// MARK: - Theme Cluster Service
// Groups threads by shared vocabulary to surface emerging themes

import { ThreadScore } from './ThreadScoringService';

export interface ThreadCluster {
  id: string;
  label: string;
  members: ThreadScore[];
  topTokens: string[];
}

export interface ThemeAnalysis {
  clusters: ThreadCluster[];
  globalTopTokens: Array<{ token: string; count: number }>;
}

export class ThemeClusterService {
  analyze(scores: ThreadScore[]): ThemeAnalysis {
    if (scores.length === 0) {
      return { clusters: [], globalTopTokens: [] };
    }

    const vectors = scores.map(score => this.buildVector(score));
    const globalCounts = new Map<string, number>();

    for (const vector of vectors) {
      for (const [token, weight] of vector.entries()) {
        globalCounts.set(token, (globalCounts.get(token) ?? 0) + weight);
      }
    }

    const clusters: ThreadCluster[] = [];
    const visited = new Set<number>();
    const threshold = 0.2;

    for (let i = 0; i < scores.length; i++) {
      if (visited.has(i)) {
        continue;
      }

      const seedVector = vectors[i];
      const members: number[] = [i];
      visited.add(i);

      for (let j = i + 1; j < scores.length; j++) {
        if (visited.has(j)) {
          continue;
        }
        const similarity = this.cosineSimilarity(seedVector, vectors[j]);
        if (similarity >= threshold) {
          members.push(j);
          visited.add(j);
        }
      }

      const clusterScores = members.map(index => scores[index]);
      const label = this.buildLabel(clusterScores);
      const topTokens = this.topTokensForCluster(members, vectors, 2);

      clusters.push({
        id: `cluster-${i}`,
        label,
        members: clusterScores,
        topTokens,
      });
    }

    const globalTopTokens = Array.from(globalCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([token, count]) => ({ token, count }));

    return {
      clusters,
      globalTopTokens,
    };
  }

  private buildVector(score: ThreadScore): Map<string, number> {
    const vector = new Map<string, number>();

    for (const hit of score.feature.topicHits) {
      const weight = (hit.keywordHits * 2 + hit.bigramHits * 4) * (hit.boost ?? 1);
      if (weight <= 0) {
        continue;
      }
      vector.set(hit.slug, (vector.get(hit.slug) ?? 0) + weight);
    }

    for (const keyword of score.feature.matchedKeywords) {
      vector.set(keyword, (vector.get(keyword) ?? 0) + 1);
    }

    return vector;
  }

  private cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
    const shared = new Set<string>([...a.keys(), ...b.keys()]);
    let dot = 0;
    let normA = 0;
    let normB = 0;

    for (const token of shared) {
      const valueA = a.get(token) ?? 0;
      const valueB = b.get(token) ?? 0;
      dot += valueA * valueB;
      normA += valueA * valueA;
      normB += valueB * valueB;
    }

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  private buildLabel(scores: ThreadScore[]): string {
    if (scores.length === 0) {
      return 'general';
    }

    const tokens = new Map<string, number>();
    for (const score of scores) {
      for (const hit of score.feature.topicHits) {
        const weight = hit.keywordHits + hit.bigramHits * 2;
        tokens.set(hit.slug, (tokens.get(hit.slug) ?? 0) + weight);
      }
    }

    const sorted = Array.from(tokens.entries()).sort((a, b) => b[1] - a[1]);
    if (sorted.length >= 2) {
      return `${sorted[0][0]} · ${sorted[1][0]}`;
    }
    if (sorted.length === 1) {
      return sorted[0][0];
    }
    return 'general';
  }

  private topTokensForCluster(indices: number[], vectors: Map<string, number>[], take: number): string[] {
    const totals = new Map<string, number>();
    for (const index of indices) {
      const vector = vectors[index];
      for (const [token, weight] of vector.entries()) {
        totals.set(token, (totals.get(token) ?? 0) + weight);
      }
    }

    return Array.from(totals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, take)
      .map(([token]) => token);
  }
}

export const themeClusterService = new ThemeClusterService();
