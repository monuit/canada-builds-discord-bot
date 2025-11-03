// MARK: - Cron Manager Service
// Manages scheduled digest jobs with dynamic updates

import * as cron from 'node-cron';
import { isValidCron } from 'cron-validator';
import { DigestConfig } from '../models/DigestConfig';
import { notificationService } from './NotificationService';
import { errorNotifier } from './ErrorNotifier';
import { logger } from '../utils/logger';

interface ScheduledJob {
  task: cron.ScheduledTask;
  cron: string;
  timezone: string;
}

export class CronManager {
  private jobs: Map<string, ScheduledJob> = new Map(); // guildId -> job

  /**
   * Initialize by loading all enabled schedules
   */
  async initialize(): Promise<void> {
    try {
      const configs = await DigestConfig.find({ 'schedule.enabled': true });

      for (const config of configs) {
        await this.updateJob(
          config.guildId,
          config.schedule.cron,
          config.schedule.timezone
        );
      }

      logger.info('CronManager initialized', { activeJobs: this.jobs.size });
    } catch (error: any) {
      logger.error('Failed to initialize CronManager', { error: error.message });
      throw error;
    }
  }

  /**
   * Update or create a scheduled job for a guild
   */
  async updateJob(
    guildId: string,
    cronExpression: string,
    timezone = 'UTC'
  ): Promise<void> {
    try {
      // Validate cron expression
      if (!isValidCron(cronExpression)) {
        throw new Error(`Invalid cron expression: ${cronExpression}`);
      }

      // Cancel existing job if present
      this.cancelJob(guildId);

      // Create new scheduled task
      const task = cron.schedule(
        cronExpression,
        async () => {
          await this.runScheduledDigest(guildId);
        },
        {
          scheduled: true,
          timezone,
        }
      );

      this.jobs.set(guildId, {
        task,
        cron: cronExpression,
        timezone,
      });

      logger.info('Cron job scheduled', {
        guildId,
        cron: cronExpression,
        timezone,
      });
    } catch (error: any) {
      logger.error('Failed to schedule cron job', {
        guildId,
        cron: cronExpression,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Cancel a scheduled job
   */
  cancelJob(guildId: string): void {
    const job = this.jobs.get(guildId);
    
    if (job) {
      job.task.stop();
      this.jobs.delete(guildId);
      
      logger.info('Cron job cancelled', { guildId });
    }
  }

  /**
   * Run scheduled digest for a guild
   */
  private async runScheduledDigest(guildId: string): Promise<void> {
    try {
      logger.info('Running scheduled digest', { guildId });

      const result = await notificationService.notifyAllSubscribers(guildId, 24);

      logger.info('Scheduled digest completed', {
        guildId,
        successful: result.successful,
        failed: result.failed,
        skipped: result.skipped,
      });

    } catch (error: any) {
      logger.error('Scheduled digest failed', {
        guildId,
        error: error.message,
      });

      await errorNotifier.notify(guildId, error, {
        context: 'scheduledDigest',
        guildId,
      });
    }
  }

  /**
   * Get active job count
   */
  getJobCount(): number {
    return this.jobs.size;
  }

  /**
   * Get job details for a guild
   */
  getJob(guildId: string): { cron: string; timezone: string } | null {
    const job = this.jobs.get(guildId);
    
    if (!job) {
      return null;
    }

    return {
      cron: job.cron,
      timezone: job.timezone,
    };
  }

  /**
   * Shutdown all jobs (for graceful exit)
   */
  shutdown(): void {
    for (const [guildId, job] of this.jobs.entries()) {
      job.task.stop();
      logger.debug('Cron job stopped', { guildId });
    }

    this.jobs.clear();
    logger.info('CronManager shutdown complete');
  }
}

// Export singleton instance
export const cronManager = new CronManager();
