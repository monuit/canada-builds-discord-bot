// MARK: - Commands Index
// Export command builders and handlers

import { ChatInputCommandInteraction } from 'discord.js';

// Import all command modules
import * as subscribe from './subscribe';
import * as unsubscribe from './unsubscribe';
import * as mySubscriptions from './mySubscriptions';
import * as digestNow from './digestNow';
import * as help from './help';
import * as stats from './stats';
import * as schedule from './schedule';
import * as unschedule from './unschedule';
import * as adminClearUser from './adminClearUser';
import * as adminRemoveChannel from './adminRemoveChannel';
import * as adminListChannels from './adminListChannels';
import * as onboarding from './onboarding';
import * as threadTag from './threadTag';
import * as where from './where';
import * as todo from './todo';
import * as adminConfig from './adminConfig';
import * as adminTopics from './adminTopics';
import * as adminChannelWeight from './adminChannelWeight';

// Type definition for command handlers
export type CommandHandler = (interaction: ChatInputCommandInteraction) => Promise<void>;

// Export commands array for deployment
export const commands: any[] = [
  subscribe.data.toJSON(),
  unsubscribe.data.toJSON(),
  mySubscriptions.data.toJSON(),
  digestNow.data.toJSON(),
  help.data.toJSON(),
  stats.data.toJSON(),
  schedule.data.toJSON(),
  unschedule.data.toJSON(),
  adminClearUser.data.toJSON(),
  adminRemoveChannel.data.toJSON(),
  adminListChannels.data.toJSON(),
  onboarding.data.toJSON(),
  threadTag.data.toJSON(),
  where.data.toJSON(),
  todo.data.toJSON(),
  adminConfig.data.toJSON(),
  adminTopics.data.toJSON(),
  adminChannelWeight.data.toJSON(),
];

// Export handlers map for execution
export const handlers = new Map<string, CommandHandler>([
  ['subscribe', subscribe.execute],
  ['unsubscribe', unsubscribe.execute],
  ['my-subscriptions', mySubscriptions.execute],
  ['digest-now', digestNow.execute],
  ['help', help.execute],
  ['stats', stats.execute],
  ['schedule', schedule.execute],
  ['unschedule', unschedule.execute],
  ['admin-clear-user', adminClearUser.execute],
  ['admin-remove-channel', adminRemoveChannel.execute],
  ['admin-list-channels', adminListChannels.execute],
  ['onboarding', onboarding.execute],
  ['thread-tag', threadTag.execute],
  ['where', where.execute],
  ['todo', todo.execute],
  ['admin-config', adminConfig.execute],
  ['admin-topics', adminTopics.execute],
  ['admin-channel-weight', adminChannelWeight.execute],
]);

/**
 * Get command handler by name
 */
export function getCommandHandler(commandName: string): CommandHandler | undefined {
  return handlers.get(commandName);
}

/**
 * Check if command exists
 */
export function hasCommand(commandName: string): boolean {
  return handlers.has(commandName);
}

/**
 * Get all command names
 */
export function getCommandNames(): string[] {
  return Array.from(handlers.keys());
}
