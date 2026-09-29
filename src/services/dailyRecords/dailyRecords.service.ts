/**
 * Daily completion records.
 *
 * Exactly one record may exist per (goal_id, date), enforced by a UNIQUE
 * constraint in the schema, so a double-tap or a retried request converges on
 * the same row instead of forking the day.
 *
 * For measured goals the database derives `completed` from `actual_value` in a
 * trigger, so the client never has to be trusted with that arithmetic. The row
 * returned below is the post-trigger row: if the client asked to record 1 km of a
 * 3 km goal, it is told the goal is not complete.
 */

import { toAppError } from '@/lib/errors';
import { api, queryString } from '@/lib/api/client';
import type { DailyGoalRecordRow } from '@/lib/api/types';
import type { CivilDate } from '@/lib/date/civil';
import { toDailyRecord } from '@/services/mappers';
import type { DailyRecord, DailyRecordInput } from '@/types/dailyRecord';

export interface RecordRange {
  from: CivilDate;
  to: CivilDate;
}

/**
 * Records within an inclusive date range. Backs the dashboard, the weekly
 * overview and the history calendar with one indexed read each.
 */
export const listRecordsInRange = async ({ from, to }: RecordRange): Promise<DailyRecord[]> => {
  try {
    const rows = await api.get<DailyGoalRecordRow[]>(
      `/records${queryString({ from, to })}`,
    );
    return rows.map(toDailyRecord);
  } catch (raw) {
    throw toAppError(raw, 'record.load');
  }
};

export const listRecordsForDate = async (date: CivilDate): Promise<DailyRecord[]> => {
  try {
    const rows = await api.get<DailyGoalRecordRow[]>(`/records${queryString({ date })}`);
    return rows.map(toDailyRecord);
  } catch (raw) {
    throw toAppError(raw, 'record.load');
  }
};

export const getRecord = async (
  goalId: string,
  date: CivilDate,
): Promise<DailyRecord | null> => {
  try {
    const row = await api.get<DailyGoalRecordRow | null>(
      `/records${queryString({ goalId, date })}`,
    );
    return row ? toDailyRecord(row) : null;
  } catch (raw) {
    throw toAppError(raw, 'record.load');
  }
};

/**
 * Insert or update the single record for this goal and day.
 *
 * `completedAt` is passed explicitly rather than defaulted by the client so the
 * "late" determination for time goals is made from a single, agreed instant.
 */
export const upsertRecord = async (input: DailyRecordInput): Promise<DailyRecord> => {
  try {
    return toDailyRecord(await api.put<DailyGoalRecordRow>('/records', input));
  } catch (raw) {
    throw toAppError(raw, 'record.upsert');
  }
};

/** Clear a day back to "not recorded". */
export const clearRecord = async (goalId: string, date: CivilDate): Promise<void> => {
  try {
    await api.delete<void>(`/records${queryString({ goalId, date })}`);
  } catch (raw) {
    throw toAppError(raw, 'record.upsert');
  }
};

/** Attach or clear a private note on a day. */
export const setRecordNote = async (
  goalId: string,
  date: CivilDate,
  notes: string | null,
): Promise<void> => {
  try {
    await api.put<DailyGoalRecordRow>('/records/notes', { goalId, date, notes });
  } catch (raw) {
    throw toAppError(raw, 'record.upsert');
  }
};
