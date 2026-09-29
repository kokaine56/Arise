import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabaseConfig } from '@/lib/env';
import type { Database } from '@/lib/supabase/database.types';

let client: SupabaseClient<Database> | null = null;

/**
 * The single browser Supabase client.
 *
 * Persisting the session is what lets the app survive a refresh without a
 * second sign-in. `detectSessionInUrl` is disabled deliberately: the email
 * confirmation link lands on a dedicated route that exchanges the token itself,
 * so tokens are never left sitting in the address bar.
 */
export const getSupabase = (): SupabaseClient<Database> | null => {
  if (!isSupabaseConfigured()) return null;
  if (client) return client;

  client = createClient<Database>(supabaseConfig.url, supabaseConfig.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      flowType: 'pkce',
    },
    global: {
      headers: { 'x-application-name': 'arise' },
    },
  });

  return client;
};

/** Narrowing accessor for code paths that already know auth is required. */
export const requireSupabase = (): SupabaseClient<Database> => {
  const instance = getSupabase();
  if (!instance) {
    throw new Error(
      'Supabase is not configured. Copy .env.example to .env.local and add your project URL and anon key.',
    );
  }
  return instance;
};
