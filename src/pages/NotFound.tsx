import { GlassCard } from '@/components/glass/GlassCard';
import { GlassLink } from '@/components/glass/GlassButton';
import { PageTransition } from '@/components/ui/Motion';

/**
 * A wrong address should feel like a dead end with a clear way out, not an
 * error. The reader's data is untouched, and that is worth saying.
 */
export const NotFoundPage = () => (
  <PageTransition className="py-16">
    <GlassCard className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <p className="tabular text-headline text-subtle">404</p>
      <h1 className="text-title text-foreground">There's nothing here.</h1>
      <p className="max-w-xs text-body text-muted">
        The page you were after doesn't exist. Your goals are still exactly where you left them.
      </p>
      <GlassLink to="/" variant="primary" className="mt-3">
        Back to today
      </GlassLink>
    </GlassCard>
  </PageTransition>
);
