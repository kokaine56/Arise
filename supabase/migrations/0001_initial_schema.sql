-- ===========================================================================
-- Arise — initial schema
-- ---------------------------------------------------------------------------
-- Design rules enforced here, not merely in the client:
--   1. A recurring goal is never duplicated into future dates.
--   2. At most one completion record per (goal_id, date). This is a hard
--      UNIQUE constraint, so concurrent writes can never fork a day.
--   3. Completion is derived server-side for measured goals, so a client
--      cannot record 3 km of a 3 km target as "not completed".
--   4. Ownership always derives from auth.uid(). The client cannot assert a
--      user_id; RLS rejects the write if it tries.
-- ===========================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Shared trigger: keep updated_at honest
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null unique references auth.users (id) on delete cascade,
  display_name text not null default '',
  -- IANA zone name, e.g. 'Asia/Kolkata'. Civil dates are resolved against it.
  timezone     text not null default 'UTC',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint profiles_display_name_length check (char_length(display_name) <= 60),
  constraint profiles_timezone_not_blank check (char_length(timezone) between 1 and 64)
);

comment on column public.profiles.timezone is
  'IANA timezone. All "which day is it" resolution uses this, never server UTC.';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- user_settings (1:1 with profile)
-- ---------------------------------------------------------------------------
create table public.user_settings (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null unique references auth.users (id) on delete cascade,
  week_starts_on        smallint not null default 1,
  notifications_enabled boolean not null default false,
  default_reminder_time text,
  default_unit          text,
  hide_empty_history_days boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint user_settings_week_start check (week_starts_on in (1, 7)),
  constraint user_settings_reminder_clock check (
    default_reminder_time is null or default_reminder_time ~ '^[0-2][0-9]:[0-5][0-9]$'
  ),
  constraint user_settings_default_unit_length check (
    default_unit is null or char_length(default_unit) <= 16
  )
);

create trigger user_settings_set_updated_at
  before update on public.user_settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- categories
-- Seeded per user from the built-in set so custom categories can be added
-- later without a migration. Referenced by goals.category_id.
-- ---------------------------------------------------------------------------
create table public.categories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  slug       text not null,
  label      text not null,
  is_builtin boolean not null default false,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  constraint categories_slug_format check (slug ~ '^[a-z][a-z0-9_]{0,31}$'),
  constraint categories_label_length check (char_length(label) between 1 and 24),
  constraint categories_user_slug_unique unique (user_id, slug)
);

create index categories_user_idx on public.categories (user_id, sort_order);

-- ---------------------------------------------------------------------------
-- goals — the recurring definition. Never holds a completion.
-- ---------------------------------------------------------------------------
create table public.goals (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,

  name             text not null,
  description      text,
  goal_type        text not null,

  -- target_value carries the target magnitude. Units are minutes for
  -- 'duration', a plain count for 'count', and the measurement for 'numeric'.
  -- Null for 'checkbox' and 'time'.
  target_value     numeric(12, 3),
  unit             text,
  -- 'HH:MM' local deadline, required for goal_type = 'time'.
  target_time      text,

  category_id      uuid references public.categories (id) on delete set null,

  frequency_type   text not null,
  -- Shape: {} | { days: 1..7 } | { everyWeeks: n } | { everyNDays: n }
  frequency_config jsonb not null default '{}'::jsonb,

  start_date       date not null,
  end_date         date,
  reminder_time    text,

  is_active        boolean not null default true,
  sort_order       integer not null default 0,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  archived_at      timestamptz,

  constraint goals_name_length check (char_length(name) between 1 and 60),
  constraint goals_description_length check (description is null or char_length(description) <= 280),
  constraint goals_type_valid check (
    goal_type in ('checkbox', 'numeric', 'duration', 'count', 'time')
  ),
  constraint goals_unit_length check (unit is null or char_length(unit) <= 16),
  constraint goals_target_positive check (target_value is null or target_value > 0),
  constraint goals_target_range check (target_value is null or target_value <= 1000000),
  constraint goals_window_ordered check (end_date is null or end_date >= start_date),
  constraint goals_reminder_clock check (
    reminder_time is null or reminder_time ~ '^[0-2][0-9]:[0-5][0-9]$'
  ),
  constraint goals_target_time_clock check (
    target_time is null or target_time ~ '^[0-2][0-9]:[0-5][0-9]$'
  ),
  constraint goals_frequency_valid check (
    frequency_type in (
      'daily',
      'weekdays',
      'weekends',
      'selected_days',
      'weekly',
      'custom_interval'
    )
  ),
  constraint goals_frequency_config_is_object check (jsonb_typeof(frequency_config) = 'object'),

  -- A measured goal needs a target; a checkbox or time goal must not carry one.
  constraint goals_measured_requires_target check (
    (goal_type in ('numeric', 'duration', 'count')) = (target_value is not null)
  ),
  constraint goals_time_requires_target_time check (
    (goal_type = 'time') = (target_time is not null)
  ),
  -- Archiving implies deactivation, so the two flags can never disagree.
  constraint goals_archived_implies_inactive check (
    archived_at is null or is_active = false
  )
);

-- Partial index: the dashboard's hot path is "my live goals".
create index goals_user_active_idx
  on public.goals (user_id, sort_order)
  where archived_at is null;

create index goals_user_created_idx on public.goals (user_id, created_at desc);

create trigger goals_set_updated_at
  before update on public.goals
  for each row execute function public.set_updated_at();

-- Frequency type must agree with its config payload, so a mismatched pair
-- can never reach the scheduler.
create or replace function public.goals_validate_frequency()
returns trigger
language plpgsql
as $$
begin
  if new.frequency_config->>'kind' is distinct from new.frequency_type then
    raise exception
      'frequency_config.kind (%) must match frequency_type (%)',
      new.frequency_config->>'kind', new.frequency_type
      using errcode = 'check_violation';
  end if;

  if new.frequency_type = 'selected_days' then
    if jsonb_typeof(new.frequency_config->'days') <> 'array'
       or jsonb_array_length(new.frequency_config->'days') = 0 then
      raise exception 'selected_days requires a non-empty days array'
        using errcode = 'check_violation';
    end if;
    if exists (
      select 1
      from jsonb_array_elements(new.frequency_config->'days') as d
      where (d #>> '{}')::int not between 1 and 7
    ) then
      raise exception 'days must be ISO weekdays 1 (Mon) through 7 (Sun)'
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

create trigger goals_validate_frequency
  before insert or update on public.goals
  for each row execute function public.goals_validate_frequency();

-- ---------------------------------------------------------------------------
-- daily_goal_records — the historical record, independent of the definition.
-- ---------------------------------------------------------------------------
create table public.daily_goal_records (
  id           uuid primary key default gen_random_uuid(),
  goal_id      uuid not null references public.goals (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,

  -- Civil date in the user's timezone. Deliberately `date`, not `timestamptz`:
  -- the day a record belongs to is a calendar concept, not an instant.
  date         date not null,

  completed    boolean not null default false,
  actual_value numeric(12, 3),
  notes        text,

  -- UTC instant the goal was marked complete. Used to detect "late" on
  -- time-based goals.
  completed_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint daily_goal_records_actual_non_negative check (
    actual_value is null or actual_value >= 0
  ),
  constraint daily_goal_records_notes_length check (notes is null or char_length(notes) <= 280),

  -- Rule 2, enforced structurally.
  constraint daily_goal_records_goal_date_unique unique (goal_id, date)
);

-- The dashboard reads by (user_id, date); history pages page through the same
-- index. Uniqueness on (goal_id, date) already covers goal-scoped lookups.
create index daily_goal_records_user_date_idx
  on public.daily_goal_records (user_id, date desc);

create index daily_goal_records_user_completed_idx
  on public.daily_goal_records (user_id, completed)
  where completed;

create trigger daily_goal_records_set_updated_at
  before update on public.daily_goal_records
  for each row execute function public.set_updated_at();

-- Rule 3: for measured goals the database, not the client, decides completion.
-- This also keeps `completed_at` meaningful, since it can no longer be set on
-- a row that is not actually complete.
create or replace function public.daily_goal_records_sync_completion()
returns trigger
language plpgsql
as $$
declare
  v_goal_type   text;
  v_target      numeric;
  v_owner       uuid;
begin
  select g.goal_type, g.target_value, g.user_id
    into v_goal_type, v_target, v_owner
  from public.goals g
   where g.id = new.goal_id;

  if v_owner is null then
    raise exception 'goal % does not exist', new.goal_id
      using errcode = 'foreign_key_violation';
  end if;

  -- Defence in depth behind the RLS policy: the record can never be filed
  -- under an account other than the goal's owner.
  if new.user_id is distinct from v_owner then
    raise exception 'record user_id must match the goal owner'
      using errcode = 'insufficient_privilege';
  end if;

  if v_goal_type in ('numeric', 'duration', 'count') and v_target is not null then
    new.completed := coalesce(new.actual_value, 0) >= v_target;
  end if;

  if new.completed then
    new.completed_at := coalesce(new.completed_at, now());
  else
    new.completed_at := null;
  end if;

  return new;
end;
$$;

create trigger daily_goal_records_sync_completion
  before insert or update on public.daily_goal_records
  for each row execute function public.daily_goal_records_sync_completion();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles            enable row level security;
alter table public.user_settings       enable row level security;
alter table public.categories          enable row level security;
alter table public.goals               enable row level security;
alter table public.daily_goal_records  enable row level security;

-- profiles
create policy "profiles_select_own" on public.profiles
  for select to authenticated using (auth.uid() = user_id);
create policy "profiles_insert_own" on public.profiles
  for insert to authenticated with check (auth.uid() = user_id);
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- No delete policy: removal happens by deleting the auth user.

-- user_settings
create policy "user_settings_select_own" on public.user_settings
  for select to authenticated using (auth.uid() = user_id);
create policy "user_settings_insert_own" on public.user_settings
  for insert to authenticated with check (auth.uid() = user_id);
create policy "user_settings_update_own" on public.user_settings
  for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "user_settings_delete_own" on public.user_settings
  for delete to authenticated using (auth.uid() = user_id);

-- categories
create policy "categories_select_own" on public.categories
  for select to authenticated using (auth.uid() = user_id);
create policy "categories_insert_own" on public.categories
  for insert to authenticated with check (auth.uid() = user_id);
create policy "categories_update_own" on public.categories
  for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "categories_delete_own" on public.categories
  for delete to authenticated using (auth.uid() = user_id);

-- goals
create policy "goals_select_own" on public.goals
  for select to authenticated using (auth.uid() = user_id);
create policy "goals_insert_own" on public.goals
  for insert to authenticated with check (auth.uid() = user_id);
create policy "goals_update_own" on public.goals
  for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "goals_delete_own" on public.goals
  for delete to authenticated using (auth.uid() = user_id);

-- daily_goal_records
create policy "records_select_own" on public.daily_goal_records
  for select to authenticated using (auth.uid() = user_id);

-- Insert additionally requires that the referenced goal is one of yours.
-- The subquery is itself RLS-scoped, so it can only ever see your own goals.
create policy "records_insert_own_goal" on public.daily_goal_records
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.goals g
       where g.id = goal_id and g.user_id = auth.uid()
    )
  );

create policy "records_update_own_goal" on public.daily_goal_records
  for update to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.goals g
       where g.id = goal_id and g.user_id = auth.uid()
    )
  );

create policy "records_delete_own_goal" on public.daily_goal_records
  for delete to authenticated
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Provisioning: profile, settings and built-in categories on signup.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, display_name, timezone)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), ''),
    coalesce(nullif(new.raw_user_meta_data ->> 'timezone', ''), 'UTC')
  )
  on conflict (user_id) do nothing;

  insert into public.user_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  insert into public.categories (user_id, slug, label, is_builtin, sort_order)
  values
    (new.id, 'fitness',     'Fitness',     true, 10),
    (new.id, 'nutrition',    'Nutrition',    true, 20),
    (new.id, 'sleep',        'Sleep',        true, 30),
    (new.id, 'mindfulness',  'Mindfulness',  true, 40),
    (new.id, 'personal',     'Personal',     true, 50),
    (new.id, 'learning',     'Learning',     true, 60),
    (new.id, 'health',       'Health',       true, 70),
    (new.id, 'other',        'Other',        true, 80)
  on conflict (user_id, slug) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Grants: the anon/authenticated roles get nothing they have not been given a
-- policy for. RLS still applies on top.
-- ---------------------------------------------------------------------------
grant usage on schema public to authenticated;
grant select, insert, update, delete on
  public.profiles, public.user_settings, public.categories,
  public.goals, public.daily_goal_records
  to authenticated;
