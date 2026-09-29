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

const DEFAULTS = {
  host: '0.0.0.0',
  port: 8080,
  dbPath: 'data/arise.db',
  staticDir: 'dist',
  maxBodyBytes: 256 * 1024,
} as const;

const readInt = (name: string, fallback: number): number => {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535) {
    throw new Error(`${name} must be an integer between 0 and 65535, got ${JSON.stringify(raw)}`);
  }
  return parsed;
};

const readString = (name: string, fallback: string): string => {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  return raw.trim();
};

export const loadConfig = (): ServerConfig => ({
  host: readString('HOST', DEFAULTS.host),
  port: readInt('PORT', DEFAULTS.port),
  dbPath: readString('ARISE_DB_PATH', DEFAULTS.dbPath),
  staticDir: readString('ARISE_STATIC_DIR', DEFAULTS.staticDir),
  maxBodyBytes: readInt('ARISE_MAX_BODY_BYTES', DEFAULTS.maxBodyBytes),
});
