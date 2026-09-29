/**
 * Goal persistence.
 *
 * The server mints ids, stamps timestamps, derives completion for measured
 * goals, and refuses writes that contradict the schema. This file is
 * deliberately thin: it maps camelCase in, gets rows back, and maps them out.
 */

import { toAppError } from '@/lib/errors';
import { api, queryString } from '@/lib/api/client';
import type { GoalRow } from '@/lib/api/types';
import type { CivilDate } from '@/lib/date/civil';
import { toGoal } from '@/services/mappers';
import type { FrequencyConfig, FrequencyType, Goal, GoalType } from '@/types/goal';

export interface GoalInput {
  name: string;
  description: string | null;
  type: GoalType;
  targetValue: number | null;
  unit: string | null;
  targetTime: string | null;
  categoryId: string | null;
  frequencyType: FrequencyType;
  frequencyConfig: FrequencyConfig;
  startDate: CivilDate;
  endDate: CivilDate | null;
  reminderTime: string | null;
  isActive: boolean;
}

export type GoalPatch = Partial<Omit<GoalInput, 'frequencyType'>> & {
  frequencyType?: FrequencyType;
  sortOrder?: number;
  archivedAt?: string | null;
};

export interface ListGoalsOptions {
  /** Archived goals are excluded by default; history still resolves them. */
  includeArchived?: boolean;
  includePaused?: boolean;
}

/**
 * Ordering is explicit rather than by name: the user controls the order of
 * their day, and history must replay that same order. The server applies it.
 */
export const listGoals = async (options: ListGoalsOptions = {}): Promise<Goal[]> => {
  const { includeArchived = false, includePaused = true } = options;

  try {
    const rows = await api.get<GoalRow[]>(
      `/goals${queryString({
        includeArchived: includeArchived ? '1' : undefined,
        includePaused: includePaused ? undefined : '0',
      })}`,
    );
    return rows.map(toGoal);
  } catch (raw) {
    throw toAppError(raw, 'goal.load');
  }
};

export const getGoal = async (id: string): Promise<Goal | null> => {
  try {
    return toGoal(await api.get<GoalRow>(`/goals/${encodeURIComponent(id)}`));
  } catch (raw) {
    // A goal deleted in another tab is not an error worth surfacing; the caller
    // treats null as "nothing to show".
    if (raw instanceof Error && 'status' in raw && (raw as { status: number }).status === 404) {
      return null;
    }
    throw toAppError(raw, 'goal.load');
  }
};

export const createGoal = async (input: GoalInput): Promise<Goal> => {
  try {
    return toGoal(await api.post<GoalRow>('/goals', input));
  } catch (raw) {
    throw toAppError(raw, 'goal.create');
  }
};

/**
 * Only the fields the caller actually set are sent. Omitting a key leaves the
 * column alone, whereas sending `null` clears it — the difference matters when
 * patching a single field of a goal.
 */
export const updateGoal = async (id: string, patch: GoalPatch): Promise<Goal> => {
  try {
    return toGoal(await api.patch<GoalRow>(`/goals/${encodeURIComponent(id)}`, patch));
  } catch (raw) {
    throw toAppError(raw, 'goal.update');
  }
};

export const setGoalPaused = async (id: string, paused: boolean): Promise<Goal> =>
  updateGoal(id, { isActive: !paused });

/** Archive keeps the definition and every historical record intact. */
export const archiveGoal = async (id: string): Promise<Goal> => {
  try {
    return toGoal(
      await api.patch<GoalRow>(`/goals/${encodeURIComponent(id)}`, {
        isActive: false,
        archivedAt: new Date().toISOString(),
      }),
    );
  } catch (raw) {
    throw toAppError(raw, 'goal.archive');
  }
};

export const restoreGoal = async (id: string): Promise<Goal> =>
  updateGoal(id, { isActive: true, archivedAt: null });

/**
 * Permanent. Cascades to the day's records, so it is only ever offered behind
 * an explicit confirmation that names the consequence.
 */
export const deleteGoal = async (id: string): Promise<void> => {
  try {
    await api.delete<void>(`/goals/${encodeURIComponent(id)}`);
  } catch (raw) {
    throw toAppError(raw, 'goal.delete');
  }
};
