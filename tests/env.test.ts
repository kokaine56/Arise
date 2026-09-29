import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Runtime configuration resolution.
 *
 * This is the linchpin of the container deployment: `docker/entrypoint.sh`
 * writes `/env.js` from real environment variables, and this module decides
 * whether those values or Vite's build-time copy win. Getting the precedence
 * backwards does not throw — it silently points a freshly deployed container at
 * whichever Supabase project happened to be baked in at build time, which is
 * the worst possible failure mode. Hence the tests.
 *
 * The module reads its configuration once at evaluation, so each case resets the
 * module cache and re-imports it.
 */

const PROJECT_URL = 'https://abcdefghijklmnop.supabase.co';
const OTHER_PROJECT_URL = 'https://qrstuvwxyzabcdefgh.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.c2lnbmF0dXJl';

type PublicEnv = {
  VITE_SUPABASE_URL: string;
  VITE_SUPABASE_ANON_KEY: string;
  VITE_DEBUG_SUPABASE?: string;
};

const stubWindow = (value: Partial<PublicEnv> | undefined): void => {
  Object.defineProperty(globalThis, 'window', {
    value: value === undefined ? {} : { __ARISE_ENV__: value },
    writable: true,
    configurable: true,
  });
};

/** Re-evaluate the module with the given runtime window and build-time env. */
const loadEnv = async (options: {
  runtime?: Partial<PublicEnv>;
  baked?: Partial<PublicEnv>;
}): Promise<{
  url: string;
  anonKey: string;
  debug: boolean;
  configured: boolean;
  instructions: readonly string[];
}> => {
  vi.resetModules();
  stubWindow(options.runtime);
  vi.stubEnv('VITE_SUPABASE_URL', options.baked?.VITE_SUPABASE_URL ?? '');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', options.baked?.VITE_SUPABASE_ANON_KEY ?? '');
  vi.stubEnv('VITE_DEBUG_SUPABASE', options.baked?.VITE_DEBUG_SUPABASE ?? '');

  const mod = await import('@/lib/env');
  return {
    url: mod.supabaseConfig.url,
    anonKey: mod.supabaseConfig.anonKey,
    debug: mod.supabaseConfig.debug,
    configured: mod.isSupabaseConfigured(),
    instructions: mod.SETUP_INSTRUCTIONS,
  };
};

beforeEach(() => {
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  Reflect.deleteProperty(globalThis, 'window');
});

describe('configuration sources', () => {
  it('falls back to the build-time values when no runtime config is present', async () => {
    const env = await loadEnv({
      baked: { VITE_SUPABASE_URL: PROJECT_URL, VITE_SUPABASE_ANON_KEY: ANON_KEY },
    });
    expect(env.url).toBe(PROJECT_URL);
    expect(env.anonKey).toBe(ANON_KEY);
    expect(env.configured).toBe(true);
  });

  it('prefers the runtime values, which is what makes one image portable', async () => {
    const env = await loadEnv({
      runtime: { VITE_SUPABASE_URL: OTHER_PROJECT_URL, VITE_SUPABASE_ANON_KEY: ANON_KEY },
      baked: { VITE_SUPABASE_URL: PROJECT_URL, VITE_SUPABASE_ANON_KEY: ANON_KEY },
    });
    // A redeploy must be able to change project without a rebuild.
    expect(env.url).toBe(OTHER_PROJECT_URL);
    expect(env.url).not.toBe(PROJECT_URL);
  });

  it('ignores a blank runtime value rather than treating it as configured', async () => {
    const env = await loadEnv({
      runtime: { VITE_SUPABASE_URL: '   ' },
      baked: { VITE_SUPABASE_URL: PROJECT_URL, VITE_SUPABASE_ANON_KEY: ANON_KEY },
    });
    // An empty env.js must not blank out a working build-time config.
    expect(env.url).toBe(PROJECT_URL);
  });

  it('reports unconfigured when nothing supplies a value', async () => {
    const env = await loadEnv({});
    expect(env.url).toBe('');
    expect(env.configured).toBe(false);
  });
});

describe('isSupabaseConfigured', () => {
  it('rejects the placeholder from .env.example', async () => {
    const env = await loadEnv({
      baked: {
        VITE_SUPABASE_URL: PROJECT_URL,
        VITE_SUPABASE_ANON_KEY: 'your-anon-key-here',
      },
    });
    expect(env.configured).toBe(false);
  });

  it('rejects a key that is too short to be real', async () => {
    const env = await loadEnv({
      baked: { VITE_SUPABASE_URL: PROJECT_URL, VITE_SUPABASE_ANON_KEY: 'short' },
    });
    expect(env.configured).toBe(false);
  });

  it('rejects a URL that is not a Supabase project', async () => {
    const env = await loadEnv({
      baked: { VITE_SUPABASE_URL: 'https://example.com', VITE_SUPABASE_ANON_KEY: ANON_KEY },
    });
    expect(env.configured).toBe(false);
  });

  it('requires both values, not just the URL', async () => {
    const env = await loadEnv({ baked: { VITE_SUPABASE_URL: PROJECT_URL } });
    expect(env.configured).toBe(false);
  });

  it('accepts a real-looking project and key', async () => {
    const env = await loadEnv({
      baked: { VITE_SUPABASE_URL: PROJECT_URL, VITE_SUPABASE_ANON_KEY: ANON_KEY },
    });
    expect(env.configured).toBe(true);
  });
});

describe('debug flag', () => {
  it('is off unless explicitly set to the string true', async () => {
    expect((await loadEnv({})).debug).toBe(false);
    expect((await loadEnv({ baked: { VITE_DEBUG_SUPABASE: 'false' } })).debug).toBe(false);
    expect((await loadEnv({ baked: { VITE_DEBUG_SUPABASE: '1' } })).debug).toBe(false);
  });

  it('is on only for the exact string true', async () => {
    expect((await loadEnv({ baked: { VITE_DEBUG_SUPABASE: 'true' } })).debug).toBe(true);
  });
});

describe('setup instructions', () => {
  it('names the two configuration sources, not just the dev file', async () => {
    const env = await loadEnv({});
    const text = env.instructions.join(' ');
    // The copy used to tell users to edit .env.local only, which is wrong
    // advice for anyone running the container.
    expect(text).toMatch(/VITE_SUPABASE_URL/);
    expect(text).toMatch(/VITE_SUPABASE_ANON_KEY/);
    expect(text).toMatch(/environment variables|container/);
    expect(text).not.toMatch(/\.env\.local and fill/);
  });
});
