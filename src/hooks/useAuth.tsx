import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DEFAULT_SETTINGS, type AppSettings, type Profile } from '@/types/profile';
import { detectTimeZone, todayIn, getLogicalDate, type CivilDate } from '@/lib/date/civil';
import { type AppError } from '@/lib/errors';

interface AuthContextValue {
  isAuthenticated: boolean | null;
  verifyAccess: (code: string) => Promise<boolean>;
  profile: Profile | null;
  settings: AppSettings;
  error: AppError | null;
  isProfileLoading: boolean;
  updateProfile: (patch: { displayName?: string; timezone?: string }) => Promise<void>;
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>;
  reloadProfile: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }): ReactNode => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [error, setError] = useState<AppError | null>(null);
  const [isProfileLoading, setIsProfileLoading] = useState(true);

  const loadData = useCallback(async () => {
    setIsProfileLoading(true);
    try {
      const accessRes = await fetch('/api/access/session');
      const accessData = await accessRes.json();
      
      if (!accessData.authenticated) {
        setIsAuthenticated(false);
        setIsProfileLoading(false);
        return;
      }
      setIsAuthenticated(true);

      const [pRes, sRes] = await Promise.all([
        fetch('/api/profile'),
        fetch('/api/settings')
      ]);
      const p = await pRes.json();
      const s = await sRes.json();
      setProfile({
        id: p.id?.toString() ?? '1',
        displayName: p.display_name,
        timezone: p.timezone,
        createdAt: p.created_at,
        updatedAt: p.updated_at
      });
      setSettings({
        weekStartsOn: s.week_starts_on,
        notificationsEnabled: s.notifications_enabled,
        defaultReminderTime: s.default_reminder_time,
        defaultUnit: s.default_unit,
        hideEmptyHistoryDays: s.hide_empty_history_days
      });
      setError(null);
    } catch (e: any) {
      setError(e);
    } finally {
      setIsProfileLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const verifyAccess = useCallback(async (code: string) => {
    try {
      const res = await fetch('/api/access/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      });
      const data = await res.json();
      if (data.authenticated) {
        setIsAuthenticated(true);
        loadData();
        return true;
      }
      return false;
    } catch {
      throw new Error("Couldn't connect to the server. Please check your connection and try again.");
    }
  }, [loadData]);

  const updateProfile = useCallback(async (patch: { displayName?: string; timezone?: string }) => {
    const res = await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch)
    });
    const data = await res.json();
    setProfile({
      id: data.id?.toString() ?? '1',
      displayName: data.display_name,
      timezone: data.timezone,
      createdAt: data.created_at,
      updatedAt: data.updated_at
    });
  }, []);

  const updateSettings = useCallback(async (patch: Partial<AppSettings>) => {
    const res = await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch)
    });
    const data = await res.json();
    setSettings({
      weekStartsOn: data.week_starts_on,
      notificationsEnabled: data.notifications_enabled,
      defaultReminderTime: data.default_reminder_time,
      defaultUnit: data.default_unit,
      hideEmptyHistoryDays: data.hide_empty_history_days
    });
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    isAuthenticated,
    verifyAccess,
    profile,
    settings,
    error,
    isProfileLoading,
    updateProfile,
    updateSettings,
    reloadProfile: loadData,
  }), [isAuthenticated, verifyAccess, profile, settings, error, isProfileLoading, updateProfile, updateSettings, loadData]);

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
  const [today, setToday] = useState<CivilDate>(() => getLogicalDate());
  useEffect(() => {
    const tick = (): void => {
      const next = getLogicalDate();
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
