import { useMemo, useState } from 'react';
import { useTimeZone, useToday } from '@/hooks/useAuth';
import { useAsync } from '@/hooks/useAsync';
import { useCategories } from '@/hooks/useCategories';
import {
  listGoals,
  setGoalPaused,
  archiveGoal,
  restoreGoal,
  type ListGoalsOptions,
} from '@/services/goals/goals.service';
import { GoalEditor } from '@/components/goals/GoalEditor';
import { GlassCard, SectionLabel } from '@/components/glass/GlassCard';
import { GlassButton } from '@/components/glass/GlassButton';
import { Badge, SegmentedControl } from '@/components/glass/GlassBadge';
import { ConfirmDialog, ErrorState, InlineSpinner } from '@/components/ui/Feedback';
import { ListSkeleton, EmptyState, LoadingStatus } from '@/components/ui/States';
import { PageTransition } from '@/components/ui/Motion';
import {
  IconArchive,
  IconDots,
  IconPause,
  IconPlay,
  IconPlus,
  IconTarget,
} from '@/components/ui/Icon';
import { useToast } from '@/hooks/useToast';
import { toAppError } from '@/lib/errors';
import { describeArchivedOn, describeTarget } from '@/lib/goals/describe';
import { formatDateLong } from '@/lib/date/civil';
import { cn, pluralise } from '@/lib/format';
import type { Goal } from '@/types/goal';

type Scope = 'active' | 'paused' | 'archived';

const SCOPE_OPTIONS: ReadonlyArray<{ value: Scope; label: string }> = [
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'archived', label: 'Archived' },
];

const FILTERS: Record<Scope, ListGoalsOptions> = {
  active: { includePaused: false, includeArchived: false },
  paused: { includePaused: true, includeArchived: false },
  archived: { includePaused: true, includeArchived: true },
};

export const GoalsPage = () => {
  const timeZone = useTimeZone();
  const today = useToday(timeZone);
  const { labelFor, categories } = useCategories();
  const { notify } = useToast();

  const [scope, setScope] = useState<Scope>('active');
  const [editorGoal, setEditorGoal] = useState<Goal | null | 'new'>(null);
  const [confirming, setConfirming] = useState<Goal | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const filters = FILTERS[scope];
  const query = useAsync<Goal[]>(() => listGoals(filters), [scope], {
    enabled: scope !== 'archived',
  });

  const goals = useMemo(() => {
    const all = query.data ?? [];
    return scope === 'archived' ? all.filter((goal) => goal.archivedAt !== null) : all;
  }, [query.data, scope]);

  const setPaused = async (goal: Goal, paused: boolean): Promise<void> => {
    setBusyId(goal.id);
    try {
      await setGoalPaused(goal.id, paused);
      notify({
        tone: 'success',
        message: paused ? 'Goal paused' : 'Goal resumed',
        detail: paused
          ? 'It stays in your history and returns whenever you want it.'
          : "It's back on your list.",
      });
      query.refetch();
    } catch (raw) {
      notify({
        tone: 'error',
        message: 'We couldn’t change that goal',
        detail: toAppError(raw, 'goal.update').userMessage,
      });
    } finally {
      setBusyId(null);
    }
  };

  const onArchiveConfirmed = async (goal: Goal): Promise<void> => {
    setBusyId(goal.id);
    try {
      if (goal.archivedAt === null) {
        await archiveGoal(goal.id);
        notify({
          tone: 'success',
          message: 'Goal archived',
          detail: 'Everything you already recorded is kept.',
        });
      } else {
        await restoreGoal(goal.id);
        notify({ tone: 'success', message: 'Goal restored' });
      }
      query.refetch();
    } catch (raw) {
      notify({
        tone: 'error',
        message: 'We couldn’t archive that goal',
        detail: toAppError(raw, 'goal.archive').userMessage,
      });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <PageTransition>
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-headline text-foreground">Goals</h1>
          <p className="mt-1 text-body text-muted">
            {goals.length === 0
              ? 'Nothing here yet.'
              : `${pluralise(goals.length, 'goal')} in this view`}
          </p>
        </div>
        <GlassButton
          variant="primary"
          onClick={() => setEditorGoal('new')}
          leading={<IconPlus className="size-4" />}
        >
          <span className="hidden sm:inline">New goal</span>
          <span className="sm:hidden">New</span>
        </GlassButton>
      </header>

      <div className="mb-5">
        <SegmentedControl
          options={SCOPE_OPTIONS}
          value={scope}
          onChange={setScope}
          label="Filter goals"
        />
      </div>

      <LoadingStatus label="Loading goals" />

      {query.isInitialLoading && scope !== 'archived' ? <ListSkeleton /> : null}

      {query.error ? (
        <ErrorState
          title="We couldn't load your goals"
          message={query.error.userMessage}
          onRetry={query.refetch}
        />
      ) : null}

      {scope === 'archived' ? (
        <ArchivedList
          goals={goals}
          labelFor={labelFor}
          busyId={busyId}
          onRestore={onArchiveConfirmed}
          onEdit={setEditorGoal}
        />
      ) : null}

      {!query.isInitialLoading && !query.error && scope !== 'archived' ? (
        goals.length === 0 ? (
          <EmptyState
            icon={<IconTarget className="size-7" />}
            title={scope === 'paused' ? 'Nothing paused.' : 'No goals yet.'}
            body={
              scope === 'paused'
                ? 'Pausing a goal takes it out of your day without deleting its history.'
                : 'Start with one thing you want to do most days. You can always add more.'
            }
            action={
              scope === 'active' ? (
                <GlassButton
                  variant="primary"
                  onClick={() => setEditorGoal('new')}
                  leading={<IconPlus className="size-4" />}
                >
                  Create a goal
                </GlassButton>
              ) : undefined
            }
          />
        ) : (
          <GlassCard className="overflow-hidden">
            <div>
              {goals.map((goal) => (
                <GoalManagementRow
                  key={goal.id}
                  goal={goal}
                  label={labelFor(goal.categoryId)}
                  busy={busyId === goal.id}
                  onEdit={() => setEditorGoal(goal)}
                  onArchive={() => setConfirming(goal)}
                  onToggleActive={() => void setPaused(goal, !goal.isActive)}
                />
              ))}
            </div>
          </GlassCard>
        )
      ) : null}

      <GoalEditor
        open={editorGoal !== null}
        {...(editorGoal !== null && editorGoal !== 'new' && { goal: editorGoal })}
        categories={categories}
        onClose={() => setEditorGoal(null)}
        onSaved={() => {
          query.refetch();
        }}
      />

      <ConfirmDialog
        open={confirming !== null}
        title={`Archive "${confirming?.name}"?`}
        body="It disappears from your daily list. Your records stay exactly where they are, and you can restore it at any time."
        confirmLabel="Archive"
        onCancel={() => setConfirming(null)}
        onConfirm={() => {
          if (confirming) void onArchiveConfirmed(confirming);
          setConfirming(null);
        }}
      />

      <p className="sr-only" aria-live="polite">
        {`Viewing ${scope} goals as of ${formatDateLong(today)}.`}
      </p>
    </PageTransition>
  );
};

interface ArchivedListProps {
  goals: readonly Goal[];
  labelFor: (id: string | null) => string | undefined;
  busyId: string | null;
  onRestore: (goal: Goal) => Promise<void>;
  onEdit: (goal: Goal) => void;
}

const ArchivedList = ({
  goals,
  labelFor,
  busyId,
  onRestore,
  onEdit,
}: ArchivedListProps) => {
  if (goals.length === 0) {
    return (
      <EmptyState
        icon={<IconArchive className="size-7" />}
        title="Nothing archived."
        body="Goals you retire land here, with their history intact."
      />
    );
  }

  return (
    <GlassCard className="overflow-hidden">
      <SectionLabel className="px-4 pb-2 pt-4">Archived</SectionLabel>
      <div>
        {goals.map((goal) => (
          <div
            key={goal.id}
            className="flex items-center gap-3 border-t border-hairline px-4 py-3.5"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-body text-muted">{goal.name}</p>
              <p className="mt-0.5 text-micro text-subtle">
                {labelFor(goal.categoryId) ?? 'Uncategorised'}
                {goal.archivedAt ? ` · ${describeArchivedOn(goal.archivedAt)}` : ''}
              </p>
            </div>
            <GlassButton
              size="sm"
              onClick={() => onEdit(goal)}
              aria-label={`Edit ${goal.name}`}
              title="Edit"
              className="w-9 justify-center px-0"
            >
              <IconDots className="size-3.5" />
            </GlassButton>
            <GlassButton
              size="sm"
              onClick={() => void onRestore(goal)}
              disabled={busyId === goal.id}
              leading={<IconPlay className="size-3.5" />}
            >
              Restore
            </GlassButton>
          </div>
        ))}
      </div>
    </GlassCard>
  );
};

interface GoalManagementRowProps {
  goal: Goal;
  label: string | undefined;
  busy: boolean;
  onEdit: () => void;
  onArchive: () => void;
  onToggleActive: () => void;
}

const GoalManagementRow = ({
  goal,
  label,
  busy,
  onEdit,
  onArchive,
  onToggleActive,
}: GoalManagementRowProps) => (
  <div className="flex items-center gap-3 border-t border-hairline px-4 py-3.5">
    <div className="min-w-0 flex-1">
      <p
        className={cn(
          'truncate text-body',
          goal.isActive ? 'text-foreground' : 'text-muted',
        )}
      >
        {goal.name}
      </p>
      <p className="mt-0.5 flex items-center gap-1.5 text-micro text-subtle">
        {label !== undefined ? <span>{label}</span> : null}
        {label !== undefined ? <span aria-hidden="true">·</span> : null}
        <span>{describeTarget(goal)}</span>
        {goal.isActive ? null : (
          <Badge tone="neutral" className="ml-1">
            Paused
          </Badge>
        )}
      </p>
    </div>

    {busy ? <InlineSpinner /> : null}

    <GlassButton
      size="sm"
      onClick={onToggleActive}
      aria-label={goal.isActive ? `Pause ${goal.name}` : `Resume ${goal.name}`}
      title={goal.isActive ? 'Pause' : 'Resume'}
      className="w-9 justify-center px-0"
    >
      {goal.isActive ? <IconPause className="size-3.5" /> : <IconPlay className="size-3.5" />}
    </GlassButton>

    <GlassButton
      size="sm"
      onClick={onEdit}
      aria-label={`Edit ${goal.name}`}
      title="Edit"
      className="w-9 justify-center px-0"
    >
      <IconDots className="size-3.5" />
    </GlassButton>

    <GlassButton
      size="sm"
      onClick={onArchive}
      aria-label={`Archive ${goal.name}`}
      title="Archive"
      className="w-9 justify-center px-0"
    >
      <IconArchive className="size-3.5" />
    </GlassButton>
  </div>
);