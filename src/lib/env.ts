/**
 * Environment access.
 *
 * Secrets live in the Supabase project, not here. The client only ever sees the
 * anon/publishable key, which is safe to ship because every table is protected
 * by Row Level Security. The service-role key is intentionally not referenced
 * anywhere in this codebase — nothing in Arise needs to bypass RLS.
 */

interface PublicEnv {
  VITE_SUPABASE_URL: string;
  VITE_SUPABASE_ANON_KEY: string;
  VITE_DEBUG_SUPABASE?: string;
}

const read = (key: keyof PublicEnv): string => {
  const value: unknown = import.meta.env[key];
  return typeof value === 'string' ? value.trim() : '';
};

const url = read('VITE_SUPABASE_URL');
const anonKey = read('VITE_SUPABASE_ANON_KEY');

const looksLikeUrl = (value: string): boolean => /^https:\/\/[a-z0-9-]+\.supabase\.(co|in)/i.test(value);

export const isSupabaseConfigured = (): boolean =>
  looksLikeUrl(url) && anonKey.length >= 20 && !anonKey.includes('your-anon');

export const supabaseConfig = {
  url,
  anonKey,
  /** Verbose error logging for development only; never enable in production. */
  debug: read('VITE_DEBUG_SUPABASE') === 'true',
} as const;

/** Message shown on the setup screen when the project is not wired up yet. */
export const SETUP_INSTRUCTIONS = [
  'Create a project at supabase.com',
  'Open the SQL editor and run the contents of supabase/migrations/0001_initial_schema.sql',
  'Copy .env.example to .env.local and fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY',
  'Restart the dev server',
] as const;
