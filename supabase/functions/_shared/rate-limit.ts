/**
 * In-memory sliding-window rate limiter for Edge Functions.
 *
 * Architecture note: Supabase Edge Functions run as isolated V8 isolates.
 * This counter store is per-isolate, not global. It provides effective burst
 * protection (the most common attack vector) while remaining stateless and
 * adding zero latency overhead. For global enforcement across all isolates,
 * supplement with Supabase Edge Function rate limiting configured in the
 * Supabase Dashboard (Functions → Rate Limits).
 */

// ─── Configuration ────────────────────────────────────────────────────────────

export const RATE_LIMIT_TIERS = {
  /** Unauthenticated public endpoints — lead capture, catalog */
  ip_public: { requests: 30, windowMs: 60_000 },
  /** Standard authenticated tenant endpoints */
  ip_auth: { requests: 200, windowMs: 60_000 },
  /** Per-user quota on authenticated endpoints (layered on top of IP) */
  user_default: { requests: 120, windowMs: 60_000 },
  /** Write operations — create/update/delete */
  user_write: { requests: 40, windowMs: 60_000 },
  /** Platform Admin workspace (elevated allowance) */
  platform_admin: { requests: 600, windowMs: 60_000 },
  /** Person Lookup — a real per-call cost once a paid provider is active;
   *  a receptionist registering students has no legitimate need for more
   *  than a handful of lookups per minute. Deliberately tighter than
   *  user_write. */
  person_lookup: { requests: 20, windowMs: 60_000 },
  /** Vehicle Registry Lookup — same reasoning as person_lookup: a real
   *  per-call cost once a paid reseller is active, and vehicle lookups are
   *  an occasional data-entry aid, not a bulk operation. */
  vehicle_registry_lookup: { requests: 20, windowMs: 60_000 },
} as const;

export type RateLimitTier = keyof typeof RATE_LIMIT_TIERS;

// ─── Counter store ────────────────────────────────────────────────────────────

interface Counter {
  hits: number;
  resetAt: number;
}

const store = new Map<string, Counter>();
let nextCleanup = Date.now() + 300_000;

function cleanup(): void {
  const now = Date.now();
  if (now < nextCleanup) return;
  nextCleanup = now + 300_000;
  for (const [k, v] of store) {
    if (v.resetAt <= now) store.delete(k);
  }
}

// ─── Core check ──────────────────────────────────────────────────────────────

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetAt: number;
}

export function checkRateLimit(identifier: string, tier: RateLimitTier): RateLimitResult {
  cleanup();
  const config   = RATE_LIMIT_TIERS[tier];
  const now      = Date.now();
  const storeKey = `${tier}:${identifier}`;

  let counter = store.get(storeKey);
  if (!counter || counter.resetAt <= now) {
    counter = { hits: 0, resetAt: now + config.windowMs };
    store.set(storeKey, counter);
  }

  counter.hits++;
  const allowed   = counter.hits <= config.requests;
  const remaining = Math.max(0, config.requests - counter.hits);

  return { allowed, remaining, limit: config.requests, resetAt: counter.resetAt };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function getClientIp(req: Request): string {
  const fwd = req.headers.get('X-Forwarded-For');
  if (fwd) return fwd.split(',')[0]?.trim() ?? 'unknown';
  return req.headers.get('CF-Connecting-IP') ?? 'unknown';
}

export function getRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    'X-RateLimit-Limit':     String(result.limit),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset':     String(Math.ceil(result.resetAt / 1000)),
  };
}

/**
 * Build a 429 response. Always include Retry-After so clients back off correctly.
 */
export function rateLimitedResponse(result: RateLimitResult, correlationId: string): Response {
  const retryAfter = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
  return new Response(
    JSON.stringify({
      code:        'RATE_LIMIT_EXCEEDED',
      message:     'Too many requests. Please try again later.',
      trace_id:    correlationId,
      retry_after: retryAfter,
    }),
    {
      status: 429,
      headers: {
        'Content-Type':          'application/json',
        'X-Correlation-ID':      correlationId,
        'Retry-After':           String(retryAfter),
        'X-RateLimit-Limit':     String(result.limit),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset':     String(Math.ceil(result.resetAt / 1000)),
      },
    }
  );
}

/**
 * Convenience: check IP rate limit and return a 429 Response or null.
 * Call this before buildEdgeContext for public endpoints.
 */
export function enforceIpRateLimit(
  req: Request,
  tier: RateLimitTier,
  correlationId: string
): Response | null {
  const ip     = getClientIp(req);
  const result = checkRateLimit(ip, tier);
  if (!result.allowed) {
    return rateLimitedResponse(result, correlationId);
  }
  return null;
}

/**
 * Convenience: check per-user rate limit and return a 429 Response or null.
 * Call after buildEdgeContext when ctx.actorId is known.
 */
export function enforceUserRateLimit(
  userId: string,
  tier: RateLimitTier,
  correlationId: string
): Response | null {
  const result = checkRateLimit(userId, tier);
  if (!result.allowed) {
    return rateLimitedResponse(result, correlationId);
  }
  return null;
}
