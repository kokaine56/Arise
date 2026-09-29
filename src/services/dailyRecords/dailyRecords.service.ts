/**
 * Daily completion records.
 *
 * Exactly one record may exist per (goal_id, date). Writes use an upsert on
 * that pair, so a double-tap or a retried request converges on the same row
 * instead of forking the day.
 *
 * For measured goals the database derives `completed` from `actual_value` via a
 * BEFORE trigger, so the client never has to be trusted with that arithmetic.
 */

import { toAppError } from '@/lib/errors';
import type { CivilDate } from '@/lib/date/civil';
import { requireSupabase } from '@/lib/supabase/client';
import { requireUserId } from '@/lib/supabase/session';
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
  const { data, error } = await requireSupabase()
    .from('daily_goal_records')
    .select('*')
    .gte('date', from)
    .lte('date', to)
    .order('date', { ascending: true });

  if (error) throw toAppError(error, 'record.load');
  return (data ?? []).map(toDailyRecord);
};

export const listRecordsForDate = async (date: CivilDate): Promise<DailyRecord[]> => {
  const { data, error } = await requireSupabase()
    .from('daily_goal_records')
    .select('*')
    .eq('date', date)
    .order('goal_id', { ascending: true });

  if (error) throw toAppError(error, 'record.load');
  return (data ?? []).map(toDailyRecord);
};

export const getRecord = async (goalId: string, date: CivilDate): Promise<DailyRecord | null> => {
  const { data, error } = await requireSupabase()
    .from('daily_goal_records')
    .select('*')
    .eq('goal_id', goalId)
    .eq('date', date)
    .maybeSingle();

  if (error) throw toAppError(error, 'record.load');
  return data ? toDailyRecord(data) : null;
};

/**
 * Insert or update the single record for this goal and day.
 *
 * `completedAt` is passed explicitly rather than defaulted by the client so the
 * "late" determination for time goals is made from a single, agreed instant.
 */
export const upsertRecord = async (input: DailyRecordInput): Promise<DailyRecord> => {
  const userId = requireUserId();
  const { data, error } = await requireSupabase()
    .from('daily_goal_records')
    .upsert(
      {
        user_id: userId,
        goal_id: input.goalId,
        date: input.date,
        completed: input.completed,
        actual_value: input.actualValue,
        notes: input.notes ?? null,
        completed_at: input.completedAt ?? null,
      },
      { onConflict: 'goal_id,date' },
    )
    .select('*')
    .single();

  if (error) throw toAppError(error, 'record.upsert');
  return toDailyRecord(data);
};

/** Clear a day back to "not recorded". */
export const clearRecord = async (goalId: string, date: CivilDate): Promise<void> => {
  const { error } = await requireSupabase()
    .from('daily_goal_records')
    .delete()
    .eq('goal_id', goalId)
    .eq('date', date);

  if (error) throw toAppError(error, 'record.upsert');
};

/** Attach a private note to a day. */
export const setRecordNote = async (
  goalId: string,
  date: CivilDate,
  notes: string | null,
): Promise<void> => {
  const userId = requireUserId();
  const { error } = await requireSupabase()
    .from('daily_goal_records')
    .upsert(
      {
        user_id: userId,
        goal_id: goalId,
        date,
        completed: false,
        actual_value: null,
        notes,
        completed_at: null,
      },
      { onConflict: 'goal_id,date' },
    );

  if (error) throw toAppError(error, 'record.upsert');
};
