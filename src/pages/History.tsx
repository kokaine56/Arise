import { useMemo, useState } from 'react';
import { useTimeZone, useToday } from '@/hooks/useAuth';
import { useAsync } from '@/hooks/useAsync';
import { useCategories } from '@/hooks/useCategories';
import { getDaysInRange } from '@/services/daily/daily.service';
import { GoalRow } from '@/components/goals/GoalRow';
import { ProgressCard } from '@/pages/Dashboard';
import { GlassCard } from '@/components/glass/GlassCard';
import { GlassButton } from '@/components/glass/GlassButton';
import { SegmentedControl } from '@/components/glass/GlassBadge';
import { ErrorState } from '@/components/ui/Feedback';
import { HistorySkeleton, EmptyState, LoadingStatus } from '@/components/ui/States';
import { PageTransition } from '@/components/ui/Motion';
import { IconCalendar, IconChevronLeft, IconChevronRight } from '@/components/ui/Icon';
import {
  addDays,
  compareCivil,
  formatDateLong,
  isSameCivil,
} from '@/lib/date/civil';
import type { CivilDate } from '@/lib/date/civil';
import type { ResolvedDay } from '@/lib/goals/resolve';

type Range = 7 | 30 | 90;

/**
 * History.
 *
 * Dates are read-only here. The one thing this screen must never do is imply
 * that yesterday can still be edited, so the rows are visually inert and
 * tapping one opens it for reading only.
 */
export const HistoryPage = () => {
  const timeZone = useTimeZone();
  const today = useToday(timeZone);
  const { labelFor } = useCategories();

  const [range, setRange] = useState<Range>(30);
  const [offset, setOffset] = useState(0);

  const end = useMemo(() => addDays(today, -offset), [today, offset]);
  const start = useMemo(() => addDays(end, -(range - 1)), [end, range]);

  const query = useAsync<ResolvedDay[]>(
    () => getDaysInRange({ from: start, to: end, timeZone }),
    [start, end, timeZone],
  );

  // A stable empty array: an inline `[]` would be a new reference every render,
  // which would recompute the totals below on every keystroke elsewhere.
  const days = useMemo(() => query.data ?? [], [query.data]);
  const isCurrent = offset === 0;
  const totals = useMemo(() => {
    let completed = 0;
    let scheduled = 0;
    let perfect = 0;
    for (const day of days) {
      completed += day.summary.completed;
      scheduled += day.summary.scheduled;
      if (day.summary.scheduled > 0 && day.summary.isComplete) perfect += 1;
    }
    return { completed, scheduled, perfect, recorded: days.length };
  }, [days]);

  return (
    <PageTransition>
      <header className="mb-6">
        <h1 className="text-headline text-foreground">History</h1>
        <p className="mt-1 text-body text-muted">
          What you actually did, kept as it was.
        </p>
      </header>

      <div className="mb-5 space-y-3">
        <SegmentedControl
          options={[
            { value: 7, label: 'Week' },
            { value: 30, label: 'Month' },
            { value: 90, label: 'Quarter' },
          ]}
          value={range}
          onChange={(value) => {
            setRange(value);
            setOffset(0);
          }}
          label="Time range"
        />

        <div className="flex items-center justify-between gap-2">
          <GlassButton
            size="sm"
            onClick={() => setOffset((current) => current + range)}
            aria-label="Previous period"
            className="w-9 justify-center px-0"
          >
            <IconChevronLeft className="size-4" />
          </GlassButton>

          <div className="flex flex-col items-center">
            <p className="text-body text-foreground">
              {formatDateLong(start)} — {formatDateLong(end)}
            </p>
            <p className="text-micro text-subtle">
              {isCurrent ? 'Up to today' : `Ends ${formatDateLong(end)}`}
            </p>
          </div>

          <GlassButton
            size="sm"
            onClick={() => setOffset((current) => Math.max(0, current - range))}
            disabled={isCurrent}
            aria-label="Next period"
            className="w-9 justify-center px-0"
          >
            <IconChevronRight className="size-4" />
          </GlassButton>
        </div>
      </div>

      <LoadingStatus label="Loading history" />

      {query.isInitialLoading ? <HistorySkeleton /> : null}

      {query.error ? (
        <ErrorState
          title="We couldn't load your history"
          message={query.error.userMessage}
          onRetry={query.refetch}
        />
      ) : null}

      {!query.isInitialLoading && !query.error ? (
        <div className="space-y-6">
          <ProgressCard
            percent={totals.scheduled === 0 ? 0 : Math.round((totals.completed / totals.scheduled) * 100)}
            completed={totals.completed}
            scheduled={totals.scheduled}
            partial={0}
            allDone={false}
            isToday={false}
          />

          {days.length === 0 ? (
            <EmptyState
              icon={<IconCalendar className="size-7" />}
              title="Nothing recorded yet."
              body="Once you start ticking things off, your days show up here."
            />
          ) : (
            <div className="space-y-4">
              {[...days].reverse().map((day) => (
                <DaySection
                  key={day.date}
                  day={day}
                  timeZone={timeZone}
                  today={today}
                  labelFor={labelFor}
                />
              ))}
            </div>
          )}
        </div>
      ) : null}
    </PageTransition>
  );
};

interface DaySectionProps {
  day: ResolvedDay;
  timeZone: string;
  today: CivilDate;
  labelFor: (id: string | null) => string | undefined;
}

const DaySection = ({ day, timeZone, today, labelFor }: DaySectionProps) => {
  const { summary, goals } = day;
  // A row is only interesting here if something was actually written. Falling
  // back to the scheduled set means a day with no taps still reads honestly
  // rather than appearing to have been hidden.
  const recorded = goals.filter((goal) => goal.updatedAt !== null);
  const display = recorded.length > 0 ? recorded : goals;
  const isToday = isSameCivil(day.date, today);
  const isFuture = compareCivil(day.date, today) > 0;

  return (
    <section aria-labelledby={`day-${day.date}`}>
      <div className="mb-2 flex items-baseline justify-between gap-3 px-1">
        <h2
          id={`day-${day.date}`}
          className="text-body font-medium text-foreground"
        >
          {isToday ? 'Today' : formatDateLong(day.date)}
        </h2>
        <p className="tabular text-caption text-subtle">
          {summary.scheduled === 0
            ? '—'
            : `${summary.completed}/${summary.scheduled}`}
        </p>
      </div>

      {isFuture ? (
        <GlassCard elevation="sunken" className="px-4 py-3">
          <p className="text-caption text-subtle">Still to come.</p>
        </GlassCard>
      ) : display.length === 0 ? (
        <GlassCard elevation="sunken" className="px-4 py-3">
          <p className="text-caption text-subtle">
            {summary.scheduled === 0
              ? 'Nothing was scheduled.'
              : 'Nothing was recorded on this day.'}
          </p>
        </GlassCard>
      ) : (
        <GlassCard className="overflow-hidden">
          <div>
            {display.map((goal) => (
              <GoalRow
                key={goal.goalId}
                goal={goal}
                date={day.date}
                timeZone={timeZone}
                categoryLabel={labelFor(goal.categoryId)}
                readOnly
              />
            ))}
          </div>
        </GlassCard>
      )}
    </section>
  );
};
