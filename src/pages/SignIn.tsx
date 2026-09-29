import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { GlassCard } from '@/components/glass/GlassCard';
import { GlassButton } from '@/components/glass/GlassButton';
import { Field, GlassInput } from '@/components/glass/GlassField';
import { SegmentedControl } from '@/components/glass/GlassBadge';
import { InlineSpinner } from '@/components/ui/Feedback';
import { PageTransition } from '@/components/ui/Motion';
import { Wordmark } from '@/components/navigation/Navigation';
import { requestPasswordReset, signIn, signUp } from '@/services/auth/auth.service';
import { toAppError } from '@/lib/errors';
import { SETUP_INSTRUCTIONS } from '@/lib/env';
import { detectTimeZone } from '@/lib/date/civil';

type Mode = 'sign-in' | 'sign-up' | 'reset';

const MODE_TABS: ReadonlyArray<{ value: Mode; label: string }> = [
  { value: 'sign-in', label: 'Sign in' },
  { value: 'sign-up', label: 'Create account' },
];

/** Deliberately permissive: the only authority on a valid address is Supabase. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const SignInPage = () => {
  const navigate = useNavigate();

  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const isSignUp = mode === 'sign-up';

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setError(null);
    setNotice(null);

    const trimmedEmail = email.trim();
    if (!EMAIL.test(trimmedEmail)) {
      setError('Enter a valid email address.');
      return;
    }

    if (mode !== 'reset' && password.length < 8) {
      setError('Passwords need to be at least 8 characters.');
      return;
    }

    setBusy(true);
    try {
      if (mode === 'sign-in') {
        await signIn(trimmedEmail, password);
        navigate('/', { replace: true });
        return;
      }

      if (mode === 'reset') {
        await requestPasswordReset(trimmedEmail);
        setNotice(
          'If that address has an account, a reset link is on its way. Check your spam folder if it has not arrived in a few minutes.',
        );
        return;
      }

      const { session, needsConfirmation } = await signUp({
        email: trimmedEmail,
        password,
        displayName,
        timeZone: detectTimeZone(),
      });

      if (session) {
        navigate('/', { replace: true });
        return;
      }

      setNotice(
        needsConfirmation
          ? 'Check your inbox to confirm your address, then come back and sign in.'
          : 'Your account is ready. Sign in to begin.',
      );
      setMode('sign-in');
    } catch (raw) {
      setError(toAppError(raw, `auth.${mode}`).userMessage);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="canvas">
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-12">
        <PageTransition>
          <div className="mb-8 flex flex-col items-center gap-3 text-center">
            <Wordmark />
            <div>
              <h1 className="text-headline text-foreground">
                {mode === 'reset' ? 'Reset your password' : isSignUp ? 'Start with Arise' : 'Welcome back'}
              </h1>
              <p className="mx-auto mt-1.5 max-w-xs text-body text-muted">
                {mode === 'reset'
                  ? 'We will email you a link to choose a new one.'
                  : isSignUp
                    ? 'One account, one private place for everything you want to keep doing.'
                    : 'Sign in to pick up where your day left off.'}
              </p>
            </div>
          </div>

          <GlassCard className="px-5 py-6">
            {mode !== 'reset' ? (
              <div className="mb-5">
                <SegmentedControl
                  options={MODE_TABS}
                  value={mode}
                  onChange={(next) => {
                    setMode(next);
                    setError(null);
                    setNotice(null);
                  }}
                  label="Sign in or create account"
                />
              </div>
            ) : null}

            <form onSubmit={(event) => void submit(event)} noValidate className="space-y-4">
              <Field label="Email">
                {({ id }) => (
                  <GlassInput
                    id={id}
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    autoCapitalize="none"
                    spellCheck={false}
                    data-autofocus
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@example.com"
                  />
                )}
              </Field>

              {isSignUp ? (
                <Field label="What should we call you?" hint="Optional. Used in the greeting.">
                  {({ id, describedBy }) => (
                    <GlassInput
                      id={id}
                      aria-describedby={describedBy}
                      autoComplete="name"
                      maxLength={60}
                      value={displayName}
                      onChange={(event) => setDisplayName(event.target.value)}
                      placeholder="Your name"
                    />
                  )}
                </Field>
              ) : null}

              {mode !== 'reset' ? (
                <Field
                  label="Password"
                  hint={isSignUp ? 'At least 8 characters.' : undefined}
                >
                  {({ id, describedBy }) => (
                    <GlassInput
                      id={id}
                      type="password"
                      autoComplete={isSignUp ? 'new-password' : 'current-password'}
                      aria-describedby={describedBy}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="••••••••"
                    />
                  )}
                </Field>
              ) : null}

              {error ? (
                <p role="alert" className="text-caption text-danger">
                  {error}
                </p>
              ) : null}
              {notice ? (
                <p role="status" className="text-caption text-accent">
                  {notice}
                </p>
              ) : null}

              <GlassButton
                type="submit"
                variant="primary"
                block
                disabled={busy}
                className="justify-center"
              >
                {busy ? (
                  <InlineSpinner label="Working" />
                ) : mode === 'reset' ? (
                  'Send reset link'
                ) : isSignUp ? (
                  'Create account'
                ) : (
                  'Sign in'
                )}
              </GlassButton>

              {mode !== 'reset' ? (
                <div className="pt-1 text-center">
                  <GlassButton
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setMode('reset');
                      setError(null);
                      setNotice(null);
                    }}
                  >
                    Forgot your password?
                  </GlassButton>
                </div>
              ) : (
                <div className="pt-1 text-center">
                  <GlassButton
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setMode('sign-in');
                      setError(null);
                      setNotice(null);
                    }}
                  >
                    Back to sign in
                  </GlassButton>
                </div>
              )}
            </form>
          </GlassCard>

          <p className="mt-6 text-center text-micro text-subtle">
            By continuing you agree to keep your own health data. Arise is not medical advice.
          </p>
        </PageTransition>
      </div>
    </div>
  );
};

/**
 * Shown instead of the app when the Supabase environment variables are absent.
 *
 * Deliberately actionable: a developer running a fresh clone gets exact steps
 * rather than a network error on first sign-in.
 */
export const SetupRequiredPage = () => (
  <div className="canvas">
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-5 py-12">
      <PageTransition>
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <Wordmark />
          <h1 className="text-headline text-foreground">Almost there</h1>
          <p className="max-w-sm text-body text-muted">
            Arise needs a Supabase project before it can store anything. It takes about two minutes.
          </p>
        </div>

        <GlassCard className="px-5 py-5">
          <ol className="space-y-4">
            {SETUP_INSTRUCTIONS.map((step, index) => (
              <li key={step} className="flex gap-3">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent-quiet text-caption font-medium text-accent">
                  {index + 1}
                </span>
                <span className="pt-0.5 text-caption text-muted">{step}</span>
              </li>
            ))}
          </ol>
        </GlassCard>
      </PageTransition>
    </div>
  </div>
);
