/**
 * Platform logger.
 * In development: rich console output.
 * In production: structured JSON (ready for Sentry / Datadog integration).
 */

// process may or may not exist (Node vs browser) — declare narrowly so TypeScript
// doesn't require @types/node for this package.
declare const process: { env: Record<string, string | undefined> } | undefined;

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  [key: string]: unknown;
}

interface LogEntry {
  level: LogLevel;
  message: string;
  context?: LogContext;
  error?: Error | unknown;
  timestamp: string;
}

function formatEntry(entry: LogEntry): string {
  const ts = entry.timestamp;
  const prefix = `[${entry.level.toUpperCase()}]`;
  return `${ts} ${prefix} ${entry.message}`;
}

function createEntry(
  level: LogLevel,
  message: string,
  context?: LogContext,
  error?: Error | unknown
): LogEntry {
  return {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...(context !== undefined && { context }),
    ...(error   !== undefined && { error }),
  };
}

const isDev =
  typeof process !== 'undefined'
    ? process.env['NODE_ENV'] === 'development'
    : typeof import.meta !== 'undefined'
      ? (import.meta as { env?: { DEV?: boolean } }).env?.DEV === true
      : false;

export const logger = {
  debug(message: string, context?: LogContext): void {
    if (!isDev) return;
    const entry = createEntry('debug', message, context);
    console.debug(formatEntry(entry), context ?? '');
  },

  info(message: string, context?: LogContext): void {
    const entry = createEntry('info', message, context);
    if (isDev) {
      console.info(formatEntry(entry), context ?? '');
    } else {
      console.info(JSON.stringify(entry));
    }
  },

  warn(message: string, context?: LogContext): void {
    const entry = createEntry('warn', message, context);
    if (isDev) {
      console.warn(formatEntry(entry), context ?? '');
    } else {
      console.warn(JSON.stringify(entry));
    }
  },

  error(message: string, error?: Error | unknown, context?: LogContext): void {
    const entry = createEntry('error', message, context, error);
    if (isDev) {
      console.error(formatEntry(entry), error, context ?? '');
    } else {
      console.error(JSON.stringify({ ...entry, error: String(error) }));
    }
    // TODO: Forward to Sentry or equivalent monitoring service
  },
};
