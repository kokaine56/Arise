/**
 * Goal persistence.
 *
 * Writes always carry an explicit `user_id`; RLS independently rejects any
 * value that does not match `auth.uid()`, so this is a claim, not a grant.
 * No query in this file trusts a client-supplied user id for authorisation.
 */

import { toAppError } from '@/lib/errors';
import { requireSupabase } from '@/lib/supabase/client';
import { requireUserId } from '@/lib/supabase/session';
import type { GoalRow } from '@/lib/supabase/database.types';
import type { CivilDate } from '@/lib/date/civil';
import { serialiseFrequencyConfig, toGoal } from '@/services/mappers';
import type { FrequencyConfig, FrequencyType, Goal, GoalType } from '@/types/goal';

/** Columns a client may set on insert. */
type GoalInsertRow = Omit<GoalRow, 'id' | 'created_at' | 'updated_at'>;

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

const toRow = (input: GoalInput, userId: string): GoalInsertRow => ({
  user_id: userId,
  name: input.name,
  description: input.description,
  goal_type: input.type,
  target_value: input.targetValue,
  unit: input.unit,
  target_time: input.targetTime,
  category_id: input.categoryId,
  frequency_type: input.frequencyType,
  frequency_config: serialiseFrequencyConfig(input.frequencyConfig),
  start_date: input.startDate,
  end_date: input.endDate,
  reminder_time: input.reminderTime,
  is_active: input.isActive,
  sort_order: 0,
  // A goal is never created already archived.
  archived_at: null,
});

/**
 * Ordering is explicit rather than by name: the user controls the order of
 * their day, and history must replay that same order.
 */
export const listGoals = async (options: ListGoalsOptions = {}): Promise<Goal[]> => {
  const { includeArchived = false, includePaused = true } = options;
  let query = requireSupabase()
    .from('goals')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (!includeArchived) query = query.is('archived_at', null);
  if (!includePaused) query = query.eq('is_active', true);

  const { data, error } = await query;
  if (error) throw toAppError(error, 'goal.load');
  return (data ?? []).map(toGoal);
};

export const getGoal = async (id: string): Promise<Goal | null> => {
  const { data, error } = await requireSupabase().from('goals').select('*').eq('id', id).maybeSingle();
  if (error) throw toAppError(error, 'goal.load');
  return data ? toGoal(data) : null;
};

/** Highest current position, so a new goal lands at the end of the day. */
const nextSortOrder = async (): Promise<number> => {
  const { data, error } = await requireSupabase()
    .from('goals')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw toAppError(error, 'goal.create');
  return (data?.sort_order ?? -1) + 1;
};

export const createGoal = async (input: GoalInput): Promise<Goal> => {
  const userId = requireUserId();
  const { data, error } = await requireSupabase()
    .from('goals')
    .insert({ ...toRow(input, userId), sort_order: await nextSortOrder() })
    .select('*')
    .single();

  if (error) throw toAppError(error, 'goal.create');
  return toGoal(data);
};

export const updateGoal = async (id: string, patch: GoalPatch): Promise<Goal> => {
  const { data, error } = await requireSupabase()
    .from('goals')
    .update(toRowPatch(patch))
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw toAppError(error, 'goal.update');
  return toGoal(data);
};

/**
 * Only carry the fields the caller actually set. Omitting a key leaves the
 * column alone, whereas sending `null` clears it — the difference matters when
 * patching a single field of a goal.
 */
const toRowPatch = (patch: GoalPatch): Partial<GoalRow> => ({
  ...(patch.name !== undefined && { name: patch.name }),
  ...(patch.description !== undefined && { description: patch.description }),
  ...(patch.type !== undefined && { goal_type: patch.type }),
  ...(patch.targetValue !== undefined && { target_value: patch.targetValue }),
  ...(patch.unit !== undefined && { unit: patch.unit }),
  ...(patch.targetTime !== undefined && { target_time: patch.targetTime }),
  ...(patch.categoryId !== undefined && { category_id: patch.categoryId }),
  ...(patch.frequencyType !== undefined && { frequency_type: patch.frequencyType }),
  ...(patch.frequencyConfig !== undefined && {
    frequency_config: serialiseFrequencyConfig(patch.frequencyConfig),
  }),
  ...(patch.startDate !== undefined && { start_date: patch.startDate }),
  ...(patch.endDate !== undefined && { end_date: patch.endDate }),
  ...(patch.reminderTime !== undefined && { reminder_time: patch.reminderTime }),
  ...(patch.isActive !== undefined && { is_active: patch.isActive }),
  ...(patch.sortOrder !== undefined && { sort_order: patch.sortOrder }),
  ...(patch.archivedAt !== undefined && { archived_at: patch.archivedAt }),
});

export const setGoalPaused = async (id: string, paused: boolean): Promise<Goal> =>
  updateGoal(id, { isActive: !paused });

/** Archive keeps the definition and every historical record intact. */
export const archiveGoal = async (id: string): Promise<Goal> =>
  updateGoal(id, { isActive: false, archivedAt: new Date().toISOString() });

export const restoreGoal = async (id: string): Promise<Goal> =>
  updateGoal(id, { isActive: true, archivedAt: null });

/**
 * Permanent. Cascades to the day's records, so it is only ever offered behind
 * an explicit confirmation that names the consequence.
 */
export const deleteGoal = async (id: string): Promise<void> => {
  const { error } = await requireSupabase().from('goals').delete().eq('id', id);
  if (error) throw toAppError(error, 'goal.delete');
};
