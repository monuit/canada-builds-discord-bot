// MARK: - Thread Tag Service
// Generates and persists tags for threads using AI assistance and manual overrides

import {
  BaseMessageOptions,
  Client,
  EmbedBuilder,
  ThreadChannel,
  Message as DiscordMessage,
} from 'discord.js';
import { ThreadTag, IThreadTag } from '../models/ThreadTag';
import { Message as IndexedMessage } from '../models/Message';
import { logger } from '../utils/logger';
import { generateTagSuggestions, TagSuggestionPayload } from './OpenAIService';

const CACHE_MINUTES = 120;
const MAX_RESULTS = 5;

class ThreadTagService {
  private client: Client | null = null;

  initialize(client: Client): void {
    this.client = client;
  }

  async suggestTagsForThread(
    thread: ThreadChannel,
    requestedBy: string,
  ): Promise<IThreadTag> {
    const cached = await ThreadTag.findOne({ threadId: thread.id });

    if (cached && cached.source === 'ai' && cached.cachedUntil && cached.cachedUntil > new Date()) {
      return cached;
    }

    const content = await this.collectThreadContext(thread);

    const suggestions = await generateTagSuggestions({
      threadName: thread.name,
      participants: Array.from(new Set(content.map(item => item.author))).slice(0, 10),
      messages: content,
    });

    const tags = suggestions.map((suggestion: TagSuggestionPayload) => suggestion.name.toLowerCase());

    const upsert = await ThreadTag.findOneAndUpdate(
      { threadId: thread.id },
      {
        guildId: thread.guildId,
        parentChannelId: thread.parentId ?? thread.id,
        tags,
        source: 'ai',
        suggestedBy: requestedBy,
        confidence: suggestions.reduce((acc: number, item: TagSuggestionPayload) => acc + item.confidence, 0) / suggestions.length,
        messageSampleIds: content.map(item => item.id).slice(0, 20),
        cachedUntil: new Date(Date.now() + CACHE_MINUTES * 60 * 1000),
        appliedAt: new Date(),
        updatedAt: new Date(),
      },
      { upsert: true, new: true },
    );

    logger.info('Thread tags generated', {
      guildId: thread.guildId,
      threadId: thread.id,
      tagCount: tags.length,
      cachedMinutes: CACHE_MINUTES,
    });

    return upsert;
  }

  async setManualTags(
    thread: ThreadChannel,
    tags: string[],
    requestedBy: string,
  ): Promise<IThreadTag> {
    const normalized = Array.from(new Set(tags.map(tag => tag.toLowerCase())));

    const updated = await ThreadTag.findOneAndUpdate(
      { threadId: thread.id },
      {
        guildId: thread.guildId,
        parentChannelId: thread.parentId ?? thread.id,
        tags: normalized,
        source: 'manual',
        suggestedBy: requestedBy,
        messageSampleIds: [],
        cachedUntil: undefined,
        confidence: undefined,
        appliedAt: new Date(),
        updatedAt: new Date(),
      },
      { upsert: true, new: true },
    );

    logger.info('Thread tags manually updated', {
      guildId: thread.guildId,
      threadId: thread.id,
      tagCount: normalized.length,
    });

    return updated;
  }

  async searchTopics(
    guildId: string,
    query: string,
    limit = MAX_RESULTS,
  ): Promise<IThreadTag[]> {
    const regex = new RegExp(query, 'i');

    const tags = await ThreadTag.find({ guildId, tags: regex })
      .sort({ updatedAt: -1 })
      .limit(limit);

    return tags;
  }

  async buildTagEmbed(thread: ThreadChannel, tag: IThreadTag): Promise<BaseMessageOptions> {
    if (!this.client) {
      throw new Error('ThreadTagService not initialized');
    }

    const embed = new EmbedBuilder()
      .setTitle(`Tags for #${thread.name}`)
      .setDescription(tag.tags.length ? tag.tags.map(t => `• ${t}`).join('\n') : 'No tags recorded yet.')
      .setFooter({ text: `Source: ${tag.source === 'ai' ? 'AI suggestion' : 'Manual'}` })
      .setTimestamp(tag.updatedAt);

    return { embeds: [embed] };
  }

  private async collectThreadContext(thread: ThreadChannel): Promise<Array<{ id: string; author: string; content: string }>> {
    const fetched = await thread.messages.fetch({ limit: 50 });
    const messages = Array.from(fetched.values() as Iterable<DiscordMessage>)
      .filter(msg => !msg.author.bot)
      .slice(-30)
      .map(msg => ({
        id: msg.id,
        author: msg.author.username,
        content: msg.content,
      }))
      .filter(item => item.content.trim().length > 0);

    if (messages.length < 5) {
      const indexed = await IndexedMessage.find({
        channelId: thread.id,
      })
        .sort({ timestamp: -1 })
        .limit(30);

      indexed.forEach(doc => {
        messages.push({ id: doc.messageId, author: doc.authorUsername, content: doc.content });
      });
    }

    return messages.slice(-30);
  }
}

export const threadTagService = new ThreadTagService();
