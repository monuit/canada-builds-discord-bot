// MARK: - Summary Cache Service
// 6-hour caching for OpenAI summaries to reduce costs

import { logger } from '../utils/logger';

interface CachedSummary {
  summary: string;
  tokensUsed: { input: number; output: number };
  cost: number;
  cachedAt: Date;
  expiresAt: number;
}

export class SummaryCache {
  private cache: Map<string, CachedSummary> = new Map();
  private readonly defaultCacheDurationMs = 6 * 60 * 60 * 1000; // 6 hours

  /**
   * Generate cache key from message IDs and keyword
   */
  private generateKey(messageIds: string[], keyword: string): string {
    const sortedIds = [...messageIds].sort();
    return `${keyword}:${sortedIds.join(',')}`;
  }

  /**
   * Get cached summary if valid
   */
  get(messageIds: string[], keyword: string): CachedSummary | null {
    const key = this.generateKey(messageIds, keyword);
    const cached = this.cache.get(key);

    if (!cached) {
      return null;
    }

    const now = Date.now();
    const age = now - cached.cachedAt.getTime();

    if (now >= cached.expiresAt) {
      // Expired, remove from cache
      this.cache.delete(key);
      logger.debug('Summary cache expired', { keyword, messageCount: messageIds.length });
      return null;
    }

    logger.debug('Summary cache hit', { keyword, ageMinutes: Math.floor(age / 60000) });
    return cached;
  }

  /**
   * Store summary in cache
   */
  set(
    messageIds: string[],
    keyword: string,
    summary: string,
    tokensUsed: { input: number; output: number },
    cost: number,
    ttlMs?: number
  ): void {
    const key = this.generateKey(messageIds, keyword);
    const ttl = Math.max(this.defaultCacheDurationMs, ttlMs ?? this.defaultCacheDurationMs);
    const cachedAt = new Date();
    
    this.cache.set(key, {
      summary,
      tokensUsed,
      cost,
      cachedAt,
      expiresAt: cachedAt.getTime() + ttl,
    });

    logger.debug('Summary cached', { 
      keyword, 
      messageCount: messageIds.length,
      tokensUsed: tokensUsed.input + tokensUsed.output 
    });
  }

  /**
   * Clear expired entries (cleanup)
   */
  cleanup(): void {
    const now = Date.now();
    let removed = 0;

    for (const [key, cached] of this.cache.entries()) {
      if (now >= cached.expiresAt) {
        this.cache.delete(key);
        removed++;
      }
    }

    if (removed > 0) {
      logger.info('Summary cache cleanup completed', { entriesRemoved: removed });
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; oldestEntryAge: number | null } {
    let oldestAge: number | null = null;

    for (const cached of this.cache.values()) {
      const age = Date.now() - cached.cachedAt.getTime();
      if (oldestAge === null || age > oldestAge) {
        oldestAge = age;
      }
    }

    return {
      size: this.cache.size,
      oldestEntryAge: oldestAge,
    };
  }

  /**
   * Clear all cached entries
   */
  clear(): void {
    const size = this.cache.size;
    this.cache.clear();
    logger.info('Summary cache cleared', { entriesRemoved: size });
  }
}

// Export singleton instance
export const summaryCache = new SummaryCache();

// Run cleanup every hour
setInterval(() => summaryCache.cleanup(), 60 * 60 * 1000);
