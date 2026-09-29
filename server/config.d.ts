/**
 * Runtime configuration.
 *
 * Every value is read from the environment and validated once, at boot, so a
 * misconfigured deployment fails immediately and loudly rather than at the first
 * request. Defaults are chosen so `node server/index.ts` works in a fresh
 * checkout with no environment at all.
 */
export interface ServerConfig {
    /** Interface to bind. 0.0.0.0 so the container is reachable from outside. */
    host: string;
    port: number;
    /** SQLite file. Its parent directory is created on boot if missing. */
    dbPath: string;
    /** Built client to serve. */
    staticDir: string;
    /** Largest accepted request body, in bytes. */
    maxBodyBytes: number;
}
export declare const loadConfig: () => ServerConfig;
//# sourceMappingURL=config.d.ts.map