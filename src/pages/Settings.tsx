import { useEffect, useState } from 'react';
import { useAuth, useTimeZone } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { useToast } from '@/hooks/useToast';
import { useCategories } from '@/hooks/useCategories';
import { createCategory, deleteCategory, type Category } from '@/services/categories/categories.service';
import { GlassCard, SectionLabel } from '@/components/glass/GlassCard';
import { GlassButton } from '@/components/glass/GlassButton';
import { Badge, SegmentedControl, Switch } from '@/components/glass/GlassBadge';
import { Field, GlassInput } from '@/components/glass/GlassField';
import { ErrorState, InlineSpinner } from '@/components/ui/Feedback';
import { PageTransition } from '@/components/ui/Motion';
import {
  IconLock,
  IconLogout,
  IconPlus,
  IconSun,
  IconMonitor,
  IconMoon,
  IconTrash,
} from '@/components/ui/Icon';
import { toAppError } from '@/lib/errors';
import { SETUP_INSTRUCTIONS, supabaseConfig } from '@/lib/env';
import { detectTimeZone } from '@/lib/date/civil';
import { WEEK_START_OPTIONS, type ThemePreference } from '@/types/profile';

const THEME_OPTIONS: ReadonlyArray<{ value: ThemePreference; label: string }> = [
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
];

const THEME_ICON: Record<ThemePreference, typeof IconSun> = {
  dark: IconMoon,
  system: IconMonitor,
  light: IconSun,
};

export const SettingsPage = () => {
  const { profile, settings, updateProfile, updateSettings, signOut, user, error: authError, reloadProfile } =
    useAuth();
  const { preference, setPreference } = useTheme();
  const { notify } = useToast();
  const timeZone = useTimeZone();
  const { categories, refetch: refetchCategories } = useCategories();

  const [name, setName] = useState(profile?.displayName ?? '');
  const [savingName, setSavingName] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  // Keep the field in step with the profile once it arrives after sign-in.
  useEffect(() => {
    setName(profile?.displayName ?? '');
  }, [profile?.displayName]);

  const saveName = async (): Promise<void> => {
    setSavingName(true);
    try {
      await updateProfile({ displayName: name.trim() });
      notify({ tone: 'success', message: 'Name updated' });
    } catch (raw) {
      notify({
        tone: 'error',
        message: "We couldn't save that",
        detail: toAppError(raw, 'profile.update').userMessage,
      });
    } finally {
      setSavingName(false);
    }
  };

  const applyTimeZone = async (): Promise<void> => {
    const detected = detectTimeZone();
    if (detected === timeZone) return;
    try {
      await updateProfile({ timezone: detected });
      notify({
        tone: 'success',
        message: 'Time zone updated',
        detail: `Days now roll over at midnight in ${detected}.`,
      });
    } catch (raw) {
      notify({
        tone: 'error',
        message: "We couldn't update your time zone",
        detail: toAppError(raw, 'profile.update').userMessage,
      });
    }
  };

  const onSignOut = async (): Promise<void> => {
    setSigningOut(true);
    try {
      await signOut();
    } catch (raw) {
      notify({
        tone: 'error',
        message: "We couldn't sign you out",
        detail: toAppError(raw, 'auth.signOut').userMessage,
      });
      setSigningOut(false);
    }
  };

  return (
    <PageTransition>
      <header className="mb-6">
        <h1 className="text-headline text-foreground">Settings</h1>
        <p className="mt-1 text-body text-muted">Your account, and how Arise behaves.</p>
      </header>

      {authError ? (
        <div className="mb-5">
          <ErrorState
            compact
            title="We couldn't load your profile"
            message={`${authError.userMessage} Your data is safe — some settings may look default.`}
            onRetry={reloadProfile}
          />
        </div>
      ) : null}

      <div className="space-y-5">
        <GlassCard className="px-4 py-4">
          <SectionLabel>Account</SectionLabel>

          <div className="mt-4 space-y-4">
            <Field label="What should we call you?" hint="Used in the greeting. Leave blank to go unnamed.">
              {({ id, describedBy }) => (
                <GlassInput
                  id={id}
                  aria-describedby={describedBy}
                  value={name}
                  maxLength={60}
                  autoComplete="name"
                  onChange={(event) => setName(event.target.value)}
                />
              )}
            </Field>

            <div className="flex justify-end">
              <GlassButton
                size="sm"
                onClick={() => void saveName()}
                disabled={savingName || name === (profile?.displayName ?? '')}
              >
                {savingName ? 'Saving…' : 'Save name'}
              </GlassButton>
            </div>

            <dl className="space-y-2 border-t border-hairline pt-3 text-caption">
              <Row label="Email" value={user?.email ?? '—'} />
              <Row label="Member since" value={formatMemberSince(profile?.createdAt)} />
            </dl>

            <GlassButton
              onClick={() => void onSignOut()}
              disabled={signingOut}
              leading={<IconLogout className="size-4" />}
              block
            >
              {signingOut ? 'Signing out…' : 'Sign out'}
            </GlassButton>
          </div>
        </GlassCard>

        <GlassCard className="px-4 py-4">
          <SectionLabel>Appearance</SectionLabel>
          <p className="mt-1 text-caption text-subtle">
            Dark is the default. This is the only thing Arise remembers on this device.
          </p>
          <div className="mt-3">
            <SegmentedControl
              options={THEME_OPTIONS}
              value={preference}
              onChange={setPreference}
              label="Theme"
            />
          </div>
          <p className="mt-2 flex items-center gap-1.5 text-micro text-subtle">
            {(() => {
              const Icon = THEME_ICON[preference];
              return <Icon className="size-3" />;
            })()}
            Currently showing the {preference === 'system' ? 'system' : preference} palette.
          </p>
        </GlassCard>

        <GlassCard className="px-4 py-4">
          <SectionLabel>Days and time</SectionLabel>
          <p className="mt-1 text-caption text-subtle">
            Arise decides what "today" means from your profile's time zone, not your device.
          </p>

          <dl className="mt-4 space-y-2 text-caption">
            <Row label="Time zone" value={timeZone} />
            <Row
              label="Detected on this device"
              value={detectTimeZone()}
              action={
                detectTimeZone() !== timeZone ? (
                  <GlassButton size="sm" onClick={() => void applyTimeZone()}>
                    Use this
                  </GlassButton>
                ) : (
                  <Badge tone="accent">Current</Badge>
                )
              }
            />
          </dl>

          <div className="mt-4 border-t border-hairline pt-4">
            <p className="mb-2 text-caption font-medium text-muted">Week starts on</p>
            <SegmentedControl
              options={WEEK_START_OPTIONS}
              value={settings.weekStartsOn}
              onChange={(weekStartsOn) => void updateSettings({ weekStartsOn })}
              label="Week start"
              size="sm"
            />
          </div>

          <div className="mt-4 space-y-1 border-t border-hairline pt-4">
            <Switch
              label="Hide empty days in history"
              description="Days with nothing scheduled won't be listed at all."
              checked={settings.hideEmptyHistoryDays}
              onChange={(hideEmptyHistoryDays) => void updateSettings({ hideEmptyHistoryDays })}
            />
          </div>
        </GlassCard>

        <CategoriesCard
          categories={categories}
          onChanged={() => refetchCategories()}
        />

        <GlassCard className="px-4 py-4">
          <SectionLabel>Privacy</SectionLabel>
          <div className="mt-3 space-y-3">
            <div className="flex items-start gap-3">
              <IconLock className="mt-0.5 size-4 shrink-0 text-accent" />
              <div>
                <p className="text-body text-foreground">Your records are yours alone.</p>
                <p className="mt-1 text-caption text-muted">
                  Every table is protected by Row Level Security, so a signed-in user can only ever
                  read or write their own rows. There is no analytics service, no third-party
                  tracking, and no account data anywhere but your Supabase project.
                </p>
              </div>
            </div>
            <p className="border-t border-hairline pt-3 text-micro text-subtle">
              Arise {supabaseConfig.debug ? 'is in debug mode' : 'is running in production mode'}.{' '}
              {SETUP_INSTRUCTIONS.length} setup steps are documented in README.md.
            </p>
          </div>
        </GlassCard>
      </div>
    </PageTransition>
  );
};

interface RowProps {
  label: string;
  value: string;
  action?: React.ReactNode;
}

const Row = ({ label, value, action }: RowProps) => (
  <div className="flex items-baseline justify-between gap-3">
    <dt className="text-subtle">{label}</dt>
    <dd className="flex min-w-0 items-center gap-2">
      <span className="truncate text-muted">{value}</span>
      {action}
    </dd>
  </div>
);

const formatMemberSince = (iso: string | undefined): string => {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
};

interface CategoriesCardProps {
  categories: readonly Category[];
  onChanged: () => void;
}

const CategoriesCard = ({ categories, onChanged }: CategoriesCardProps) => {
  const { notify } = useToast();
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  const trimmed = label.trim();

  const add = async (): Promise<void> => {
    if (trimmed.length === 0) return;
    setBusy(true);
    try {
      await createCategory(trimmed);
      setLabel('');
      onChanged();
      notify({ tone: 'success', message: `Added ${trimmed}` });
    } catch (raw) {
      notify({
        tone: 'error',
        message: "We couldn't add that category",
        detail: toAppError(raw, 'category.create').userMessage,
      });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (category: Category): Promise<void> => {
    setRemoving(category.id);
    try {
      await deleteCategory(category.id);
      onChanged();
      notify({
        tone: 'success',
        message: `Removed ${category.label}`,
        detail: 'Goals keep working — they simply have no category.',
      });
    } catch (raw) {
      notify({
        tone: 'error',
        message: "We couldn't remove that category",
        detail: toAppError(raw, 'category.delete').userMessage,
      });
    } finally {
      setRemoving(null);
    }
  };

  return (
    <GlassCard className="px-4 py-4">
      <SectionLabel>Categories</SectionLabel>
      <p className="mt-1 text-caption text-subtle">
        A small number of groupings. Arise never invents categories for you.
      </p>

      <ul className="mt-4 space-y-2">
        {categories.length === 0 ? (
          <li className="text-caption text-subtle">No categories yet.</li>
        ) : (
          categories.map((category) => (
            <li
              key={category.id}
              className="flex items-center justify-between gap-3 rounded-[var(--radius-control)] bg-glass px-3 py-2"
            >
              <span className="text-body text-foreground">{category.label}</span>
              <GlassButton
                size="sm"
                onClick={() => void remove(category)}
                disabled={removing === category.id}
                aria-label={`Remove ${category.label}`}
                className="w-8 justify-center px-0"
              >
                {removing === category.id ? (
                  <InlineSpinner label="Removing" />
                ) : (
                  <IconTrash className="size-3.5" />
                )}
              </GlassButton>
            </li>
          ))
        )}
      </ul>

      <div className="mt-4 flex items-end gap-2 border-t border-hairline pt-4">
        <div className="flex-1">
          <Field label="Add a category">
            {({ id, describedBy }) => (
              <GlassInput
                id={id}
                aria-describedby={describedBy}
                value={label}
                maxLength={40}
                placeholder="Movement"
                onChange={(event) => setLabel(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void add();
                  }
                }}
              />
            )}
          </Field>
        </div>
        <GlassButton
          onClick={() => void add()}
          disabled={busy || trimmed.length === 0}
          leading={<IconPlus className="size-4" />}
        >
          Add
        </GlassButton>
      </div>
    </GlassCard>
  );
};
