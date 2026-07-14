import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient, SupabaseClientOptions } from '@supabase/supabase-js';
import type { Database } from '@platform/types';

export type TypedSupabaseClient = SupabaseClient<Database>;

/**
 * Browser client — uses the anon key. RLS enforces all access.
 * Persists the user session to localStorage. Use in React apps.
 *
 * Pass `options` to override defaults for app-specific configuration
 * (e.g. storageKey, detectSessionInUrl, global headers, realtime params).
 */
export function createBrowserClient(
  supabaseUrl: string,
  supabaseAnonKey: string,
  options?: SupabaseClientOptions<'public'>
): TypedSupabaseClient {
  return createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      ...options?.auth,
    },
    ...options,
  });
}

/**
 * Server-side user client — uses the anon key with the caller's JWT forwarded.
 * RLS enforces access using the user's identity. No session is persisted.
 * Use in Next.js Route Handlers and server-side rendering contexts.
 */
export function createServerClient(
  supabaseUrl: string,
  supabaseAnonKey: string,
  accessToken?: string | null
): TypedSupabaseClient {
  return createClient<Database>(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/**
 * Service-role client — bypasses RLS entirely.
 * NEVER expose this client or its key to the browser or to API responses.
 * Use exclusively in: background workers, auth hooks, admin operations.
 */
export function createServiceRoleClient(
  supabaseUrl: string,
  serviceRoleKey: string
): TypedSupabaseClient {
  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
