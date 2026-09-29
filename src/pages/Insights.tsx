import { useMemo, useState } from 'react';
import { useTimeZone, useToday, useWeekStart } from '@/hooks/useAuth';
import { useAsync } from '@/hooks/useAsync';
import { getInsights, type Insights } from '@/services/analytics/analytics.service';
import { GlassCard, SectionLabel } from '@/components/glass/GlassCard';
import { SegmentedControl } from '@/components/glass/GlassBadge';
import { ErrorState } from '@/components/ui/Feedback';
import { InsightsSkeleton, EmptyState, LoadingStatus } from '@/components/ui/States';
import { PageTransition } from '@/components/ui/Motion';
import { IconChart, IconFlame, IconSparkle } from '@/components/ui/Icon';
import { formatDateShort } from '@/lib/date/civil';
import { asPercent, cn, formatAmount, pluralise } from '@/lib/format';

type Window = 30 | 90;

/**
 * Insights.
 *
 * Four numbers answer "how am I doing" — current streak, thirty-day
 * completion, this week's completion, and the best run so far. Everything below
 * explains where the time went. No invented benchmarks and no score out of a
 * hundred: the numbers only ever describe what actually happened.
 */
export const InsightsPage = () => {
  const timeZone = useTimeZone();
  const today = useToday(timeZone);
  const weekStartsOn = useWeekStart();

  const [window, setWindow] = useState<Window>(30);

  const query = useAsync<Insights>(
    () => getInsights({ today, timeZone, weekStartsOn, windowDays: window }),
    [today, timeZone, weekStartsOn, window],
  );

  const data = query.data;

  const headline = useMemo(() => {
    if (data === null) return [];
    return [
      {
        id: 'streak',
        icon: <IconFlame className="size-3.5" />,
        label: 'Current streak',
        value: data.currentStreak.current === 0 ? '—' : String(data.currentStreak.current),
        unit:
          data.currentStreak.current === 1
            ? 'day'
            : data.currentStreak.current === 0
              ? 'days'
              : 'days',
        tone: 'accent' as const,
      },
      {
        id: 'completion',
        icon: <IconChart className="size-3.5" />,
        label: 'Completion',
        value: `${asPercent(data.last30.rate)}%`,
        unit: 'last 30 days',
        tone: 'neutral' as const,
      },
      {
        id: 'week',
        icon: <IconSparkle className="size-3.5" />,
        label: 'This week',
        value: `${asPercent(data.consistency.weekly)}%`,
        unit: 'so far',
        tone: 'neutral' as const,
      },
      {
        id: 'best',
        icon: null,
        label: 'Best run',
        value: String(data.bestStreak.best),
        unit: data.bestStreak.best === 1 ? 'day' : 'days',
        tone: 'neutral' as const,
      },
    ];
  }, [data]);

  return (
    <PageTransition>
      <header className="mb-6">
        <h1 className="text-headline text-foreground">Insights</h1>
        <p className="mt-1 text-body text-muted">Patterns, not judgement.</p>
      </header>

      <div className="mb-5">
        <SegmentedControl
          options={[
            { value: 30, label: '30 days' },
            { value: 90, label: '90 days' },
          ]}
          value={window}
          onChange={(value) => setWindow(value)}
          label="Reporting window"
        />
      </div>

      <LoadingStatus label="Crunching your numbers" />

      {query.isInitialLoading ? <InsightsSkeleton /> : null}

      {query.error ? (
        <ErrorState
          title="We couldn't load your insights"
          message={query.error.userMessage}
          onRetry={query.refetch}
        />
      ) : null}

      {data ? (
        data.allTime.scheduled === 0 ? (
          <EmptyState
            icon={<IconChart className="size-7" />}
            title="Not enough to look at yet."
            body="Once you've tracked a few days, patterns and streaks appear here."
          />
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-3">
              {headline.map((stat) => (
                <GlassCard key={stat.id} className="px-4 py-4">
                  <p className="flex items-center gap-1.5 text-caption text-subtle">
                    {stat.icon}
                    {stat.label}
                  </p>
                  <p className="mt-2 flex items-baseline gap-1.5">
                    <span
                      className={cn(
                        'tabular text-2xl leading-none',
                        stat.tone === 'accent' ? 'text-accent' : 'text-foreground',
                      )}
                    >
                      {stat.value}
                    </span>
                    <span className="text-caption text-subtle">{stat.unit}</span>
                  </p>
                </GlassCard>
              ))}
            </div>

            <TrendCard data={data} window={window} />

            {data.perGoal.length > 0 ? (
              <GlassCard className="overflow-hidden">
                <SectionLabel className="px-4 pb-2 pt-4">By goal</SectionLabel>
                <div>
                  {data.perGoal.map((stat) => (
                    <div key={stat.goalId} className="border-t border-hairline px-4 py-3.5">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="truncate text-body text-foreground">{stat.name}</p>
                        <p className="tabular text-caption text-muted">
                          {asPercent(stat.rate)}%
                        </p>
                      </div>
                      <div
                        className="mt-2 h-1 overflow-hidden rounded-full bg-glass-sunken"
                        role="presentation"
                      >
                        <div
                          className="h-full rounded-full bg-accent transition-[width] duration-500"
                          style={{ width: `${asPercent(stat.rate)}%` }}
                        />
                      </div>
                      <p className="mt-1.5 text-micro text-subtle">
                        {stat.completed} of {stat.scheduled} completed
                        {stat.streak.current > 0
                          ? ` · ${pluralise(stat.streak.current, 'day')} running`
                          : ''}
                      </p>
                    </div>
                  ))}
                </div>
              </GlassCard>
            ) : null}
          </div>
        )
      ) : null}
    </PageTransition>
  );
};

interface TrendCardProps {
  data: Insights;
  window: Window;
}

/**
 * Completion over time as a run of thin bars.
 *
 * Deliberately not a line chart: the question is "how much got done each day",
 * and a bar's height answers it without reading an axis. Days with nothing
 * scheduled are blank rather than zero, so a rest day never looks like failure.
 */
const TrendCard = ({ data, window }: TrendCardProps) => {
  const bars = useMemo(
    () =>
      (window === 30 ? data.daily : data.weekly).map((point) => ({
        key: 'date' in point ? point.date : point.weekStart,
        completed: point.completed,
        scheduled: point.scheduled,
        rate: point.rate,
      })),
    [data, window],
  );

  const max = Math.max(1, ...bars.map((bar) => bar.scheduled));

  return (
    <GlassCard className="px-4 py-4">
      <div className="flex items-baseline justify-between gap-3">
        <SectionLabel>{window === 30 ? 'Last 30 days' : 'By week'}</SectionLabel>
        <p className="text-micro text-subtle">
          {formatDateShort(data.from)} — {formatDateShort(data.today)}
        </p>
      </div>

      <div className="mt-4 flex h-24 items-end gap-[3px]" role="presentation">
        {bars.map((bar) => {
          const height = bar.scheduled === 0 ? 0 : Math.max(6, (bar.completed / max) * 96);
          return (
            <div
              key={bar.key}
              className={cn(
                'flex-1 rounded-full transition-[height] duration-300',
                bar.scheduled === 0 ? 'bg-glass-sunken' : 'bg-accent/85',
              )}
              style={{ height: `${height}%` }}
            />
          );
        })}
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-hairline pt-3">
        <Stat label="Completed" value={formatAmount(data.last30.completed)} />
        <Stat label="Scheduled" value={formatAmount(data.last30.scheduled)} />
        <Stat label="Days tracked" value={String(data.last30.days)} />
      </dl>
    </GlassCard>
  );
};

interface StatProps {
  label: string;
  value: string;
}

const Stat = ({ label, value }: StatProps) => (
  <div>
    <dt className="text-micro text-subtle">{label}</dt>
    <dd className="tabular mt-0.5 text-body text-foreground">{value}</dd>
  </div>
);
