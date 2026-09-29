-- ===========================================================================
-- Arise — initial schema (SQLite)
-- ---------------------------------------------------------------------------
-- Translated from the original PostgreSQL/Supabase schema. The design rules
-- that file enforced are preserved here, because they are the parts that make
-- the data trustworthy rather than merely storable:
--
--   1. A recurring goal is never duplicated into future dates. Still structural:
--      `goals` holds the definition, `daily_goal_records` holds outcomes, and
--      there is no table in which a copy could be made.
--   2. At most one completion record per (goal_id, date). A hard UNIQUE
--      constraint, so a double-tap or a retried request converges instead of
--      forking the day.
--   3. Completion is derived by a trigger for measured goals, so a client
--      cannot record 3 km against a 3 km target as "not completed".
--   4. Row Level Security is gone, and deliberately so: there is no longer more
--      than one user and no network-facing database. What replaces it is
--      narrower — the API is the only writer, it never accepts an owner id from
--      a request, and the SQLite file is not reachable except through it.
--
-- Deliberate type changes, and why:
--   date / timestamptz -> TEXT   ISO-8601 strings, which is exactly what the
--                               client already passes around (CivilDate is
--                               'YYYY-MM-DD', timestamps are strings), which
--                               removes a whole class of conversion bugs.
--   uuid               -> TEXT   ids are minted by the API with randomUUID().
--   numeric(12, 3)     -> REAL   adequate for magnitudes like minutes and km.
--   jsonb              -> TEXT   guarded by json_valid(), read with JSON1.
--   boolean            -> INTEGER CHECK (x IN (0, 1))   SQLite has no bool.
--
-- One rule got *stricter* in translation. The PostgreSQL original validated
-- clocks with `^[0-2][0-9]:[0-5][0-9]$`, which accepts the non-existent hours
-- 24 through 29; the inline checks below bound the hour numerically instead.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Migration ledger. The runner applies each file once, in filename order.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS schema_migrations (
  name       TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ---------------------------------------------------------------------------
-- profiles — a single row. `id = 1` is enforced by the CHECK, so this table
-- cannot grow a second row even by accident.
-- ---------------------------------------------------------------------------
CREATE TABLE profiles (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  display_name  TEXT NOT NULL DEFAULT '' CHECK (length(display_name) <= 60),
  -- IANA zone name, e.g. 'Asia/Kolkata'. Civil dates resolve against this, so
  -- "which day is it" never depends on the server's own UTC clock.
  timezone      TEXT NOT NULL DEFAULT 'UTC' CHECK (length(timezone) BETWEEN 1 AND 64),
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TRIGGER profiles_set_updated_at
AFTER UPDATE ON profiles
BEGIN
  -- Recursive triggers are off (the runner sets the pragma explicitly), so this
  -- inner UPDATE does not re-fire the trigger.
  UPDATE profiles SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
   WHERE id = new.id;
END;

-- ---------------------------------------------------------------------------
-- user_settings — also a single row.
-- ---------------------------------------------------------------------------
CREATE TABLE user_settings (
  id                       INTEGER PRIMARY KEY CHECK (id = 1),
  week_starts_on           INTEGER NOT NULL DEFAULT 1 CHECK (week_starts_on IN (1, 7)),
  notifications_enabled    INTEGER NOT NULL DEFAULT 0 CHECK (notifications_enabled IN (0, 1)),
  default_reminder_time    TEXT,
  default_unit             TEXT,
  hide_empty_history_days  INTEGER NOT NULL DEFAULT 1 CHECK (hide_empty_history_days IN (0, 1)),
  created_at               TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at               TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (default_unit IS NULL OR length(default_unit) <= 16)
);

CREATE TRIGGER user_settings_set_updated_at
AFTER UPDATE ON user_settings
BEGIN
  UPDATE user_settings SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
   WHERE id = new.id;
END;

-- ---------------------------------------------------------------------------
-- categories — global, seeded once. Custom categories can be added later
-- without a migration. Referenced by goals.category_id.
-- ---------------------------------------------------------------------------
CREATE TABLE categories (
  id          TEXT PRIMARY KEY,
  slug        TEXT NOT NULL UNIQUE
                CHECK (slug GLOB '[a-z][a-z0-9_]*' AND length(slug) <= 32),
  label       TEXT NOT NULL CHECK (length(label) BETWEEN 1 AND 24),
  is_builtin  INTEGER NOT NULL DEFAULT 0 CHECK (is_builtin IN (0, 1)),
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX categories_sort_idx ON categories (sort_order, slug);

-- ---------------------------------------------------------------------------
-- goals — the recurring definition. Never holds a completion.
-- ---------------------------------------------------------------------------
CREATE TABLE goals (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
  description       TEXT CHECK (description IS NULL OR length(description) <= 280),
  goal_type         TEXT NOT NULL
                      CHECK (goal_type IN ('checkbox', 'numeric', 'duration', 'count', 'time')),

  -- Target magnitude: minutes for 'duration', a plain count for 'count', the
  -- measurement for 'numeric'. NULL for 'checkbox' and 'time'.
  target_value      REAL
                      CHECK (target_value IS NULL OR (target_value > 0 AND target_value <= 1000000)),
  unit              TEXT CHECK (unit IS NULL OR length(unit) <= 16),
  -- 'HH:MM' local deadline, required when goal_type = 'time'.
  target_time       TEXT,

  category_id       TEXT REFERENCES categories (id) ON DELETE SET NULL,

  frequency_type    TEXT NOT NULL
                      CHECK (frequency_type IN
                        ('daily', 'weekdays', 'weekends', 'selected_days', 'weekly', 'custom_interval')),
  -- Shape: {"kind":...} | {"kind":"selected_days","days":[1..7]}
  --        | {"kind":"weekly","everyWeeks":n} | {"kind":"custom_interval","everyNDays":n}
  frequency_config  TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(frequency_config)),

  start_date        TEXT NOT NULL
                      CHECK (length(start_date) = 10
                         AND start_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
                         AND date(start_date) IS NOT NULL
                         -- date() alone is not a validity test: SQLite rolls
                         -- '2023-02-30' forward to March 2 instead of
                         -- returning NULL. Requiring the value to survive a
                         -- round trip is what actually rejects 30 February.
                         AND strftime('%Y-%m-%d', start_date) = start_date),
  end_date          TEXT,
  reminder_time     TEXT,

  is_active         INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  sort_order        INTEGER NOT NULL DEFAULT 0,

  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  archived_at       TEXT,

  CHECK (end_date IS NULL OR (
           length(end_date) = 10
       AND end_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
       AND date(end_date) IS NOT NULL
       AND strftime('%Y-%m-%d', end_date) = end_date
  )),
  -- The window must run forwards.
  CHECK (end_date IS NULL OR end_date >= start_date),

  -- 'HH:MM' wall-clock checks. GLOB pins the shape; the CAST bounds reject the
  -- hours 24-29 that a naive '[0-2][0-9]' pattern would let through.
  CHECK (reminder_time IS NULL OR (
           length(reminder_time) = 5
       AND substr(reminder_time, 3, 1) = ':'
       AND reminder_time GLOB '[0-9][0-9]:[0-9][0-9]'
       AND CAST(substr(reminder_time, 1, 2) AS INTEGER) <= 23
       AND CAST(substr(reminder_time, 4, 2) AS INTEGER) <= 59
  )),
  CHECK (target_time IS NULL OR (
           length(target_time) = 5
       AND substr(target_time, 3, 1) = ':'
       AND target_time GLOB '[0-9][0-9]:[0-9][0-9]'
       AND CAST(substr(target_time, 1, 2) AS INTEGER) <= 23
       AND CAST(substr(target_time, 4, 2) AS INTEGER) <= 59
  )),

  -- A measured goal needs a target; a checkbox or time goal must not carry one.
  CHECK ((goal_type IN ('numeric', 'duration', 'count')) = (target_value IS NOT NULL)),
  -- A time goal needs its deadline, and nothing else may have one.
  CHECK ((goal_type = 'time') = (target_time IS NOT NULL)),
  -- Archiving implies deactivation, so the two flags can never disagree.
  CHECK (archived_at IS NULL OR is_active = 0)
);

-- The dashboard's hot path is "my live goals", which is exactly this predicate.
CREATE INDEX goals_live_idx ON goals (sort_order, created_at) WHERE archived_at IS NULL;
CREATE INDEX goals_archived_idx ON goals (archived_at, sort_order);

CREATE TRIGGER goals_set_updated_at
AFTER UPDATE ON goals
BEGIN
  UPDATE goals SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
   WHERE id = new.id;
END;

-- Frequency type must agree with its config payload, so a mismatched pair can
-- never reach the scheduler. Direct translation of the PL/pgSQL trigger of the
-- same name.
--
-- SQLite takes a single event per trigger, so insert and update are two
-- triggers with an identical body. Keep them in step when editing: a check that
-- exists only on insert would let a PATCH smuggle in a bad payload.
CREATE TRIGGER goals_validate_frequency_insert
BEFORE INSERT ON goals
BEGIN
  SELECT RAISE(ABORT, 'frequency_config.kind must match frequency_type')
   WHERE json_extract(new.frequency_config, '$.kind') IS NOT new.frequency_type;

  SELECT RAISE(ABORT, 'selected_days requires a non-empty days array')
   WHERE new.frequency_type = 'selected_days'
     AND (json_type(new.frequency_config, '$.days') IS NOT 'array'
          OR json_array_length(new.frequency_config, '$.days') = 0);

  -- Every day must be an ISO weekday, 1 (Mon) through 7 (Sun).
  SELECT RAISE(ABORT, 'days must be ISO weekdays 1 through 7')
   WHERE new.frequency_type = 'selected_days'
     AND EXISTS (
       SELECT 1 FROM json_each(new.frequency_config, '$.days') AS d
        WHERE json_type(d.value) NOT IN ('integer', 'real')
           OR CAST(d.value AS INTEGER) NOT BETWEEN 1 AND 7
     );
END;

CREATE TRIGGER goals_validate_frequency_update
BEFORE UPDATE ON goals
BEGIN
  SELECT RAISE(ABORT, 'frequency_config.kind must match frequency_type')
   WHERE json_extract(new.frequency_config, '$.kind') IS NOT new.frequency_type;

  SELECT RAISE(ABORT, 'selected_days requires a non-empty days array')
   WHERE new.frequency_type = 'selected_days'
     AND (json_type(new.frequency_config, '$.days') IS NOT 'array'
          OR json_array_length(new.frequency_config, '$.days') = 0);

  SELECT RAISE(ABORT, 'days must be ISO weekdays 1 through 7')
   WHERE new.frequency_type = 'selected_days'
     AND EXISTS (
       SELECT 1 FROM json_each(new.frequency_config, '$.days') AS d
        WHERE json_type(d.value) NOT IN ('integer', 'real')
           OR CAST(d.value AS INTEGER) NOT BETWEEN 1 AND 7
     );
END;

-- ---------------------------------------------------------------------------
-- daily_goal_records — the historical record, independent of the definition.
-- ---------------------------------------------------------------------------
CREATE TABLE daily_goal_records (
  id            TEXT PRIMARY KEY,
  goal_id       TEXT NOT NULL REFERENCES goals (id) ON DELETE CASCADE,

  -- Civil date, 'YYYY-MM-DD', already resolved against the profile's timezone
  -- by the client. Deliberately not an instant: the day a record belongs to is
  -- a calendar concept, not a point in time.
  date          TEXT NOT NULL
                  CHECK (length(date) = 10
                     AND date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
                     AND date(date) IS NOT NULL
                     -- Rejects rolled-over dates such as '2023-02-30'; see the
                     -- note on goals.start_date.
                     AND strftime('%Y-%m-%d', date) = date),

  completed     INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
  actual_value  REAL CHECK (actual_value IS NULL OR actual_value >= 0),
  notes         TEXT CHECK (notes IS NULL OR length(notes) <= 280),

  -- UTC instant at which the goal was marked complete. Used to detect "late"
  -- on time-based goals. Maintained by the trigger below, never by the client.
  completed_at  TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),

  -- Design rule 2, enforced structurally rather than in application code.
  UNIQUE (goal_id, date)
);

-- The dashboard reads by date; history pages through the same column.
CREATE INDEX records_date_idx ON daily_goal_records (date, goal_id);
CREATE INDEX records_completed_idx ON daily_goal_records (completed) WHERE completed = 1;

CREATE TRIGGER daily_goal_records_set_updated_at
AFTER UPDATE ON daily_goal_records
BEGIN
  UPDATE daily_goal_records SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
   WHERE id = new.id;
END;

-- Design rule 3: for measured goals the database, not the client, decides
-- completion. This also keeps completed_at meaningful, since it can no longer
-- be set on a row that is not actually complete.
--
-- The two expressions are written out separately rather than reading the
-- corrected `completed` back, so the trigger does not depend on statement order
-- within its own body. Note that the goals CHECK constraint guarantees a
-- measured goal always has a non-null target_value, so it needs no NULL guard.
--
-- These are AFTER triggers performing a corrective UPDATE, because SQLite
-- cannot assign to `new.column` the way the PL/pgSQL original did. Recursive
-- triggers are off, so the inner UPDATE fires no further triggers and cannot
-- loop; the correction and the insert share one transaction, so no caller ever
-- observes the uncorrected intermediate state.
--
-- Split by event, because SQLite allows only one per trigger. A record updated
-- to a contradicting value must be corrected just as one created that way is.
CREATE TRIGGER daily_goal_records_sync_completion_insert
AFTER INSERT ON daily_goal_records
BEGIN
  -- Measured: completion is arithmetic, and the client's opinion is ignored.
  -- Everything else: the client decides, because a checkbox and a deadline have
  -- no target to compare against.
  UPDATE daily_goal_records
     SET completed = CASE
           WHEN (SELECT goal_type FROM goals WHERE id = new.goal_id)
                  IN ('numeric', 'duration', 'count')
           THEN CASE WHEN coalesce(new.actual_value, 0)
                          >= (SELECT target_value FROM goals WHERE id = new.goal_id)
                     THEN 1 ELSE 0 END
           ELSE new.completed
         END,
         completed_at = CASE
           WHEN (SELECT goal_type FROM goals WHERE id = new.goal_id)
                  NOT IN ('numeric', 'duration', 'count')
           THEN CASE WHEN new.completed = 1
                     THEN coalesce(new.completed_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
                     ELSE NULL END
           WHEN coalesce(new.actual_value, 0)
                  >= (SELECT target_value FROM goals WHERE id = new.goal_id)
           THEN coalesce(new.completed_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
           ELSE NULL
         END
   WHERE id = new.id;
END;

CREATE TRIGGER daily_goal_records_sync_completion_update
AFTER UPDATE ON daily_goal_records
BEGIN
  UPDATE daily_goal_records
     SET completed = CASE
           WHEN (SELECT goal_type FROM goals WHERE id = new.goal_id)
                  IN ('numeric', 'duration', 'count')
           THEN CASE WHEN coalesce(new.actual_value, 0)
                          >= (SELECT target_value FROM goals WHERE id = new.goal_id)
                     THEN 1 ELSE 0 END
           ELSE new.completed
         END,
         completed_at = CASE
           WHEN (SELECT goal_type FROM goals WHERE id = new.goal_id)
                  NOT IN ('numeric', 'duration', 'count')
           THEN CASE WHEN new.completed = 1
                     THEN coalesce(new.completed_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
                     ELSE NULL END
           WHEN coalesce(new.actual_value, 0)
                  >= (SELECT target_value FROM goals WHERE id = new.goal_id)
           THEN coalesce(new.completed_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
           ELSE NULL
         END
   WHERE id = new.id;
END;

-- ---------------------------------------------------------------------------
-- Seed data.
--
-- The built-in categories used to be inserted by a trigger on auth signup, once
-- per user. With a single user and no auth they are inserted here, once. The
-- ids are literals rather than generated so they are stable across rebuilds and
-- a data volume can be reattached without the ids moving under it.
-- ---------------------------------------------------------------------------
INSERT INTO profiles (id) VALUES (1);
INSERT INTO user_settings (id) VALUES (1);

INSERT INTO categories (id, slug, label, is_builtin, sort_order) VALUES
  ('builtin-fitness',    'fitness',     'Fitness',     1, 10),
  ('builtin-nutrition',  'nutrition',   'Nutrition',   1, 20),
  ('builtin-sleep',      'sleep',       'Sleep',       1, 30),
  ('builtin-mindfulness','mindfulness', 'Mindfulness', 1, 40),
  ('builtin-personal',   'personal',    'Personal',    1, 50),
  ('builtin-learning',   'learning',    'Learning',    1, 60),
  ('builtin-health',     'health',      'Health',      1, 70),
  ('builtin-other',      'other',       'Other',       1, 80);
