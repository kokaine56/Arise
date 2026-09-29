import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { getSupabase } from '@/lib/supabase/client';
import { setSessionUser } from '@/lib/supabase/session';
import { toAppError, type AppError } from '@/lib/errors';
import { DEFAULT_SETTINGS, type AppSettings, type Profile } from '@/types/profile';
import { detectTimeZone, isValidTimeZone, todayIn, type CivilDate } from '@/lib/date/civil';

export type AuthStatus = 'loading' | 'signed-out' | 'signed-in';

interface AuthContextValue {
  status: AuthStatus;
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  settings: AppSettings;
  error: AppError | null;
  /** `true` while the profile row is still being read after sign-in. */
  isProfileLoading: boolean;
  updateProfile: (patch: { displayName?: string; timezone?: string }) => Promise<void>;
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>;
  reloadProfile: () => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Session, profile and settings in one place.
 *
 * The profile row is created by a database trigger on signup, so the only
 * timing that matters here is the first load after a sign-in — handled by
 * `getProfileOrDefault`, which falls back to local defaults rather than
 * blocking the whole app on one row.
 */
export const AuthProvider = ({ children }: { children: ReactNode }): ReactNode => {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  const [profileNonce, setProfileNonce] = useState(0);

  const supabase = getSupabase();

  useEffect(() => {
    if (!supabase) {
      setStatus('signed-out');
      return;
    }

    let active = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session ?? null);
      setStatus(data.session ? 'signed-in' : 'signed-out');
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setStatus(next ? 'signed-in' : 'signed-out');
      if (!next) {
        // Never leave one account's data on screen after signing out.
        setProfile(null);
        setSettings(DEFAULT_SETTINGS);
        setSessionUser(null);
      }
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [supabase]);

  // Mirror the session into the in-memory user store the services read from.
  useEffect(() => {
    setSessionUser(session?.user ?? null);
  }, [session]);

  const userId = session?.user.id ?? null;

  useEffect(() => {
    if (!userId || !supabase) {
      setProfile(null);
      setSettings(DEFAULT_SETTINGS);
      return;
    }

    let active = true;
    setIsProfileLoading(true);

    void (async () => {
      try {
        const [profileRow, settingsRow] = await Promise.all([
          supabase.from('profiles').select('*').maybeSingle(),
          supabase.from('user_settings').select('*').maybeSingle(),
        ]);
        if (!active) return;

        if (profileRow.error) throw toAppError(profileRow.error, 'profile.load');
        if (settingsRow.error) throw toAppError(settingsRow.error, 'settings.load');

        if (profileRow.data) {
          const timezone = isValidTimeZone(profileRow.data.timezone)
            ? profileRow.data.timezone
            : detectTimeZone();
          setProfile({
            id: profileRow.data.id,
            displayName: profileRow.data.display_name,
            timezone,
            createdAt: profileRow.data.created_at,
            updatedAt: profileRow.data.updated_at,
          });
        }

        if (settingsRow.data) {
          setSettings({
            weekStartsOn: settingsRow.data.week_starts_on === 7 ? 7 : 1,
            notificationsEnabled: settingsRow.data.notifications_enabled,
            defaultReminderTime: settingsRow.data.default_reminder_time,
            defaultUnit: settingsRow.data.default_unit,
            hideEmptyHistoryDays: settingsRow.data.hide_empty_history_days,
          });
        }
      } catch (raw) {
        if (!active) return;
        // A profile read failure must not sign the user out; the app stays
        // usable with local defaults and the banner explains.
        setError(toAppError(raw, 'profile.load'));
      } finally {
        if (active) setIsProfileLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [userId, supabase, profileNonce]);

  const reloadProfile = useCallback(() => setProfileNonce((n) => n + 1), []);

  const updateProfile = useCallback<AuthContextValue['updateProfile']>(
    async (patch) => {
      const { data, error: failure } = await supabase!
        .from('profiles')
        .update({
          ...(patch.displayName !== undefined && { display_name: patch.displayName }),
          ...(patch.timezone !== undefined && { timezone: patch.timezone }),
        })
        .select('*')
        .single();

      if (failure) throw toAppError(failure, 'profile.update');
      setProfile((previous) =>
        previous
          ? {
              ...previous,
              displayName: data.display_name,
              timezone: data.timezone,
              updatedAt: data.updated_at,
            }
          : previous,
      );
    },
    [supabase],
  );

  const updateSettings = useCallback<AuthContextValue['updateSettings']>(
    async (patch) => {
      // Applied locally first so a toggle feels instant, then reconciled with
      // whatever the database stored.
      setSettings((previous) => ({ ...previous, ...patch }));
      try {
        const { data, error: failure } = await supabase!
          .from('user_settings')
          .update({
            ...(patch.weekStartsOn !== undefined && { week_starts_on: patch.weekStartsOn }),
            ...(patch.notificationsEnabled !== undefined && {
              notifications_enabled: patch.notificationsEnabled,
            }),
            ...(patch.defaultReminderTime !== undefined && {
              default_reminder_time: patch.defaultReminderTime,
            }),
            ...(patch.defaultUnit !== undefined && { default_unit: patch.defaultUnit }),
            ...(patch.hideEmptyHistoryDays !== undefined && {
              hide_empty_history_days: patch.hideEmptyHistoryDays,
            }),
          })
          .select('*')
          .single();

        if (failure) throw toAppError(failure, 'profile.update');
        setSettings({
          weekStartsOn: data.week_starts_on === 7 ? 7 : 1,
          notificationsEnabled: data.notifications_enabled,
          defaultReminderTime: data.default_reminder_time,
          defaultUnit: data.default_unit,
          hideEmptyHistoryDays: data.hide_empty_history_days,
        });
      } catch (raw) {
        setSettings((previous) => ({ ...previous }));
        throw raw;
      }
    },
    [supabase],
  );

  const signOut = useCallback(async () => {
    if (!supabase) return;
    const { error: failure } = await supabase.auth.signOut();
    if (failure) throw toAppError(failure, 'auth.signOut');
  }, [supabase]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      session,
      user: session?.user ?? null,
      profile,
      settings,
      error,
      isProfileLoading,
      updateProfile,
      updateSettings,
      reloadProfile,
      signOut,
    }),
    [
      status,
      session,
      profile,
      settings,
      error,
      isProfileLoading,
      updateProfile,
      updateSettings,
      reloadProfile,
      signOut,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
};

/** The user's timezone, with a safe fallback for a profile that has not loaded. */
export const useTimeZone = (): string => {
  const { profile } = useAuth();
  return profile?.timezone ?? detectTimeZone();
};

/** Which day the week starts on, used by history and insights. */
export const useWeekStart = (): 1 | 7 => useAuth().settings.weekStartsOn;

/** `today` in the user's own timezone. Recomputed when the clock crosses midnight. */
export const useToday = (timeZone: string): CivilDate => {
  const [today, setToday] = useState<CivilDate>(() => todayIn(timeZone));

  useEffect(() => {
    const tick = (): void => {
      const next = todayIn(timeZone);
      setToday((previous) => (previous === next ? previous : next));
    };
    // A minute is frequent enough to notice midnight without burning battery.
    const timer = window.setInterval(tick, 60_000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [timeZone]);

  return today;
};
