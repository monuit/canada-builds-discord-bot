// MARK: - Message Indexer Service
// Real-time message indexing with keyword matching

import { Message as DiscordMessage } from 'discord.js';
import { Message, IMessage } from '../models/Message';
import { UserSubscription } from '../models/UserSubscription';
import { DigestConfig } from '../models/DigestConfig';
import { logger } from '../utils/logger';

export class MessageIndexer {
  private allKeywords: Set<string> = new Set();
  private excludedChannelIds: Set<string> = new Set();

  /**
   * Initialize by loading all tracked keywords
   */
  async initialize(guildId: string): Promise<void> {
    try {
      // Load all user keywords
      const subscriptions = await UserSubscription.find({ guildId });
      this.allKeywords.clear();
      
      for (const sub of subscriptions) {
        sub.keywords.forEach(kw => this.allKeywords.add(kw.toLowerCase()));
      }

      // Load excluded channels
      const config = await DigestConfig.findOne({ guildId });
      if (config) {
        this.excludedChannelIds = new Set(config.excludedChannelIds);
      }

      logger.info('MessageIndexer initialized', {
        guildId,
        keywordCount: this.allKeywords.size,
        excludedChannels: this.excludedChannelIds.size,
      });
    } catch (error: any) {
      logger.error('Failed to initialize MessageIndexer', { guildId, error: error.message });
      throw error;
    }
  }

  /**
   * Index a single message
   */
  async indexMessage(message: DiscordMessage): Promise<IMessage | null> {
    try {
      // Skip if channel is excluded
      if (this.excludedChannelIds.has(message.channelId)) {
        return null;
      }

      // Skip if no content
      if (!message.content || message.content.trim().length === 0) {
        return null;
      }

      // Normalize content
      const normalizedContent = this.normalizeContent(message.content);

      // Find matched keywords
      const matchedKeywords = this.findMatchedKeywords(normalizedContent);

      if (matchedKeywords.length === 0) {
        return null; // No keywords matched, skip indexing
      }

      // Determine primary keyword (first appearing in original content)
      const primaryKeyword = this.determinePrimaryKeyword(message.content, matchedKeywords);

      // Create message document
      const linkCount = this.countLinks(message.content);
      const reactionSummary = this.buildReactionSummary(message);
      const { threadId, parentChannelId } = this.resolveThreadContext(message);

      const messageDoc = await Message.create({
        messageId: message.id,
        guildId: message.guildId!,
        channelId: message.channelId,
        threadId,
        parentChannelId,
        authorId: message.author.id,
        authorUsername: message.author.username,
        content: message.content,
        normalizedContent,
        matchedKeywords,
        primaryKeyword,
        linkCount,
        reactionSummary,
        timestamp: message.createdAt,
      });

      logger.debug('Message indexed', {
        messageId: message.id,
        keywords: matchedKeywords.length,
        primary: primaryKeyword,
      });

      return messageDoc;

    } catch (error: any) {
      // Duplicate key error is fine (message already indexed)
      if (error.code === 11000) {
        return null;
      }
      
      logger.error('Failed to index message', {
        messageId: message.id,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Normalize content for matching
   */
  private normalizeContent(content: string): string {
    return content
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ') // Remove special chars
      .replace(/\s+/g, ' ') // Collapse whitespace
      .trim();
  }

  private resolveThreadContext(message: DiscordMessage): { threadId?: string; parentChannelId?: string } {
    const channel: any = message.channel;

    if (channel && typeof channel.isThread === 'function' && channel.isThread()) {
      return {
        threadId: message.channelId,
        parentChannelId: channel.parentId ?? undefined,
      };
    }

    return {
      threadId: undefined,
      parentChannelId: message.channelId,
    };
  }

  private countLinks(content: string): number {
    const matches = content.match(/https?:\/\/[^\s)]+/gi);
    return matches?.length ?? 0;
  }

  private buildReactionSummary(message: DiscordMessage): Array<{ emoji: string; count: number }> {
    if (!message.reactions.cache.size) {
      return [];
    }

    return message.reactions.cache.map(reaction => ({
      emoji: reaction.emoji.name ?? 'unknown',
      count: reaction.count ?? 0,
    }));
  }

  /**
   * Find all matched keywords using substring search
   */
  private findMatchedKeywords(normalizedContent: string): string[] {
    const matched: string[] = [];

    for (const keyword of this.allKeywords) {
      if (normalizedContent.includes(keyword)) {
        matched.push(keyword);
      }
    }

    return matched;
  }

  /**
   * Determine primary keyword (first appearing in original content)
   */
  private determinePrimaryKeyword(originalContent: string, matchedKeywords: string[]): string {
    const lowerContent = originalContent.toLowerCase();
    let earliestPosition = Infinity;
    let primaryKeyword = matchedKeywords[0];

    for (const keyword of matchedKeywords) {
      const position = lowerContent.indexOf(keyword);
      if (position !== -1 && position < earliestPosition) {
        earliestPosition = position;
        primaryKeyword = keyword;
      }
    }

    return primaryKeyword;
  }

  /**
   * Refresh keywords (call when subscriptions change)
   */
  async refreshKeywords(guildId: string): Promise<void> {
    await this.initialize(guildId);
  }

  /**
   * Add excluded channel
   */
  addExcludedChannel(channelId: string): void {
    this.excludedChannelIds.add(channelId);
    logger.debug('Channel excluded from indexing', { channelId });
  }

  /**
   * Remove excluded channel
   */
  removeExcludedChannel(channelId: string): void {
    this.excludedChannelIds.delete(channelId);
    logger.debug('Channel included in indexing', { channelId });
  }

  /**
   * Get indexing statistics
   */
  getStats(): { keywordCount: number; excludedChannelCount: number } {
    return {
      keywordCount: this.allKeywords.size,
      excludedChannelCount: this.excludedChannelIds.size,
    };
  }
}

// Export singleton instance
export const messageIndexer = new MessageIndexer();
