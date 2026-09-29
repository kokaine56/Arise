/**
 * HTTP plumbing: a small router, JSON helpers, and the translation of SQLite
 * constraint failures into meaningful status codes.
 *
 * There is no web framework here on purpose. The API is a dozen endpoints over
 * one file, and a dependency would add install time and supply-chain surface
 * without removing a meaningful amount of code.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }
}

export const badRequest = (message: string, code = 'bad_request'): HttpError =>
  new HttpError(400, code, message);

export const notFound = (message = 'Not found'): HttpError => new HttpError(404, 'not_found', message);

/* -------------------------------------------------------------------------- */
/* Responses                                                                   */
/* -------------------------------------------------------------------------- */

export const sendJson = (res: ServerResponse, status: number, body: unknown): void => {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    // API output must never be cached: a stale record list would look like data
    // loss right after a write.
    'cache-control': 'no-store',
  });
  res.end(payload);
};

export const sendNoContent = (res: ServerResponse): void => {
  res.writeHead(204, { 'cache-control': 'no-store' });
  res.end();
};

export const sendError = (res: ServerResponse, error: unknown): void => {
  if (error instanceof HttpError) {
    sendJson(res, error.status, { error: { code: error.code, message: error.message } });
    return;
  }

  const mapped = mapSqliteError(error);
  if (mapped) {
    sendJson(res, mapped.status, { error: { code: mapped.code, message: mapped.message } });
    return;
  }

  console.error('arise: unhandled error', error);
  sendJson(res, 500, {
    error: { code: 'internal', message: 'Something went wrong handling that request.' },
  });
};

/**
 * Turn a constraint violation into a 4xx.
 *
 * The schema is the validation layer — a client cannot write a goal with a
 * frequency payload that disagrees with its type, because the trigger refuses
 * it. That is the point of putting the rules there, but it would be unhelpful to
 * surface the result as a 500 "something went wrong", so each SQLite result
 * code is mapped to the status that actually describes it.
 *
 * Returns null for anything that is not a constraint failure, so genuine bugs
 * still surface as 500s.
 */
const SQLITE_CONSTRAINT_FOREIGNKEY = 787;
const SQLITE_CONSTRAINT_CHECK = 275;
const SQLITE_CONSTRAINT_UNIQUE = 2067;
const SQLITE_CONSTRAINT_TRIGGER = 1811;

const mapSqliteError = (
  error: unknown,
): { status: number; code: string; message: string } | null => {
  const errcode = (error as { errcode?: number } | null)?.errcode;
  if (errcode === undefined) return null;

  switch (errcode) {
    case SQLITE_CONSTRAINT_UNIQUE:
      return {
        status: 409,
        code: 'conflict',
        message: 'That day already has a record for this goal.',
      };
    case SQLITE_CONSTRAINT_FOREIGNKEY:
      return {
        status: 400,
        code: 'unknown_reference',
        message: 'That record refers to a goal that no longer exists.',
      };
    case SQLITE_CONSTRAINT_TRIGGER:
    case SQLITE_CONSTRAINT_CHECK:
      return {
        status: 400,
        code: 'rejected_by_schema',
        // The trigger and CHECK messages are written for a human and name the
        // exact rule that refused the write, which is more useful than any
        // generic "invalid goal" text.
        message: (error as Error).message,
      };
    default:
      return null;
  }
};

/* -------------------------------------------------------------------------- */
/* Request body                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Read and parse a JSON body, refusing anything oversized.
 *
 * The limit is not paranoia about SQLite — it is that this is an unauthenticated
 * endpoint, so an unbounded body is a trivial way to exhaust memory.
 */
export const readJsonBody = async (req: IncomingMessage, maxBytes: number): Promise<unknown> => {
  const chunks: Buffer[] = [];
  let total = 0;

  for await (const chunk of req) {
    const buf = chunk as Buffer;
    total += buf.length;
    if (total > maxBytes) {
      throw new HttpError(413, 'payload_too_large', 'Request body is too large.');
    }
    chunks.push(buf);
  }

  if (total === 0) return {};

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw badRequest('Request body is not valid JSON.');
  }
};

/* -------------------------------------------------------------------------- */
/* Router                                                                      */
/* -------------------------------------------------------------------------- */

export interface RequestContext {
  req: IncomingMessage;
  res: ServerResponse;
  /** Path parameters captured from the route pattern, e.g. `:id`. */
  params: Record<string, string>;
  query: URLSearchParams;
  /** Parsed JSON body; `{}` for methods that carry none. */
  body: unknown;
  maxBodyBytes: number;
}

type Handler = (ctx: RequestContext) => Promise<void> | void;

interface Route {
  method: string;
  segments: string[];
  handler: Handler;
}

/**
 * Method-and-path router.
 *
 * Supports `:param` segments. A path that matches no route but is not `/api`
 * falls through to the static handler, which is what makes the client-side
 * router's deep links work.
 */
export class Router {
  private readonly routes: Route[] = [];

  add(method: string, pattern: string, handler: Handler): this {
    this.routes.push({
      method,
      segments: pattern.split('/').filter(Boolean),
      handler,
    });
    return this;
  }

  get = (pattern: string, handler: Handler): this => this.add('GET', pattern, handler);
  post = (pattern: string, handler: Handler): this => this.add('POST', pattern, handler);
  patch = (pattern: string, handler: Handler): this => this.add('PATCH', pattern, handler);
  put = (pattern: string, handler: Handler): this => this.add('PUT', pattern, handler);
  delete = (pattern: string, handler: Handler): this => this.add('DELETE', pattern, handler);

  /**
   * Find a handler, or report that nothing matched. Distinguishing "no such
   * path" from "wrong method" matters: the second is a 405, and telling them
   * apart is what stops a client bug looking like a missing endpoint.
   */
  match(
    method: string,
    pathname: string,
  ): { handler: Handler; params: Record<string, string> } | 'not_found' | 'method_not_allowed' {
    const parts = pathname.split('/').filter(Boolean);
    let pathMatched = false;

    for (const route of this.routes) {
      if (route.segments.length !== parts.length) continue;

      const params: Record<string, string> = {};
      let matched = true;

      for (let i = 0; i < route.segments.length; i += 1) {
        const expected = route.segments[i] as string;
        const actual = parts[i] as string;
        if (expected.startsWith(':')) params[expected.slice(1)] = decodeURIComponent(actual);
        else if (expected !== actual) {
          matched = false;
          break;
        }
      }

      if (!matched) continue;
      pathMatched = true;
      if (route.method === method) return { handler: route.handler, params };
    }

    return pathMatched ? 'method_not_allowed' : 'not_found';
  }
}
