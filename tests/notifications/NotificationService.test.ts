import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findOneMock: vi.fn(),
  findMock: vi.fn(),
  historyCreateMock: vi.fn(),
  generateForUserMock: vi.fn(),
  generateForKeywordsMock: vi.fn(),
  digestConfigFindOneMock: vi.fn(),
}));

vi.mock('../../src/models/UserSubscription', () => ({
  __esModule: true,
  UserSubscription: {
    findOne: (...args: unknown[]) => mocks.findOneMock(...args),
    find: (...args: unknown[]) => mocks.findMock(...args),
  },
}));

vi.mock('../../src/models/DigestHistory', () => ({
  __esModule: true,
  DigestHistory: {
    create: (...args: unknown[]) => mocks.historyCreateMock(...args),
  },
}));

vi.mock('../../src/services/DigestGenerator', () => ({
  __esModule: true,
  digestGenerator: {
    generateForUser: (...args: unknown[]) => mocks.generateForUserMock(...args),
    generateForKeywords: (...args: unknown[]) => mocks.generateForKeywordsMock(...args),
  },
}));

vi.mock('../../src/models/DigestConfig', () => ({
  __esModule: true,
  DigestConfig: {
    findOne: (...args: unknown[]) => mocks.digestConfigFindOneMock(...args),
  },
}));

vi.mock('../../src/utils/rateLimiter', () => ({
  RateLimiter: class {
    async schedule<T>(task: () => Promise<T>): Promise<T> {
      return task();
    }
  },
}));

let NotificationServiceClass: typeof import('../../src/services/NotificationService').NotificationService;

beforeAll(async () => {
  ({ NotificationService: NotificationServiceClass } = await import('../../src/services/NotificationService'));
});

describe('NotificationService', () => {
  const sendMock = vi.fn();
  const fetchMock = vi.fn();
  const channelFetchMock = vi.fn();
  const channelSendMock = vi.fn();

  beforeEach(() => {
    mocks.findOneMock.mockReset();
    mocks.findMock.mockReset();
    mocks.historyCreateMock.mockReset();
    mocks.generateForUserMock.mockReset();
    mocks.generateForKeywordsMock.mockReset();
    mocks.digestConfigFindOneMock.mockReset();
    sendMock.mockReset();
    fetchMock.mockReset();
    channelFetchMock.mockReset();
    channelSendMock.mockReset();

    fetchMock.mockResolvedValue({
      send: sendMock.mockResolvedValue(undefined),
    });
    channelFetchMock.mockResolvedValue(null);
    mocks.digestConfigFindOneMock.mockResolvedValue(null);
  });

  const buildService = () => {
    const service = new NotificationServiceClass();
    service.initialize({
      users: {
        fetch: fetchMock,
      },
      channels: {
        fetch: channelFetchMock,
      },
    } as any);
    return service;
  };

  it('persists digest analytics when notifying a user', async () => {
    const subscription = {
      userId: 'user-1',
      guildId: 'guild-1',
      keywords: ['policy', 'energy'],
      dmEnabled: true,
      cooldownHours: 24,
      lastNotified: new Map<string, Date>(),
      save: vi.fn(async () => undefined),
    };

    mocks.findOneMock.mockResolvedValue(subscription);

    const digestResult = {
      embeds: [{ data: { title: 'Digest' } }] as any,
      threadDetails: [
        {
          primaryTopic: 'policy',
          channelId: 'chan-1',
          threadId: 'thread-1',
          messageCount: 5,
          topics: [
            { slug: 'policy', weight: 6.2 },
            { slug: 'climate', weight: 3.4 },
          ],
        },
      ],
      stats: {
        messageCount: 5,
        topicCount: 1,
        tokensUsed: { input: 16, output: 8 },
        cost: 0.27,
        threadScores: [
          { key: 'thread-1', score: 12.34, participants: 4, messages: 5, decisionVerbHits: 2 },
        ],
        topTopics: [{ slug: 'policy', count: 4 }],
        clusterLabels: ['policy · climate'],
      },
    };

    mocks.generateForKeywordsMock.mockResolvedValue(digestResult);
    mocks.historyCreateMock.mockResolvedValue(undefined);

    const service = buildService();
    const result = await service.notifyUser('user-1', 'guild-1', 24);

    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith('user-1');
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(subscription.save).toHaveBeenCalledTimes(1);
    expect(subscription.lastNotified.get('policy')).toBeInstanceOf(Date);
    expect(subscription.lastNotified.get('energy')).toBeInstanceOf(Date);

    expect(mocks.historyCreateMock).toHaveBeenCalledTimes(1);
    const payload = mocks.historyCreateMock.mock.calls[0][0] as any;

    expect(payload.threadScores).toEqual(digestResult.stats.threadScores);
    expect(payload.topTopics).toEqual(digestResult.stats.topTopics);
    expect(payload.clusterLabels).toEqual(digestResult.stats.clusterLabels);
    expect(payload.tokensUsed).toEqual(digestResult.stats.tokensUsed);
    expect(payload.costUSD).toBe(digestResult.stats.cost);

    expect(payload.topicClusters).toEqual([
      {
        keyword: 'policy',
        messageCount: 5,
        crossRefs: [
          { keyword: 'policy', count: 6 },
          { keyword: 'climate', count: 3 },
        ],
      },
    ]);
  });

  it('delivers a guild channel digest when configured', async () => {
    const subscription = {
      userId: 'user-1',
      guildId: 'guild-1',
      keywords: ['policy'],
      dmEnabled: true,
      cooldownHours: 24,
      lastNotified: new Map<string, Date>(),
      save: vi.fn(async () => undefined),
    };

    mocks.findMock.mockResolvedValue([subscription]);
    mocks.findOneMock.mockResolvedValue(subscription);

    const dmDigestResult = {
      embeds: [{ data: { title: 'DM Digest' } }] as any,
      threadDetails: [],
      stats: {
        messageCount: 1,
        topicCount: 1,
        tokensUsed: { input: 10, output: 5 },
        cost: 0.1,
        threadScores: [],
        topTopics: [],
        clusterLabels: [],
      },
    };

    const channelDigestResult = {
      embeds: [{ data: { title: 'Channel Digest' } }] as any,
      threadDetails: [],
      stats: {
        messageCount: 2,
        topicCount: 1,
        tokensUsed: { input: 20, output: 10 },
        cost: 0.2,
        threadScores: [],
        topTopics: [],
        clusterLabels: [],
      },
    };

    mocks.generateForKeywordsMock.mockResolvedValue(dmDigestResult);
    mocks.generateForUserMock.mockResolvedValue(channelDigestResult);

    mocks.historyCreateMock.mockResolvedValue(undefined);

    const sendableChannel = {
      isTextBased: () => true,
      send: channelSendMock.mockResolvedValue(undefined),
    };

    channelFetchMock.mockResolvedValue(sendableChannel);

    mocks.digestConfigFindOneMock.mockResolvedValue({
      guildId: 'guild-1',
      digestChannelId: 'channel-1',
    });

    const service = buildService();
    await service.notifyAllSubscribers('guild-1', 24);

    expect(channelFetchMock).toHaveBeenCalledWith('channel-1');
    expect(channelSendMock).toHaveBeenCalledTimes(1);

    expect(mocks.generateForKeywordsMock).toHaveBeenCalledTimes(1);
    expect(mocks.generateForUserMock).toHaveBeenCalledTimes(1);
    const channelCallArgs = mocks.generateForUserMock.mock.calls[0];
    expect(channelCallArgs?.[2]).toEqual(['policy']);

    expect(mocks.historyCreateMock).toHaveBeenCalledTimes(2);
    const channelHistory = mocks.historyCreateMock.mock.calls[1][0] as any;
    expect(channelHistory.deliveryMethod).toBe('channel');
    expect(channelHistory.guildId).toBe('guild-1');
    expect(channelHistory.recipientUserId).toBe('channel:channel-1');
  });
});
