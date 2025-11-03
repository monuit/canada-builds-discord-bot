// MARK: - Bookmark Relay Service
// Mirrors starred messages into a configured highlight channel

import {
  Client,
  EmbedBuilder,
  GuildTextBasedChannel,
  MessageReaction,
  PermissionsBitField,
  PartialMessageReaction,
  PartialUser,
  User,
} from 'discord.js';
import { Bookmark } from '../models/Bookmark';
import { guildFeatureConfigService } from './GuildFeatureConfigService';
import { logger } from '../utils/logger';

class BookmarkRelayService {
  private client: Client | null = null;

  initialize(client: Client): void {
    this.client = client;
  }

  async handleReactionAdd(reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser): Promise<void> {
    if (!reaction.message.guildId || user.bot) {
      return;
    }

    if (reaction.emoji.name !== '⭐') {
      return;
    }

    const resolvedReaction = reaction.partial ? await reaction.fetch().catch(() => null) : reaction;
    const resolvedUser = user.partial ? await user.fetch().catch(() => null) : user;

    if (!resolvedReaction || !resolvedUser || resolvedUser.bot) {
      return;
    }

    const message = resolvedReaction.message.partial
      ? await resolvedReaction.message.fetch().catch(() => null)
      : resolvedReaction.message;

    if (!message) {
      return;
    }

    const guildId = message.guildId;

    if (!guildId) {
      return;
    }

    const highlightChannelId = guildFeatureConfigService.getHighlightChannelId(guildId);

    if (!highlightChannelId) {
      return;
    }

    const highlightChannel = await message.guild?.channels.fetch(highlightChannelId).catch(() => null);

    if (!highlightChannel || !highlightChannel.isTextBased()) {
      return;
    }

    if (!(await this.canMirror(message.channel, highlightChannel))) {
      logger.warn('Skipping highlight relay due to permission mismatch', {
        guildId,
        channelId: message.channelId,
        highlightChannelId,
      });
      return;
    }

    const existing = await Bookmark.findOne({ guildId, messageId: message.id });
    const starredBy = new Set(existing?.starredBy ?? []);
    starredBy.add(resolvedUser.id);

    if (existing && existing.highlightMessageId) {
      await Bookmark.updateOne(
        { guildId, messageId: message.id },
        {
          $set: {
            lastStarredAt: new Date(),
            starredBy: Array.from(starredBy),
            removedAt: null,
          },
        },
      );

      await this.refreshHighlightEmbed(
        highlightChannel,
        existing.highlightMessageId,
        {
          author: message.author?.username,
          content: message.content,
          url: message.url,
        },
        starredBy.size,
      );
      return;
    }

    const embed = this.buildEmbed({
      author: message.author?.username,
      content: message.content,
      url: message.url,
    }, starredBy.size);

    const highlightMessage = await (highlightChannel as GuildTextBasedChannel).send({ embeds: [embed] });

    await Bookmark.findOneAndUpdate(
      { guildId, messageId: message.id },
      {
        guildId,
        channelId: message.channelId,
        messageId: message.id,
        highlightChannelId,
        highlightMessageId: highlightMessage.id,
        starredBy: Array.from(starredBy),
        firstStarredAt: new Date(),
        lastStarredAt: new Date(),
        removedAt: null,
      },
      { upsert: true, new: true },
    );

    logger.info('Highlight relay created', {
      guildId,
      messageId: message.id,
      highlightMessageId: highlightMessage.id,
    });
  }

  async handleReactionRemove(reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser): Promise<void> {
    if (!reaction.message.guildId || (user as User).bot) {
      return;
    }

    if (reaction.emoji.name !== '⭐') {
      return;
    }

    const resolvedReaction = reaction.partial ? await reaction.fetch().catch(() => null) : reaction;
    const resolvedUser = user.partial ? await user.fetch().catch(() => null) : user;

    if (!resolvedReaction || !resolvedUser) {
      return;
    }

    const message = resolvedReaction.message.partial
      ? await resolvedReaction.message.fetch().catch(() => null)
      : resolvedReaction.message;

    if (!message) {
      return;
    }

    const guildId = message.guildId;

    if (!guildId) {
      return;
    }

    const bookmark = await Bookmark.findOne({ guildId, messageId: message.id });

    if (!bookmark) {
      return;
    }

    const updated = bookmark.starredBy.filter(id => id !== resolvedUser.id);

    if (updated.length === 0) {
      await Bookmark.updateOne(
        { guildId, messageId: message.id },
        {
          $set: {
            starredBy: updated,
            removedAt: new Date(),
          },
        },
      );

      if (bookmark.highlightMessageId) {
        const highlightChannel = await message.guild?.channels.fetch(bookmark.highlightChannelId).catch(() => null);
        if (highlightChannel && highlightChannel.isTextBased()) {
          await highlightChannel.messages.delete(bookmark.highlightMessageId).catch(() => null);
        }
      }

      return;
    }

    await Bookmark.updateOne(
      { guildId, messageId: message.id },
      {
        $set: {
          starredBy: updated,
          lastStarredAt: new Date(),
        },
      },
    );

    if (bookmark.highlightMessageId) {
      const highlightChannel = await message.guild?.channels.fetch(bookmark.highlightChannelId).catch(() => null);
      if (highlightChannel && highlightChannel.isTextBased()) {
        await this.refreshHighlightEmbed(highlightChannel as GuildTextBasedChannel, bookmark.highlightMessageId, {
          author: message.author?.username,
          content: message.content,
          url: message.url,
        },
        updated.length);
      }
    }
  }

  private async refreshHighlightEmbed(
    channel: GuildTextBasedChannel,
    highlightMessageId: string,
    sourceMessage: { author?: string; content?: string; url?: string },
    starCount: number,
  ): Promise<void> {
    const embed = this.buildEmbed(sourceMessage, starCount);
    await channel.messages.edit(highlightMessageId, { embeds: [embed] }).catch(() => null);
  }

  private buildEmbed(source: { author?: string; content?: string; url?: string }, starCount: number): EmbedBuilder {
    const author = source.author ?? 'Unknown';
    const url = source.url ?? '';
    const content = source.content?.slice(0, 250) ?? '';

    return new EmbedBuilder()
      .setAuthor({ name: author })
      .setDescription(content.length > 0 ? content : '*No text content*')
      .addFields({ name: 'Stars', value: `${starCount}`, inline: true })
      .addFields({ name: 'Jump', value: url.length > 0 ? `[View message](${url})` : 'Unavailable', inline: true })
      .setFooter({ text: '⭐ Highlight' })
      .setTimestamp(new Date());
  }

  private async canMirror(
    sourceChannel: any,
    highlightChannel: GuildTextBasedChannel,
  ): Promise<boolean> {
    if (!sourceChannel || !('permissionsFor' in sourceChannel)) {
      return false;
    }

    const everyone = highlightChannel.guild.roles.everyone;
    const viewInSource = sourceChannel.permissionsFor(everyone)?.has(PermissionsBitField.Flags.ViewChannel) ?? false;
    const viewInHighlight = highlightChannel.permissionsFor(everyone)?.has(PermissionsBitField.Flags.ViewChannel) ?? false;

    return viewInSource && viewInHighlight;
  }
}

export const bookmarkRelayService = new BookmarkRelayService();
