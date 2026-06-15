/**
 * CORS headers for Edge Functions.
 * Imported by every Edge Function that handles HTTP requests.
 *
 * Use serveCors() as the outermost wrapper in every Deno.serve() handler —
 * it handles OPTIONS preflights and merges CORS headers into every response.
 */

const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  Deno.env.get('APP_URL') ?? '',
  Deno.env.get('STUDENT_APP_URL') ?? '',
].filter(Boolean);

export function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? '';
  const isAllowed = allowedOrigins.includes(origin);

  return {
    'Access-Control-Allow-Origin':   isAllowed ? origin : (allowedOrigins[0] ?? ''),
    'Access-Control-Allow-Methods':  'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers':  'authorization, x-client-info, apikey, content-type, x-correlation-id, x-app-env, x-app-version',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age':        '86400',
  };
}

/**
 * Full CORS wrapper for Deno.serve handlers.
 *
 * - Returns 204 for OPTIONS preflights (no handler invocation)
 * - Merges CORS headers into every response the handler returns
 * - Catches unhandled throws and returns a 500 with CORS headers
 *
 * Usage:
 *   Deno.serve((req) => serveCors(req, async () => {
 *     // ... handler logic ...
 *   }));
 */
export async function serveCors(
  req: Request,
  handler: () => Promise<Response>,
): Promise<Response> {
  const cors = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  let res: Response;
  try {
    res = await handler();
  } catch (err) {
    res = new Response(
      JSON.stringify({ code: 'INTERNAL_ERROR', message: 'Unhandled server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
    console.error('[serveCors] unhandled error:', err);
  }

  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(cors)) headers.set(k, v);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

/** @deprecated Use serveCors() instead — handleCors only covers OPTIONS, not actual responses. */
export function handleCors(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: getCorsHeaders(req) });
  }
  return null;
}
