import type { CivilDate } from '@/lib/date/civil';

/**
 * One goal's outcome on one civil date. This is the historical record and is
 * deliberately independent of the goal definition: editing a goal's target or
 * schedule must never rewrite what was recorded on past days.
 */
export interface DailyRecord {
  id: string;
  goalId: string;
  date: CivilDate;
  completed: boolean;
  /** Minutes for duration goals, magnitude for numeric/count goals. */
  actualValue: number | null;
  notes: string | null;
  /** UTC instant at which the goal was marked complete, or null. */
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Fields a client may write. Identity and ownership are server-derived. */
export interface DailyRecordInput {
  goalId: string;
  date: CivilDate;
  completed: boolean;
  actualValue: number | null;
  notes?: string | null;
  completedAt?: string | null;
}
