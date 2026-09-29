import { requireSupabase } from '@/lib/supabase/client';
import { toAppError } from '@/lib/errors';
import type { AuthError, Session } from '@supabase/supabase-js';
import { getSupabase } from '@/lib/supabase/client';

/** What a caller needs to know, without leaking SDK error shapes. */
export interface AuthResult {
  ok: boolean;
  message?: string;
}

const isAuthError = (error: unknown): error is AuthError =>
  error instanceof Error && 'status' in error;

/** 422 with "User already registered" is the normal duplicate-signup case. */
const duplicateEmail = (message: string): boolean =>
  /already registered|already been registered/i.test(message);

export interface SignUpInput {
  email: string;
  password: string;
  displayName: string;
  timeZone: string;
}

export const signUp = async ({
  email,
  password,
  displayName,
  timeZone,
}: SignUpInput): Promise<{ session: Session | null; needsConfirmation: boolean }> => {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase is not configured.');

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // Picked up by the `handle_new_user` trigger, so the profile and its
      // categories exist before the first render after confirmation.
      data: { display_name: displayName.trim(), timezone: timeZone },
      emailRedirectTo: `${window.location.origin}/auth/callback`,
    },
  });

  if (error) {
    if (isAuthError(error) && duplicateEmail(error.message)) {
      throw toAppError(
        { ...error, message: 'An account already exists for that email. Try signing in instead.' },
        'auth.signUp',
      );
    }
    throw toAppError(error, 'auth.signUp');
  }

  return { session: data.session, needsConfirmation: data.session === null };
};

export const signIn = async (email: string, password: string): Promise<Session> => {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase is not configured.');

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw toAppError(error, 'auth.signIn');
  if (!data.session) throw toAppError({ message: 'No session returned' }, 'auth.signIn');
  return data.session;
};

export const signOut = async (): Promise<void> => {
  const supabase = getSupabase();
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw toAppError(error, 'auth.signOut');
};

export const requestPasswordReset = async (email: string): Promise<void> => {
  const supabase = getSupabase();
  if (!supabase) return;
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/auth/reset`,
  });
  if (error) throw toAppError(error, 'auth.reset');
};

/**
 * Complete an emailed confirmation or recovery link. The token is read from the
 * URL and exchanged immediately, then removed from the address bar so it is
 * not left in history or a shared screen.
 */
export const consumeAuthCallback = async (): Promise<AuthResult> => {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, message: 'Supabase is not configured.' };

  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const errorDescription = params.get('error_description');

  if (errorDescription) return { ok: false, message: 'That link is no longer valid. Request a new one.' };
  if (!code) return { ok: false, message: 'That link is missing its code. Request a new one.' };

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return { ok: false, message: 'That link has expired. Request a new one.' };

  window.history.replaceState({}, document.title, window.location.pathname);
  return { ok: true };
};

export const updatePassword = async (password: string): Promise<void> => {
  const { error } = await requireSupabase().auth.updateUser({ password });
  if (error) throw toAppError(error, 'auth.updatePassword');
};

export const resendConfirmation = async (email: string): Promise<void> => {
  const supabase = getSupabase();
  if (!supabase) return;
  const { error } = await supabase.auth.resend({ type: 'signup', email });
  if (error) throw toAppError(error, 'auth.resend');
};
