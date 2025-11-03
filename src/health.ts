// MARK: - Health Check Server
// Express server for Railway health monitoring

import express, { Request, Response } from 'express';
import mongoose from 'mongoose';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import { Client } from 'discord.js';
import { UserSubscription } from './models/UserSubscription';
import { cronManager } from './services/CronManager';
import { logger } from './utils/logger';

const app = express();
const DEFAULT_PORT = Number(process.env.PORT) || 3000;

let discordClient: Client | null = null;
let server: Server | null = null;
let activePort: number | null = null;

// Global counters
export const metrics = {
  messagesIndexed: 0,
  digestsSent: 0,
};

/**
 * Initialize health server with Discord client reference
 */
export function initializeHealthServer(client: Client): void {
  discordClient = client;
}

/**
 * Health check endpoint
 */
app.get('/health', async (req: Request, res: Response) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    checks: {
      mongodb: 'unknown',
      discord: 'unknown',
    },
  };

  // Check MongoDB connection
  if (mongoose.connection.readyState === 1) {
    health.checks.mongodb = 'connected';
  } else {
    health.status = 'degraded';
    health.checks.mongodb = 'disconnected';
  }

  // Check Discord client status
  if (discordClient && discordClient.isReady()) {
    health.checks.discord = 'ready';
  } else {
    health.status = 'degraded';
    health.checks.discord = 'not ready';
  }

  const statusCode = health.status === 'healthy' ? 200 : 503;
  res.status(statusCode).json(health);
});

/**
 * Metrics endpoint
 */
app.get('/metrics', async (req: Request, res: Response) => {
  try {
    const activeSubscriptions = await UserSubscription.countDocuments({
      dmEnabled: true,
    });

    const metricsData = {
      memory: process.memoryUsage(),
      uptime: process.uptime(),
      messagesIndexed: metrics.messagesIndexed,
      digestsSent: metrics.digestsSent,
      activeSubscriptions,
      scheduledJobs: cronManager.getJobCount(),
    };

    res.json(metricsData);
  } catch (error: any) {
    logger.error('Failed to fetch metrics', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch metrics' });
  }
});

/**
 * Root endpoint
 */
app.get('/', (req: Request, res: Response) => {
  res.json({
    name: 'Build Canada Discord Bot',
    version: '1.0.0',
    status: 'running',
  });
});

/**
 * Start health server
 */
export async function startHealthServer(): Promise<void> {
  const preferredPort = DEFAULT_PORT;
  const allowFallback = !process.env.PORT; // Only fall back if port not explicitly set

  await new Promise<void>((resolve, reject) => {
    const attemptListen = (port: number, canFallback: boolean): void => {
      const instance = app.listen(port, () => {
        server = instance;
        const address = instance.address() as AddressInfo | null;
        activePort = address?.port ?? port;
        logger.info('Health server started', { port: activePort });
        resolve();
      });

      instance.once('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'EADDRINUSE') {
          logger.error('Health server port already in use', { port });

          if (canFallback) {
            logger.warn('Attempting to start health server on an ephemeral port');
            instance.close(() => attemptListen(0, false));
            return;
          }

          reject(new Error(`Port ${port} is already in use for health server`));
          return;
        }

        reject(error);
      });
    };

    attemptListen(preferredPort, allowFallback);
  });
}

/**
 * Graceful shutdown
 */
export async function stopHealthServer(): Promise<void> {
  if (!server) {
    logger.info('Health server stopping');
    return;
  }

  await new Promise<void>((resolve, reject) => {
    server!.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

  logger.info('Health server stopped', { port: activePort });
  server = null;
  activePort = null;
}
