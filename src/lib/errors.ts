/**
 * Error normalisation.
 *
 * Two audiences, two vocabularies. People get a sentence that names the next
 * step. Developers get the raw PostgREST/Auth error in the console, with no
 * personal data in it. Raw database errors never reach the interface.
 */

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
  forbidden: "You don't have access to that.",
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
  'auth.signIn': "That email and password combination didn't match. Please try again.",
  'auth.signUp': 'Check your inbox to confirm your email, then sign in.',
  'auth.signOut': "We couldn't sign you out cleanly. Please try again.",
};

const classify = (status: number | undefined): AppErrorKind => {
  if (status === undefined) return 'network';
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 409) return 'conflict';
  if (status === 422 || status === 400) return 'validation';
  if (status === 429) return 'rate_limited';
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

/** Errors that arrive from Supabase, as opposed to thrown locally. */
export interface SupabaseFailure {
  message: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
  status?: number;
}

/**
 * Convert anything thrown by the data layer into an `AppError`.
 * `context` selects the action-specific message, e.g. `'record.upsert'`.
 */
export const toAppError = (raw: unknown, context?: string): AppError => {
  if (raw instanceof AppError) return raw;

  const candidate = raw as SupabaseFailure | undefined;
  const detail = normaliseDetail(candidate);
  const kind = classify(candidate?.status);

  if (import.meta.env.DEV || import.meta.env.MODE !== 'production') {
    // Developer-facing only. Never includes row contents or credentials.
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
