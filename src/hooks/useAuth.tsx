import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DEFAULT_SETTINGS, type AppSettings, type Profile } from '@/types/profile';
import { detectTimeZone, todayIn, type CivilDate } from '@/lib/date/civil';
import { type AppError } from '@/lib/errors';

export type AuthStatus = 'loading' | 'signed-out' | 'signed-in';

interface AuthContextValue {
  status: AuthStatus;
  session: any | null;
  user: any | null;
  profile: Profile | null;
  settings: AppSettings;
  error: AppError | null;
  isProfileLoading: boolean;
  updateProfile: (patch: { displayName?: string; timezone?: string }) => Promise<void>;
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>;
  reloadProfile: () => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const FAKE_USER = { id: 'local-user', email: 'guest@local' };

export const AuthProvider = ({ children }: { children: ReactNode }): ReactNode => {
  const [status, setStatus] = useState<AuthStatus>('signed-in');
  const [profile, setProfile] = useState<Profile | null>({
    id: 'local-user',
    displayName: 'Guest',
    timezone: detectTimeZone(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  const updateProfile = useCallback(async (patch: { displayName?: string; timezone?: string }) => {
    setProfile(p => p ? { ...p, ...patch, updatedAt: new Date().toISOString() } : p);
  }, []);

  const updateSettings = useCallback(async (patch: Partial<AppSettings>) => {
    setSettings(s => ({ ...s, ...patch }));
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    status,
    session: { access_token: 'fake-token', user: FAKE_USER },
    user: FAKE_USER,
    profile,
    settings,
    error: null,
    isProfileLoading: false,
    updateProfile,
    updateSettings,
    reloadProfile: () => {},
    signOut: async () => setStatus('signed-out'),
  }), [status, profile, settings, updateProfile, updateSettings]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
};

export const useTimeZone = (): string => {
  const { profile } = useAuth();
  return profile?.timezone ?? detectTimeZone();
};

export const useWeekStart = (): 1 | 7 => useAuth().settings.weekStartsOn;

export const useToday = (timeZone: string): CivilDate => {
  const [today, setToday] = useState<CivilDate>(() => todayIn(timeZone));
  useEffect(() => {
    const tick = (): void => {
      const next = todayIn(timeZone);
      setToday((previous) => (previous === next ? previous : next));
    };
    const timer = window.setInterval(tick, 60_000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [timeZone]);
  return today;
};
