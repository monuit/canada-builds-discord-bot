// MARK: - Digest Generator Service
// Generates curated digests blending heuristic scoring and summaries

import { Client, EmbedBuilder } from 'discord.js';
import { generateSummary } from './OpenAIService';
import { summarizer } from './Summarizer';
import { hashStringToColor } from '../utils/colorHash';
import { logger } from '../utils/logger';
import { threadFeatureExtractor, ThreadFeature } from './digest/ThreadFeatureExtractor';
import { threadScoringService, ThreadScore } from './digest/ThreadScoringService';
import { themeClusterService } from './digest/ThemeClusterService';
import { topicCounterService } from './digest/TopicCounterService';
import { digestInstrumentation } from './digest/DigestInstrumentation';

export interface DigestResult {
  embeds: EmbedBuilder[];
  threadDetails: ThreadDigestEntry[];
  stats: {
    messageCount: number;
    topicCount: number;
    tokensUsed: { input: number; output: number };
    cost: number;
    threadScores: Array<{
      key: string;
      score: number;
      participants: number;
      messages: number;
      decisionVerbHits: number;
    }>;
    topTopics: Array<{ slug: string; count: number }>;
    clusterLabels: string[];
  };
}

interface ThreadDigestEntry {
  primaryTopic: string;
  channelId: string;
  threadId?: string;
  messageCount: number;
  topics: Array<{ slug: string; weight: number }>;
}

export class DigestGenerator {
  private client: Client | null = null;

  initialize(client: Client): void {
    this.client = client;
  }

  async generateForUser(
    userId: string,
    guildId: string,
    keywords: string[],
    hours = 24,
    options?: { summaryCacheTtlHours?: number },
  ): Promise<DigestResult> {
    return this.generateDigest({
      requestId: userId,
      guildId,
      keywords,
      hours,
      summaryCacheTtlHours: options?.summaryCacheTtlHours,
    });
  }

  async generateForKeywords(
    guildId: string,
    keywords: string[],
    hours = 24,
    requestId = 'batch',
    options?: { summaryCacheTtlHours?: number },
  ): Promise<DigestResult> {
    return this.generateDigest({
      requestId,
      guildId,
      keywords,
      hours,
      summaryCacheTtlHours: options?.summaryCacheTtlHours,
    });
  }

  private async generateDigest(params: {
    requestId: string;
    guildId: string;
    keywords: string[];
    hours: number;
    summaryCacheTtlHours?: number;
  }): Promise<DigestResult> {
    const { requestId, guildId, keywords, hours, summaryCacheTtlHours } = params;
    try {
      const cutoffDate = new Date(Date.now() - hours * 60 * 60 * 1000);
      const features = await threadFeatureExtractor.fetchFeatures(guildId, keywords, cutoffDate);

      if (features.length === 0) {
        return this.createEmptyDigest(keywords);
      }

      const scored = threadScoringService.scoreThreads(guildId, features);
      digestInstrumentation.logThreadScores(guildId, scored);

      const themeAnalysis = themeClusterService.analyze(scored);
      digestInstrumentation.logClusters(guildId, themeAnalysis.clusters);

      const topTopics = topicCounterService.count(scored);
      const topScores = scored.slice(0, 9);

      const useAiSummaries = process.env.USE_AI_SUMMARIES !== 'false';
      const embeds: EmbedBuilder[] = [];
      const threadDetails: ThreadDigestEntry[] = [];
      const headerEmbed = await this.buildHeaderEmbed(guildId, topTopics, themeAnalysis, useAiSummaries);
      if (headerEmbed) {
        embeds.push(headerEmbed);
      }

      let totalMessages = 0;
      let totalTokensInput = 0;
      let totalTokensOutput = 0;
      let totalCost = 0;

      for (const score of topScores) {
        totalMessages += score.feature.messageCount;
        const { embed, tokensUsed, cost, metadata } = await this.buildThreadEmbed(
          guildId,
          score,
          useAiSummaries,
          summaryCacheTtlHours ?? hours,
        );

        embeds.push(embed);
        threadDetails.push(metadata);
        totalTokensInput += tokensUsed.input;
        totalTokensOutput += tokensUsed.output;
        totalCost += cost;
      }

      logger.info('Digest generated', {
        requestId,
        guildId,
        topics: topScores.length,
        messages: totalMessages,
        useAiSummaries,
        cost: totalCost.toFixed(4),
      });

      return {
        embeds,
        threadDetails,
        stats: {
          messageCount: totalMessages,
          topicCount: topScores.length,
          tokensUsed: {
            input: totalTokensInput,
            output: totalTokensOutput,
          },
          cost: totalCost,
          threadScores: topScores.map(score => ({
            key: score.feature.key,
            score: Number(score.score.toFixed(2)),
            participants: score.feature.uniqueParticipants,
            messages: score.feature.messageCount,
            decisionVerbHits: score.feature.decisionVerbHits,
          })),
          topTopics,
          clusterLabels: themeAnalysis.clusters.map(cluster => cluster.label),
        },
      };
    } catch (error: any) {
      logger.error('Failed to generate digest', {
        requestId,
        guildId,
        error: error.message,
      });
      throw error;
    }
  }

  private async buildThreadEmbed(
    guildId: string,
    score: ThreadScore,
    useAiSummaries: boolean,
    summaryCacheTtlHours: number,
  ): Promise<{
    embed: EmbedBuilder;
    tokensUsed: { input: number; output: number };
    cost: number;
    metadata: ThreadDigestEntry;
  }> {
    const feature = score.feature;
    const sortedTopics = [...feature.topicHits].sort((a, b) => (
      (b.keywordHits + b.bigramHits * 2) * (b.boost ?? 1) -
      (a.keywordHits + a.bigramHits * 2) * (a.boost ?? 1)
    ));
    const primaryTopic = sortedTopics[0]?.slug ?? feature.matchedKeywords[0] ?? 'discussion';
    const topTopicWeights = sortedTopics.slice(0, 3).map(hit => ({
      slug: hit.slug,
      weight: (hit.keywordHits * 2 + hit.bigramHits * 4) * (hit.boost ?? 1),
    }));

    const extractive = summarizer.summarize(feature.messages, primaryTopic);
    let summaryText = extractive.summary;
    let tokensUsed = { input: 0, output: 0 };
    let cost = 0;

    if (useAiSummaries) {
      const curatedMessages = extractive.selectedIds.length > 0
        ? feature.messages.filter(message => extractive.selectedIds.includes(message.id)).slice(0, 8)
        : feature.messages.slice(0, 8);
      const aiResult = await generateSummary(curatedMessages, primaryTopic, {
        cacheTtlHours: Math.max(6, summaryCacheTtlHours),
      });
      summaryText = aiResult.summary || extractive.summary;
      tokensUsed = aiResult.tokensUsed;
      cost = aiResult.cost;
    }

    const sampleMessages = feature.messages.slice(0, 3).map(msg => (
      `• [${msg.authorUsername}](${msg.url}) ${(msg.content ?? '').slice(0, 140)}${(msg.content ?? '').length > 140 ? '…' : ''}`
    ));

    const primaryLink = feature.messages[0]?.url;

    const embed = new EmbedBuilder()
      .setTitle(await this.buildTitle(guildId, feature, primaryTopic))
      .setDescription(summaryText)
      .setColor(hashStringToColor(primaryTopic))
      .addFields({
        name: 'Signals',
        value:
          `Participants: ${feature.uniqueParticipants} · Messages: ${feature.messageCount} · Reactions: ${feature.reactionWeighted.toFixed(1)}\n` +
          `Decision hits: ${feature.decisionVerbHits} · Score: ${score.score.toFixed(2)}`,
      })
      .setTimestamp(feature.lastMessageAt);

    if (primaryLink) {
      embed.setURL(primaryLink);
    }

    if (sampleMessages.length > 0) {
      embed.addFields({
        name: 'Recent Activity',
        value: sampleMessages.join('\n').slice(0, 1024),
      });
    }

    if (topTopicWeights.length > 0) {
      const tagField = topTopicWeights.map(entry => `#${entry.slug}`).join(' · ');
      embed.addFields({ name: 'Tags', value: tagField || '`community`' });
    }

    return {
      embed,
      tokensUsed,
      cost,
      metadata: {
        primaryTopic,
        channelId: feature.channelId,
        threadId: feature.threadId,
        messageCount: feature.messageCount,
        topics: topTopicWeights,
      },
    };
  }

  private async buildTitle(
    guildId: string,
    feature: ThreadFeature,
    topicLabel: string,
  ): Promise<string> {
    const channelLabel = await this.resolveChannelLabel(guildId, feature);
    return `${channelLabel} — ${topicLabel}`;
  }

  private async resolveChannelLabel(
    guildId: string,
    feature: ThreadFeature,
  ): Promise<string> {
    if (!this.client) {
      return `#${feature.channelId}`;
    }

    try {
      const channel = await this.client.channels.fetch(feature.threadId ?? feature.channelId);
      if (channel && 'name' in channel && typeof channel.name === 'string') {
        return `#${channel.name}`;
      }
    } catch (error) {
      logger.warn('Failed to resolve channel label', {
        guildId,
        channelId: feature.channelId,
        error: (error as Error).message,
      });
    }

    return `#${feature.channelId}`;
  }

  private async buildHeaderEmbed(
    guildId: string,
    topTopics: Array<{ slug: string; count: number }>,
    analysis: ReturnType<typeof themeClusterService.analyze>,
    aiEnabled: boolean,
  ): Promise<EmbedBuilder | null> {
    if (topTopics.length === 0 && analysis.clusters.length === 0) {
      return null;
    }

    const lines: string[] = [];
    if (topTopics.length > 0) {
      const topicLine = topTopics
        .map(topic => `${topic.slug} (${topic.count})`)
        .join(', ');
      lines.push(`Top topics this window: ${topicLine}`);
    }

    const escalations = this.detectEscalations(topTopics, analysis.clusters);
    if (escalations.length > 0) {
      lines.push(`Escalate: ${escalations.join(', ')}`);
    }

    const clusterSummary = analysis.clusters
      .filter(cluster => cluster.members.length >= 2)
      .map(cluster => `${cluster.label} (${cluster.members.length})`)
      .slice(0, 3)
      .join(' · ');

    if (clusterSummary) {
      lines.push(`Themes: ${clusterSummary}`);
    }

    lines.push(`Summaries: ${aiEnabled ? 'AI-enhanced with extractive pre-pass' : 'Extractive only (AI disabled)'}`);

    return new EmbedBuilder()
      .setTitle('Digest Highlights')
      .setDescription(lines.join('\n'))
      .setColor(0x1abc9c)
      .setTimestamp(new Date())
      .setFooter({ text: `Guild ${guildId}` });
  }

  private detectEscalations(
    topTopics: Array<{ slug: string; count: number }>,
    clusters: ReturnType<typeof themeClusterService.analyze>['clusters'],
  ): string[] {
    const escalations: string[] = [];
    for (const topic of topTopics) {
      let channelCount = 0;
      let decisionHits = 0;

      for (const cluster of clusters) {
        const membersWithTopic = cluster.members.filter(member =>
          member.feature.topicHits.some(hit => hit.slug === topic.slug),
        );
        if (membersWithTopic.length > 0) {
          channelCount += new Set(membersWithTopic.map(member => member.feature.channelId)).size;
          decisionHits += membersWithTopic.reduce((sum, member) => sum + member.feature.decisionVerbHits, 0);
        }
      }

      if (channelCount >= 3 && decisionHits >= 2) {
        escalations.push(`${topic.slug} ↑`);
      }
    }
    return escalations;
  }

  private createEmptyDigest(keywords: string[]): DigestResult {
    const embed = new EmbedBuilder()
      .setTitle('📭 No New Activity')
      .setDescription(
        `No messages found matching your keywords in the specified time period.\n\n` +
        `**Your Keywords**: ${keywords.join(', ')}\n\n` +
        `Try broadening your search or checking back later.`
      )
      .setColor(0x95A5A6)
      .setTimestamp();

    return {
      embeds: [embed],
      threadDetails: [],
      stats: {
        messageCount: 0,
        topicCount: 0,
        tokensUsed: { input: 0, output: 0 },
        cost: 0,
        threadScores: [],
        topTopics: [],
        clusterLabels: [],
      },
    };
  }
}

export const digestGenerator = new DigestGenerator();
