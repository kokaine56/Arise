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
| `APP_ACCESS_CODE` | (Required) 4-digit code to access the application |

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

## Deployment

Arise is a static single-page app, so the deployed artifact is just a file server. The image contains
no Node runtime and no application secrets.

### Runtime configuration

Vite inlines `import.meta.env` at **build** time, which normally means one image per environment.
Arise avoids that: `docker/entrypoint.sh` writes a small `/env.js` from real environment variables
at container start, and the app reads it at startup.

```
browser -> /env.js  ->  window.__ARISE_ENV__  ->  wins over import.meta.env
```

The practical consequence is that the same published image can be promoted from staging to
production, or repointed at a different Supabase project, by restarting the container with
different environment variables. No rebuild, no CI run.

`public/env.js` is a checked-in placeholder holding an empty object. It gives dev and any
non-container static host a defined "unconfigured" state, and it stops `/env.js` 404ing in dev.
The container overwrites it at boot.

`docker/entrypoint.sh` validates each value against a strict allowlist and refuses to start on an
unexpected one. This is deliberate: these values are written into a `<script>` served from the app's
own origin, so validating is safer than escaping — a bad value stops the container with a clear
message instead of shipping a broken bundle.

An empty value is allowed and renders the in-app setup screen, which is the right behaviour for a
fresh deploy rather than a crash loop.

### The image

| Stage | Base | Purpose |
| --- | --- | --- |
| `build` | `node:22-alpine` | `npm ci`, then `tsc -b && vite build` |
| `runtime` | `nginxinc/nginx-unprivileged:1.27-alpine` | Serves `dist` as a SPA on port 8080, non-root |

Notable details:

- `npm ci` in its own layer, so source edits do not re-resolve the dependency tree.
- Supabase values are passed as `ARG`, never `ENV`, keeping them out of `docker history`.
- `.dockerignore` excludes `.env*` and `*.key`, so a local secret file can never reach an image
  layer or the registry cache.
- `nginx -t` runs during the build, so a malformed config fails CI rather than production.
- `try_files $uri $uri/ /index.html` is what makes a hard refresh on `/goals` or `/settings` work.
- `/assets/*` is `immutable` (Vite hashes filenames); `index.html` is `no-cache`; `env.js` is
  `no-store`, because a cached `env.js` points a new container at the previous Supabase project.
- `/healthz` is a real request through the real config, used by the `HEALTHCHECK` and the deploy job.

### Local run

```bash
docker build -t arise:local .
docker run --rm -p 8080:8080 \
  -e VITE_SUPABASE_URL=https://yourref.supabase.co \
  -e VITE_SUPABASE_ANON_KEY=your-anon-key \
  arise:local
```

Or with compose, which is also the production path:

```bash
cp .env.example .env    # fill in the two Supabase values
docker compose up -d --build
```

### Auto-deploy

`.github/workflows/deploy.yml` runs on every push and pull request:

```
verify  ──  lint · typecheck · test · build
   │         (every push and PR)
   ▼
publish ──  push image to GHCR
   │         (main only, needs `packages: write`)
   ▼
deploy  ──  ssh to the host, pull and roll out
            (main only, needs the DEPLOY_* secrets)
```

A failing verify job stops the pipeline, so a broken build can never replace a working deployment.
The `concurrency` group serialises deploys so two pushes cannot interleave into a half-rolled-back
release. Publishing and deploying skip themselves when the required secrets are absent, so the
publish-only path works before you have a server.

**Repository secrets** (Settings → Secrets):

| Secret | Purpose |
| --- | --- |
| `DEPLOY_HOST` | Server hostname or IP |
| `DEPLOY_USER` | SSH user with docker access |
| `DEPLOY_KEY` | Private key, added to that user's `authorized_keys` |
| `DEPLOY_PATH` | Directory on the host holding `compose.yaml` and `.env` |

**Repository variable** (Settings → Secrets and variables → Actions → Variables):

| Variable | Purpose |
| --- | --- |
| `ARISE_HEALTH_URL` | Public URL; enables the post-deploy smoke test |

**First-time host setup** — one command, on the server:

```bash
mkdir -p /opt/arise && cd /opt/arise
# copy compose.yaml from the repo, then:
printf 'VITE_SUPABASE_URL=https://yourref.supabase.co\nVITE_SUPABASE_ANON_KEY=your-anon-key\n' > .env
chmod 600 .env
docker compose pull && docker compose up -d
```

`compose.yaml` binds to `127.0.0.1` deliberately. Put a TLS-terminating reverse proxy (Caddy,
nginx, a tunnel) in front of it rather than exposing a plain HTTP port.

The deploy job ends with a smoke test that checks both `/` and `/env.js` — a 200 on the HTML alone
would not catch a container serving stale runtime config.

### Rollback

Every image is tagged with its commit SHA as well as `latest`, and the deploy job prints the tags
it published. To roll back, set `ARISE_IMAGE` in the host's `.env` to the previous tag and restart:

```bash
docker compose up -d
```

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
| `tests/env.test.ts` | Runtime vs build-time configuration precedence |

The client is deliberately thin over these functions, so the suite does not need a browser or a
database. The parts it does not cover — Supabase queries, RLS enforcement, the React components, and
the container image itself — need a real project or a real Docker host to verify.
