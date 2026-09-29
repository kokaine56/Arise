import { Suspense } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { BottomNav, SideNav, Wordmark } from '@/components/navigation/Navigation';
import { LoadingStatus, DashboardSkeleton } from '@/components/ui/States';
import { ScrollToTop } from '@/components/ui/Motion';
import { cn } from '@/lib/format';

/**
 * Application frame.
 *
 * A fixed glass rail on desktop, a floating glass bar on a phone, and one
 * centred column for the content in both. The column is deliberately narrow:
 * a daily checklist is read at arm's length on a phone and scanned on a
 * laptop, and neither benefits from extra width.
 */
export const AppShell = () => {
  const { pathname } = useLocation();

  return (
    <div className="canvas">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-[var(--radius-control)] focus:bg-accent focus:px-4 focus:py-2 focus:text-body focus:font-medium focus:text-accent-contrast"
      >
        Skip to content
      </a>

      <SideNav pathname={pathname} />

      <Wordmark className="safe-t pt-4 md:hidden" />

      <main
        id="main"
        className={cn(
          'mx-auto w-full max-w-xl px-4 pt-2 pb-32',
          'sm:px-6',
          'md:pl-[76px] md:pt-10 md:pb-16',
        )}
      >
        <ScrollToTop />
        <Suspense
          fallback={
            <>
              <LoadingStatus label="Loading" />
              <DashboardSkeleton />
            </>
          }
        >
          <Outlet />
        </Suspense>
      </main>

      <BottomNav pathname={pathname} />
    </div>
  );
};
