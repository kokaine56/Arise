/**
 * HTTP plumbing: a small router, JSON helpers, and the translation of SQLite
 * constraint failures into meaningful status codes.
 *
 * There is no web framework here on purpose. The API is a dozen endpoints over
 * one file, and a dependency would add install time and supply-chain surface
 * without removing a meaningful amount of code.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
export declare class HttpError extends Error {
    readonly status: number;
    readonly code: string;
    constructor(status: number, code: string, message: string);
}
export declare const badRequest: (message: string, code?: string) => HttpError;
export declare const notFound: (message?: string) => HttpError;
export declare const sendJson: (res: ServerResponse, status: number, body: unknown) => void;
export declare const sendNoContent: (res: ServerResponse) => void;
export declare const sendError: (res: ServerResponse, error: unknown) => void;
/**
 * Read and parse a JSON body, refusing anything oversized.
 *
 * The limit is not paranoia about SQLite — it is that this is an unauthenticated
 * endpoint, so an unbounded body is a trivial way to exhaust memory.
 */
export declare const readJsonBody: (req: IncomingMessage, maxBytes: number) => Promise<unknown>;
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
/**
 * Method-and-path router.
 *
 * Supports `:param` segments. A path that matches no route but is not `/api`
 * falls through to the static handler, which is what makes the client-side
 * router's deep links work.
 */
export declare class Router {
    private readonly routes;
    add(method: string, pattern: string, handler: Handler): this;
    get: (pattern: string, handler: Handler) => this;
    post: (pattern: string, handler: Handler) => this;
    patch: (pattern: string, handler: Handler) => this;
    put: (pattern: string, handler: Handler) => this;
    delete: (pattern: string, handler: Handler) => this;
    /**
     * Find a handler, or report that nothing matched. Distinguishing "no such
     * path" from "wrong method" matters: the second is a 405, and telling them
     * apart is what stops a client bug looking like a missing endpoint.
     */
    match(method: string, pathname: string): {
        handler: Handler;
        params: Record<string, string>;
    } | 'not_found' | 'method_not_allowed';
}
export {};
//# sourceMappingURL=http.d.ts.map