/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_APP_URL: string;
  readonly VITE_APP_ENV: 'development' | 'staging' | 'production';
  readonly VITE_APP_VERSION: string;
  readonly VITE_STUDENT_APP_URL: string;
  readonly VITE_FEATURE_BANKID: string;
  readonly VITE_FEATURE_AI_ASSISTANT: string;
  readonly VITE_FEATURE_CORPORATE_PORTAL: string;
  readonly VITE_ENABLE_QUERY_DEVTOOLS: string;
  readonly VITE_ENABLE_DEBUG_LOGGING: string;
  readonly VITE_SENTRY_DSN: string;
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
  readonly VITE_FIREBASE_VAPID_KEY?: string;
  readonly VITE_GOOGLE_MAPS_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
