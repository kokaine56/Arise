import { lazy, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { ThemeProvider } from '@/hooks/useTheme';
import { ToastProvider } from '@/hooks/useToast';
import { AppShell } from '@/components/navigation/AppShell';
import { LoadingStatus, DashboardSkeleton } from '@/components/ui/States';
import { isSupabaseConfigured } from '@/lib/env';
import { SignInPage, SetupRequiredPage } from '@/pages/SignIn';
import { AuthCallbackPage } from '@/pages/AuthCallback';
import { NotFoundPage } from '@/pages/NotFound';
import { DashboardPage } from '@/pages/Dashboard';

// Everything past the first paint is split out, so signing in is not held up by
// screens nobody is looking at yet. The import specifiers are written out in
// full so the bundler can see them.
const GoalsPage = lazy(() => import('@/pages/Goals').then((m) => ({ default: m.GoalsPage })));
const HistoryPage = lazy(() => import('@/pages/History').then((m) => ({ default: m.HistoryPage })));
const InsightsPage = lazy(() => import('@/pages/Insights').then((m) => ({ default: m.InsightsPage })));
const SettingsPage = lazy(() => import('@/pages/Settings').then((m) => ({ default: m.SettingsPage })));

const SessionPending = () => (
  <div className="canvas">
    <div className="mx-auto w-full max-w-xl px-4 py-10">
      <LoadingStatus label="Checking your session" />
      <DashboardSkeleton />
    </div>
  </div>
);

/**
 * Gate for the signed-in part of the app.
 *
 * While the session is still being read nothing is rendered and nothing is
 * redirected. Deciding earlier would bounce an already-authenticated user to
 * the sign-in screen on every hard refresh, which is the most common way a
 * working auth flow feels broken.
 */
const RequireAuth = () => {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <SessionPending />;
  if (status === 'signed-out') {
    // Remember where they were headed so sign-in can return them there.
    return <Navigate to="/sign-in" replace state={{ from: location.pathname }} />;
  }
  return <AppShell />;
};

/** Keeps an already-signed-in user out of the sign-in screen. */
const RedirectIfSignedIn = ({ children }: { children: ReactNode }) => {
  const { status } = useAuth();

  if (status === 'loading') {
    return (
      <div className="canvas">
        <div className="mx-auto flex min-h-dvh max-w-md items-center justify-center">
          <LoadingStatus label="Checking your session" />
        </div>
      </div>
    );
  }

  return status === 'signed-in' ? <Navigate to="/" replace /> : children;
};

const AppRoutes = () => {
  // Without credentials there is nothing to sign in to, so explain the setup
  // rather than presenting a form that cannot possibly work.
  if (!isSupabaseConfigured()) return <SetupRequiredPage />;

  return (
    <Routes>
      <Route
        path="/sign-in"
        element={
          <RedirectIfSignedIn>
            <SignInPage />
          </RedirectIfSignedIn>
        }
      />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />

      <Route element={<RequireAuth />}>
        <Route index element={<DashboardPage />} />
        <Route path="goals" element={<GoalsPage />} />
        <Route path="history" element={<HistoryPage />} />
        <Route path="insights" element={<InsightsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

/**
 * Provider order matters: theme resolves before first paint, auth must exist
 * before any data hook runs, and toasts sit outermost so a failure inside any
 * screen still has somewhere to report itself.
 */
export const App = () => (
  <ThemeProvider>
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <AppRoutes />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  </ThemeProvider>
);
