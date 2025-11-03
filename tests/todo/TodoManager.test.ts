import { beforeEach, describe, expect, it, vi } from 'vitest';

const findMock = vi.fn();
const findOneMock = vi.fn();

vi.mock('../../src/models/Task', () => ({
  __esModule: true,
  Task: {
    create: vi.fn(),
    find: (...args: unknown[]) => findMock(...args),
    findOne: (...args: unknown[]) => findOneMock(...args),
    findOneAndUpdate: vi.fn(),
  },
}));

import { todoManager } from '../../src/services/TodoManager';
import { TaskStatus } from '../../src/models/Task';

const buildChain = (items: any[]) => ({
  sort: vi.fn().mockReturnValue({
    limit: vi.fn().mockResolvedValue(items),
  }),
});

describe('TodoManager', () => {
  beforeEach(() => {
    findMock.mockReset();
    findOneMock.mockReset();
  });

  it('formats tasks with status icons and metadata', () => {
    const formatted = todoManager.formatTasks([
      {
        id: 'abc123',
        description: 'Finish deck',
        status: 'pending',
        channelId: 'chan',
        guildId: 'guild',
        createdBy: 'user',
        updatedAt: new Date(),
        createdAt: new Date(),
      },
      {
        id: 'xyz789',
        description: 'Review PR',
        status: 'completed',
        channelId: 'chan',
        guildId: 'guild',
        createdBy: 'user',
        updatedAt: new Date(),
        createdAt: new Date(),
        threadId: 'thread',
        assignedTo: 'reviewer',
      },
    ] as any);

    expect(formatted).toContain('📝 `abc123`');
    expect(formatted).toContain('✅ `xyz789`');
    expect(formatted).toContain('<@reviewer>');
    expect(formatted).toContain('<#chan>');
    expect(formatted).toContain('<#thread>');
    expect(formatted).toContain('→ <@reviewer>');
    expect(formatted).toContain('https://discord.com/channels/guild/thread');
  });

  it('returns null when task cannot be resolved', async () => {
    findOneMock.mockResolvedValue(null);
    findMock.mockReturnValue(buildChain([]));

    const result = await todoManager.completeTask('guild', 'does-not-exist', 'user');

    expect(result).toBeNull();
  });

  it('completes a task using suffix matching', async () => {
    const task = {
      id: 'deadbeefcafebabef00d1234',
      guildId: 'guild',
      status: 'pending' as TaskStatus,
      save: vi.fn(async function save(this: any) {
        return this;
      }),
    };

    findOneMock.mockResolvedValue(null);
    findMock.mockReturnValue(buildChain([task]));

    const result = await todoManager.completeTask('guild', '1234', 'user');

    expect(result?.status).toBe('completed');
    expect(result?.completedAt).toBeInstanceOf(Date);
    expect(task.save).toHaveBeenCalled();
  });
});
