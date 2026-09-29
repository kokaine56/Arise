/**
 * The dashboard's data and its single most important interaction.
 *
 * Completion is optimistic: the interface reflects the tap immediately, the
 * write follows, and any failure restores the exact prior state and says so.
 * The user is never left waiting on the network to see their own tap land, and
 * never loses an action to a silent error.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAsync } from '@/hooks/useAsync';
import { useToast } from '@/hooks/useToast';
import { toAppError } from '@/lib/errors';
import { materialiseRecord, planRecord, type CompletionIntent } from '@/lib/goals/completion';
import { resolveGoalDay, summarise, type ResolvedDay } from '@/lib/goals/resolve';
import { getGoalsForDate } from '@/services/daily/daily.service';
import { commitCompletion } from '@/services/daily/completion.service';
import type { CivilDate } from '@/lib/date/civil';
import type { DailyRecord } from '@/types/dailyRecord';
import type { ResolvedGoal } from '@/types/goal';

export interface DailyGoalsController {
  day: ResolvedDay | null;
  goals: ResolvedGoal[];
  isInitialLoading: boolean;
  isRefreshing: boolean;
  error: ReturnType<typeof useAsync<ResolvedDay>>['error'];
  refetch: () => void;
  /** True while a write for this goal is in flight. */
  pending: ReadonlySet<string>;
  complete: (goal: ResolvedGoal, intent: CompletionIntent) => Promise<void>;
}

/**
 * The stored row implied by what is already on screen.
 *
 * This is the crux of the optimistic flow. The resolved goal carries both the
 * current value and when it was last written, which is everything a subsequent
 * intent needs — so a tap never waits on a read to learn the day's current
 * progress. Reading the row back first would also be a second source of truth
 * racing the first.
 *
 * `notes` is null because the interface has no per-day note field; nothing in
 * Arise writes one, so there is nothing here to preserve.
 */
const recordFromScreen = (goal: ResolvedGoal, date: CivilDate, now: Date): DailyRecord | null => {
  if (goal.updatedAt === null) return null;

  const measured = goal.type === 'numeric' || goal.type === 'duration' || goal.type === 'count';
  const stamp = new Date(goal.updatedAt);

  return {
    id: 'from-screen',
    goalId: goal.goalId,
    userId: goal.goal.userId,
    date,
    completed: goal.completed,
    actualValue: measured ? goal.actual : null,
    notes: null,
    completedAt: goal.completed ? (Number.isNaN(stamp.getTime()) ? now.toISOString() : stamp.toISOString()) : null,
    createdAt: goal.updatedAt,
    updatedAt: goal.updatedAt,
  };
};

/** Re-resolve one goal and recompute the day, without touching the network. */
const applyRecordToDay = (
  day: ResolvedDay,
  goalId: string,
  record: DailyRecord,
  timeZone: string,
  now: Date,
): ResolvedDay => {
  const goal = day.goals.find((entry) => entry.goalId === goalId);
  if (!goal) return day;

  const resolved = resolveGoalDay(goal.goal, record, { date: day.date, timeZone, now });
  const goals = day.goals.map((entry) => (entry.goalId === goalId ? resolved : entry));
  return { ...day, goals, summary: summarise(goals, day.date) };
};

export const useDailyGoals = (
  date: CivilDate,
  timeZone: string,
  options: { enabled?: boolean } = {},
): DailyGoalsController => {
  const { enabled = true } = options;
  const { notify } = useToast();

  const query = useAsync<ResolvedDay>(
    () => getGoalsForDate({ date, timeZone }),
    [date, timeZone],
    { enabled },
  );

  const [day, setDay] = useState<ResolvedDay | null>(null);
  const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set());

  // Adopt the fetched day, unless an optimistic write is still in flight for
  // it — otherwise a slow refetch could clobber an unsaved tap.
  const inflight = useRef(0);
  useEffect(() => {
    const fetched = query.data;
    if (!fetched) return;
    setDay((current) => (inflight.current === 0 ? fetched : current));
  }, [query.data]);

  // A different date means a different day entirely; nothing carries over.
  useEffect(() => {
    setDay(null);
    inflight.current = 0;
  }, [date]);

  const complete = useCallback(
    async (goal: ResolvedGoal, intent: CompletionIntent): Promise<void> => {
      const snapshot = day;
      if (!snapshot) return;

      // One `now` for the whole interaction, so the optimistic row and the
      // persisted row cannot disagree about when it happened.
      const now = new Date();
      const current = recordFromScreen(goal, snapshot.date, now);
      const plan = planRecord(goal.goal, current, snapshot.date, intent, { timeZone, now });

      // Show the result first, ask the database second.
      inflight.current += 1;
      setPending((previous) => new Set(previous).add(goal.goalId));
      setDay(
        applyRecordToDay(
          snapshot,
          goal.goalId,
          materialiseRecord(goal.goal, plan, current, now),
          timeZone,
          now,
        ),
      );

      try {
        const saved = await commitCompletion(goal.goal, current, snapshot.date, intent, {
          timeZone,
          now,
        });

        // The server is authoritative: it derives `completed` for measured
        // goals, so re-resolve from what it actually stored.
        const savedAt = new Date(saved.updatedAt);
        setDay((current_day) =>
          current_day
            ? applyRecordToDay(
                current_day,
                goal.goalId,
                saved,
                timeZone,
                Number.isNaN(savedAt.getTime()) ? now : savedAt,
              )
            : current_day,
        );
      } catch (raw) {
        // Roll back to the exact state before the tap, then explain.
        setDay(snapshot);
        notify({
          tone: 'error',
          message: 'That change did not save.',
          detail: toAppError(raw, 'record.upsert').userMessage,
        });
      } finally {
        inflight.current -= 1;
        setPending((previous) => {
          const next = new Set(previous);
          next.delete(goal.goalId);
          return next;
        });
      }
    },
    [day, timeZone, notify],
  );

  return useMemo(
    () => ({
      day,
      goals: day?.goals ?? [],
      isInitialLoading: query.isInitialLoading,
      isRefreshing: query.isRefreshing,
      error: query.error,
      refetch: query.refetch,
      pending,
      complete,
    }),
    [
      day,
      query.isInitialLoading,
      query.isRefreshing,
      query.error,
      query.refetch,
      pending,
      complete,
    ],
  );
};
