import { createClient } from '@supabase/supabase-js';
import type { Database } from '@platform/types';

const rawSupabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const rawSupabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!rawSupabaseUrl || !rawSupabaseKey) {
  // Warn rather than throw — a module-level throw prevents the entire app from
  // mounting and produces a blank page. The client will fail at network level
  // instead, and the user is directed to configure their .env.local.
  console.error(
    '[Platform] Missing Supabase environment variables.\n' +
    'Copy .env.example to .env.local and fill in your Supabase project credentials.'
  );
}

/**
 * Typed Supabase client — the single instance used across the entire app.
 * Never instantiate another client; always import from here.
 */
export const supabase = createClient<Database>(
  rawSupabaseUrl ?? 'https://placeholder.supabase.co',
  rawSupabaseKey ?? 'placeholder-anon-key',
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      storageKey: 'platform_auth',
    },
    global: {
      headers: {
        'x-app-version': import.meta.env.VITE_APP_VERSION ?? '0.0.0',
        'x-app-env': import.meta.env.VITE_APP_ENV ?? 'development',
      },
    },
    db: {
      schema: 'public',
    },
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
  }
);
