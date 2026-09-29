import { lazy } from 'react';
import { BrowserRouter, Route, Routes, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { ThemeProvider } from '@/hooks/useTheme';
import { ToastProvider } from '@/hooks/useToast';
import { AppShell } from '@/components/navigation/AppShell';
import { NotFoundPage } from '@/pages/NotFound';
import { DashboardPage } from '@/pages/Dashboard';

const GoalsPage = lazy(() => import('@/pages/Goals').then((m) => ({ default: m.GoalsPage })));
const HistoryPage = lazy(() => import('@/pages/History').then((m) => ({ default: m.HistoryPage })));
const InsightsPage = lazy(() => import('@/pages/Insights').then((m) => ({ default: m.InsightsPage })));
const SettingsPage = lazy(() => import('@/pages/Settings').then((m) => ({ default: m.SettingsPage })));

import { AccessGate } from '@/components/auth/AccessGate';

const AppRoutes = () => {
  const { isAuthenticated, isProfileLoading } = useAuth();

  if (isProfileLoading || isAuthenticated === null) {
    return <div className="fixed inset-0 flex items-center justify-center bg-background"><div className="text-muted">Loading...</div></div>;
  }

  if (!isAuthenticated) {
    return <AccessGate />;
  }

  return (
    <Routes>
      <Route element={<AppShell />}>
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
