import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { GlassOverlay } from '@/components/glass/GlassOverlay';
import { GlassButton } from '@/components/glass/GlassButton';
import { Field, GlassInput, GlassSelect, GlassTextarea } from '@/components/glass/GlassField';
import { SegmentedControl, Switch } from '@/components/glass/GlassBadge';
import { GlassCard } from '@/components/glass/GlassCard';
import { ErrorState } from '@/components/ui/Feedback';
import { toAppError } from '@/lib/errors';
import { parseGoalForm, toGoalInput, type GoalDraft, type GoalFieldErrors } from '@/lib/validation/goal';
import { todayIn } from '@/lib/date/civil';
import { DAY_LABELS, GOAL_TYPE_HINTS, GOAL_TYPE_LABELS, ISO_DAYS, type FrequencyConfig, type FrequencyType, type Goal, type GoalType, type IsoDay } from '@/types/goal';
import { createGoal, updateGoal, type GoalInput } from '@/services/goals/goals.service';
import { useToast } from '@/hooks/useToast';
import type { Category } from '@/services/categories/categories.service';

const TYPE_OPTIONS: ReadonlyArray<{ value: GoalType; label: string }> = (
  ['checkbox', 'numeric', 'duration', 'count', 'time'] as const
).map((value) => ({ value, label: GOAL_TYPE_LABELS[value] }));

const FREQUENCY_OPTIONS: ReadonlyArray<{ value: FrequencyType; label: string }> = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekdays', label: 'Weekdays' },
  { value: 'weekends', label: 'Weekends' },
  { value: 'selected_days', label: 'Days' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'custom_interval', label: 'Custom' },
];

/** Units offered per type. Free text is still allowed. */
const UNIT_SUGGESTIONS: Record<GoalType, readonly string[]> = {
  numeric: ['km', 'L', 'steps', 'pages', 'glasses'],
  duration: ['min'],
  count: ['reps', 'sets'],
  checkbox: [],
  time: [],
};

interface FormState {
  name: string;
  type: GoalType;
  targetValue: string;
  unit: string;
  targetTime: string;
  categoryId: string;
  frequencyType: FrequencyType;
  days: IsoDay[];
  everyNDays: string;
  startDate: string;
  endDate: string;
  reminderTime: string;
  description: string;
  hasEndDate: boolean;
  isActive: boolean;
}

const emptyForm = (startDate: string, categoryId: string): FormState => ({
  name: '',
  type: 'checkbox',
  targetValue: '',
  unit: '',
  targetTime: '22:00',
  categoryId,
  frequencyType: 'daily',
  days: [1, 2, 3, 4, 5, 6, 7],
  everyNDays: '2',
  startDate,
  endDate: '',
  reminderTime: '',
  description: '',
  hasEndDate: false,
  isActive: true,
});

const fromGoal = (goal: Goal, categoryId: string): FormState => {
  const config = goal.frequencyConfig;
  return {
    name: goal.name,
    type: goal.type,
    targetValue: goal.targetValue === null ? '' : String(goal.targetValue),
    unit: goal.unit ?? '',
    targetTime: goal.targetTime ?? '22:00',
    categoryId: goal.categoryId ?? categoryId,
    frequencyType: goal.frequencyType,
    days: config.kind === 'selected_days' ? config.days : [1, 2, 3, 4, 5, 6, 7],
    everyNDays: config.kind === 'custom_interval' ? String(config.everyNDays) : '2',
    startDate: goal.startDate,
    endDate: goal.endDate ?? '',
    reminderTime: goal.reminderTime ?? '',
    description: goal.description ?? '',
    hasEndDate: goal.endDate !== null,
    isActive: goal.isActive,
  };
};

const toFrequencyConfig = (form: FormState): FrequencyConfig => {
  switch (form.frequencyType) {
    case 'selected_days':
      return { kind: 'selected_days', days: [...form.days].sort((a, b) => a - b) };
    case 'weekly':
      return { kind: 'weekly', everyWeeks: 1 };
    case 'custom_interval':
      return {
        kind: 'custom_interval',
        everyNDays: Math.max(1, Math.trunc(Number(form.everyNDays) || 1)),
      };
    case 'weekdays':
    case 'weekends':
    case 'daily':
    default:
      return { kind: form.frequencyType };
  }
};

export interface GoalEditorProps {
  open: boolean;
  onClose: () => void;
  /** Present when editing; absent when creating. */
  goal?: Goal | undefined;
  categories: readonly Category[];
  timeZone: string;
  /** Called after a successful save so the caller can refresh its lists. */
  onSaved?: (goal: Goal) => void;
}

const FALLBACK_CATEGORY = '';

/**
 * Create or edit a goal.
 *
 * Progressive disclosure: the four things everyone needs are always visible,
 * and everything else lives behind "More options". A goal should be creatable
 * in a few seconds without ever meeting a field it does not need.
 */
export const GoalEditor = ({
  open,
  onClose,
  goal,
  categories,
  timeZone,
  onSaved,
}: GoalEditorProps) => {
  const reduceMotion = useReducedMotion();
  const { notify } = useToast();
  const formId = useId();
  const formTopRef = useRef<HTMLDivElement>(null);

  const defaultCategory = categories[0]?.id ?? FALLBACK_CATEGORY;
  const today = useMemo(() => todayIn(timeZone), [timeZone]);

  const [form, setForm] = useState<FormState>(() =>
    goal ? fromGoal(goal, defaultCategory) : emptyForm(today, defaultCategory),
  );
  const [errors, setErrors] = useState<GoalFieldErrors>({});
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Reset each time the sheet opens, so a previous draft never leaks in.
  useEffect(() => {
    if (!open) return;
    setForm(goal ? fromGoal(goal, defaultCategory) : emptyForm(today, defaultCategory));
    setErrors({});
    setSaveError(null);
    setShowAdvanced(false);
  }, [open, goal, defaultCategory, today]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]): void => {
    setForm((current) => ({ ...current, [key]: value }));
    // Clear a field's error as soon as it is edited.
    setErrors((current) => (current[key as string] ? { ...current, [key as string]: undefined } : current));
  };

  /** Nested validation paths arrive as `a.b`; match on the first segment too. */
  const fieldError = (...keys: string[]): string | undefined =>
    keys.map((key) => errors[key]).find((message): message is string => Boolean(message));

  const needsTarget = form.type === 'numeric' || form.type === 'duration' || form.type === 'count';
  const suggestions = UNIT_SUGGESTIONS[form.type];

  /**
   * The form's flat state, handed over as-is. The validator owns the
   * discriminated shape, so there is no second copy of "what a numeric goal
   * looks like" to keep in step here.
   */
  const toDraft = (): GoalDraft => ({
    type: form.type,
    name: form.name,
    description: form.description,
    targetValue: form.targetValue,
    unit: form.unit || null,
    targetTime: form.targetTime,
    categoryId: form.categoryId || null,
    frequencyType: form.frequencyType,
    frequencyConfig: toFrequencyConfig(form),
    startDate: form.startDate,
    endDate: form.hasEndDate ? form.endDate : null,
    reminderTime: form.reminderTime || null,
    isActive: form.isActive,
  });

  const submit = async (): Promise<void> => {
    const parsed = parseGoalForm(toDraft());

    if (!parsed.success) {
      setErrors(parsed.errors);
      // A problem hidden inside "More options" would otherwise be invisible, so
      // open the section and bring it into view.
      const hidden = Object.keys(parsed.errors).some((key) =>
        /startDate|endDate|reminderTime|description/.test(key),
      );
      if (hidden) setShowAdvanced(true);
      formTopRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      return;
    }

    setErrors({});
    setSaving(true);
    setSaveError(null);

    const input: GoalInput = toGoalInput(parsed.data);
    try {
      const saved = goal ? await updateGoal(goal.id, input) : await createGoal(input);
      notify({
        tone: 'success',
        message: goal ? 'Goal updated' : 'Goal created',
        detail: input.startDate <= today ? 'It is on your list today.' : `Starts ${input.startDate}.`,
      });
      onSaved?.(saved);
      onClose();
    } catch (raw) {
      setSaveError(toAppError(raw, goal ? 'goal.update' : 'goal.create').userMessage);
    } finally {
      setSaving(false);
    }
  };

  return (
    <GlassOverlay
      open={open}
      onClose={onClose}
      title={goal ? 'Edit goal' : 'New goal'}
      {...(goal
        ? { description: 'Changes apply from today. Past records stay as they were.' }
        : {})}
      footer={
        <div className="flex items-center justify-between gap-3">
          <GlassButton
            variant="ghost"
            size="sm"
            onClick={() => setShowAdvanced((open_now) => !open_now)}
            aria-expanded={showAdvanced}
            aria-controls={`${formId}-advanced`}
          >
            {showAdvanced ? 'Fewer options' : 'More options'}
          </GlassButton>
          <div className="flex gap-2">
            <GlassButton onClick={onClose} disabled={saving}>
              Cancel
            </GlassButton>
            <GlassButton
              variant="primary"
              onClick={() => void submit()}
              disabled={saving}
              data-autofocus
            >
              {saving ? 'Saving…' : goal ? 'Save changes' : 'Create goal'}
            </GlassButton>
          </div>
        </div>
      }
    >
      <div className="space-y-5" ref={formTopRef}>
        {saveError ? <ErrorState compact title="We couldn't save this goal" message={saveError} /> : null}

        <Field label="What will you do?" error={fieldError('name')} hint="Short and specific works best.">
          {({ id, describedBy, invalid }) => (
            <GlassInput
              id={id}
              aria-describedby={describedBy}
              data-autofocus
              value={form.name}
              invalid={invalid}
              onChange={(event) => set('name', event.target.value)}
              placeholder="Walk"
              autoComplete="off"
            />
          )}
        </Field>

        <Field label="How is it measured?">
          {() => <SegmentedControl options={TYPE_OPTIONS} value={form.type} onChange={(type) => set('type', type)} label="Goal type" size="sm" />}
        </Field>
        <p className="-mt-3 text-caption text-subtle">{GOAL_TYPE_HINTS[form.type]}</p>

        <AnimatePresence initial={false}>
          {needsTarget ? (
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.2, ease: [0.32, 0.72, 0, 1] }}
              className="overflow-hidden"
            >
              <div className="grid grid-cols-2 gap-3 pt-1">
                <Field
                  label="Target"
                  error={fieldError('targetValue')}
                  hint={form.type === 'duration' ? 'in minutes' : undefined}
                >
                  {({ id, describedBy, invalid }) => (
                    <GlassInput
                      id={id}
                      aria-describedby={describedBy}
                      numeric
                      inputMode="decimal"
                      placeholder={form.type === 'duration' ? '30' : '3'}
                      value={form.targetValue}
                      invalid={invalid}
                      onChange={(event) => set('targetValue', event.target.value)}
                    />
                  )}
                </Field>

                {form.type !== 'duration' ? (
                  <Field label="Unit" error={fieldError('unit')} hint="Optional">
                    {({ id, describedBy, invalid }) => (
                      <>
                        <GlassInput
                          id={id}
                          aria-describedby={describedBy}
                          list={`${formId}-units`}
                          placeholder={suggestions[0] ?? 'none'}
                          value={form.unit}
                          invalid={invalid}
                          onChange={(event) => set('unit', event.target.value)}
                        />
                        <datalist id={`${formId}-units`}>
                          {suggestions.map((unit) => (
                            <option key={unit} value={unit} />
                          ))}
                        </datalist>
                      </>
                    )}
                  </Field>
                ) : null}
              </div>
            </motion.div>
          ) : null}

          {form.type === 'time' ? (
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.2, ease: [0.32, 0.72, 0, 1] }}
              className="overflow-hidden"
            >
              <Field
                label="Do this by"
                error={fieldError('targetTime')}
                hint="Completing after this still counts — it's just recorded as late."
              >
                {({ id, describedBy, invalid }) => (
                  <GlassInput
                    id={id}
                    aria-describedby={describedBy}
                    type="time"
                    value={form.targetTime}
                    invalid={invalid}
                    onChange={(event) => set('targetTime', event.target.value)}
                  />
                )}
              </Field>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <Field label="Repeat">
          {() => (
            <SegmentedControl
              options={FREQUENCY_OPTIONS}
              value={form.frequencyType}
              onChange={(frequencyType) => set('frequencyType', frequencyType)}
              label="Repeat"
              size="sm"
            />
          )}
        </Field>

        {form.frequencyType === 'selected_days' ? (
          <div>
            <p className="mb-1.5 text-caption font-medium text-muted">On these days</p>
            <div className="flex gap-1.5">
              {ISO_DAYS.map((day) => {
                const selected = form.days.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    aria-pressed={selected}
                    onClick={() =>
                      set(
                        'days',
                        selected
                          ? form.days.filter((d) => d !== day)
                          : [...form.days, day].sort((a, b) => a - b),
                      )
                    }
                    className={
                      selected
                        ? 'h-10 flex-1 rounded-[var(--radius-chip)] bg-accent text-caption font-medium text-accent-contrast transition-colors'
                        : 'h-10 flex-1 rounded-[var(--radius-chip)] border border-glass-border text-caption font-medium text-subtle transition-colors hover:border-glass-border-strong hover:text-muted'
                    }
                  >
                    {DAY_LABELS[day]}
                  </button>
                );
              })}
            </div>
            {fieldError('frequencyConfig', 'frequencyConfig.days') ? (
              <p className="mt-1.5 text-caption text-danger">
                {fieldError('frequencyConfig', 'frequencyConfig.days')}
              </p>
            ) : null}
          </div>
        ) : null}

        {form.frequencyType === 'custom_interval' ? (
          <Field label="Every how many days?" error={fieldError('frequencyConfig')}>
            {({ id, describedBy, invalid }) => (
              <GlassInput
                id={id}
                aria-describedby={describedBy}
                numeric
                inputMode="numeric"
                value={form.everyNDays}
                invalid={invalid}
                onChange={(event) => set('everyNDays', event.target.value)}
              />
            )}
          </Field>
        ) : null}

        <Field label="Category">
          {({ id }) => (
            <GlassSelect
              id={id}
              value={form.categoryId}
              onChange={(event) => set('categoryId', event.target.value)}
            >
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.label}
                </option>
              ))}
            </GlassSelect>
          )}
        </Field>

        <AnimatePresence initial={false}>
          {showAdvanced ? (
            <motion.div
              id={`${formId}-advanced`}
              initial={reduceMotion ? false : { opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.24, ease: [0.32, 0.72, 0, 1] }}
              className="overflow-hidden"
            >
              <div className="space-y-5 pt-1">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Start date" error={fieldError('startDate')}>
                    {({ id, describedBy, invalid }) => (
                      <GlassInput
                        id={id}
                        aria-describedby={describedBy}
                        type="date"
                        value={form.startDate}
                        invalid={invalid}
                        onChange={(event) => set('startDate', event.target.value)}
                      />
                    )}
                  </Field>

                  {form.hasEndDate ? (
                    <Field label="End date" error={fieldError('endDate')}>
                      {({ id, describedBy, invalid }) => (
                        <GlassInput
                          id={id}
                          aria-describedby={describedBy}
                          type="date"
                          min={form.startDate}
                          value={form.endDate}
                          invalid={invalid}
                          onChange={(event) => set('endDate', event.target.value)}
                        />
                      )}
                    </Field>
                  ) : null}
                </div>

                <Switch
                  label="Stop on a set date"
                  description="Leave off to keep this going indefinitely."
                  checked={form.hasEndDate}
                  onChange={(checked) => set('hasEndDate', checked)}
                />

                <Field
                  label="Reminder"
                  hint="Optional. Arise never asks for notifications on your behalf."
                  error={fieldError('reminderTime')}
                >
                  {({ id, describedBy, invalid }) => (
                    <GlassInput
                      id={id}
                      aria-describedby={describedBy}
                      type="time"
                      value={form.reminderTime}
                      invalid={invalid}
                      onChange={(event) => set('reminderTime', event.target.value)}
                    />
                  )}
                </Field>

                <Field label="Notes" error={fieldError('description')} hint="Optional, private to you.">
                  {({ id, describedBy, invalid }) => (
                    <GlassTextarea
                      id={id}
                      aria-describedby={describedBy}
                      rows={3}
                      value={form.description}
                      invalid={invalid}
                      onChange={(event) => set('description', event.target.value)}
                      placeholder="Anything worth remembering about this one."
                    />
                  )}
                </Field>

                {goal ? (
                  <Switch
                    label="Show on today"
                    description="Paused goals stay in your history but leave your day."
                    checked={form.isActive}
                    onChange={(checked) => set('isActive', checked)}
                  />
                ) : null}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {goal ? (
          <GlassCard elevation="sunken" className="px-4 py-3">
            <p className="text-caption text-muted">
              {goal.name} has {form.frequencyType === 'daily' ? 'a daily' : 'a repeating'} schedule
              from {form.startDate}. Editing never rewrites what you already recorded.
            </p>
          </GlassCard>
        ) : null}
      </div>
    </GlassOverlay>
  );
};
