type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogData {
  [key: string]: unknown;
}

export interface FunctionLogger {
  debug: (event: string, data?: LogData) => void;
  info:  (event: string, data?: LogData) => void;
  warn:  (event: string, data?: LogData) => void;
  error: (event: string, data?: LogData) => void;
  /** Log request start with standard fields. */
  requestStarted: (req: Request, correlationId: string, orgId: string | null, actorId: string | null) => void;
  /** Log request completion with standard fields. */
  requestCompleted: (req: Request, status: number, correlationId: string, startedAt: number) => void;
}

/**
 * Structured logger for Edge Functions.
 * Every log entry includes: event name, level, timestamp.
 *
 * Usage:
 *   const log = createFunctionLogger('students');
 *   log.info('student.created', { correlation_id: ..., org_id: ..., student_id: ... });
 *
 * Or use the module-level logger directly for quick one-off entries:
 *   logger.error('unexpected', { error: err.message });
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

/** Global logger — use when function name is not relevant or already in event. */
export const logger = {
  debug: (event: string, data?: LogData) => log('debug', event, data),
  info:  (event: string, data?: LogData) => log('info',  event, data),
  warn:  (event: string, data?: LogData) => log('warn',  event, data),
  error: (event: string, data?: LogData) => log('error', event, data),
};

/**
 * Creates a function-scoped logger that automatically adds `function` to every entry.
 * Prefer this over the module-level logger when the function name adds diagnostic value.
 *
 * Also provides requestStarted / requestCompleted helpers for consistent request logging:
 *   log.requestStarted(req, ctx.correlationId, ctx.organizationId, ctx.actorId);
 *   log.requestCompleted(req, response.status, ctx.correlationId, ctx.startedAt);
 */
export function createFunctionLogger(functionName: string): FunctionLogger {
  const fn = functionName;

  function logFn(level: LogLevel, event: string, data: LogData = {}): void {
    log(level, event, { function: fn, ...data });
  }

  return {
    debug: (event, data) => logFn('debug', event, data),
    info:  (event, data) => logFn('info',  event, data),
    warn:  (event, data) => logFn('warn',  event, data),
    error: (event, data) => logFn('error', event, data),

    requestStarted(req, correlationId, orgId, actorId) {
      const url = new URL(req.url);
      logFn('info', 'request.started', {
        method:         req.method,
        path:           url.pathname,
        correlation_id: correlationId,
        org_id:         orgId ?? 'platform',
        actor_id:       actorId,
      });
    },

    requestCompleted(req, status, correlationId, startedAt) {
      const url = new URL(req.url);
      logFn('info', 'request.completed', {
        method:         req.method,
        path:           url.pathname,
        status,
        correlation_id: correlationId,
        duration_ms:    Date.now() - startedAt,
      });
    },
  };
}
