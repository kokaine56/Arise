/**
 * Goal validation.
 *
 * Runs on the client so the form can point at the offending field, and again in
 * the database via CHECK constraints. The two are intentionally duplicative:
 * the client copy is a courtesy, the database copy is the guarantee.
 */

import { z } from 'zod';
import { isValidCivilDate } from '@/lib/date/civil';
import type { GoalInput } from '@/services/goals/goals.service';
import {
  FREQUENCY_TYPES,
  ISO_DAYS,
  type FrequencyConfig,
  type FrequencyType,
  type GoalType,
  type IsoDay,
} from '@/types/goal';

const CLOCK = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

/**
 * A cleared text input holds `''`, which every string rule below would reject.
 * Normalise it to `undefined` *before* validation — putting this in a
 * `.transform()` instead would run after the regex has already failed.
 */
const blankToUndefined = (value: unknown): unknown =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

const nameSchema = z
  .string()
  .trim()
  .min(1, 'Give the goal a name')
  .max(60, 'Keep the name under 60 characters');

const descriptionSchema = z.string().trim().max(280, 'Keep notes under 280 characters');

const unitSchema = z
  .preprocess(blankToUndefined, z.string().trim().max(16, 'Keep the unit under 16 characters').nullish())
  .transform((value) => value ?? null);

const clockSchema = z
  .preprocess(blankToUndefined, z.string().regex(CLOCK, 'Use a 24-hour time like 21:30').nullish())
  .transform((value) => value ?? null);

const dateSchema = z.string().refine(isValidCivilDate, 'Use a date like 2026-09-29');

const optionalDateSchema = z
  .preprocess(blankToUndefined, z.string().refine(isValidCivilDate, 'Use a date like 2026-09-29').nullish())
  .transform((value) => value ?? null);

const isoDaySchema = z
  .number()
  .int()
  .refine((day): day is IsoDay => (ISO_DAYS as readonly number[]).includes(day));

/** The repeat pattern, validated on its own terms. */
const frequencyConfigSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('daily') }),
  z.object({ kind: z.literal('weekdays') }),
  z.object({ kind: z.literal('weekends') }),
  z.object({ kind: z.literal('selected_days'), days: z.array(isoDaySchema).min(1) }),
  z.object({ kind: z.literal('weekly'), everyWeeks: z.number().int().min(1).max(52) }),
  z.object({ kind: z.literal('custom_interval'), everyNDays: z.number().int().min(1).max(365) }),
]);

/** Fields every goal shares, regardless of type. */
const sharedShape = {
  name: nameSchema,
  description: descriptionSchema.optional().default(''),
  categoryId: z.string().uuid().nullish().transform((value) => value ?? null),
  frequencyType: z.enum(FREQUENCY_TYPES),
  frequencyConfig: frequencyConfigSchema,
  startDate: dateSchema,
  endDate: optionalDateSchema,
  reminderTime: clockSchema,
  isActive: z.boolean().default(true),
} as const;

const withShape = <TType extends GoalType, TExtra extends z.ZodRawShape>(
  type: TType,
  extra: TExtra,
) => z.object({ ...sharedShape, type: z.literal<TType>(type), ...extra });

/**
 * One variant per goal type, so each form carries only the fields that type
 * actually uses. A discriminated union rather than optional-everything means
 * `targetValue` cannot be silently null for a numeric goal.
 */
const goalSchema = z
  .discriminatedUnion('type', [
    withShape('checkbox', {
      /** Optional descriptive amount, e.g. "10 min" of meditation. */
      targetValue: z.coerce.number().positive().max(1_000_000).nullish(),
      unit: unitSchema,
    }),
    withShape('numeric', {
      targetValue: z.coerce.number().positive('Enter a target above zero').max(1_000_000),
      unit: unitSchema,
    }),
    withShape('duration', {
      targetValue: z.coerce.number().positive('Enter a duration above zero').max(100_000),
      unit: z.literal('min').default('min'),
    }),
    withShape('count', {
      targetValue: z.coerce
        .number()
        .int('Use a whole number')
        .positive('Enter a count above zero')
        .max(1_000_000),
      unit: unitSchema,
    }),
    withShape('time', {
      targetTime: z.string().regex(CLOCK, 'Pick a time of day'),
    }),
  ])
  .superRefine((value, ctx) => {
    if (value.frequencyConfig.kind !== value.frequencyType) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['frequencyType'],
        message: 'Choose how often this repeats',
      });
    }

    if (value.endDate !== null && value.endDate < value.startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endDate'],
        message: 'The end date must be on or after the start date',
      });
    }
  });

export type ParsedGoalValues = z.output<typeof goalSchema>;

/**
 * Raw form state, exactly as the inputs hold it.
 *
 * Every numeric field is still a string here, which is the honest shape of a
 * form and the reason `parseGoalForm` does the narrowing rather than the
 * component. It keeps the discriminated union in one place instead of spread
 * across the call site.
 */
export interface GoalDraft {
  type: GoalType;
  name: string;
  description: string;
  /** Raw text; '' means "not given". */
  targetValue: string;
  unit: string | null;
  targetTime: string;
  categoryId: string | null;
  frequencyType: FrequencyType;
  frequencyConfig: FrequencyConfig;
  startDate: string;
  endDate: string | null;
  reminderTime: string | null;
  isActive: boolean;
}

const toSchemaInput = (draft: GoalDraft): unknown => {
  const shared = {
    name: draft.name,
    description: draft.description,
    categoryId: draft.categoryId,
    frequencyType: draft.frequencyType,
    frequencyConfig: draft.frequencyConfig,
    startDate: draft.startDate,
    endDate: draft.endDate,
    reminderTime: draft.reminderTime,
    isActive: draft.isActive,
  };

  // Left as text on purpose: the schema coerces it, and an empty box becomes
  // zero, which the `.positive()` rules then reject with a field-specific
  // message instead of a generic type error.
  const amount = draft.targetValue.trim() === '' ? null : draft.targetValue;

  switch (draft.type) {
    case 'time':
      return { ...shared, type: 'time', targetTime: draft.targetTime };
    case 'checkbox':
      return { ...shared, type: 'checkbox', targetValue: amount, unit: draft.unit };
    case 'duration':
      // Duration is always minutes, so the unit is not the user's to choose.
      return { ...shared, type: 'duration', targetValue: amount, unit: 'min' };
    case 'count':
    case 'numeric':
      return { ...shared, type: draft.type, targetValue: amount, unit: draft.unit };
  }
};

/** Field-keyed messages, for painting errors onto the form. */
export type GoalFieldErrors = Partial<Record<string, string>>;

export const parseGoalForm = (
  draft: GoalDraft,
): { success: true; data: ParsedGoalValues } | { success: false; errors: GoalFieldErrors } => {
  const result = goalSchema.safeParse(toSchemaInput(draft));
  if (result.success) return { success: true, data: result.data };

  const errors: GoalFieldErrors = {};
  for (const issue of result.error.issues) {
    const key = issue.path
      .filter((part): part is string => typeof part === 'string')
      .join('.');
    if (key && !errors[key]) errors[key] = issue.message;
  }
  return { success: false, errors };
};

/** Form values → the shape the service expects. */
export const toGoalInput = (parsed: ParsedGoalValues): GoalInput => {
  const base = {
    name: parsed.name,
    description: parsed.description.length > 0 ? parsed.description : null,
    categoryId: parsed.categoryId,
    frequencyType: parsed.frequencyType,
    frequencyConfig: parsed.frequencyConfig,
    startDate: parsed.startDate,
    endDate: parsed.endDate,
    reminderTime: parsed.reminderTime,
    isActive: parsed.isActive,
  };

  switch (parsed.type) {
    case 'time':
      return { ...base, type: 'time', targetValue: null, unit: null, targetTime: parsed.targetTime };
    case 'checkbox':
      return {
        ...base,
        type: 'checkbox',
        targetValue: parsed.targetValue ?? null,
        unit: parsed.unit,
        targetTime: null,
      };
    default:
      return {
        ...base,
        type: parsed.type,
        targetValue: Number(parsed.targetValue),
        unit: parsed.unit,
        targetTime: null,
      };
  }
};
