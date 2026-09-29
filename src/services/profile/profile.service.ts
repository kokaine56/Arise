import { toAppError } from '@/lib/errors';
import { requireSupabase } from '@/lib/supabase/client';
import { toProfile, toSettings } from '@/services/mappers';
import type { AppSettings, Profile, WeekStart } from '@/types/profile';

/**
 * The profile row is created by a database trigger on signup, so this is a
 * read-or-create rather than an insert. RLS scopes it to the signed-in user.
 */
export const getProfile = async (): Promise<Profile | null> => {
  const { data, error } = await requireSupabase()
    .from('profiles')
    .select('*')
    .maybeSingle();

  if (error) throw toAppError(error, 'profile.load');
  return data ? toProfile(data) : null;
};

export const updateProfile = async (patch: {
  displayName?: string;
  timezone?: string;
}): Promise<Profile> => {
  const { data, error } = await requireSupabase()
    .from('profiles')
    .update({
      ...(patch.displayName !== undefined && { display_name: patch.displayName }),
      ...(patch.timezone !== undefined && { timezone: patch.timezone }),
    })
    .select('*')
    .single();

  if (error) throw toAppError(error, 'profile.update');
  return toProfile(data);
};

export const getSettings = async (): Promise<AppSettings | null> => {
  const { data, error } = await requireSupabase()
    .from('user_settings')
    .select('*')
    .maybeSingle();

  if (error) throw toAppError(error, 'settings.load');
  return data ? toSettings(data) : null;
};

export const updateSettings = async (patch: Partial<AppSettings>): Promise<AppSettings> => {
  const { data, error } = await requireSupabase()
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

  if (error) throw toAppError(error, 'profile.update');
  return toSettings(data);
};

export const setWeekStart = async (weekStartsOn: WeekStart): Promise<AppSettings> =>
  updateSettings({ weekStartsOn });
