/**
 * CORS headers for Edge Functions.
 * Imported by every Edge Function that handles HTTP requests.
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
    'Access-Control-Allow-Origin': isAllowed ? origin : allowedOrigins[0] ?? '',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Max-Age': '86400',
  };
}

export function handleCors(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: getCorsHeaders(req) });
  }
  return null;
}
