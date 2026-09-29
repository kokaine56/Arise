import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { ThemePreference } from '@/types/profile';

const STORAGE_KEY = 'arise.theme';

interface ThemeContextValue {
  /** What the user chose, which may be `system`. */
  preference: ThemePreference;
  /** What is actually on screen. */
  resolved: 'dark' | 'light';
  setPreference: (next: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const systemPrefersLight = (): boolean => {
  try {
    return window.matchMedia('(prefers-color-scheme: light)').matches;
  } catch {
    return false;
  }
};

const readStoredPreference = (): ThemePreference => {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === 'dark' || stored === 'light' ? stored : 'system';
  } catch {
    return 'system';
  }
};

/**
 * Theme is deliberately the one piece of state allowed in localStorage. It is a
 * rendering preference with no health data in it, and reading it before first
 * paint (see index.html) prevents a flash of the wrong surface.
 */
export const ThemeProvider = ({ children }: { children: ReactNode }): ReactNode => {
  const [preference, setPreferenceState] = useState<ThemePreference>(readStoredPreference);
  const [systemLight, setSystemLight] = useState<boolean>(systemPrefersLight);

  // Track the OS setting so `system` stays live rather than being sampled once.
  useEffect(() => {
    let media: MediaQueryList;
    try {
      media = window.matchMedia('(prefers-color-scheme: light)');
    } catch {
      return;
    }
    const onChange = (event: MediaQueryListEvent): void => setSystemLight(event.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const resolved: 'dark' | 'light' =
    preference === 'system' ? (systemLight ? 'light' : 'dark') : preference;

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', resolved);
    // Keeps mobile browser chrome in step with the surface behind it.
    const color = resolved === 'dark' ? '#08090b' : '#edeff2';
    for (const meta of document.querySelectorAll('meta[name="theme-color"]')) meta.remove();
    const tag = document.createElement('meta');
    tag.name = 'theme-color';
    tag.content = color;
    document.head.appendChild(tag);
  }, [resolved]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    try {
      if (next === 'system') window.localStorage.removeItem(STORAGE_KEY);
      else window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // A blocked storage API must not break theming.
    }
  }, []);

  const value = useMemo(
    () => ({ preference, resolved, setPreference }),
    [preference, resolved, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = (): ThemeContextValue => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside <ThemeProvider>');
  return context;
};
