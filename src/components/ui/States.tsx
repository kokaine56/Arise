import { cn } from '@/lib/format';
import type { ReactNode } from 'react';

export const Skeleton = ({ className }: { className?: string }) => (
  <div className={cn('skeleton', className)} aria-hidden />
);

/**
 * Loading placeholders that mirror the real layout's shape, so nothing jumps
 * when data arrives. Decorative only — the surrounding region carries the
 * `aria-busy` and a live status message.
 */
export const DashboardSkeleton = () => (
  <div className="space-y-6" aria-hidden>
    <div className="space-y-2">
      <Skeleton className="h-7 w-40" />
      <Skeleton className="h-4 w-28" />
    </div>
    <div className="glass flex flex-col items-center gap-4 px-5 py-7">
      <Skeleton className="size-[132px] rounded-full" />
      <Skeleton className="h-3 w-24" />
    </div>
    <div className="glass divide-y divide-glass-border overflow-hidden">
      {Array.from({ length: 5 }, (_, index) => (
        <div key={index} className="flex items-center gap-4 px-4 py-4">
          <Skeleton className="size-6 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
      ))}
    </div>
  </div>
);

export const ListSkeleton = ({ rows = 4 }: { rows?: number }) => (
  <div className="glass overflow-hidden" aria-hidden>
    {Array.from({ length: rows }, (_, index) => (
      <div key={index} className="hairline flex items-center gap-4 px-4 py-4">
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-28" />
        </div>
        <Skeleton className="size-8 rounded-full" />
      </div>
    ))}
  </div>
);

export const CardSkeleton = ({ className }: { className?: string }) => (
  <div className={cn('glass space-y-3 p-5', className)} aria-hidden>
    <Skeleton className="h-3 w-20" />
    <Skeleton className="h-8 w-24" />
    <Skeleton className="h-3 w-32" />
  </div>
);

/** Two stat tiles, a chart, and a list — the shape of the Insights screen. */
export const InsightsSkeleton = () => (
  <div className="space-y-6" aria-hidden>
    <div className="grid grid-cols-2 gap-3">
      {Array.from({ length: 4 }, (_, index) => (
        <CardSkeleton key={index} />
      ))}
    </div>
    <div className="glass space-y-4 p-5">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-24 w-full" />
    </div>
    <ListSkeleton rows={3} />
  </div>
);

/** Day sections for the History screen. */
export const HistorySkeleton = () => (
  <div className="space-y-4" aria-hidden>
    {Array.from({ length: 3 }, (_, index) => (
      <div key={index} className="space-y-2">
        <Skeleton className="h-3 w-32" />
        <ListSkeleton rows={2} />
      </div>
    ))}
  </div>
);

/**
 * A live region announcing load progress. Skeletons are invisible to assistive
 * technology, so this is what actually tells a screen-reader user that
 * something is on its way.
 */
export const LoadingStatus = ({ label }: { label: string }) => (
  <p role="status" aria-live="polite" className="sr-only">
    {label}
  </p>
);

export const EmptyState = ({
  title,
  body,
  action,
  icon,
}: {
  title: string;
  body: string;
  action?: ReactNode;
  icon?: ReactNode;
}) => (
  <div className="glass flex flex-col items-center gap-3 px-6 py-12 text-center">
    {icon ? <div className="mb-1 text-subtle">{icon}</div> : null}
    <h3 className="text-title text-foreground">{title}</h3>
    <p className="max-w-xs text-body text-muted">{body}</p>
    {action ? <div className="mt-3">{action}</div> : null}
  </div>
);
