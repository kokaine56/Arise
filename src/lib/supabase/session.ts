/**
 * In-memory mirror of the signed-in user id.
 *
 * Writes need an explicit `user_id` column value, but calling
 * `supabase.auth.getUser()` on every write would add a network round-trip to
 * each interaction. The auth provider keeps this in sync from the session it
 * already has, so services can read it synchronously.
 *
 * RLS still does the authorising: this value is a *claim*, never a *grant*. A
 * tampered client sending someone else's id is rejected by the database.
 */

import type { User } from '@supabase/supabase-js';

let currentUser: User | null = null;
let currentUserId: string | null = null;
const listeners = new Set<() => void>();

export const setSessionUser = (user: User | null): void => {
  const nextId = user?.id ?? null;
  if (nextId === currentUserId) return;
  currentUser = user;
  currentUserId = nextId;
  listeners.forEach((listener) => listener());
};

export const getSessionUser = (): User | null => currentUser;

export const getSessionUserId = (): string | null => currentUserId;

export const requireUserId = (): string => {
  if (!currentUserId) {
    throw new Error('No signed-in user. Authenticated routes must be used here.');
  }
  return currentUserId;
};

export const onSessionUserChange = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
