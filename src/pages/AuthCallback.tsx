import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { consumeAuthCallback } from '@/services/auth/auth.service';
import { GlassCard } from '@/components/glass/GlassCard';
import { GlassButton } from '@/components/glass/GlassButton';
import { InlineSpinner } from '@/components/ui/Feedback';
import { PageTransition } from '@/components/ui/Motion';
import { Wordmark } from '@/components/navigation/Navigation';

/**
 * The landing point for emailed confirmation and recovery links.
 *
 * The token is exchanged once, then the URL is scrubbed. A brief, honest
 * status rather than a spinner that could spin forever on a dead link.
 */
export const AuthCallbackPage = () => {
  const navigate = useNavigate();
  const [state, setState] = useState<'working' | 'failed'>('working');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    void (async () => {
      const result = await consumeAuthCallback();
      if (!active) return;

      if (result.ok) {
        navigate('/', { replace: true });
        return;
      }

      setState('failed');
      setMessage(result.message ?? 'That link could not be used.');
    })();

    return () => {
      active = false;
    };
  }, [navigate]);

  return (
    <div className="canvas">
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-12">
        <PageTransition>
          <div className="mb-6 flex flex-col items-center gap-3 text-center">
            <Wordmark />
            <h1 className="text-headline text-foreground">
              {state === 'working' ? 'Signing you in' : 'That link did not work'}
            </h1>
          </div>

          <GlassCard className="px-5 py-6 text-center">
            {state === 'working' ? (
              <div className="flex justify-center py-2">
                <InlineSpinner label="Signing you in" />
              </div>
            ) : (
              <>
                <p className="text-body text-muted">{message}</p>
                <GlassButton
                  variant="primary"
                  block
                  className="mt-5"
                  onClick={() => navigate('/sign-in', { replace: true })}
                >
                  Back to sign in
                </GlassButton>
              </>
            )}
          </GlassCard>
        </PageTransition>
      </div>
    </div>
  );
};
