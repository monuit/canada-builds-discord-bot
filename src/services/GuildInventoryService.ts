// MARK: - Guild Inventory Service
// Coordinates initial, incremental, and scheduled scans of channels, threads, and members

import cron, { ScheduledTask } from 'node-cron';
import {
  ChannelType,
  Client,
  Collection,
  Guild,
  GuildBasedChannel,
  GuildMember,
  ThreadChannel,
  User,
} from 'discord.js';
import { RateLimiter } from '../utils/rateLimiter';
import { logger } from '../utils/logger';
import { GuildInventoryState } from '../models/GuildInventoryState';
import { GuildChannelIndex } from '../models/GuildChannelIndex';
import { GuildMemberIndex } from '../models/GuildMemberIndex';
import { UserSubscription } from '../models/UserSubscription';
import { ConsentLedger } from '../models/ConsentLedger';

const NIGHTLY_SCAN_CRON = process.env.INVENTORY_SCAN_CRON ?? '0 4 * * *'; // 04:00 UTC default
const RATE_LIMIT_DELAY_MS = 400;
const ARCHIVE_PAGE_SIZE = 100;

export class GuildInventoryService {
  private client: Client | null = null;
  private guildId: string | null = null;
  private readonly rateLimiter = new RateLimiter(RATE_LIMIT_DELAY_MS);
  private nightlyTask: ScheduledTask | null = null;

  initialize(client: Client, guildId: string): Promise<void> {
    this.client = client;
    this.guildId = guildId;
    return this.ensureStateAndScan();
  }

  shutdown(): void {
    this.nightlyTask?.stop();
    this.nightlyTask = null;
  }

  async handleMemberJoin(member: GuildMember): Promise<void> {
    if (!this.isManagedGuild(member.guild.id)) {
      return;
    }

    await this.captureMember(member);
    await GuildInventoryState.updateOne(
      { guildId: member.guild.id },
      { $set: { lastIncrementalScanAt: new Date() } },
    ).exec();
  }

  async handleChannelCreate(channel: GuildBasedChannel): Promise<void> {
    if (!this.isManagedGuild(channel.guild.id)) {
      return;
    }

    await this.captureChannel(channel);
    await GuildInventoryState.updateOne(
      { guildId: channel.guild.id },
      { $set: { lastIncrementalScanAt: new Date() } },
    ).exec();
  }

  async handleThreadCreate(thread: ThreadChannel): Promise<void> {
    if (!this.isManagedGuild(thread.guild.id)) {
      return;
    }

    await this.captureThread(thread);
    await GuildInventoryState.updateOne(
      { guildId: thread.guild.id },
      { $set: { lastIncrementalScanAt: new Date() } },
    ).exec();
  }

  private async ensureStateAndScan(): Promise<void> {
    const guild = await this.fetchManagedGuild();
    const state = await GuildInventoryState.findOneAndUpdate(
      { guildId: guild.id },
      { $setOnInsert: { initialScanCompleted: false, nightlyCron: NIGHTLY_SCAN_CRON } },
      { new: true, upsert: true },
    ).exec();

    const inventoryEmpty = await this.isInventoryEmpty(guild.id);
    if (!state.initialScanCompleted || inventoryEmpty) {
      const reason: ScanReason = state.initialScanCompleted ? 'bootstrap' : 'initial';
      await this.runFullScan(guild, reason);
      state.initialScanCompleted = true;
      state.lastFullScanAt = new Date();
      await state.save();
    }

    this.scheduleNightlyScan();
  }

  private scheduleNightlyScan(): void {
    if (this.nightlyTask) {
      return;
    }

    this.nightlyTask = cron.schedule(NIGHTLY_SCAN_CRON, async () => {
      try {
        const guild = await this.fetchManagedGuild();
        await this.runFullScan(guild, 'nightly');
        await GuildInventoryState.updateOne(
          { guildId: guild.id },
          { $set: { lastFullScanAt: new Date() } },
        ).exec();
      } catch (error: any) {
        logger.error('Nightly inventory scan failed', {
          guildId: this.guildId,
          error: error.message,
        });
      }
    });

    logger.info('Nightly inventory scan scheduled', {
      guildId: this.guildId,
      cron: NIGHTLY_SCAN_CRON,
    });
  }

  private async runFullScan(guild: Guild, reason: ScanReason): Promise<void> {
    logger.info('Starting guild inventory scan', { guildId: guild.id, reason });

    await Promise.all([
      this.captureGuildChannels(guild),
      this.captureGuildMembers(guild),
    ]);

    logger.info('Guild inventory scan complete', { guildId: guild.id, reason });
  }

  private async captureGuildChannels(guild: Guild): Promise<void> {
    const channels = await guild.channels.fetch();
    await this.persistChannelCollection(channels);

    try {
      const activeThreads = await guild.channels.fetchActiveThreads();
      for (const thread of activeThreads.threads.values()) {
        await this.captureThread(thread);
      }
    } catch (error: any) {
      logger.warn('Failed to fetch active threads', {
        guildId: guild.id,
        error: error.message,
      });
    }

    await GuildInventoryState.updateOne(
      { guildId: guild.id },
      { $set: { lastIncrementalScanAt: new Date() } },
    ).exec();
  }

  private async captureGuildMembers(guild: Guild): Promise<void> {
    const members = await guild.members.fetch();
    const [subscriptions, consentLedgers] = await Promise.all([
      UserSubscription.find({ guildId: guild.id }).select('userId').lean().exec(),
      ConsentLedger.find({ guildId: guild.id }).select('userId status').lean().exec(),
    ]);

    const subscriptionSet = new Set(subscriptions.map(sub => sub.userId));
    const consentStatusMap = new Map(consentLedgers.map(ledger => [ledger.userId, ledger.status]));

    for (const member of members.values()) {
      await this.rateLimiter.schedule(() => this.persistMember(member, subscriptionSet, consentStatusMap));
    }
  }

  private async persistChannelCollection(
    channels: Collection<string, GuildBasedChannel | null>,
  ): Promise<void> {
    for (const channel of channels.values()) {
      if (!channel || channel.isDMBased()) {
        continue;
      }

      await this.captureChannel(channel);
    }
  }

  private async captureChannel(channel: GuildBasedChannel): Promise<void> {
    await this.rateLimiter.schedule(() => this.persistChannel(channel));

    if (this.hasThreadManager(channel)) {
      await this.collectThreadsForChannel(channel);
    }
  }

  private async captureThread(thread: ThreadChannel): Promise<void> {
    await this.rateLimiter.schedule(() => this.persistThread(thread));
  }

  private async collectThreadsForChannel(channel: GuildBasedChannel & { threads: any }): Promise<void> {
    await this.fetchActiveThreads(channel);
    await this.fetchArchivedThreads(channel, 'public');
    await this.fetchArchivedThreads(channel, 'private');
  }

  private async fetchActiveThreads(channel: GuildBasedChannel & { threads: any }): Promise<void> {
    try {
      const { threads } = await channel.threads.fetchActive();
      for (const thread of threads.values()) {
        await this.captureThread(thread);
      }
    } catch (error: any) {
      logger.debug('Active thread fetch failed for channel', {
        channelId: channel.id,
        error: error.message,
      });
    }
  }

  private async fetchArchivedThreads(
    channel: GuildBasedChannel & { threads: any },
    type: 'public' | 'private',
  ): Promise<void> {
    if (typeof channel.threads.fetchArchived !== 'function') {
      return;
    }

    let hasMore = true;
    let before: string | undefined;

    while (hasMore) {
      try {
        const result = await channel.threads.fetchArchived({ type, limit: ARCHIVE_PAGE_SIZE, before });
        for (const thread of result.threads.values()) {
          await this.captureThread(thread);
        }

        if (!result.hasMore || result.threads.size === 0) {
          hasMore = false;
        } else {
          before = result.threads.last()?.id;
          if (!before) {
            hasMore = false;
          }
        }
      } catch (error: any) {
        const isForbidden = error.code === 50013 || error.code === 50001;
        logger.debug('Archived thread fetch failed', {
          channelId: channel.id,
          type,
          before,
          error: error.message,
        });
        if (isForbidden) {
          // Stop attempting further pages if permissions are insufficient
          return;
        }
        hasMore = false;
      }
    }
  }

  private async captureMember(member: GuildMember): Promise<void> {
    const [subscription, consent] = await Promise.all([
      UserSubscription.findOne({ guildId: member.guild.id, userId: member.id }).select('userId').lean().exec(),
      ConsentLedger.findOne({ guildId: member.guild.id, userId: member.id }).select('status').lean().exec(),
    ]);

    await this.rateLimiter.schedule(() => this.persistMember(
      member,
      new Set(subscription ? [member.id] : []),
      new Map(consent ? [[member.id, consent.status]] : []),
    ));
  }

  private async persistChannel(channel: GuildBasedChannel): Promise<void> {
    const record = {
      guildId: channel.guild.id,
      channelId: channel.id,
      name: this.resolveChannelName(channel),
      type: this.resolveChannelType(channel),
      parentId: 'parentId' in channel ? channel.parentId ?? null : null,
      isThread: channel.isThread(),
      archived: channel.isThread() ? Boolean(channel.archived) : false,
      createdTimestamp: channel.createdAt ?? undefined,
      lastScannedAt: new Date(),
      updatedAt: new Date(),
    };

    await GuildChannelIndex.findOneAndUpdate(
      { guildId: record.guildId, channelId: record.channelId },
      { $set: record },
      { upsert: true, new: true },
    ).exec();
  }

  private async persistThread(thread: ThreadChannel): Promise<void> {
    const record = {
      guildId: thread.guild.id,
      channelId: thread.id,
      name: thread.name ?? thread.id,
      type: this.resolveThreadType(thread),
      parentId: thread.parentId ?? null,
      isThread: true,
      archived: Boolean(thread.archived),
      createdTimestamp: thread.createdAt ?? undefined,
      lastScannedAt: new Date(),
      updatedAt: new Date(),
    };

    await GuildChannelIndex.findOneAndUpdate(
      { guildId: record.guildId, channelId: record.channelId },
      { $set: record },
      { upsert: true, new: true },
    ).exec();
  }

  private async persistMember(
    member: GuildMember,
    subscriptionSet: Set<string>,
    consentStatusMap: Map<string, string>,
  ): Promise<void> {
    const { user } = member;

    const record = {
      guildId: member.guild.id,
      userId: user.id,
      username: this.resolveUsername(user),
      displayName: member.displayName,
      joinedAt: member.joinedAt ?? undefined,
      isSubscribed: subscriptionSet.has(user.id),
      consentStatus: consentStatusMap.get(user.id),
      lastScannedAt: new Date(),
      updatedAt: new Date(),
    };

    await GuildMemberIndex.findOneAndUpdate(
      { guildId: record.guildId, userId: record.userId },
      { $set: record },
      { upsert: true, new: true },
    ).exec();
  }

  private resolveChannelName(channel: GuildBasedChannel): string {
    if ('name' in channel && channel.name) {
      return channel.name;
    }

    return channel.id;
  }

  private resolveChannelType(channel: GuildBasedChannel): string {
    if (channel.isThread()) {
      return this.resolveThreadType(channel as ThreadChannel);
    }

    return ChannelType[channel.type] ?? 'Unknown';
  }

  private resolveThreadType(thread: ThreadChannel): string {
    return ChannelType[thread.type] ?? 'UnknownThread';
  }

  private resolveUsername(user: User): string {
    return user.tag ?? `${user.username}#${user.discriminator}`;
  }

  private async fetchManagedGuild(): Promise<Guild> {
    if (!this.client || !this.guildId) {
      throw new Error('GuildInventoryService not initialized');
    }

    const guild = await this.client.guilds.fetch(this.guildId);
    if (!guild) {
      throw new Error(`Guild ${this.guildId} not found`);
    }

    return guild;
  }

  private isManagedGuild(guildId: string): boolean {
    return guildId === this.guildId;
  }

  private hasThreadManager(channel: GuildBasedChannel): channel is GuildBasedChannel & { threads: any } {
    return typeof (channel as any)?.threads?.fetchActive === 'function';
  }

  private async isInventoryEmpty(guildId: string): Promise<boolean> {
    const [channelCount, memberCount] = await Promise.all([
      GuildChannelIndex.countDocuments({ guildId }).exec(),
      GuildMemberIndex.countDocuments({ guildId }).exec(),
    ]);

    return channelCount === 0 || memberCount === 0;
  }
}

type ScanReason = 'initial' | 'bootstrap' | 'nightly';

export const guildInventoryService = new GuildInventoryService();
