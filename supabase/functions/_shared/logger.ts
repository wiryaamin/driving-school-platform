type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogData {
  [key: string]: unknown;
}

/**
 * Structured logger for Edge Functions.
 * Every log entry includes: event name, level, timestamp.
 * Add correlation_id and org_id to every call site for traceability.
 *
 * Usage:
 *   logger.info('request.started', { correlation_id: ..., org_id: ..., method: 'POST' });
 *   logger.error('booking.failed',  { correlation_id: ..., error: err.message });
 */
function log(level: LogLevel, event: string, data: LogData = {}): void {
  const entry = {
    level,
    event,
    timestamp: new Date().toISOString(),
    ...data,
  };

  const serialized = JSON.stringify(entry);
  if (level === 'error') {
    console.error(serialized);
  } else if (level === 'warn') {
    console.warn(serialized);
  } else {
    console.log(serialized);
  }
}

export const logger = {
  debug: (event: string, data?: LogData) => log('debug', event, data),
  info:  (event: string, data?: LogData) => log('info',  event, data),
  warn:  (event: string, data?: LogData) => log('warn',  event, data),
  error: (event: string, data?: LogData) => log('error', event, data),
};
