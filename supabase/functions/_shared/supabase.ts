import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/** Correlation context to attach to outgoing DB requests. See PR-2 Observability Architecture v1.0, ADR-001. */
export interface CorrelationContext {
  correlationId: string;
  requestId: string;
}

/**
 * Create a Supabase client for Edge Functions.
 *
 * Pass serviceRole=true only for server-side logic that must bypass RLS.
 * NEVER expose service role to client-side code or return it in responses.
 *
 * Pass `correlation` (optional, additive) to propagate correlation_id/request_id
 * to PostgREST via request headers, which audit_trigger_fn() reads via the
 * `request.headers` GUC — the same mechanism already used for request.jwt.claims.
 * Omitting it changes nothing: existing callers are fully unaffected.
 */
export function createSupabaseClient(
  req: Request,
  serviceRole = false,
  correlation?: CorrelationContext
) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const key = serviceRole
    ? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    : Deno.env.get('SUPABASE_ANON_KEY')!;

  const authHeader = req.headers.get('Authorization');

  const headers: Record<string, string> = authHeader ? { Authorization: authHeader } : {};
  if (correlation) {
    headers['X-Correlation-ID'] = correlation.correlationId;
    headers['X-Request-ID']    = correlation.requestId;
  }

  return createClient(supabaseUrl, key, {
    global: { headers },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/**
 * Create an anon-key Supabase client with no request context and no forwarded
 * Authorization header. Use for calling public GoTrue endpoints server-side
 * that must actually dispatch mail — e.g. auth.resetPasswordForEmail(), which
 * (unlike auth.admin.generateLink()) sends the email itself via the project's
 * configured SMTP. admin.generateLink() only mints the link/token and leaves
 * delivery to the caller, so it is the wrong tool for "send this person a
 * working recovery link" and must not be used for that purpose.
 */
export function createAnonClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey     = Deno.env.get('SUPABASE_ANON_KEY')!;

  return createClient(supabaseUrl, anonKey, {
    auth: {
      persistSession:   false,
      autoRefreshToken: false,
    },
  });
}

/**
 * Create a service-role Supabase client with no request context.
 * Use when calling DB functions that require bypassing RLS (e.g. auth hook, background jobs).
 * NEVER expose the returned client or its key outside the Edge Function.
 */
export function createServiceClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  return createClient(supabaseUrl, serviceKey, {
    auth: {
      persistSession:   false,
      autoRefreshToken: false,
    },
  });
}
