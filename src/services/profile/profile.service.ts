import { toAppError } from '@/lib/errors';
import { api } from '@/lib/api/client';
import type { ProfileRow, UserSettingRow } from '@/lib/api/types';
import { toProfile, toSettings } from '@/services/mappers';
import type { AppSettings, Profile, WeekStart } from '@/types/profile';

/**
 * There is exactly one profile and one settings row, seeded by the migration, so
 * these are reads and updates — never a create, and never a question of which
 * row is "mine".
 */
export const getProfile = async (): Promise<Profile | null> => {
  try {
    return toProfile(await api.get<ProfileRow>('/profile'));
  } catch (raw) {
    throw toAppError(raw, 'profile.load');
  }
};

export const updateProfile = async (patch: {
  displayName?: string;
  timezone?: string;
}): Promise<Profile> => {
  try {
    return toProfile(await api.patch<ProfileRow>('/profile', patch));
  } catch (raw) {
    throw toAppError(raw, 'profile.update');
  }
};

export const getSettings = async (): Promise<AppSettings | null> => {
  try {
    return toSettings(await api.get<UserSettingRow>('/settings'));
  } catch (raw) {
    throw toAppError(raw, 'settings.load');
  }
};

export const updateSettings = async (patch: Partial<AppSettings>): Promise<AppSettings> => {
  try {
    return toSettings(await api.patch<UserSettingRow>('/settings', patch));
  } catch (raw) {
    throw toAppError(raw, 'profile.update');
  }
};

export const setWeekStart = async (weekStartsOn: WeekStart): Promise<AppSettings> =>
  updateSettings({ weekStartsOn });
