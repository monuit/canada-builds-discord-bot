// MARK: - Logger Utility
// Structured logging with timestamp and level filtering

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLogLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';
const currentLevelValue = LOG_LEVELS[currentLogLevel];

/**
 * Formats timestamp in ISO format with local timezone
 */
function getTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Main logger function with level filtering
 */
export function log(level: LogLevel, message: string, meta?: Record<string, any>): void {
  if (LOG_LEVELS[level] < currentLevelValue) {
    return; // Skip logs below configured level
  }

  const logEntry = {
    timestamp: getTimestamp(),
    level: level.toUpperCase(),
    message,
    ...meta,
  };

  const output = JSON.stringify(logEntry);

  switch (level) {
    case 'error':
      console.error(output);
      break;
    case 'warn':
      console.warn(output);
      break;
    case 'debug':
      console.debug(output);
      break;
    default:
      console.log(output);
  }
}

/**
 * Convenience methods
 */
export const logger = {
  debug: (message: string, meta?: Record<string, any>) => log('debug', message, meta),
  info: (message: string, meta?: Record<string, any>) => log('info', message, meta),
  warn: (message: string, meta?: Record<string, any>) => log('warn', message, meta),
  error: (message: string, meta?: Record<string, any>) => log('error', message, meta),
};
