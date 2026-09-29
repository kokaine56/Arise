/**
 * Static file serving for the built client.
 *
 * This is what nginx was doing in the container, done in-process so the whole
 * deployment stays a single service. The caching rules are the part that
 * mattered and they are preserved exactly:
 *
 *   /assets/*   immutable, one year. Vite hashes these filenames, so a changed
 *               file always gets a new URL and a stale cache is unreachable.
 *   index.html  no-cache. It names the current hashed bundles, so it must be
 *               revalidated or a deploy would keep serving the old app.
 *   everything  else falls through to index.html, which is what makes a hard
 *               refresh on /goals or /settings work.
 */
import type { ServerResponse } from 'node:http';
export declare class StaticHandler {
    private readonly root;
    private readonly indexPath;
    /** Gzipped bodies keyed by absolute path, for the immutable asset bundles. */
    private readonly compressed;
    constructor(root: string);
    /** True when a build is present. Reported by /healthz. */
    get hasBuild(): boolean;
    /**
     * Serve `pathname`, or return false to let the caller fall back to index.html.
     *
     * `acceptEncoding` is honoured rather than assumed: sending gzip to a client
     * that did not ask for it produces bytes it cannot read.
     */
    serve(pathname: string, acceptEncoding: string, res: ServerResponse): Promise<boolean>;
    /**
     * Map a URL path to a file inside the root, or null if it does not resolve to
     * one.
     *
     * The traversal check runs on the *resolved* path rather than rejecting `..`
     * textually, because percent-encoding and separator tricks both survive a
     * textual check.
     */
    private resolveRequest;
    private bodyFor;
}
//# sourceMappingURL=static.d.ts.map