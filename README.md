# Arise

A personal health space — recurring health goals with per-day completion history.

Define a habit once, then mark it off each day it is scheduled. Arise keeps the
*definition* and the *completion* as separate concepts, so editing a goal's target
or schedule never rewrites what you actually recorded on past days.

---

## Stack

Vite · React 18 · React Router · TypeScript (strict) · Tailwind v4 · Framer Motion · Zod · Vitest · Supabase (PostgreSQL)

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in your Supabase keys
npm run dev
```

Without valid credentials the app shows a setup screen rather than a broken sign-in form.

### Environment

| Variable | Purpose |
| --- | --- |
| `VITE_SUPABASE_URL` | Your project URL |
| `VITE_SUPABASE_ANON_KEY` | The public anon key |
| `VITE_SUPABASE_DEBUG` | Optional; enables devtools output |

### Database

Run the migration against your project before using the app:

```bash
supabase db push
```

or apply `supabase/migrations/0001_initial_schema.sql` in the SQL editor. It creates the tables,
row-level security policies, provisioning trigger, completion-synchronisation trigger, frequency
CHECK constraints, indexes, and `updated_at` triggers.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Typecheck, then production build |
| `npm run preview` | Serve the built output |
| `npm run typecheck` | `tsc -b` |
| `npm run lint` | ESLint |
| `npm test` | Vitest, single run |
| `npm run test:watch` | Vitest, watch mode |

---

## Domain model

The distinction the whole codebase is built around:

- A **Goal** is a permanent definition. It is never "today's completion".
- A **DailyRecord** is the completion of one goal on one civil date.

`goals` and `daily_goal_records` are separate tables, with `(goal_id, date)` unique.

### Goal types

| Type | Completion | Fields |
| --- | --- | --- |
| `checkbox` | boolean | optional descriptive `targetValue` + `unit` |
| `numeric` | measured value | `targetValue`, `unit` |
| `duration` | minutes | `targetValue` (unit locked to `min`) |
| `count` | whole number | `targetValue` |
| `time` | boolean | `targetTime` (`HH:MM` deadline) |

A measured goal is complete when `actual >= target`; the number is the truth. For `checkbox` and
`time` goals, completion itself is the truth and the value exists only so progress maths has
something to divide.

### Frequencies

`daily` · `weekdays` · `weekends` · `selected_days` · `weekly` · `custom_interval`

`weekly` and `custom_interval` are anchored to the goal's own `startDate`.

Recurring goals are **never materialised into future rows**. The schedule is evaluated lazily from
the definition, and only real user actions create records. That is what keeps the database small
and what lets you change a schedule without a migration.

## Timezone handling

All date-shaped values in the app are **civil dates** (`YYYY-MM-DD` in the user's own timezone),
branded as `CivilDate`, not instants. Scheduling arithmetic runs on epoch-day integers, so it is
immune to DST and to the host machine's timezone.

Persisted timestamps remain UTC. Anything user-facing is projected through `Intl.DateTimeFormat`
into the profile's IANA zone. Two rules follow from this, and both are enforced by tests:

- "Today" comes from the **profile's** timezone, never the device's.
- A `time` goal's deadline is compared against the **local** wall clock. Comparing a UTC instant
  against a local `HH:MM` would mis-flag every goal for anyone not on UTC.

## Resolution pipeline

Every screen derives from one pure function, so the dashboard, history, and insights can never
disagree:

1. Take the live goals.
2. Keep those whose schedule covers the requested date (`isEligibleOn`).
3. Attach the completion record for that date.
4. Normalise into `ResolvedGoal` and summarise.

History uses `resolveHistoricalDay`, which additionally surfaces goals that have since been
paused or archived, and shows any goal with a record even if its schedule no longer covers the
date — records outlive the goal's active life.

### Streaks

A streak counts **scheduled** days, never calendar days. A goal that runs Monday, Wednesday and
Friday is not expected on a Tuesday, so a Tuesday gap neither extends nor breaks it. Today is
special: a day still in progress cannot break a live streak, which is what makes an evening
check-in feel right.

Days with nothing scheduled are excluded from every rate and streak. Counting a rest day as a
missed day is how habit trackers talk people out of using them.

## Optimistic completion

Turning an intent into a record is pure arithmetic, so it lives in `lib/goals/completion.ts`
rather than in a component or a hook:

1. `planRecord` computes the exact record an intent implies.
2. The UI applies it immediately via `materialiseRecord`.
3. The service persists it.
4. A failure rolls back to the snapshot the caller kept.

All four stages read the same function, so the optimistic state and the persisted row cannot drift.
Rules that must hold client-side (measured completion, the 4× overshoot ceiling, preserving the
original `completedAt` when a value climbs later) are mirrored by `BEFORE` triggers in the
migration. The client copy is a courtesy; the database copy is the guarantee.

## Validation

`lib/validation/goal.ts` is a discriminated union on `type`, not optional-everything, so
`targetValue` cannot be silently null for a numeric goal. The form holds strings, so the schema
coerces them and reports field-keyed messages — a blank target reads "Enter a target above zero",
not a type error. A `superRefine` catches the mistakes a form is actually prone to: a
`frequencyConfig` that contradicts the chosen `frequencyType`, and an end date before the start.

## Layout

```
src/
  components/        glass UI, goal editor, rows, navigation
  hooks/             useAuth, useDailyGoals, useCategories, useTheme, useToast
  lib/
    analytics/       streaks, aggregates, trends
    date/            civil dates, scheduling
    goals/           resolve, completion, display helpers
    supabase/        client, session, generated types
    validation/      goal form schema
  pages/             Dashboard, Goals, History, Insights, Settings, auth
  services/          goals, daily records, analytics, auth
  styles/            design tokens, Liquid Glass
  types/             domain model
supabase/migrations/ schema, RLS, triggers
tests/               unit tests for the pure domain layer
```

## Tests

```bash
npm test
```

178 tests cover the pure domain layer, which is where the correctness risk actually lives:

| File | Covers |
| --- | --- |
| `tests/civil.test.ts` | Date parsing, epoch-day arithmetic, DST immunity, timezone projection |
| `tests/schedule.test.ts` | Every frequency, lifecycle windows, deadlines, clock helpers |
| `tests/resolve.test.ts` | Single-goal and whole-day resolution, history, completion planning |
| `tests/analytics.test.ts` | Streaks, totals, category breakdown, trends, consistency |
| `tests/validation.test.ts` | Goal form schema and field error reporting |

The client is deliberately thin over these functions, so the suite does not need a browser or a
database. The parts it does not cover — Supabase queries, RLS enforcement, and the React
components — need a real project to verify; there is no mock data layer to hide behind.
