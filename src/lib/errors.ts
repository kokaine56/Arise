/**
 * Error normalisation.
 *
 * Two audiences, two vocabularies. People get a sentence that names the next
 * step. Developers get the raw failure in the console. Raw database errors never
 * reach the interface, which matters more now than it did with a hosted database:
 * a CHECK constraint message is written for a SQL reader, not for a person
 * trying to tick a box.
 */

import { ApiError } from '@/lib/api/client';

export type AppErrorKind =
  | 'network'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'validation'
  | 'conflict'
  | 'rate_limited'
  | 'unknown';

export class AppError extends Error {
  readonly kind: AppErrorKind;
  /** Safe to show to the user. */
  readonly userMessage: string;
  /** Present only when debug logging is on. Never rendered. */
  readonly debugDetail: string | undefined;

  constructor(kind: AppErrorKind, userMessage: string, debugDetail?: string) {
    super(userMessage);
    this.name = 'AppError';
    this.kind = kind;
    this.userMessage = userMessage;
    this.debugDetail = debugDetail;
  }
}

const DEFAULT_MESSAGES: Record<AppErrorKind, string> = {
  network: "We couldn't reach the server. Check your connection and try again.",
  unauthorized: 'Your session has ended. Sign in again to continue.',
  forbidden: "We don't have access to that.",
  not_found: "We couldn't find that.",
  validation: 'Some of those details need another look.',
  conflict: 'That changed while you were working. Refresh and try again.',
  rate_limited: 'Too many requests just now. Give it a moment.',
  unknown: 'Something went wrong on our side. Please try again.',
};

/** Action-oriented copy: each message tells the reader what to do next. */
const CONTEXT_MESSAGES: Partial<Record<string, string>> = {
  'goal.create': "We couldn't save that goal. Please try again.",
  'goal.update': "We couldn't update that goal. Your previous version is unchanged.",
  'goal.archive': "We couldn't archive that goal. Please try again.",
  'goal.delete': "We couldn't delete that goal. Nothing was removed.",
  'record.upsert': "We couldn't save that. Your change was undone.",
  'profile.update': "We couldn't save your settings. Please try again.",
  'profile.load': "We couldn't load your settings. Some may look default.",
  'categories.load': "We couldn't load your categories.",
  'auth.signIn': "That email and password combination didn't match. Please try again.",
  'auth.signUp': 'Check your inbox to confirm your email, then sign in.',
  'auth.signOut': "We couldn't sign you out cleanly. Please try again.",
};

const classify = (status: number | undefined): AppErrorKind => {
  // fetch reports a transport failure as status 0, which is the one case that
  // means "the server is not there" rather than "the server said no".
  if (status === undefined || status === 0) return 'network';
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 409) return 'conflict';
  if (status === 413) return 'validation';
  if (status === 429) return 'rate_limited';
  if (status === 422 || status === 400) return 'validation';
  if (status >= 500) return 'unknown';
  return 'unknown';
};

const normaliseDetail = (raw: unknown): string => {
  if (typeof raw === 'string') return raw;
  if (raw && typeof raw === 'object') {
    const record = raw as Record<string, unknown>;
    const parts = [record.message, record.hint, record.code, record.details]
      .filter((part): part is string => typeof part === 'string');
    if (parts.length > 0) return parts.join(' · ');
    try {
      return JSON.stringify(raw);
    } catch {
      return 'Unserialisable error payload';
    }
  }
  if (raw === null || raw === undefined) return 'Unknown error';
  // Deliberately narrow: an object that reached here has already been handled
  // above, and stringifying one blindly would only yield "[object Object]".
  if (typeof raw === 'number' || typeof raw === 'boolean' || typeof raw === 'bigint') {
    return String(raw);
  }
  return 'Unexpected error';
};

/** An error thrown by the API client, which carries a status and a code. */
export interface TransportFailure {
  status?: number;
  code?: string;
  message?: string;
}

const describe = (raw: unknown): { detail: string; status: number | undefined } => {
  if (raw instanceof ApiError) return { detail: `${raw.code}: ${raw.message}`, status: raw.status };

  const candidate = raw as TransportFailure | undefined;
  return { detail: normaliseDetail(candidate), status: candidate?.status };
};

/**
 * Convert anything thrown by the data layer into an `AppError`.
 * `context` selects the action-specific message, e.g. `'record.upsert'`.
 */
export const toAppError = (raw: unknown, context?: string): AppError => {
  if (raw instanceof AppError) return raw;

  const { detail, status } = describe(raw);
  const kind = classify(status);

  if (import.meta.env.DEV || import.meta.env.MODE !== 'production') {
    // Developer-facing only. Never includes row contents.
    console.warn(`[arise:${context ?? 'unknown'}]`, kind, detail);
  }

  const userMessage =
    (context !== undefined ? CONTEXT_MESSAGES[context] : undefined) ?? DEFAULT_MESSAGES[kind];

  return new AppError(kind, userMessage, detail);
};

/** Turn a Zod error into a single sentence, or null when it validates. */
export const describeIssues = (issues: readonly { path: PropertyKey[]; message: string }[]): string => {
  const first = issues[0];
  if (!first) return 'Some fields need another look.';
  const field = first.path.filter((p) => typeof p === 'string').join(' ');
  return field ? `${field}: ${first.message}` : first.message;
};
