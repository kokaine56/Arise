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
import { existsSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { gzipSync } from 'node:zlib';
const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.avif': 'image/avif',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.txt': 'text/plain; charset=utf-8',
    '.webmanifest': 'application/manifest+json',
};
/** Text formats worth compressing. Images and fonts are already compressed. */
const COMPRESSIBLE = new Set([
    '.html',
    '.js',
    '.mjs',
    '.css',
    '.json',
    '.svg',
    '.txt',
    '.webmanifest',
]);
/**
 * Response headers applied to every asset.
 *
 * The CSP allows only self-hosted scripts and styles, plus Google Fonts, which
 * is where the typography in index.html comes from. `'unsafe-inline'` is present
 * for scripts and styles only: index.html resolves the theme before first paint
 * in an inline script that cannot become a file without reintroducing a flash of
 * the wrong surface.
 */
const securityHeaders = {
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'permissions-policy': 'geolocation=(), microphone=(), camera=()',
    'content-security-policy': [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        'font-src https://fonts.gstatic.com',
        "img-src 'self' data:",
        "connect-src 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
        'base-uri self',
    ].join('; '),
};
export class StaticHandler {
    root;
    indexPath;
    /** Gzipped bodies keyed by absolute path, for the immutable asset bundles. */
    compressed = new Map();
    constructor(root) {
        this.root = resolve(root);
        this.indexPath = join(this.root, 'index.html');
    }
    /** True when a build is present. Reported by /healthz. */
    get hasBuild() {
        return existsSync(this.indexPath);
    }
    /**
     * Serve `pathname`, or return false to let the caller fall back to index.html.
     *
     * `acceptEncoding` is honoured rather than assumed: sending gzip to a client
     * that did not ask for it produces bytes it cannot read.
     */
    async serve(pathname, acceptEncoding, res) {
        const target = this.resolveRequest(pathname);
        if (!target)
            return false;
        const isIndex = target === this.indexPath;
        const { body, encoding } = await this.bodyFor(target, acceptEncoding);
        res.writeHead(200, {
            ...securityHeaders,
            'content-type': MIME[extname(target).toLowerCase()] ?? 'application/octet-stream',
            'content-length': body.length,
            'cache-control': isIndex ? 'no-cache' : 'public, max-age=31536000, immutable',
            // The body may be gzip or identity depending on the request, so any shared
            // cache in between has to key on the encoding.
            vary: 'Accept-Encoding',
            ...(encoding === 'gzip' ? { 'content-encoding': 'gzip' } : {}),
        });
        res.end(body);
        return true;
    }
    /**
     * Map a URL path to a file inside the root, or null if it does not resolve to
     * one.
     *
     * The traversal check runs on the *resolved* path rather than rejecting `..`
     * textually, because percent-encoding and separator tricks both survive a
     * textual check.
     */
    resolveRequest(pathname) {
        let decoded;
        try {
            decoded = decodeURIComponent(pathname);
        }
        catch {
            return null;
        }
        if (decoded.endsWith('/'))
            decoded += 'index.html';
        const candidate = resolve(join(this.root, normalize(decoded)));
        if (candidate !== this.root && !candidate.startsWith(this.root + sep))
            return null;
        if (!existsSync(candidate) || !statSync(candidate).isFile())
            return null;
        return candidate;
    }
    async bodyFor(path, acceptEncoding) {
        const ext = extname(path).toLowerCase();
        if (!COMPRESSIBLE.has(ext) || !/\bgzip\b/.test(acceptEncoding)) {
            return { body: await readFile(path), encoding: null };
        }
        // Vite's bundles are ~165 kB raw and ~54 kB gzipped, which is worth having on
        // a mobile connection. Compressed bundles are memoised because hashed asset
        // filenames are immutable by construction; index.html is small and is
        // compressed per request so a deploy is never served from a stale cache.
        const isImmutable = path.includes(`${sep}assets${sep}`);
        if (isImmutable) {
            const cached = this.compressed.get(path);
            if (cached)
                return { body: cached, encoding: 'gzip' };
        }
        const gzipped = gzipSync(await readFile(path));
        if (isImmutable)
            this.compressed.set(path, gzipped);
        return { body: gzipped, encoding: 'gzip' };
    }
}
//# sourceMappingURL=static.js.map