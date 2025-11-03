// MARK: - Todo Command
// Lightweight task tracking scoped to channels and threads

import { ActionRowBuilder, ChatInputCommandInteraction, MessageFlags, SlashCommandBuilder, StringSelectMenuBuilder, StringSelectMenuInteraction } from 'discord.js';
import type { Guild } from 'discord.js';
import { todoManager } from '../services/TodoManager';
import { logger } from '../utils/logger';
import type { ITask } from '../models/Task';

const EPHEMERAL_TTL_MS = 30_000;
type EphemeralInteraction = ChatInputCommandInteraction | StringSelectMenuInteraction;

export const data = new SlashCommandBuilder()
  .setName('todo')
  .setDescription('Track lightweight tasks scoped to the current channel or thread')
  .addSubcommand(sub =>
    sub
      .setName('add')
      .setDescription('Add a new todo for this channel or thread')
      .addStringOption(option =>
        option
          .setName('description')
          .setDescription('What needs to get done?')
          .setRequired(true),
      )
      .addUserOption(option =>
        option
          .setName('assign')
          .setDescription('Assign the task to someone')
          .setRequired(false),
      )
      .addStringOption(option =>
        option
          .setName('message')
          .setDescription('Optional message link or ID to anchor this task')
          .setRequired(false),
      ),
  )
  .addSubcommand(sub =>
    sub
      .setName('list')
      .setDescription('List open (or completed) todos for this channel or thread')
      .addStringOption(option =>
        option
          .setName('status')
          .setDescription('Filter by status')
          .setRequired(false)
          .addChoices(
            { name: 'Pending', value: 'pending' },
            { name: 'Completed', value: 'completed' },
            { name: 'All', value: 'all' },
          ),
      )
      .addUserOption(option =>
        option
          .setName('assigned')
          .setDescription('Only show tasks assigned to this member')
          .setRequired(false),
      ),
  )
  .addSubcommand(sub =>
    sub
      .setName('done')
      .setDescription('Mark a todo as completed from a picker'),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({
      content: '❌ This command is only available inside a server.',
      flags: MessageFlags.Ephemeral,
    });
    scheduleEphemeralCleanup(interaction);
    return;
  }

  const sub = interaction.options.getSubcommand(true) as 'add' | 'list' | 'done';
  const scope = {
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    threadId: interaction.channel?.isThread() ? interaction.channelId : undefined,
  };

  try {
    if (sub === 'add') {
      const description = interaction.options.getString('description', true);
      const assignUser = interaction.options.getUser('assign');
      const messageReference = interaction.options.getString('message');
      const contextMessageId = await resolveMessageAnchor(messageReference, interaction);

      const task = await todoManager.addTask({
        ...scope,
        description,
        createdBy: interaction.user.id,
        assignedTo: assignUser?.id,
        contextMessageId,
      });

      let content = `✅ Task created with ID \`${task.id}\`\n`;
      content += `• Description: ${description}\n`;
      if (assignUser) {
        content += `• Assigned to: <@${assignUser.id}>\n`;
      }
      content += 'Use `/todo list` to review and share task IDs.';

      await interaction.reply({
        content,
        flags: MessageFlags.Ephemeral,
      });
      scheduleEphemeralCleanup(interaction);
      return;
    }

    if (sub === 'list') {
      const status = interaction.options.getString('status') as 'pending' | 'completed' | 'all' | null;
      const assignedFilter = interaction.options.getUser('assigned');
      const tasks = await todoManager.listTasks(
        scope.guildId,
        scope.channelId,
        scope.threadId,
        status ?? 'pending',
        assignedFilter?.id ?? null,
      );
      const body = todoManager.formatTasks(tasks);
      const header = `📋 Tasks (${status ?? 'pending'})` + (assignedFilter ? ` for <@${assignedFilter.id}>` : '');

      await interaction.reply({
        content: `${header}\n${body}\n\nUse \`/todo done\` to complete a task from the picker.`,
        flags: MessageFlags.Ephemeral,
      });
      scheduleEphemeralCleanup(interaction);
      return;
    }

    if (sub === 'done') {
      const tasks = await todoManager.listTasks(
        scope.guildId,
        scope.channelId,
        scope.threadId,
        'pending',
        null,
      );

      if (tasks.length === 0) {
        await interaction.reply({
          content: '📋 No open tasks found for this channel or thread. Try `/todo add` to create one first.',
          flags: MessageFlags.Ephemeral,
        });
        scheduleEphemeralCleanup(interaction);
        return;
      }

      const assigneeNames = await fetchDisplayNames(
        interaction.guild,
        tasks
          .map(task => task.assignedTo)
          .filter((id): id is string => Boolean(id)),
      );

      const select = new StringSelectMenuBuilder()
        .setCustomId('todo:complete')
        .setPlaceholder('Select a task to mark as completed')
        .setMinValues(1)
        .setMaxValues(1);

      tasks.slice(0, 25).forEach(task => {
        const normalizedDescription = task.description.replace(/\s+/g, ' ').trim();
        const label = normalizedDescription.length > 80
          ? `${normalizedDescription.slice(0, 77)}…`
          : normalizedDescription;
        const assignedName = task.assignedTo
          ? assigneeNames.get(task.assignedTo) ?? `@${task.assignedTo}`
          : 'Unassigned';
        const assignment = task.assignedTo ? `Assigned: ${assignedName}` : 'Unassigned';
        const suffix = task.id.slice(-6);
        const locationSummary = buildLocationSummary(task);

        select.addOptions({
          label: label || `Task ${suffix}`,
          value: task.id,
          description: truncate(`ID ${suffix} • ${assignment} • Loc ${locationSummary}`, 100),
        });
      });

      const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);

      await interaction.reply({
        content: 'Select the task you want to complete. This picker shows the 25 most recent open tasks here.',
        components: [row],
        flags: MessageFlags.Ephemeral,
      });
      scheduleEphemeralCleanup(interaction);
      return;
    }
  } catch (error: any) {
    logger.error('Todo command failed', {
      guildId: interaction.guildId,
      userId: interaction.user.id,
      sub,
      error: error.message,
    });

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({
        content: '❌ Something went wrong while processing your todo command. Please try again later.',
        components: [],
      });
    } else {
      await interaction.reply({
        content: '❌ Something went wrong while processing your todo command. Please try again later.',
        flags: MessageFlags.Ephemeral,
      });
    }
    scheduleEphemeralCleanup(interaction);
  }
}

export async function handleCompletionSelect(interaction: StringSelectMenuInteraction): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({
      content: '❌ Unable to mark tasks outside a server context.',
      flags: MessageFlags.Ephemeral,
    });
    scheduleEphemeralCleanup(interaction);
    return;
  }

  const selection = interaction.values.at(0);

  if (!selection) {
    await interaction.update({
      content: '⚠️ No task selected. Try again with `/todo done`.',
      components: [],
    });
    scheduleEphemeralCleanup(interaction);
    return;
  }

  try {
    const task = await todoManager.completeTask(interaction.guildId, selection, interaction.user.id);

    if (!task) {
      await interaction.update({
        content: '⚠️ That task could not be found or was already completed. Use `/todo list` to refresh.',
        components: [],
      });
      scheduleEphemeralCleanup(interaction);
      return;
    }

    const assigneeName = await fetchDisplayName(interaction.guild, task.assignedTo);
    const assignmentLine = task.assignedTo
      ? `• Assigned to: <@${task.assignedTo}>${assigneeName ? ` (${assigneeName})` : ''}`
      : '• Assigned to: (unassigned)';

    const channelMention = `<#${task.channelId}>`;
    const locationLine = task.threadId
      ? `• Location: <#${task.threadId}> (in ${channelMention})`
      : `• Location: ${channelMention}`;

    const messageLines = [
      `✅ Marked task \`${task.id}\` as completed.`,
      `• Description: ${task.description}`,
      assignmentLine,
      locationLine,
      '',
      'Run `/todo list status:pending` to review the remaining open work.',
    ];

    await interaction.update({
      content: messageLines.join('\n'),
      components: [],
    });
    scheduleEphemeralCleanup(interaction);
  } catch (error: any) {
    logger.error('Todo completion select failed', {
      guildId: interaction.guildId,
      userId: interaction.user.id,
      error: error.message,
    });

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({
        content: '❌ Something went wrong while closing that task. Please try again in a moment.',
        components: [],
      });
    } else {
      await interaction.reply({
        content: '❌ Something went wrong while closing that task. Please try again in a moment.',
        flags: MessageFlags.Ephemeral,
      });
    }
    scheduleEphemeralCleanup(interaction);
  }
}

async function resolveMessageAnchor(
  reference: string | null,
  interaction: ChatInputCommandInteraction,
): Promise<string | undefined> {
  const channel = interaction.channel;

  if (!channel || !channel.isTextBased()) {
    return undefined;
  }

  if (reference) {
    const linkMatch = reference.match(/https?:\/\/discord\.com\/channels\/(\d+)\/(\d+)\/(\d+)/i);

    if (linkMatch) {
      const [, guildId, channelId, messageId] = linkMatch;
      if (guildId === interaction.guildId && channelId === channel.id) {
        return messageId;
      }
    }

    if (/^\d{16,21}$/u.test(reference)) {
      return reference;
    }
  }

  try {
    const messages = await channel.messages.fetch({ limit: 1 });
    const lastMessage = messages.first();
    return lastMessage?.id;
  } catch (error) {
    logger.warn('Failed to resolve message anchor for todo', {
      guildId: interaction.guildId,
      userId: interaction.user.id,
      error: (error as Error).message,
    });
  }

  return undefined;
}

function buildLocationSummary(task: ITask): string {
  if (task.threadId) {
    return `<#${task.threadId}> in <#${task.channelId}>`;
  }
  return `<#${task.channelId}>`;
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, Math.max(0, maxLength - 1))}…`;
}

function scheduleEphemeralCleanup(interaction: EphemeralInteraction, delayMs = EPHEMERAL_TTL_MS): void {
  setTimeout(() => {
    interaction.deleteReply().catch(() => undefined);
  }, delayMs);
}

async function fetchDisplayNames(guild: Guild | null, userIds: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (!guild || userIds.length === 0) {
    return names;
  }

  const uniqueIds = Array.from(new Set(userIds));

  try {
    const members = await guild.members.fetch({ user: uniqueIds });
    members.forEach(member => {
      names.set(member.id, member.displayName);
    });
  } catch (error) {
    logger.warn('Failed to resolve assignee display names', {
      guildId: guild.id,
      userIds,
      error: (error as Error).message,
    });
  }

  return names;
}

async function fetchDisplayName(guild: Guild | null, userId?: string): Promise<string | null> {
  if (!guild || !userId) {
    return null;
  }

  try {
    const member = await guild.members.fetch(userId);
    return member.displayName;
  } catch (error) {
    logger.warn('Failed to resolve assignee display name', {
      guildId: guild.id,
      userId,
      error: (error as Error).message,
    });
    return null;
  }
}
