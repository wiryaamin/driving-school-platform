import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * Create a Supabase client for Edge Functions.
 *
 * Pass serviceRole=true only for server-side logic that must bypass RLS.
 * NEVER expose service role to client-side code or return it in responses.
 */
export function createSupabaseClient(req: Request, serviceRole = false) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const key = serviceRole
    ? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    : Deno.env.get('SUPABASE_ANON_KEY')!;

  const authHeader = req.headers.get('Authorization');

  return createClient(supabaseUrl, key, {
    global: {
      headers: authHeader ? { Authorization: authHeader } : {},
    },
    auth: {
      persistSession: false,
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
