// MARK: - Rate Limiter Utility
// Manages rate-limited operations with queue and delay

/**
 * Simple rate limiter for DM sending
 * Enforces 1 message per second to avoid Discord rate limits
 */
export class RateLimiter {
  private queue: Array<() => Promise<void>> = [];
  private processing = false;
  private lastExecutionTime = 0;
  private delayMs: number;

  constructor(delayMs = 1000) {
    this.delayMs = delayMs;
  }

  /**
   * Add a task to the rate-limited queue
   */
  async schedule<T>(task: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await task();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });

      if (!this.processing) {
        this.processQueue();
      }
    });
  }

  /**
   * Process queued tasks with delay
   */
  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0) {
      const now = Date.now();
      const timeSinceLastExecution = now - this.lastExecutionTime;

      if (timeSinceLastExecution < this.delayMs) {
        await this.sleep(this.delayMs - timeSinceLastExecution);
      }

      const task = this.queue.shift();
      if (task) {
        this.lastExecutionTime = Date.now();
        await task();
      }
    }

    this.processing = false;
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get current queue size
   */
  getQueueSize(): number {
    return this.queue.length;
  }
}
