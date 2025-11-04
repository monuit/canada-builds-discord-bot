// MARK: - Main Bot Entry Point
// Discord bot initialization and event handling

import 'dotenv/config';
import { ButtonInteraction, Client, Events, GatewayIntentBits, MessageFlags, Partials, REST, Routes, StringSelectMenuInteraction } from 'discord.js';
import mongoose from 'mongoose';
import { messageIndexer } from './services/MessageIndexer';
import { digestGenerator } from './services/DigestGenerator';
import { webhookManager } from './services/WebhookManager';
import { errorNotifier } from './services/ErrorNotifier';
import { notificationService } from './services/NotificationService';
import { cronManager } from './services/CronManager';
import { onboardingManager } from './services/OnboardingManager';
import { threadTagService } from './services/ThreadTagService';
import { bookmarkRelayService } from './services/BookmarkRelayService';
import { guildFeatureConfigService } from './services/GuildFeatureConfigService';
import { topicService } from './services/TopicService';
import { guildInventoryService } from './services/GuildInventoryService';
import { presenceManager } from './services/PresenceManager';
import { reminderService } from './services/ReminderService';
import { initializeHealthServer, startHealthServer, stopHealthServer, metrics } from './health';
import { autocompleteHandlers, commands, handlers } from './commands';
import { handleCompletionSelect } from './commands/todo';
import { logger } from './utils/logger';

// MARK: - Configuration
const TOKEN = process.env.DISCORD_TOKEN!;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID!;
const GUILD_ID = process.env.DISCORD_GUILD_ID!;
const MONGODB_URI = process.env.MONGODB_URI!;
const OWNER_IDS: string[] = (process.env.DISCORD_OWNER_IDS ?? '')
  .split(',')
  .map(id => id.trim())
  .filter(id => id.length > 0);

// Validate required environment variables
if (!TOKEN || !CLIENT_ID || !GUILD_ID || !MONGODB_URI) {
  logger.error('Missing required environment variables', {
    hasToken: !!TOKEN,
    hasClientId: !!CLIENT_ID,
    hasGuildId: !!GUILD_ID,
    hasMongoUri: !!MONGODB_URI,
  });
  process.exit(1);
}

// MARK: - Discord Client Setup
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent, // PRIVILEGED INTENT
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

// MARK: - MongoDB Connection
async function connectMongoDB(): Promise<void> {
  const maxRetries = 5;
  let retries = 0;

  while (retries < maxRetries) {
    try {
      await mongoose.connect(MONGODB_URI, {
        maxPoolSize: 10,
        minPoolSize: 2,
        serverSelectionTimeoutMS: 5000,
      });
      logger.info('MongoDB connected successfully');
      return;
    } catch (error: any) {
      retries++;
      logger.error(`MongoDB connection attempt ${retries} failed`, {
        error: error.message,
        retries,
        maxRetries,
      });

      if (retries >= maxRetries) {
        throw new Error('Failed to connect to MongoDB after maximum retries');
      }

      // Exponential backoff
      const delay = Math.min(1000 * Math.pow(2, retries), 10000);
      logger.info(`Retrying MongoDB connection in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

// MongoDB connection events
mongoose.connection.on('connected', () => {
  logger.info('Mongoose connected to MongoDB');
});

mongoose.connection.on('error', (error) => {
  logger.error('Mongoose connection error', { error: error.message });
});

mongoose.connection.on('disconnected', () => {
  logger.warn('Mongoose disconnected from MongoDB');
});

// MARK: - Event: Client Ready
client.once(Events.ClientReady, async (readyClient) => {
  logger.info('╔════════════════════════════════════════════════╗');
  logger.info('║   BUILD CANADA DISCORD BOT STARTING UP        ║');
  logger.info('╚════════════════════════════════════════════════╝');
  logger.info(`Bot logged in as: ${readyClient.user.tag}`);
  logger.info(`Guilds: ${readyClient.guilds.cache.size}`);
  logger.info(`Commands: ${commands.length}`);

  try {
    // Initialize all services
    logger.info('Initializing services...');
    
    await messageIndexer.initialize(GUILD_ID);
    logger.info('✓ MessageIndexer initialized');

    await digestGenerator.initialize(client);
    logger.info('✓ DigestGenerator initialized');

    await webhookManager.initialize(client);
    logger.info('✓ WebhookManager initialized');

    await errorNotifier.initialize(client);
    logger.info('✓ ErrorNotifier initialized');

    await notificationService.initialize(client);
    logger.info('✓ NotificationService initialized');
    await topicService.initialize();
    logger.info('✓ TopicService initialized');
    await guildFeatureConfigService.initialize(GUILD_ID);
    threadTagService.initialize(client);
    onboardingManager.initialize(client);
    bookmarkRelayService.initialize(client);
    await guildInventoryService.initialize(client, GUILD_ID);
    logger.info('✓ GuildInventoryService initialized');

    presenceManager.initialize(client, GUILD_ID);
    logger.info('✓ PresenceManager initialized');

    reminderService.initialize(client);
    logger.info('✓ ReminderService initialized');

    await onboardingManager.resumePendingSessions(GUILD_ID);

    await cronManager.initialize();
    logger.info('✓ CronManager initialized');

    // Register guild commands
    logger.info('Registering slash commands...');
    const rest = new REST({ version: '10' }).setToken(TOKEN);

    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands }
    );
    logger.info(`✓ Registered ${commands.length} slash commands`);

    // Start health server
    initializeHealthServer(client);
    await startHealthServer();
    logger.info('✓ Health server started');

    logger.info('╔════════════════════════════════════════════════╗');
    logger.info('║   BOT READY AND OPERATIONAL                    ║');
    logger.info('╚════════════════════════════════════════════════╝');
  } catch (error: any) {
    logger.error('Failed to initialize bot services', {
      error: error.message,
      stack: error.stack,
    });
    await errorNotifier.notifyCritical(GUILD_ID, error, {
      context: 'Bot initialization failed',
    });
    process.exit(1);
  }
});

// MARK: - Event: Message Create
client.on(Events.MessageCreate, async (message) => {
  // Ignore bot messages
  if (message.author.bot) {
    return;
  }

  try {
    const indexed = await messageIndexer.indexMessage(message);
    if (indexed) {
      metrics.messagesIndexed++;
      logger.debug('Message indexed', {
        messageId: message.id,
        channelId: message.channelId,
        hasKeywords: indexed.matchedKeywords?.length > 0,
      });
    }
  } catch (error: any) {
    logger.error('Failed to index message', {
      messageId: message.id,
      channelId: message.channelId,
      error: error.message,
    });
    await errorNotifier.notify(GUILD_ID, error, {
      context: 'Message indexing',
      messageId: message.id,
    });
  }
});

// MARK: - Event: Interaction Create
client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isAutocomplete()) {
    const handler = autocompleteHandlers.get(interaction.commandName);

    if (!handler) {
      await interaction.respond([]);
      return;
    }

    try {
      await handler(interaction);
    } catch (error: any) {
      logger.error('Autocomplete execution failed', {
        commandName: interaction.commandName,
        userId: interaction.user.id,
        error: error.message,
      });

      try {
        await interaction.respond([]);
      } catch (respondError: any) {
        logger.warn('Failed to respond to autocomplete fallback', {
          commandName: interaction.commandName,
          error: respondError.message,
        });
      }
    }

    return;
  }

  if (interaction.isButton() || interaction.isStringSelectMenu()) {
    const handled = await onboardingManager.handleComponentInteraction(
      interaction as ButtonInteraction | StringSelectMenuInteraction,
    );
    if (handled) {
      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'todo:complete') {
      await handleCompletionSelect(interaction);
      return;
    }
  }

  if (!interaction.isChatInputCommand()) {
    return;
  }

  const commandName = interaction.commandName;
  const handler = handlers.get(commandName);

  if (!handler) {
    logger.warn('Unknown command', { commandName });
    await interaction.reply({
      content: '❌ Unknown command.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Check permissions for admin commands
  const adminCommands = ['admin-clear-user', 'admin-remove-channel', 'admin-list-channels', 'admin-config', 'admin-topics'];
  if (adminCommands.includes(commandName)) {
    const isOwnerOverride = OWNER_IDS.includes(interaction.user.id);
    if (!isOwnerOverride && !interaction.memberPermissions?.has('Administrator')) {
      await interaction.reply({
        content: '❌ You need Administrator permissions to use this command.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
  }

  try {
    logger.info('Command executed', {
      commandName,
      userId: interaction.user.id,
      guildId: interaction.guildId,
    });

    await handler(interaction);
  } catch (error: any) {
    logger.error('Command execution failed', {
      commandName,
      userId: interaction.user.id,
      error: error.message,
      stack: error.stack,
    });

    const errorMessage = '❌ An error occurred while executing this command. The team has been notified.';

    if (interaction.deferred) {
      await interaction.editReply(errorMessage);
    } else if (interaction.replied) {
      await interaction.followUp({
        content: errorMessage,
        flags: MessageFlags.Ephemeral,
      });
    } else {
      await interaction.reply({
        content: errorMessage,
        flags: MessageFlags.Ephemeral,
      });
    }

    await errorNotifier.notify(GUILD_ID, error, {
      context: `Command: ${commandName}`,
      userId: interaction.user.id,
    });
  }
});

client.on(Events.GuildMemberAdd, async (member) => {
  try {
    await onboardingManager.handleMemberJoin(member);
    await guildInventoryService.handleMemberJoin(member);
  } catch (error: any) {
    logger.error('GuildMemberAdd onboarding failed', {
      guildId: member.guild.id,
      userId: member.id,
      error: error.message,
    });
  }
});

client.on(Events.ChannelCreate, async (channel) => {
  try {
    if (!('guild' in channel)) {
      return;
    }

    await guildInventoryService.handleChannelCreate(channel);
  } catch (error: any) {
    logger.error('Channel create inventory capture failed', {
      channelId: channel.id,
      error: error.message,
    });
  }
});

client.on(Events.ThreadCreate, async (thread) => {
  try {
    await guildInventoryService.handleThreadCreate(thread);
  } catch (error: any) {
    logger.error('Thread create inventory capture failed', {
      threadId: thread.id,
      error: error.message,
    });
  }
});

client.on(Events.MessageReactionAdd, async (reaction, user) => {
  try {
    await bookmarkRelayService.handleReactionAdd(reaction, user);
  } catch (error: any) {
    logger.error('Highlight relay failed on reaction add', {
      messageId: reaction.message.id,
      error: error.message,
    });
  }
});

client.on(Events.MessageReactionRemove, async (reaction, user) => {
  try {
    await bookmarkRelayService.handleReactionRemove(reaction, user);
  } catch (error: any) {
    logger.error('Highlight relay failed on reaction remove', {
      messageId: reaction.message.id,
      error: error.message,
    });
  }
});

// MARK: - Graceful Shutdown
async function shutdown(signal: string): Promise<void> {
  logger.info(`Received ${signal}, shutting down gracefully...`);

  try {
    // Stop cron jobs
    cronManager.shutdown();
    logger.info('✓ Cron manager stopped');

    guildInventoryService.shutdown();
    logger.info('✓ Guild inventory scheduler stopped');

    presenceManager.shutdown();
    logger.info('✓ Presence manager stopped');

    reminderService.shutdown();
    logger.info('✓ Reminder service stopped');

    // Destroy Discord client
    client.destroy();
    logger.info('✓ Discord client destroyed');

    // Close MongoDB connection
    await mongoose.connection.close();
    logger.info('✓ MongoDB connection closed');

    // Stop health server
    await stopHealthServer();
    logger.info('✓ Health server stopped');

    logger.info('Shutdown complete');
    process.exit(0);
  } catch (error: any) {
    logger.error('Error during shutdown', {
      error: error.message,
      stack: error.stack,
    });
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// MARK: - Uncaught Exception Handler
process.on('uncaughtException', async (error) => {
  logger.error('Uncaught exception', {
    error: error.message,
    stack: error.stack,
  });

  try {
    await errorNotifier.notifyCritical(GUILD_ID, error, {
      context: 'uncaughtException',
    });
  } catch (notifyError: any) {
    logger.error('Failed to notify about uncaught exception', {
      error: notifyError.message,
    });
  }

  process.exit(1);
});

process.on('unhandledRejection', async (reason: any) => {
  logger.error('Unhandled promise rejection', {
    reason: reason?.message || String(reason),
    stack: reason?.stack,
  });

  try {
    await errorNotifier.notifyCritical(GUILD_ID, reason, {
      context: 'unhandledRejection',
    });
  } catch (notifyError: any) {
    logger.error('Failed to notify about unhandled rejection', {
      error: notifyError.message,
    });
  }

  process.exit(1);
});

// MARK: - Start Bot
async function start(): Promise<void> {
  try {
    logger.info('Starting Build Canada Discord Bot...');

    // Connect to MongoDB first
    await connectMongoDB();

    // Then login to Discord
    await client.login(TOKEN);
  } catch (error: any) {
    logger.error('Failed to start bot', {
      error: error.message,
      stack: error.stack,
    });
    process.exit(1);
  }
}

// Start the bot
start();
