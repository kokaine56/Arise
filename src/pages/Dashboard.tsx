import { useState } from 'react';
import { useAuth, useTimeZone, useToday } from '@/hooks/useAuth';
import { useCategories } from '@/hooks/useCategories';
import { useDailyGoals } from '@/hooks/useDailyGoals';
import { GoalEditor } from '@/components/goals/GoalEditor';
import { GoalRow } from '@/components/goals/GoalRow';
import { GlassCard, SectionLabel } from '@/components/glass/GlassCard';
import { GlassButton } from '@/components/glass/GlassButton';
import { ProgressRing } from '@/components/glass/GlassProgress';
import { DashboardSkeleton, EmptyState, LoadingStatus } from '@/components/ui/States';
import { ErrorState } from '@/components/ui/Feedback';
import { PageTransition } from '@/components/ui/Motion';
import { IconPlus, IconToday } from '@/components/ui/Icon';
import { formatDateLong, hourOfDayIn } from '@/lib/date/civil';
import { asPercent, cn, pluralise } from '@/lib/format';
import type { ResolvedGoal } from '@/types/goal';

/**
 * Good morning / afternoon / evening / night, from the reader's own clock.
 * Plainly stated, then left alone.
 */
const greetingFor = (hour: number): string => {
  if (hour < 5) return 'Good night';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  if (hour < 22) return 'Good evening';
  return 'Good night';
};

export const DashboardPage = () => {
  const timeZone = useTimeZone();
  const today = useToday(timeZone);
  const { profile } = useAuth();
  const { labelFor, categories } = useCategories();

  const [editorOpen, setEditorOpen] = useState(false);

  const { day, goals, isInitialLoading, error, refetch, pending, complete } = useDailyGoals(
    today,
    timeZone,
  );

  const summary = day?.summary;
  const percent = summary ? asPercent(summary.rate) : 0;
  const allDone = summary !== undefined && summary.isComplete;

  const onToggle = (goal: ResolvedGoal): void => {
    void complete(goal, { kind: 'toggle', completed: !goal.completed });
  };

  const onAdjust = (goal: ResolvedGoal, delta: number): void => {
    void complete(goal, { kind: 'adjust_actual', delta });
  };

  const onCommit = (goal: ResolvedGoal, value: number): void => {
    void complete(goal, { kind: 'set_actual', actualValue: value });
  };

  return (
    <PageTransition>
      <header className="mb-6">
        <h1 className="text-headline text-foreground">
          {greetingFor(hourOfDayIn(timeZone))}
        </h1>
        <p className="mt-1 text-body text-muted">
          {formatDateLong(today)}
          {profile?.displayName ? ` · ${profile.displayName}` : ''}
        </p>
      </header>

      <LoadingStatus label="Loading today's goals" />

      {isInitialLoading ? <DashboardSkeleton /> : null}

      {error ? (
        <ErrorState
          title="We couldn't load today"
          message={error.userMessage}
          onRetry={refetch}
        />
      ) : null}

      {!isInitialLoading && !error && summary ? (
        <div className="space-y-6">
          <ProgressCard
            percent={percent}
            completed={summary.completed}
            scheduled={summary.scheduled}
            partial={summary.partial}
            allDone={allDone}
            isToday
          />

          {goals.length === 0 ? (
            <EmptyState
              icon={<IconToday className="size-7" />}
              title="Your day starts here."
              body="Create your first health goal and build a routine you can actually keep."
              action={
                <GlassButton
                  variant="primary"
                  onClick={() => setEditorOpen(true)}
                  leading={<IconPlus className="size-4" />}
                >
                  Add your first goal
                </GlassButton>
              }
            />
          ) : (
            <section aria-labelledby="today-goals">
              <GlassCard className="overflow-hidden">
                <div className="flex items-baseline justify-between gap-3 px-4 pb-2 pt-4">
                  <SectionLabel className="flex-1">
                    <span id="today-goals">Today</span>
                  </SectionLabel>
                  {summary.partial > 0 ? (
                    <span className="text-micro text-subtle">
                      {pluralise(summary.partial, 'goal')} in progress
                    </span>
                  ) : null}
                </div>

                <div>
                  {goals.map((goal) => (
                    <GoalRow
                      key={goal.goalId}
                      goal={goal}
                      date={today}
                      timeZone={timeZone}
                      categoryLabel={labelFor(goal.categoryId)}
                      pending={pending.has(goal.goalId)}
                      onToggle={() => onToggle(goal)}
                      onAdjust={(delta) => onAdjust(goal, delta)}
                      onCommit={(value) => onCommit(goal, value)}
                    />
                  ))}
                </div>
              </GlassCard>

              <GlassButton
                variant="primary"
                block
                onClick={() => setEditorOpen(true)}
                leading={<IconPlus className="size-4" />}
                className="mt-4"
              >
                Add goal
              </GlassButton>
            </section>
          )}
        </div>
      ) : null}

      <GoalEditor
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        categories={categories}
        timeZone={timeZone}
        onSaved={refetch}
      />
    </PageTransition>
  );
};

export interface ProgressCardProps {
  percent: number;
  completed: number;
  scheduled: number;
  partial: number;
  allDone: boolean;
  isToday: boolean;
}

/**
 * The day's progress.
 *
 * One ring, the percentage set in tabular figures at its centre, and one line
 * of plain language beneath. This is the only element on the screen at scale,
 * which is what makes the answer to "where am I?" immediate.
 */
export const ProgressCard = ({
  percent,
  completed,
  scheduled,
  partial,
  allDone,
  isToday,
}: ProgressCardProps) => (
  <GlassCard className="flex flex-col items-center gap-4 px-5 py-7">
    <ProgressRing
      value={percent / 100}
      size={140}
      strokeWidth={5}
      label={`${percent} percent of today's goals completed`}
    >
      <div className="flex flex-col items-center">
        <span className="tabular text-[2.125rem] leading-none text-foreground">{percent}%</span>
      </div>
    </ProgressRing>

    <div className="text-center">
      <p className="text-body text-foreground">
        {scheduled === 0
          ? 'Nothing scheduled today'
          : `${completed} of ${scheduled} completed`}
      </p>
      <p
        className={cn(
          'mt-1 text-caption',
          allDone ? 'text-accent' : partial > 0 ? 'text-muted' : 'text-subtle',
        )}
      >
        {scheduled === 0
          ? 'Add a goal to give the day some shape.'
          : allDone
            ? isToday
              ? "Everything's done for today."
              : 'A full day.'
            : partial > 0
              ? `${partial} still in progress.`
              : 'Tap a goal when you have done it.'}
      </p>
    </div>
  </GlassCard>
);
