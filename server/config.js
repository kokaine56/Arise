/**
 * Runtime configuration.
 *
 * Every value is read from the environment and validated once, at boot, so a
 * misconfigured deployment fails immediately and loudly rather than at the first
 * request. Defaults are chosen so `node server/index.ts` works in a fresh
 * checkout with no environment at all.
 */
const DEFAULTS = {
    host: '0.0.0.0',
    port: 8080,
    dbPath: 'data/arise.db',
    staticDir: 'dist',
    maxBodyBytes: 256 * 1024,
};
const readInt = (name, fallback) => {
    const raw = process.env[name];
    if (raw === undefined || raw.trim() === '')
        return fallback;
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535) {
        throw new Error(`${name} must be an integer between 0 and 65535, got ${JSON.stringify(raw)}`);
    }
    return parsed;
};
const readString = (name, fallback) => {
    const raw = process.env[name];
    if (raw === undefined || raw.trim() === '')
        return fallback;
    return raw.trim();
};
export const loadConfig = () => ({
    host: readString('HOST', DEFAULTS.host),
    port: readInt('PORT', DEFAULTS.port),
    dbPath: readString('ARISE_DB_PATH', DEFAULTS.dbPath),
    staticDir: readString('ARISE_STATIC_DIR', DEFAULTS.staticDir),
    maxBodyBytes: readInt('ARISE_MAX_BODY_BYTES', DEFAULTS.maxBodyBytes),
});
//# sourceMappingURL=config.js.map