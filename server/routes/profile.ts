/**
 * Profile and settings endpoints.
 *
 * Both tables hold exactly one row, enforced by `CHECK (id = 1)`. There is no
 * create path: the migration seeds them, so every request is a read or an update
 * and there is no "which row is mine" question to get wrong.
 */

import type { Db } from '../db.ts';
import { transaction } from '../db.ts';
import { notFound, sendJson, type Router } from '../http.ts';
import {
  asBoolean,
  asClockOrNull,
  asString,
  asStringOrNull,
  requireObject,
} from '../validate.ts';

interface DbProfile {
  id: number;
  display_name: string;
  timezone: string;
  created_at: string;
  updated_at: string;
}

interface DbSettings {
  id: number;
  week_starts_on: number;
  notifications_enabled: number;
  default_reminder_time: string | null;
  default_unit: string | null;
  hide_empty_history_days: number;
}

const toProfile = (row: DbProfile): Record<string, unknown> => ({
  id: row.id,
  display_name: row.display_name,
  timezone: row.timezone,
  created_at: row.created_at,
  updated_at: row.updated_at,
});

const toSettings = (row: DbSettings): Record<string, unknown> => ({
  week_starts_on: row.week_starts_on,
  notifications_enabled: row.notifications_enabled === 1,
  default_reminder_time: row.default_reminder_time,
  default_unit: row.default_unit,
  hide_empty_history_days: row.hide_empty_history_days === 1,
});

const readProfile = (db: Db): DbProfile => {
  const row = db.prepare('SELECT * FROM profiles WHERE id = 1').get() as DbProfile | undefined;
  if (!row) throw notFound('This installation has no profile row.');
  return row;
};

const readSettings = (db: Db): DbSettings => {
  const row = db.prepare('SELECT * FROM user_settings WHERE id = 1').get() as
    | DbSettings
    | undefined;
  if (!row) throw notFound('This installation has no settings row.');
  return row;
};

export const registerProfileRoutes = (router: Router, db: Db): void => {
  router.get('/api/profile', ({ res }) => {
    sendJson(res, 200, toProfile(readProfile(db)));
  });

  router.patch('/api/profile', ({ body, res }) => {
    const patch = requireObject(body);
    const sets: string[] = [];
    const values: unknown[] = [];

    if (patch['displayName'] !== undefined) {
      sets.push('display_name = ?');
      values.push(asString(patch['displayName'], 'displayName', 60));
    }
    if (patch['timezone'] !== undefined) {
      const zone = asString(patch['timezone'], 'timezone', 64);
      // Checked here as well as by the length constraint, because a zone name
      // that is well-formed but unrecognised would silently make every civil
      // date fall back to UTC and quietly shift the user's day.
      if (!isValidTimeZone(zone)) {
        throw notFound('That is not a time zone Arise recognises.');
      }
      sets.push('timezone = ?');
      values.push(zone);
    }

    if (sets.length > 0) {
      values.push(1);
      db.prepare(`UPDATE profiles SET ${sets.join(', ')} WHERE id = ?`).run(...values);
    }

    sendJson(res, 200, toProfile(readProfile(db)));
  });

  router.get('/api/settings', ({ res }) => {
    sendJson(res, 200, toSettings(readSettings(db)));
  });

  router.patch('/api/settings', ({ body, res }) => {
    const patch = requireObject(body);
    const sets: string[] = [];
    const values: unknown[] = [];

    if (patch['weekStartsOn'] !== undefined) {
      const week = patch['weekStartsOn'];
      if (week !== 1 && week !== 7) throw notFound('The week must start on Monday or Sunday.');
      sets.push('week_starts_on = ?');
      values.push(week);
    }
    if (patch['notificationsEnabled'] !== undefined) {
      sets.push('notifications_enabled = ?');
      values.push(asBoolean(patch['notificationsEnabled'], 'notificationsEnabled') ? 1 : 0);
    }
    if (patch['defaultReminderTime'] !== undefined) {
      sets.push('default_reminder_time = ?');
      values.push(asClockOrNull(patch['defaultReminderTime'], 'defaultReminderTime'));
    }
    if (patch['defaultUnit'] !== undefined) {
      sets.push('default_unit = ?');
      values.push(asStringOrNull(patch['defaultUnit'], 'defaultUnit', 16));
    }
    if (patch['hideEmptyHistoryDays'] !== undefined) {
      sets.push('hide_empty_history_days = ?');
      values.push(asBoolean(patch['hideEmptyHistoryDays'], 'hideEmptyHistoryDays') ? 1 : 0);
    }

    if (sets.length > 0) {
      const updated = transaction(db, () => {
        values.push(1);
        db.prepare(`UPDATE user_settings SET ${sets.join(', ')} WHERE id = ?`).run(...values);
        return readSettings(db);
      });
      sendJson(res, 200, toSettings(updated));
      return;
    }

    sendJson(res, 200, toSettings(readSettings(db)));
  });
};

/**
 * Reject a zone name the runtime does not know.
 *
 * `Intl` is the authority here rather than a hand-kept list, so it stays correct
 * as the platform's tzdata updates. The cost of skipping this check is high and
 * quiet: an unknown zone makes every date in the app resolve as UTC.
 */
const isValidTimeZone = (zone: string): boolean => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
};
