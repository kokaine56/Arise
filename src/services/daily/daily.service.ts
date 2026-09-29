/**
 * The composed reads the UI actually needs.
 *
 * `getGoalsForDate` is the documented entry point for the dashboard: it fetches
 * the live goals and the day's records in two indexed queries, then hands both
 * to the pure resolver. No component performs its own query.
 */

import { eachDay, type CivilDate } from '@/lib/date/civil';
import { resolveDay, resolveHistoricalDay, type ResolvedDay } from '@/lib/goals/resolve';
import { listRecordsInRange } from '@/services/dailyRecords/dailyRecords.service';
import { listGoals } from '@/services/goals/goals.service';
import type { DailyRecord } from '@/types/dailyRecord';

export interface DayQuery {
  date: CivilDate;
  timeZone: string;
  now?: Date;
}

export const getGoalsForDate = async ({
  date,
  timeZone,
  now = new Date(),
}: DayQuery): Promise<ResolvedDay> => {
  const [goals, records] = await Promise.all([
    listGoals(),
    listRecordsInRange({ from: date, to: date }),
  ]);

  return resolveDay(goals, records, { date, timeZone, now });
};

export interface RangeQuery {
  from: CivilDate;
  to: CivilDate;
  timeZone: string;
  now?: Date;
}

/**
 * Resolve every day in an inclusive range.
 *
 * Archived goals are included on purpose: pausing or archiving a goal must not
 * silently rewrite last month's numbers.
 */
export const getDaysInRange = async ({
  from,
  to,
  timeZone,
  now = new Date(),
}: RangeQuery): Promise<ResolvedDay[]> => {
  const [goals, records] = await Promise.all([
    listGoals({ includeArchived: true }),
    listRecordsInRange({ from, to }),
  ]);

  // One pass to bucket records by date, so each day's resolution is O(goals).
  const byDate = new Map<CivilDate, DailyRecord[]>();
  for (const record of records) {
    const bucket = byDate.get(record.date);
    if (bucket) bucket.push(record);
    else byDate.set(record.date, [record]);
  }

  return eachDay(from, to).map((date) =>
    resolveHistoricalDay(goals, byDate.get(date) ?? [], { date, timeZone, now }),
  );
};
