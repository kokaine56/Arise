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

declare global {
  interface Window {
    /**
     * Injected by the container at boot (see `docker/entrypoint.sh`), which
     * writes `/env.js` from real environment variables.
     *
     * This is what makes one built image portable between environments, and
     * what lets a deploy change the Supabase project without a rebuild. Absent
     * in dev, where the values below come from Vite instead.
     */
    __ARISE_ENV__?: Partial<PublicEnv>;
  }
}

const read = (key: keyof PublicEnv): string => {
  // Runtime config wins over the build-time copy, so a redeploy to a different
  // project takes effect on the same image tag.
  const injected: unknown = typeof window === 'undefined' ? undefined : window.__ARISE_ENV__?.[key];
  if (typeof injected === 'string' && injected.trim() !== '') return injected.trim();

  const baked: unknown = import.meta.env[key];
  return typeof baked === 'string' ? baked.trim() : '';
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
  'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY — in .env.local for local dev, or as container environment variables in production',
  'Restart the app',
] as const;
