/**
 * Completion writes.
 *
 * Thin by design: `planRecord` decides *what* should be stored and
 * `materialiseRecord` decides *what it looks like*. Both are pure and shared
 * with the optimistic path, so the instant feedback the user sees and the row
 * the database ends up holding are produced by the same code.
 */

import { materialiseRecord, planRecord, type CompletionIntent } from '@/lib/goals/completion';
import { clearRecord, upsertRecord } from '@/services/dailyRecords/dailyRecords.service';
import type { CivilDate } from '@/lib/date/civil';
import type { DailyRecord } from '@/types/dailyRecord';
import type { Goal } from '@/types/goal';

export interface CommitContext {
  timeZone: string;
  now?: Date;
}

export const commitCompletion = async (
  goal: Goal,
  current: DailyRecord | null,
  date: CivilDate,
  intent: CompletionIntent,
  { timeZone, now = new Date() }: CommitContext,
): Promise<DailyRecord> => {
  if (intent.kind === 'clear') {
    await clearRecord(goal.id, date);
    return materialiseRecord(goal, planRecord(goal, current, date, intent, { timeZone, now }), current, now);
  }

  const plan = planRecord(goal, current, date, intent, { timeZone, now });
  return upsertRecord(plan);
};

/**
 * Apply a record to an in-memory list, returning a new list. The optimistic UI
 * uses this so React sees a changed reference without hand-rolled array surgery.
 */
export const applyRecord = (
  records: readonly DailyRecord[],
  goalId: string,
  next: DailyRecord | null,
): DailyRecord[] => {
  const rest = records.filter((record) => record.goalId !== goalId);
  return next === null ? rest : [...rest, next];
};
