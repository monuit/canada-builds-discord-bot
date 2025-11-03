// MARK: - Todo Manager Service
// Provides scoped todo CRUD operations for channels and threads

import { Task, ITask } from '../models/Task';
import { logger } from '../utils/logger';

interface AddTaskOptions {
  guildId: string;
  channelId: string;
  threadId?: string;
  contextMessageId?: string;
  description: string;
  createdBy: string;
  assignedTo?: string;
}

class TodoManager {
  async addTask(options: AddTaskOptions): Promise<ITask> {
    const task = await Task.create({
      guildId: options.guildId,
      channelId: options.channelId,
      threadId: options.threadId,
      contextMessageId: options.contextMessageId,
      description: options.description,
      createdBy: options.createdBy,
      assignedTo: options.assignedTo,
      status: 'pending',
    });

    logger.info('Task created', {
      guildId: options.guildId,
      channelId: options.channelId,
      threadId: options.threadId,
      taskId: task.id,
    });

    return task;
  }

  async listTasks(
    guildId: string,
    channelId: string,
    threadId?: string,
    status: 'pending' | 'completed' | 'all' = 'pending',
    assignedTo?: string | null,
  ): Promise<ITask[]> {
    const filter: Record<string, unknown> = {
      guildId,
      channelId,
    };

    if (threadId) {
      filter.threadId = threadId;
    }

    if (status !== 'all') {
      filter.status = status;
    }

    if (assignedTo) {
      filter.assignedTo = assignedTo;
    }

    const tasks = await Task.find(filter).sort({ createdAt: -1 }).limit(25);
    return tasks;
  }

  async completeTask(guildId: string, taskId: string, completedBy: string): Promise<ITask | null> {
    let task: ITask | null = null;

    if (/^[0-9a-f]{24}$/i.test(taskId)) {
      task = await Task.findOne({ guildId, _id: taskId });
    }

    if (!task) {
      const recent = await Task.find({ guildId }).sort({ createdAt: -1 }).limit(50);
      task = recent.find(candidate => candidate.id.endsWith(taskId)) ?? null;
    }

    if (!task) {
      return null;
    }

    if (task.status === 'completed') {
      return task;
    }

    task.status = 'completed';
    task.completedAt = new Date();
    task.updatedAt = new Date();
    await task.save();

    logger.info('Task completed', { guildId, taskId, completedBy });
    return task;
  }

  formatTasks(tasks: ITask[]): string {
    if (tasks.length === 0) {
      return 'No tasks found for this channel/thread.';
    }

    return tasks
      .map(task => {
        const statusIcon = task.status === 'completed' ? '✅' : '📝';
        const assignee = task.assignedTo ? ` → <@${task.assignedTo}>` : '';
        const anchorUrl = this.buildJumpUrl(task);
        const locationLabel = task.threadId ? `<#${task.threadId}>` : `<#${task.channelId}>`;
        const createdStamp = `<t:${Math.floor(task.createdAt.getTime() / 1000)}:R>`;
        const link = anchorUrl ? `[jump](${anchorUrl})` : locationLabel;
        return `${statusIcon} \`${task.id}\` ${task.description}${assignee} · ${locationLabel} · ${createdStamp} · ${link}`;
      })
      .join('\n');
  }

  private buildJumpUrl(task: ITask): string | null {
    const channelId = task.threadId ?? task.channelId;

    if (!channelId) {
      return null;
    }

    if (task.contextMessageId) {
      return `https://discord.com/channels/${task.guildId}/${channelId}/${task.contextMessageId}`;
    }

    return `https://discord.com/channels/${task.guildId}/${channelId}`;
  }
}

export const todoManager = new TodoManager();
