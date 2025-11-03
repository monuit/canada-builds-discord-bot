// MARK: - Onboarding Subscription Service
// Expands topic selections into keyword subscriptions with limits

import { UserSubscription } from '../../models/UserSubscription';
import { messageIndexer } from '../MessageIndexer';
import { topicService } from '../TopicService';
import { logger } from '../../utils/logger';

export interface TopicSubscriptionMergeResult {
  finalKeywords: string[];
  newlyAdded: string[];
  skippedKeywords: string[];
}

const KEYWORD_LIMIT = 20;

class OnboardingSubscriptionService {
  async applyTopicSelections(
    guildId: string,
    userId: string,
    topicSlugs: string[],
    timezone = 'UTC',
  ): Promise<TopicSubscriptionMergeResult> {
    const subscription = await UserSubscription.findOne({ guildId, userId });
    const existingKeywords = new Set<string>((subscription?.keywords ?? []).map(keyword => keyword.toLowerCase()));
    const mergedKeywords = new Set<string>(existingKeywords);
    const skippedKeywords: string[] = [];
    const newlyAdded: string[] = [];

    const tryAddKeyword = (keyword: string) => {
      if (!keyword) {
        return;
      }

      const normalized = keyword.toLowerCase();

      if (mergedKeywords.has(normalized)) {
        return;
      }

      if (mergedKeywords.size >= KEYWORD_LIMIT) {
        skippedKeywords.push(normalized);
        return;
      }

      mergedKeywords.add(normalized);
      newlyAdded.push(normalized);
    };

    for (const slug of topicSlugs) {
      const normalizedSlug = slug.toLowerCase();
      const topic = topicService.find(normalizedSlug);

      tryAddKeyword(normalizedSlug);

      if (topic?.keywords?.length) {
        topic.keywords.forEach(keyword => tryAddKeyword(keyword));
      }
    }

    const finalKeywordList = Array.from(mergedKeywords).sort((a, b) => a.localeCompare(b));
    const cooldownHours = subscription?.cooldownHours ?? 24;
    const dmEnabled = finalKeywordList.length > 0 ? true : subscription?.dmEnabled ?? false;

    await UserSubscription.findOneAndUpdate(
      { guildId, userId },
      {
        $set: {
          keywords: finalKeywordList,
          dmEnabled,
          cooldownHours,
          updatedAt: new Date(),
          'preferences.timezone': timezone,
        },
      },
      { upsert: true, new: true },
    );

    await messageIndexer.refreshKeywords(guildId);
    logger.info('Auto-subscriptions applied after onboarding', {
      guildId,
      userId,
      addedTopics: topicSlugs,
      totalKeywords: finalKeywordList.length,
      newlyAdded,
      skippedKeywords,
    });

    return {
      finalKeywords: finalKeywordList,
      newlyAdded,
      skippedKeywords,
    };
  }
}

export const onboardingSubscriptionService = new OnboardingSubscriptionService();
