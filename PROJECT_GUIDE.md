# GymVerse — Complete Project Guide

A full explanation of the GymVerse gym management system: what it does, how every part is
built, how the parts talk to each other, and how to run, test, operate and extend it.

**Who this is for:** a developer or student joining the project who needs to understand the
whole codebase, and anyone evaluating the database design.

**Contents**

1. [What GymVerse is](#1-what-gymverse-is)
2. [Architecture at a glance](#2-architecture-at-a-glance)
3. [Repository map](#3-repository-map)
4. [Running the project](#4-running-the-project)
5. [Roles and permissions](#5-roles-and-permissions)
6. [The database](#6-the-database)
7. [The backend API](#7-the-backend-api)
8. [API reference](#8-api-reference)
9. [Authentication and security](#9-authentication-and-security)
10. [Business rules and concurrency](#10-business-rules-and-concurrency)
11. [The AI assistant and chat history](#11-the-ai-assistant-and-chat-history)
12. [The frontend](#12-the-frontend)
13. [Testing and verification](#13-testing-and-verification)
14. [Configuration reference](#14-configuration-reference)
15. [Operations](#15-operations)
16. [Troubleshooting](#16-troubleshooting)
17. [Known limitations and future work](#17-known-limitations-and-future-work)
18. [Glossary](#18-glossary)

---

## 1. What GymVerse is

GymVerse manages the day-to-day running of a gym:

- **Members** — profiles, membership plans, subscriptions and payments.
- **Front desk** — check-in and check-out, collecting payments, assigning plans.
- **Trainers** — self-registration with admin approval, rosters of assigned members,
  workout plans, logged workout sessions.
- **Classes** — a class catalogue, a timetable of sessions, bookings with enforced capacity.
- **Management** — dashboards for each role, a revenue report, an audit trail.
- **AI assistant** — a chat widget that answers gym and fitness questions using the live
  plan catalogue, with optional saved chat history.

It is a three-tier web application built as a database course project, so the database
layer is deliberately rich: constraints, indexes, functions, triggers, views and versioned
migrations all live in SQL.

---

## 2. Architecture at a glance

```
 Browser (React SPA, port 5173 in development)
    │  HTTPS/JSON, Authorization: Bearer <JWT>
    ▼
 Express API (Node.js, port 5000)
    │  helmet → CORS → JSON parser → logging → rate limit
    │  route → requireAuth → requireRole → validators → controller
    │
    ├──► PostgreSQL (port 5432)  — all gym data, auth, audit (the source of truth)
    ├──► MongoDB Atlas (optional) — chat history only
    ├──► Google Gemini / Groq     — AI assistant replies
    └──► SMTP server (optional)   — password-reset and email-confirmation links
```

**Request lifecycle, end to end** (example: a receptionist assigns a plan):

1. The React page calls `createSubscription()` in `services/membershipService.js`.
2. `services/api.js` (an axios instance) attaches the JWT from `localStorage`.
3. Express routes `POST /api/subscriptions` through `requireAuth` (verifies the token and
   loads the account), `requireRole('admin', 'receptionist')`, then the validators.
4. `subscriptionController.createSubscription` runs inside `withTransaction`: it locks the
   member row, checks for an active subscription and the plan status, inserts the
   subscription and its first payment, and writes an audit entry, all in one transaction.
5. The JSON response returns to the page, which shows a success note.
6. Any thrown error reaches the central error handler, which maps it to an HTTP status.

**Key design decisions**

| Decision | Why |
|---|---|
| No ORM; parameterised SQL via `pg` | The course is about SQL; every query is visible and uses `$1` placeholders. |
| PostgreSQL is the only source of truth | Constraints and unique indexes are the real guarantees; API checks exist for clear error messages. |
| MongoDB only for chat history | Chat is optional, schemaless and high-volume; the app works fully without it. |
| JWT with server-side revocation | Stateless tokens, but `token_version` and `revoked_tokens` let sessions be ended. |
| Record-level authorisation in code | Route roles aren't enough: a member must only reach their own records, a trainer only their roster. |
| Versioned SQL migrations | A live database can be upgraded without wiping it. |

---

## 3. Repository map

```
gymverse/
├── PROJECT_GUIDE.md          This document
├── gymverse.sql              psql one-shot install script (\i every SQL file in order)
├── .env                      Shared DB settings (gitignored)
├── .gitignore
├── database/                 All SQL: schema, constraints, indexes, functions,
│                             triggers, views, seed data, sample queries, migrations
├── gymverse-backend/         Express REST API
│   ├── src/
│   │   ├── server.js         Process entry: env check, DB check, listen, jobs, shutdown
│   │   ├── app.js            Express app: middleware, routes, SPA serving, errors
│   │   ├── config/           database.js (pg pool), env.js (startup validation)
│   │   ├── routes/           One router per resource (URL → middleware → controller)
│   │   ├── controllers/      Request handlers and SQL
│   │   ├── middleware/       auth, role, validation, 404, error handler
│   │   ├── validators/       express-validator rule sets
│   │   ├── services/         aiService, chatHistoryService, emailService
│   │   ├── utils/            authorize, pagination, transaction, audit, tokens, …
│   │   ├── jobs/             maintenance.js (scheduled housekeeping)
│   │   └── db/               migrations.js (migration runner)
│   ├── tests/                Jest suites (database mocked)
│   ├── swagger.yaml          OpenAPI 3 description served at /api-docs
│   ├── migrate.js            Apply pending migrations / show status
│   ├── reset_db.js           Drop and rebuild the schema, then seed (dev only)
│   ├── run_seed.js           Re-run only the seed
│   ├── set_passwords.js      Reset development account passwords
│   ├── backup_db.js          pg_dump backup with rotation
│   ├── verify_stack.js       Full-stack smoke test on a throwaway database
│   ├── verify_mongo.js       Check chat history in Atlas with mongosh
│   ├── README.md, CHAT_HISTORY.md, .env.example
│   └── backups/, .mail-outbox/   Generated at runtime (gitignored)
└── gymverse-frontend/        React single-page app
    ├── index.html, vite.config.js, postcss.config.js, .oxlintrc.json
    ├── .env.example          VITE_API_URL
    └── src/
        ├── main.jsx          Mounts <App/> in StrictMode
        ├── App.jsx           Routes, lazy loading, providers
        ├── index.css         Tailwind 4 theme tokens and glass styles
        ├── context/          AuthContext (session state)
        ├── routes/           ProtectedRoute, RoleRoute
        ├── layouts/          DashboardLayout (sidebar + header)
        ├── pages/            One folder per feature area
        ├── components/       ChatWidget, ConversationPicker, forms/, ui/
        ├── services/         api.js (axios) + one module per resource
        └── utils/            dates.js, passwordPolicy.js
```

A stray `~/` folder at the repository root (gitignored) holds a local Postgres data
directory created by a mis-expanded path. It is not part of the project.

---

## 4. Running the project

### Prerequisites

- **Node.js** 20+ (developed on Node 24).
- **PostgreSQL** 14+ (developed on PostgreSQL 18 on Windows).
- Optional: a **MongoDB Atlas** cluster (chat history), a **Gemini** or **Groq** API key
  (AI assistant), an **SMTP** server (emails).

### 1. Configure

```bash
cd gymverse-backend
cp .env.example .env        # then edit: DB_*, JWT_SECRET, AI keys, MONGODB_URI
cd ../gymverse-frontend
cp .env.example .env.development   # VITE_API_URL=http://localhost:5000/api
```

`JWT_SECRET` is required. Generate one with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### 2. Create the database

| Situation | Command | Effect |
|---|---|---|
| New, empty database | `node reset_db.js --confirm gymverse` | Drops the schema, applies every migration, loads seed data. You must retype the database name. Refuses in production. |
| Existing database | `npm run migrate` | Applies only pending migrations. Safe on live data. |
| Check state | `npm run migrate:status` | Lists each migration as baseline / applied / pending. |
| Using psql directly | `psql -d gymverse -f gymverse.sql` | Runs every SQL file in order, then the sample queries. |

### 3. Install and start

```bash
cd gymverse-backend  && npm install && npm run dev     # API on :5000
cd gymverse-frontend && npm install && npm run dev     # SPA on :5173
```

Open http://localhost:5173.

### Seeded accounts

Every seeded account uses the password **`Password@123`**.

| Email | Role |
|---|---|
| `admin@gymverse.com` | admin |
| `rec@gymverse.com` | receptionist |
| `arjun@gv.com`, `meera@gv.com`, … (10 trainers) | trainer |
| 50 member accounts (see `database/07_seed.sql`) | member |

Change them before exposing the database: `node set_passwords.js "a-new-password"`.

### Single-process production mode

Build the frontend (`npm run build`), then start the backend with
`NODE_ENV=production` and `SERVE_FRONTEND_DIST=../gymverse-frontend/dist`. The API then
serves the SPA from the same origin: `/api/*` is the API, and every other path returns
`index.html` so client-side routes work. Assets under `assets/` are cached for a year;
`index.html` is always revalidated.

### Windows notes

- The `postgresql-x64-18` Windows service needs an Administrator PowerShell to start
  (`Start-Service postgresql-x64-18`).
- On a machine low on memory, Postgres can crash with *"could not reattach to shared memory,
  error code 1455"*. Close other applications before starting it.

---

## 5. Roles and permissions

There are four roles, stored in the `roles` table and carried in the JWT.

| Capability | Admin | Receptionist | Trainer | Member |
|---|:-:|:-:|:-:|:-:|
| Dashboard | revenue view | front-desk view | roster view | progress view |
| Members: list / create | ✔ | ✔ | roster only / ✘ | ✘ |
| Member profile: view | ✔ | ✔ | own roster (no personal file) | self |
| Member profile: edit | ✔ | ✔ | ✘ | self (not status) |
| Delete member | ✔ | ✘ | ✘ | ✘ |
| Trainers: list / view | ✔ | ✔ | ✔ | ✔ (no phone/email) |
| Create / delete trainer | ✔ | ✘ | ✘ | ✘ |
| Edit trainer | ✔ | ✘ | self (not status) | ✘ |
| Approve / reject trainer signups | ✔ | ✘ | ✘ | ✘ |
| Trainer rosters (assign / end) | ✔ | ✔ | view own | view own |
| Membership plans: browse | ✔ (incl. retired) | ✔ (incl. retired) | ✔ | ✔ |
| Membership plans: create / edit | ✔ | ✘ | ✘ | ✘ |
| Subscriptions: create / list all | ✔ | ✔ | ✘ | ✘ |
| Payments: list / record / change status | ✔ | ✔ | ✘ | ✘ |
| Own payments and subscriptions | — | — | ✘ (never a client's billing) | ✔ |
| Attendance: check in/out, full log | ✔ | ✔ | ✘ | ✘ |
| Attendance history of a member | ✔ | ✔ | own roster | self |
| Exercises: create / edit | ✔ | ✘ | ✔ | ✘ |
| Delete exercise | ✔ | ✘ | ✘ | ✘ |
| Workout plans: create | ✔ (names a trainer) | ✘ | ✔ (as self) | ✘ |
| Delete workout plan | ✔ | ✘ | own plans | ✘ |
| Assign workout to member | ✔ (names a trainer) | ✘ | own roster | ✘ |
| Update assignment progress | ✔ | ✔ | assignments they created | own |
| Log workout session | ✔ | ✔ | own roster | self |
| Classes & schedules: manage | ✔ | ✘ | ✘ | ✘ |
| Enrol in a class | ✔ (names member) | ✔ (names member) | own roster | self |
| Revenue report | ✔ | ✘ | ✘ | ✘ |
| Members report | ✔ | ✔ | ✘ | ✘ |
| Run maintenance now | ✔ | ✘ | ✘ | ✘ |
| AI assistant, account settings | ✔ | ✔ | ✔ | ✔ |

Enforcement happens in three layers:

1. **Route level** — `requireRole(...)` rejects the wrong role with 403.
2. **Record level** — helpers in `utils/authorize.js` check ownership:
   - `assertMemberDataAccess`: staff see all; a member sees only themselves; a trainer only
     members with an active `trainer_assignments` row.
   - `assertFinancialAccess`: staff and the member themselves only — trainers never.
3. **UI level** — `RoleRoute` hides whole route groups; pages hide buttons. This is for
   convenience only; the API enforces everything independently.

---

## 6. The database

### 6.1 Files and what they contain

| File | Purpose |
|---|---|
| `01_schema.sql` | All base tables (26). |
| `02_constraints.sql` | Cross-column CHECKs and the booking unique constraint. |
| `03_indexes.sql` | Original indexes. |
| `04_functions.sql` | Utility functions (BMI, active subscription, current trainer, …). |
| `05_triggers.sql` | `updated_at` maintenance, class capacity check, attendance check, audit logging with credential redaction. |
| `06_views.sql` | Reporting views. |
| `07_seed.sql` | Development data. Not a migration. |
| `08_queries.sql` | 20 sample reporting queries and 2 transaction demos. Not a migration. |
| `09`–`17` | Migrations added over time (see 6.8). |

### 6.2 Tables

**Identity and access**

| Table | Holds | Notes |
|---|---|---|
| `roles` | admin, trainer, member, receptionist | `role_name` unique |
| `users` | Login accounts | Unique `username` and `email`; bcrypt `password_hash`; `role_id`; optional link to `member_id` or `trainer_id`; `status` (active, pending, suspended, rejected); `token_version`; `email_verified_at`; `last_login` |
| `auth_tokens` | One-time password-reset and email-verification tokens | Stores only a SHA-256 `token_hash`; `purpose`, `expires_at`, `used_at` |
| `revoked_tokens` | Signed-out session ids (JWT `jti`) | Kept until the token would have expired |
| `audit_logs` | Who changed what | `user_id`, `action`, `table_name`, `record_id`, `old_data`/`new_data` JSONB |

**People**

| Table | Holds | Notes |
|---|---|---|
| `members` | Gym members | Unique `member_code`, `phone`, `email`; gender CHECK; `status` (active, inactive, suspended, expired); emergency contacts |
| `trainers` | Coaching staff | Unique `trainer_code`, `phone`, `email`; specialization, qualification, experience, shift, bio; `status` (active, inactive) |
| `trainer_assignments` | Which trainer coaches which member | `start_date`/`end_date`; `status` (active, completed, cancelled); one active row per pair |

**Memberships and money**

| Table | Holds | Notes |
|---|---|---|
| `membership_plans` | Plan catalogue | Unique `plan_name`; `duration_months` > 0; `price` ≥ 0; access level; PT sessions; class access; diet consultation; `status` |
| `subscriptions` | A member on a plan | Start/end dates (end ≥ start); `subscription_status` (pending, active, expired, cancelled, suspended); at most one active per member |
| `payments` | Money received | `amount` > 0; method (cash, card, upi, bank_transfer); status (pending, completed, failed, refunded, partially_refunded); unique transaction reference and receipt number |

**Attendance, training and classes**

| Table | Holds | Notes |
|---|---|---|
| `attendance` | Check-ins | Date, check-in and check-out time (out ≥ in); method (manual, qr, biometric, app); at most one open check-in per member per day |
| `exercises` | Exercise library | Unique name; muscle groups; equipment; difficulty |
| `workout_plans` | Training programmes | Owning `trainer_id` (required); goal, difficulty, `duration_weeks` |
| `workout_plan_exercises` | Exercises inside a plan | Day, order, sets, reps, duration, rest (all positive) |
| `member_workouts` | A plan assigned to a member | Assigning trainer; dates; `status` (assigned, in_progress, completed, cancelled); `completion_percentage` 0–100 |
| `workout_sessions` | Logged workouts | Duration > 0, calories, completed flag |
| `fitness_classes` | Class catalogue | Name, difficulty, duration, status |
| `class_schedules` | A dated session of a class | Trainer, date, start/end (end > start), `capacity` (required, > 0), room, status (scheduled, completed, cancelled) |
| `class_bookings` | A member booked on a session | `booking_status` (booked, cancelled, waitlisted); attendance status; unique (schedule, member) |

**Coursework tables (in the schema and seed data, not used by the API or UI)**

`progress_records` (with a generated `bmi` column), `fitness_goals`, `diet_plans`,
`diet_meals`, `equipment`, `maintenance_records`, `feedback`, `notifications`,
`system_settings`. They are used by the views and sample queries.

**Bookkeeping**

`schema_migrations` — created by the migration runner; one row per applied file with its
checksum.

### 6.3 Relationships

```
roles 1─* users *─0..1 members           members 1─* subscriptions *─1 membership_plans
              └─0..1 trainers             subscriptions 1─* payments *─1 members

members *─* trainers   via trainer_assignments

members 1─* attendance
workout_plans *─1 trainers ; workout_plans 1─* workout_plan_exercises *─1 exercises
members 1─* member_workouts *─1 workout_plans ; member_workouts *─0..1 trainers
members 1─* workout_sessions *─0..1 workout_plans
fitness_classes 1─* class_schedules *─1 trainers ; class_schedules 1─* class_bookings *─1 members
users 1─* auth_tokens ; users 1─* revoked_tokens ; users 1─* audit_logs
```

Deleting a member cascades to their subscriptions, payments, attendance, bookings and
workout records. Deleting a trainer who still has assignments or schedules is blocked
(`ON DELETE RESTRICT`), which the API reports as 409.

### 6.4 Constraints that carry business rules

| Rule | Where |
|---|---|
| One active subscription per member | `uniq_active_subscription_per_member` (partial unique index, migration 10) |
| One open check-in per member per day | `uniq_open_attendance_per_day` (partial unique index, 10) |
| One active assignment per member/trainer pair | `uniq_active_trainer_assignment` (12) |
| A member books a session once | `unique_class_booking` (02) |
| Dates in order | `chk_assignment_dates`, `chk_sub_dates`, `chk_check_out`, `chk_class_time`, `chk_member_workout_dates` |
| Capacity must be set | `class_schedules.capacity NOT NULL` (11) |
| Workout plans have an owner | `workout_plans.trainer_id NOT NULL` (11) |
| Account status values | `chk_users_status` (09) |

### 6.5 Indexes (current state after migration 16)

- **Uniqueness** — every UNIQUE column above has its own index.
- **Member history, newest first** — `(member_id, created_at DESC)` on payments and
  subscriptions; `(member_id, assigned_date DESC)` on member_workouts;
  `(member_id, attendance_date)` on attendance; `(member_id, session_date DESC)` on
  workout_sessions.
- **Staff list pages** — `created_at DESC` on members, payments, subscriptions;
  `(attendance_date DESC, check_in_time DESC)` on attendance.
- **Timetable** — `(class_date, start_time)` and `(trainer_id, class_date)` on
  class_schedules; `schedule_id` and `member_id` on class_bookings.
- **Roster lookups** — partial `(trainer_id, member_id) WHERE status = 'active'` on
  trainer_assignments.
- **Search** — trigram GIN indexes (`pg_trgm`) on member name, email and phone, and on
  trainer name and email. They serve `ILIKE '%term%'`.
- **Other** — `users.status`, `auth_tokens (user_id, purpose)`, `revoked_tokens.expires_at`,
  `payments.payment_status`, `payments.payment_date`, `subscriptions.end_date`,
  `workout_plans.trainer_id`.

### 6.6 Functions

| Function | Returns | Used by |
|---|---|---|
| `calculate_bmi(weight, height)` | BMI | Coursework |
| `get_active_subscription(member)` | subscription id | Coursework |
| `get_current_trainer(member)` | trainer id | Coursework |
| `get_available_class_slots(schedule)` | free seats | Coursework |
| `get_member_attendance_summary(member)` | visits, last visit | Coursework |
| `get_member_progress_summary(member)` | latest weight, BMI | Coursework |
| `get_member_payment_summary(member)` | total paid, refunded | Coursework |
| `get_equipment_maintenance_status(equipment)` | status | Coursework |
| `expire_subscriptions()` | rows changed | Maintenance job |
| `close_stale_attendance()` | rows changed | Maintenance job |
| `purge_expired_auth_tokens()` | rows deleted | Maintenance job |
| `redact_sensitive(jsonb)` | row without `password_hash`/`reset_token` | Audit trigger |
| `set_updated_at()`, `check_class_booking_capacity()`, `check_attendance_state()`, `log_audit_event()` | trigger functions | Triggers |

### 6.7 Triggers and views

**Triggers**

- `trg_*_updated` — sets `updated_at` on every UPDATE for 17 tables.
- `trg_check_booking_capacity` — refuses a booking that would exceed capacity (a NULL
  capacity counts as zero, meaning closed rather than unlimited).
- `trg_check_attendance` — refuses a check-out without a check-in.
- `trg_audit_users`, `trg_audit_members` — write every INSERT, UPDATE and DELETE to
  `audit_logs`, with credentials removed, filed under the row's own id. An update that only
  touches `last_login`/`updated_at` (every sign-in) is skipped.

**Views**

`active_member_overview`, `member_subscription_summary`, `monthly_revenue` (used by the
admin revenue chart), `attendance_summary`, `trainer_member_summary`, `upcoming_classes`,
`class_capacity_summary`, `member_progress_summary`, `equipment_maintenance_summary`,
`expiring_memberships` (next 14 days), `unread_notifications`, `feedback_summary`.

### 6.8 Migrations

**The runner** (`gymverse-backend/src/db/migrations.js`, run by `npm run migrate`):

- Every numbered `.sql` file in `database/` is a migration, except `07_seed.sql` and
  `08_queries.sql`. Files are applied in numeric order.
- Each file runs in its own transaction and is recorded in `schema_migrations` with a
  SHA-256 checksum (line endings normalised).
- A Postgres advisory lock stops two deploys migrating at once.
- **Baseline:** the first time the runner meets an existing database, it records
  01–06 and 09–11 as already applied without running them.
- If an applied file is edited afterwards, the runner warns. **Never edit an applied
  migration; add a new file.**

**History**

| File | What it did |
|---|---|
| 09_add_user_status | Replaced `users.is_active` with `status` (active, pending, suspended, rejected). |
| 10_integrity | One active subscription and one open check-in per member; list and search indexes. |
| 11_hardening | Required capacity and plan owner; date and percentage checks; ownership indexes. |
| 12_trainer_assignments | Cancelled duplicate active pairs; one active row per pair. |
| 13_account_security | `token_version`, `email_verified_at`, `auth_tokens`. |
| 14_maintenance_jobs | `expire_subscriptions`, `close_stale_attendance`, `purge_expired_auth_tokens`. |
| 15_revoked_tokens | Per-session sign-out table; purge extended to it. |
| 16_performance | Created indexes that 11 silently skipped (name clash), dropped duplicate and unusable ones, added trigram search indexes, fixed the audit trigger's record id and skipped sign-in noise. |
| 17_audit_redaction | Defined `redact_sensitive()` for databases built before it existed, and scrubbed password hashes from old audit rows. |

**Lesson from 16/17:** a baseline database can lack things that were added to early files
after it was built. Migration 16 called `redact_sensitive()`, which such databases never
received, and member creation failed until migration 17 added it. New migrations should
define (with `CREATE OR REPLACE`) any function they depend on.

### 6.9 Seed data (`07_seed.sql`)

| Table | Rows | Table | Rows |
|---|---|---|---|
| roles | 4 | workout_plan_exercises | 100 |
| trainers | 10 | member_workouts | 100 |
| members | 50 | workout_sessions | 100 |
| users | 62 | fitness_classes | 10 |
| trainer_assignments | 60 | class_schedules | 50 |
| membership_plans | 5 | class_bookings | 200 |
| subscriptions | 75 | progress_records | 100 |
| payments | 100 | fitness_goals | 50 |
| attendance | 300 | diet_plans / diet_meals | 30 / 100 |
| exercises | 30 | equipment / maintenance_records | 30 / 50 |
| workout_plans | 15 | feedback / notifications / system_settings | 50 / 100 / 4 |

`seed()` in the runner refuses to run with `NODE_ENV=production` and marks seeded accounts
as email-verified.

### 6.10 Sample queries (`08_queries.sql`)

Twenty reporting queries: active members, current memberships, member–trainer pairs,
expiring memberships, payment history, monthly revenue, attendance history, the ten most
active members, workout plans and their exercises, upcoming classes, free seats, bookings,
progress, goals, diet plans, equipment needing repair, maintenance cost by year, feedback
and unread notifications. Two transaction demos follow: a membership purchase (subscription,
payment and notification in one transaction) and a class booking whose capacity trigger
rolls back an overbooking.

---

## 7. The backend API

### 7.1 Stack

Express 5, `pg`, `express-validator`, `jsonwebtoken`, `bcryptjs`, `helmet`, `cors`,
`express-rate-limit`, `morgan`, `swagger-ui-express` + `yamljs`, `nodemailer`,
`@google/generative-ai`, `groq-sdk`, `mongodb`, `node-cache`. Tests use Jest, Supertest and
`mongodb-memory-server`.

### 7.2 Startup (`src/server.js`)

1. Loads `gymverse-backend/.env` by absolute path, so the working directory doesn't matter.
2. Runs `validateEnv()` (`config/env.js`): prints warnings, and **exits** on errors. In
   production it refuses a missing `JWT_SECRET`, a short secret, a missing or `*`
   `CORS_ORIGIN`, a default database password, or `REQUIRE_EMAIL_VERIFICATION` without SMTP.
3. Starts connecting to MongoDB in the background (never blocks startup).
4. Runs `SELECT 1` against Postgres; exits if the database is unreachable.
5. Listens on `PORT` (default 5000) and starts the maintenance job.
6. On SIGINT or SIGTERM: stops the job, closes the server, the pg pool and MongoDB, and
   force-exits after 10 seconds.

### 7.3 The Express app (`src/app.js`), in order

1. Swagger UI at `/api-docs` (outside production, or with `ENABLE_API_DOCS=true`).
2. `trust proxy` only when `TRUST_PROXY=true`.
3. `x-powered-by` disabled; `helmet()` security headers.
4. CORS allowlist from `CORS_ORIGIN` (default `http://localhost:5173`), credentials on.
5. JSON and form bodies limited to 1 MB; `morgan` request logging.
6. Global rate limit: 500 requests per 15 minutes on `/api`.
7. `GET /api/health` — 200 with `database: connected`, or 503 without leaking driver details.
8. The 18 resource routers.
9. Optional SPA serving (`SERVE_FRONTEND_DIST`).
10. 404 handler, then the central error handler.

### 7.4 Configuration modules

- **`config/database.js`** — a `pg` Pool (max `DB_POOL_MAX`, default 10; 30 s idle timeout;
  5 s connect timeout). Postgres `DATE` values are returned as `'YYYY-MM-DD'` strings, not
  JS Dates, so dates never shift across timezones. An idle-client error is logged, not fatal.
- **`config/env.js`** — the startup checks described above.

### 7.5 Middleware

| File | Behaviour |
|---|---|
| `authMiddleware.js` | `requireAuth`: reads `Authorization: Bearer`, verifies the JWT, loads the account in one query (role, links, `token_version`, verification, and whether the `jti` is revoked). 401 if missing, expired, invalid, inactive, revoked, or `tv` ≠ `token_version`. Sets `req.user` and `req.auth = { jti, exp }`. `optionalAuth`: the same, but anonymous on failure (used by public catalogue routes). |
| `roleMiddleware.js` | `requireRole(...roles)` → 403 when `req.user.role` isn't listed. |
| `validationMiddleware.js` | Collects express-validator results into a **422** with `message` and a per-field `errors` array. |
| `notFoundMiddleware.js` | Passes a 404 `AppError` for unknown routes. |
| `errorMiddleware.js` | Central handler. Uses `err.statusCode` when set; maps Postgres errors (23505 → 409, 23503 → 409, 23502 → 400, 23514 → 400, 22P02 → 400, 22003 → 400) to generic messages; otherwise 500. In production a 500 says only "Internal Server Error"; stack traces are included only when `NODE_ENV=development`. |

### 7.6 Utilities (`src/utils`)

| File | Provides |
|---|---|
| `AppError.js` | `AppError(message, status)` plus `badRequest`, `forbidden`, `notFoundError`, `conflict`. Any layer can throw these. |
| `authorize.js` | `isStaff`, `parseId` (strict positive integer), `trainerOwnsMember`, `assertMemberDataAccess`, `assertFinancialAccess`. |
| `pagination.js` | `getPagination` (safe `page`/`limit`), `buildMeta`, and `paginate(req, { select, from, orderBy, params })`, which runs the page query and its `COUNT(*)` in parallel over the same FROM/WHERE. |
| `transaction.js` | `withTransaction(work)`: one pooled connection, BEGIN, COMMIT or ROLLBACK on any throw, always released. |
| `updateBuilder.js` | `buildUpdate` (PATCH from a column whitelist) and `buildReplace` (PUT that requires core fields, so a partial PUT can't null out data). |
| `audit.js` | `writeAudit(client, {...})` — application-level audit entries written inside the same transaction as the change. |
| `authTokens.js` | `issueToken` (random 32 bytes, stores SHA-256, retires older tokens of the same purpose), `consumeToken` (atomic single-use), `hashToken`. TTL: reset 30 min, verification 24 h. |
| `jwt.js` | `generateToken(userId, role, tokenVersion)` with a random `jti`; `verifyToken`. |
| `password.js` | bcrypt hash (cost 10) and compare. |

### 7.7 Validators (`src/validators`)

- **`commonValidators.js`** — `idParam` (positive integer), `paginationQuery` (page ≥ 1,
  limit 1–1000, search ≤ 100 chars).
- **`authValidators.js`** — registration (username 3–100 of letters, digits, `._-`; name
  2–100; phone 7–20 digits and `+ - ( )`; email ≤ 100 normalised; password 8–128 with a letter
  and a number; role member or trainer), login, change password, email-only, token, logout.
- **`resourceValidators.js`** — rules for every resource. They mirror the schema CHECKs, so
  bad input gets a 422 with a clear message instead of a constraint error. Optional numbers
  treat `0` as a value, so a zero is validated rather than skipped.

### 7.8 Controllers

| Controller | Responsibilities |
|---|---|
| `authController` | Register, login, me, logout (one session or everywhere), change password, forgot/reset password, verify email, resend verification. |
| `memberController` | List (trainers see only their roster, with a coaching projection), detail (projection per role), create, PUT/PATCH (one shared handler), delete. |
| `trainerController` | List and detail (contact details hidden from members), create, PUT/PATCH (self or admin; only admin changes status), delete. |
| `membershipController` | Plan catalogue (active only for the public), CRUD; delete refused while subscriptions reference a plan. |
| `subscriptionController` | Create subscription + first payment + audit in one transaction; list; by id; by member (with plan name). |
| `paymentController` | List, by id, by member, create (checks the subscription belongs to the member), status change (row-locked, audited). |
| `attendanceController` | Check-in (active members only, one open per day), check-out, full log, member history. |
| `exerciseController` | Search, CRUD; delete refused while used in a plan. |
| `workoutPlanController` | List, detail with exercises, create (plan and all exercises in one transaction and one insert), delete (trainer: own plans only). |
| `memberWorkoutController` | Assign a plan, list a member's assignments, update progress (role-scoped). |
| `workoutSessionController` | Log a session, list a member's sessions. |
| `classController` | Catalogue (admin sees retired classes), CRUD. |
| `scheduleController` | Timetable (hides cancelled sessions except for admins who ask), create with trainer double-booking check, update/cancel (releases bookings, audited), enrol (locked capacity check), member enrolments. |
| `trainerAssignmentController` | Role-scoped roster list, create (active trainer only), end/cancel/reactivate (audited). |
| `dashboardController` | Overview (one query of sub-counts), trainer dashboard, member dashboard (parallel queries), revenue chart (from the `monthly_revenue` view). |
| `reportController` | Revenue report (completed payments), members report (with active plan). |
| `adminController` | Pending trainer signups; approve/reject (one shared handler: row lock, status, trainer status, audit); run maintenance now. |
| `chatController` | Chat request, status, conversation list, conversation read (see §11). |

### 7.9 Services and jobs

- **`services/emailService.js`** — Sends mail over SMTP when `SMTP_HOST` is set. Without it,
  outside production, each email is written to `gymverse-backend/.mail-outbox/` (links are
  credentials, so they aren't printed to the console). It never throws for delivery
  problems, so auth flows answer the same way either way.
- **`services/aiService.js`** and **`services/chatHistoryService.js`** — §11.
- **`jobs/maintenance.js`** — Runs at startup, then every `MAINTENANCE_INTERVAL_MINUTES`
  (default 60), under an advisory lock so only one instance works at a time: expires
  lapsed subscriptions, closes yesterday's open check-ins at 23:59:59, and purges expired
  tokens. Disable with `MAINTENANCE_ENABLED=false`; trigger manually with
  `POST /api/admin/maintenance/run`.

### 7.10 Scripts

| Command | Purpose |
|---|---|
| `npm run dev` / `npm start` | Start with nodemon / plain node. |
| `npm test` | Jest suite (no database needed). |
| `npm run migrate` / `migrate:status` | Apply pending migrations / list their state. |
| `npm run seed` (`node run_seed.js`) | Re-run the seed on an existing schema. |
| `npm run backup` (`node backup_db.js`) | `pg_dump --format=custom` into `backups/`, keeping the newest 14. |
| `npm run verify:stack` (`node verify_stack.js`) | Build a throwaway database from every migration, seed it, boot the API, call every read route plus regression checks, then drop it. |
| `node reset_db.js --confirm <db>` | Drop and rebuild everything (dev only). |
| `node set_passwords.js [password] [emails…]` | Reset account passwords (defaults to the seeded staff and one trainer). |
| `node verify_mongo.js` | Use mongosh to report chat collections, indexes and saved count. |

---

## 8. API reference

All paths start with `/api`. Unless noted, routes need a valid token. **Roles** show the
route-level check; record-level rules from §5 also apply. Paginated lists accept
`?page=&limit=` and return `{ data, meta: { page, limit, total, totalPages } }`.

### Auth — `/api/auth`

| Method | Path | Access | Notes |
|---|---|---|---|
| POST | `/register` | Public | Member (active immediately) or trainer (pending approval). Rate limited. |
| POST | `/login` | Public | Returns the account and a JWT. Rate limited. |
| POST | `/logout` | Signed in | `{ everywhere: true }` ends every session. |
| GET | `/me` | Signed in | Current account. |
| POST | `/change-password` | Signed in | Returns a fresh token; other sessions end. |
| POST | `/forgot-password` | Public | Always the same reply. |
| POST | `/reset-password` | Public | `{ token, password }`; ends every session. |
| POST | `/verify-email` | Public | `{ token }`. |
| POST | `/resend-verification` | Public | Always the same reply. |

### People

| Method | Path | Roles |
|---|---|---|
| GET | `/members` (`?search=`) | admin, receptionist, trainer |
| POST | `/members` | admin, receptionist |
| GET / PUT / PATCH | `/members/:id` | any (record rules) |
| DELETE | `/members/:id` | admin |
| GET | `/trainers` (`?search=&specialization=`) | any |
| POST | `/trainers` | admin |
| GET / PUT / PATCH | `/trainers/:id` | any (record rules) |
| DELETE | `/trainers/:id` | admin |
| GET | `/trainer-assignments` (`?status=active\|completed\|cancelled\|all&trainer_id&member_id`) | any (scoped per role) |
| POST | `/trainer-assignments` | admin, receptionist |
| PATCH | `/trainer-assignments/:id` | admin, receptionist |

### Memberships and money

| Method | Path | Roles |
|---|---|---|
| GET | `/membership-plans`, `/membership-plans/:id` | Public (staff see retired plans) |
| POST / PUT / PATCH / DELETE | `/membership-plans[/:id]` | admin |
| GET / POST | `/subscriptions` | admin, receptionist |
| GET | `/subscriptions/:id`, `/subscriptions/member/:id` | any (financial rules) |
| GET / POST | `/payments` | admin, receptionist |
| GET | `/payments/:id`, `/payments/member/:id` | any (financial rules) |
| PATCH | `/payments/:id` | admin, receptionist |

### Attendance

| Method | Path | Roles |
|---|---|---|
| GET | `/attendance` | admin, receptionist |
| POST | `/attendance/check-in` | admin, receptionist |
| PATCH | `/attendance/check-out` | admin, receptionist |
| GET | `/attendance/member/:id` | any (record rules) |

### Training

| Method | Path | Roles |
|---|---|---|
| GET | `/exercises` (`?search=&muscle_group=`), `/exercises/:id` | any |
| POST, PUT | `/exercises[/:id]` | admin, trainer |
| DELETE | `/exercises/:id` | admin |
| GET | `/workout-plans`, `/workout-plans/:id` | any |
| POST | `/workout-plans` | admin, trainer |
| DELETE | `/workout-plans/:id` | admin, trainer (own) |
| POST | `/member-workouts` | admin, trainer |
| GET | `/member-workouts/member/:id` | any (record rules) |
| PATCH | `/member-workouts/:id` | any (record rules) |
| POST | `/workout-sessions` | any (record rules) |
| GET | `/workout-sessions/member/:id` | any (record rules) |

### Classes

| Method | Path | Roles |
|---|---|---|
| GET | `/classes`, `/classes/:id` | Public (admin sees retired classes) |
| POST / PUT / DELETE | `/classes[/:id]` | admin |
| GET | `/schedules` (`?include=cancelled` for admins) | Public |
| POST | `/schedules` | admin |
| PATCH | `/schedules/:id` | admin |
| POST | `/schedules/:id/enroll` | any (record rules) |
| GET | `/schedules/member/:id` | any (record rules) |

### Dashboards, reports, admin, chat, health

| Method | Path | Roles |
|---|---|---|
| GET | `/dashboard/overview` | admin, receptionist |
| GET | `/dashboard/revenue` | admin |
| GET | `/dashboard/trainer` | trainer |
| GET | `/dashboard/member` | member |
| GET | `/reports/revenue` | admin |
| GET | `/reports/members` | admin, receptionist |
| GET | `/admin/users/pending-trainers` | admin |
| PATCH | `/admin/users/:id/approve`, `/admin/users/:id/reject` | admin |
| POST | `/admin/maintenance/run` | admin |
| POST | `/chat` | any (15 per 15 min per account) |
| GET | `/chat/status`, `/chat/conversations`, `/chat/conversations/:id` | any |
| GET | `/health` | Public |

**Status codes you will see:** 200/201 success · 400 bad request · 401 not signed in or
session ended · 403 wrong role or not your record · 404 not found · 409 conflict (duplicate,
full class, active subscription exists) · 422 validation failed · 429 rate limited ·
500 server error · 503 AI provider or database unavailable.

---

## 9. Authentication and security

### Tokens and sessions

- A JWT carries `userId`, `role`, `tv` (the account's `token_version` at issue) and a random
  `jti`. It expires after `JWT_EXPIRES_IN` (default 1 day).
- Every request re-reads the account, so a suspended user loses access immediately.
- **Sign out this device:** the `jti` goes into `revoked_tokens`.
- **Sign out everywhere / password change / password reset:** `token_version` is
  incremented, invalidating every older token.
- The frontend stores the token in `localStorage`; a 401 on the current session clears it
  and redirects to `/login`.

### Registration and verification

- A member account is active at once and receives a token. A trainer account is `pending`
  (and its trainer record `inactive`) until an admin approves it.
- Member and trainer codes are generated as prefix + timestamp + random hex, so concurrent
  signups can't collide.
- A verification token is created in the same transaction as the account; the email is sent
  afterwards without blocking the response.
- With `REQUIRE_EMAIL_VERIFICATION=true`, login is refused until the address is confirmed.
- Following a password-reset link also counts as verifying the email.

### Defences

| Threat | Defence |
|---|---|
| Password guessing | 10 auth requests per IP per 15 min; recovery endpoints 5 (`RECOVERY_RATE_LIMIT`). |
| Email enumeration | Login always runs bcrypt (a dummy hash for unknown emails) and reveals account status only after a correct password; recovery endpoints give identical replies. |
| Stolen reset links | Only SHA-256 hashes are stored; single-use; 30-minute expiry; newer links retire older ones. |
| Cross-site requests | CORS allowlist; `*` refused in production. |
| Header forgery | `trust proxy` only when explicitly enabled. |
| Information leaks | Generic messages for 500s and database errors; no stack traces unless `NODE_ENV=development`; health endpoint hides driver messages; MongoDB errors never logged with their URI. |
| SQL injection | Every value goes through `$n` placeholders; column names come only from code whitelists. |
| Over-fetching | Role-specific column projections; trainers never see payments. |
| Credential spread | The audit trigger strips `password_hash` and `reset_token`. |
| Paid-API abuse | Chat requires sign-in and is limited per account. |

### Audit trail

- **Row triggers** record every change to `users` and `members`.
- **Application entries** (`writeAudit`) record subscriptions, payments and payment status
  changes, schedule updates, trainer assignments, and trainer approval or rejection — always
  inside the same transaction, so an entry exists if and only if the change committed.

---

## 10. Business rules and concurrency

| Rule | How it is guaranteed |
|---|---|
| One active subscription per member | The member row is locked (`FOR UPDATE`) before checking; the partial unique index is the final guard (reported as 409). Locking subscription rows wouldn't work, because with none there is nothing to lock. |
| Subscription and first payment succeed together | One transaction; the end date is `start + duration_months`. |
| Retired plans can't be sold | The API refuses inactive plans (409); the UI marks them and hides Assign. |
| Class capacity | Enrolment locks the schedule row, then counts bookings; the database trigger is a second guard. |
| No enrolment in cancelled or past sessions | Checked in SQL (`class_date < CURRENT_DATE`), using the database's calendar. |
| No trainer double-booking | An `OVERLAPS` query before creating a session (not protected against two simultaneous creations). |
| Cancelling a session | Its bookings become `cancelled`; the response reports how many were released. |
| Check-in | Only `active` members; one open check-in per day (index-backed). Forgotten check-outs are closed by the maintenance job. |
| Payment belongs to its subscription | Checked inside the transaction before inserting. |
| Payment status changes | Row locked; before/after audited. |
| Trainer rosters | Only active trainers; one active row per pair; ending stamps an end date; reactivating clears it. |
| Workout plan ownership | A trainer creates plans as themselves; an admin must name a trainer; only the author (or an admin) deletes. |
| Assignment progress | Members update their own; trainers only assignments they created. |
| PUT vs PATCH | PUT requires the core fields; PATCH changes only what is sent; non-staff can't change `status`. |
| Lapsed subscriptions | Marked `expired` by the maintenance job. |
| Dates | `DATE` columns travel as `YYYY-MM-DD`; the frontend builds local dates from the parts. |

---

## 11. The AI assistant and chat history

### Replies (`services/aiService.js`, `controllers/chatController.js`)

- **Prompt:** a fixed system prompt (gym hours, 30-day cancellation notice, no private data,
  confirm prices with reception) plus the live list of active plans, cached for 5 minutes.
  The assistant has no tools and no member data, so a manipulated history can affect only
  the text of one reply.
- **Model fallback:** Gemini models are tried in order (`GEMINI_MODELS`, default
  `gemini-3.6-flash, gemini-3.5-flash-lite, gemini-flash-lite-latest`; `GEMINI_MODEL`, if
  set, goes first). The next model is tried on 404 (retired), 429 (quota), 5xx (overloaded)
  or timeout. A bad key or rejected request (400/401/403) stops the Gemini chain. Groq
  (`GROQ_MODEL`) is the final fallback when `GROQ_API_KEY` is set.
- **Time limits:** `AI_TIMEOUT_MS` per attempt (default 15 s) within `AI_TOTAL_TIMEOUT_MS`
  (default 40 s). If everything fails, the API returns 503 with a friendly message.
- **Input limits:** message 1–2000 characters; at most 20 history turns of up to 4000
  characters each; 15 requests per 15 minutes per account.
- **Reply cache:** per account, keyed by the normalised message, 10 minutes, at most 500
  entries. Used only for first messages of 200 characters or fewer, and never for
  temporary chats.

### Saved history (`services/chatHistoryService.js`, MongoDB Atlas)

- **Optional:** without `MONGODB_URI`, chat works in temporary mode.
- **Storage:** database `MONGODB_DB_NAME` (default `gymverse_chat`), collection
  `chat_exchanges`. One document per request holds the user message and the reply, with
  `userId` (the Postgres user id), `conversationId`, `requestId`, `epoch` and `gapBefore`.
  Unique index `owned_exchange` makes retries idempotent; `owned_history` and `owned_recent`
  serve reads.
- **Durability:** writes use `w: majority, journal: true`; "saved" in the UI means durable.
- **Connection handling:** a background probe runs every 10 seconds. The API never waits on
  MongoDB at startup, and request-path operations time out after 1.5 s. A client that fails
  its check is discarded and rebuilt, so history recovers by itself when Atlas becomes
  reachable. A replica-set secondary dropping out doesn't count as an outage.
- **Gaps:** each outage starts a new epoch. Messages exchanged while offline are never
  back-filled, and a "Some earlier messages were temporary" marker appears on read.
- **Ownership:** list and read always use the signed-in user's id; another user's
  conversation reads as not found.
- **Temporary chat:** a toggle in the widget. The server never saves those requests, even
  when history is connected.

### The widget (`components/ChatWidget.jsx`)

A floating "Ask GymVerse" button for signed-in users (its code loads only after sign-in).
It shows whether history is connected, has a saved-conversation picker
(`ConversationPicker.jsx`, keyboard accessible), "New chat", the temporary toggle, and
"Load older messages" (pages of 50). The welcome greeting and local error notes are never
sent back to the model as history. Switching account or signing out discards the chat state
and aborts in-flight requests.

---

## 12. The frontend

### 12.1 Stack and tooling

React 19, React Router 7, Vite 8 (Rolldown), Tailwind CSS 4 via `@tailwindcss/postcss`,
axios, lucide-react icons. Oxlint for linting; Vitest with Testing Library and jsdom for
tests. Scripts: `npm run dev`, `build`, `preview`, `lint`, `test`.

In development `VITE_API_URL` (in `.env.development`) points at the API. A production build
leaves it unset and calls `/api` on its own origin.

### 12.2 Routing (`src/App.jsx`)

| Path | Page | Who |
|---|---|---|
| `/login` | Login | Public (in the main bundle) |
| `/register` | Register | Public |
| `/forgot-password`, `/reset-password`, `/verify-email` | Recovery pages | Public |
| `/dashboard` | Dashboard | Signed in |
| `/account` | AccountSettings | Signed in |
| `/members`, `/members/:id` | MembersList, MemberProfile | admin, receptionist |
| `/attendance` | AttendancePage | admin, receptionist |
| `/payments` | PaymentsList | admin, receptionist |
| `/subscriptions` | Subscriptions | admin, receptionist |
| `/trainer-assignments` | TrainerAssignments | admin, receptionist |
| `/plans` | MembershipPlans | Signed in |
| `/trainers`, `/trainers/:id` | TrainersList, TrainerProfile | Signed in |
| `/workouts` | WorkoutsPage | Signed in |
| `/exercises` | ExercisesPage | Signed in |
| `/classes` | ClassSchedule | Signed in |
| `/class-management` | ClassManagement | admin |
| `/reports` | RevenueReport | admin |
| `/admin/approvals` | PendingApprovals | admin |
| anything else | redirect to `/dashboard` | — |

`ProtectedRoute` redirects to `/login` without a token; `RoleRoute` shows "403 Forbidden"
for the wrong role. Everything except Login is lazy-loaded (including the dashboard shell
and the chat widget), keeping the sign-in page's JavaScript to about 289 KB (95 KB gzipped).

### 12.3 Session state (`context/AuthContext.jsx`)

Provides `user`, `token`, `isAuthenticated`, `loading`, `login`, `logout({ everywhere })`,
`register`, `replaceToken`.

- On load with a stored token, it fetches `/auth/me` once; an invalid token is discarded.
- After login or registration the returned account is used directly (no second `/auth/me`).
- `logout` clears local state first, then tells the server; it doesn't wait on the network.
- `replaceToken` swaps in the fresh token after a password change.
- The context value is memoised, so consumers re-render only when auth state changes.

### 12.4 API layer (`src/services`)

- **`api.js`** — the axios instance; attaches the token; on a 401 for the *current* token
  (except login and register) clears it and goes to `/login`. `getErrorMessage(error,
  fallback)` extracts the best message, joining per-field validation errors.
- One module per resource, each function a one-liner returning `response.data`:
  `memberService`, `trainerService`, `membershipService`, `paymentService`,
  `attendanceService`, `classService`, `workoutService` (exercises, plans, assignments,
  sessions), `assignmentService`, `dashboardService`, `reportService`, `accountService`
  (password and email flows).

### 12.5 Layout and navigation (`layouts/DashboardLayout.jsx`)

A glass sidebar with role-filtered links (Dashboard, Members, Trainers, Trainer rosters,
Attendance, Subscriptions, Plans, Payments, Workouts, Exercises, Classes, Manage classes,
Reports, Pending Approvals, Account) and a header with the page title, role and email. Nav
paths are chosen so none is a prefix of another, because the active item is found with
`startsWith`. The branch name "Riverside Branch" is hard-coded.

### 12.6 Pages

| Page | What it does |
|---|---|
| **Login** | Email/password; links to reset and register; offers to resend confirmation when the server requires it. |
| **Register** | Member or trainer signup with client-side password checks and a honeypot field. |
| **ForgotPassword / ResetPassword / VerifyEmail** | The emailed-link flows; the verify page guards against React's development double-run spending the single-use token. |
| **Dashboard** | Per role, loaded in parallel. Admin: members, active %, attendance, revenue KPIs and a 12-month CSS bar chart. Receptionist: on file, checked in, expiring, payments to collect. Trainer: roster, classes today, plans, completion, and "My members". Member: visits, sessions, booked classes (next class), days remaining, plan progress bars. |
| **AccountSettings** | Profile, email confirmation status and resend, change password, sign out of all devices. |
| **MembersList** | Debounced search, pagination, create; edit loads the full record first; delete. |
| **MemberProfile** | Details, active membership with plan name, the 5 most recent visits (fetched in parallel). |
| **TrainersList / TrainerProfile** | Trainer cards (admin create/edit/delete); profile with upcoming classes and qualifications. |
| **TrainerAssignments** | Rosters filterable by status and trainer; assign, end, cancel, reactivate. |
| **MembershipPlans** | Plan cards; admin create/edit; staff assign to a member with a payment method; retired plans marked and not sellable. |
| **Subscriptions** | All subscriptions (up to 200) with status pills. |
| **PaymentsList** | Paginated payments, filter within the page, change status (including partially refunded). |
| **AttendancePage** | Paginated log; check a member in or out. |
| **WorkoutsPage** | Plan cards; create a plan (admin names a trainer); assign; view exercises; log a session (members and trainers). |
| **ExercisesPage** | Searchable library; create/edit (admin, trainer); delete (admin). |
| **ClassSchedule** | Upcoming sessions with live seat counts; members enrol. |
| **ClassManagement** | Admin catalogue (create, edit, delete) and timetable (schedule, edit capacity/room, cancel with booking release). |
| **RevenueReport** | Completed payments with a local-date range filter, a total, and a safe CSV export (quotes escaped, formula-looking cells neutralised). |
| **PendingApprovals** | Trainer signups to approve or reject. |

### 12.7 Components

**Forms (`components/forms`)** — `MemberForm`, `TrainerForm`, `PlanForm`, `ClassForm`,
`ScheduleForm` / `ScheduleEditForm`, `ExerciseForm`, `WorkoutPlanForm`,
`AssignWorkoutForm`, `AssignSubscriptionForm`, `TrainerAssignmentForm`,
`WorkoutSessionForm`, `CheckInOutForm`, `PaymentActionModal`, `ViewExercisesModal`. Each is
the body of a modal and calls `onSubmit` with API-ready data.

**UI kit (`components/ui`)**

| Component | Purpose |
|---|---|
| `Glass.jsx` | `GlassPanel`, status `Pill`, `Skeleton`, `ProgressBar`, `Monogram`, `useCountUp` (eased number animation), `useGlassTheme` (sets accent colour and blur on `:root`). |
| `GlassTable.jsx` | Grid-based data table with staggered row animation; `IdentityCell` for name + subtitle. |
| `Modal.jsx` | Dialog with Escape and backdrop close; locks page scroll only while open. |
| `Pagination.jsx` | "Showing x–y of z" with previous/next. |
| `StatCard.jsx` | KPI tile with count-up, tone and trend caption. |
| `States.jsx` | `PageHeader`, `SearchField`, `ErrorNote`, `SuccessNote`, `EmptyState`, `LoadingTable`, `LoadingCards`. |
| `AppBackdrop.jsx` | Animated grid and colour-glow background. |
| `AuthShell.jsx` | The card used by every signed-out page, plus `AuthAlert`. |

**Utilities (`src/utils`)** — `dates.js` (`todayLocal`, `toLocalDay`, `parseDate`,
`fmtDate`, `fmtTime`, all timezone-safe) and `passwordPolicy.js` (mirrors the server's
password rule).

### 12.8 Styling

`index.css` defines Tailwind 4 theme tokens: colours `ink`, `ink-soft`, `ink-muted`,
`primary`, `secondary`, `violet`, `warn`, `danger`, `dark`; fonts `display`, `sans`,
`mono`; animations `rise-in`, `screen-in`, `grow-bar`, `grow-width`. It also defines the
shared classes (`glass`, `glass-inset`, `field`, `btn-primary`, `btn-ghost`, `label-caps`).
The look is dark glassmorphism: translucent panels with backdrop blur over an animated
backdrop. Tailwind 4 adds vendor prefixes itself, so there is no autoprefixer. Use slash
opacity syntax (`bg-black/50`); the old `bg-opacity-*` utilities no longer exist.

---

## 13. Testing and verification

### Backend unit and route tests (`npm test`)

The database module is mocked, so no Postgres is needed. Transaction tests use a fake
client that answers queries by SQL fragment and records `BEGIN`/`COMMIT`/`ROLLBACK`.

| Suite | Tests | Covers |
|---|---|---|
| `featureRoutes` | 49 | Session revocation, password and email flows, rosters, schedules, payments auditing, dashboards, maintenance |
| `routes` | 23 | Chat endpoint, auth required, role enforcement, financial scoping, input validation |
| `authorize` | 20 | `parseId`, `isStaff`, roster ownership, data and financial access |
| `auth` | 15 | Login timing and messages, registration conflicts and rollback |
| `errorHandling` | 15 | Error handler mapping, `AppError`, 404 |
| `updateBuilder` | 13 | PATCH and PUT statement building |
| `auditRegressions` | 12 | Schema-matching validation, PUT keeping status, public timetable |
| `authorization` | 12 | `requireRole`, assignment and plan ownership |
| `aiService` | 8 | Model fallback on 429/503/404, bad key, Groq, timeouts, deadline |
| `authTokens`, `pagination`, `chatPersistenceRoutes`, `chatHistoryResilience` | 7 each | Token hashing and expiry; paging; chat ownership and temporary mode; history outages and recovery |
| `chatHistory` | 5 | Real in-memory MongoDB: saves, ownership, outage and reconnect |
| `envValidation`, `maintenance` | 4 each | Startup checks; job locking and cleanup |

**Gotchas**
- `jest.config.js` sets `resetMocks: true`, which wipes `jest.fn()` implementations before
  every test. Give mocks their behaviour in `beforeEach`, or use plain functions in
  `jest.mock` factories.
- On a machine short of memory, run `npx jest --runInBand`; parallel workers can fail to
  start.

### Frontend tests (`npm test` in the frontend)

`ChatWidget.test.jsx` (7 tests): temporary replies aren't kept, account switching aborts
requests, saved history loads, keyboard use of the picker, reconnection gaps, temporary
chat isolation, and that greetings and error notes aren't sent as history.

### Full-stack check (`node verify_stack.js`)

Builds `gymverse_stack_check` from every migration, seeds it, starts the API on port 5099,
signs in, calls every read endpoint, and runs regression checks (pagination limits, trainer
contact privacy, ownership, audit redaction, required indexes, no audit row per sign-in,
bulk exercise insert). Then it drops the database. It needs Postgres credentials that can
create databases.

---

## 14. Configuration reference

### Backend (`gymverse-backend/.env`)

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | 5000 | API port |
| `NODE_ENV` | — | `production` enables strict checks; `development` adds stack traces to errors |
| `ENABLE_API_DOCS` | false | Serve Swagger in production |
| `TRUST_PROXY` | false | Trust `X-Forwarded-For` (only behind a proxy) |
| `CORS_ORIGIN` | `http://localhost:5173` | Comma-separated allowed origins |
| `SERVE_FRONTEND_DIST` | — | Path to a built frontend to serve from the API |
| `DB_HOST` / `DB_PORT` / `DB_NAME` | localhost / 5432 / gymverse | Postgres location |
| `DB_USER` / `DB_PASSWORD` | postgres / root | Runtime credentials |
| `DB_POOL_MAX` | 10 | Pool size |
| `MIGRATION_DB_USER` / `MIGRATION_DB_PASSWORD` | runtime credentials | Owner credentials for migrations and backups |
| `JWT_SECRET` | **required** | Token signing secret (32+ chars in production) |
| `JWT_EXPIRES_IN` | 1d | Token lifetime |
| `RECOVERY_RATE_LIMIT` | 5 | Recovery requests per 15 min per IP |
| `REQUIRE_EMAIL_VERIFICATION` | false | Block login until email is confirmed |
| `APP_BASE_URL` | `http://localhost:5173` | Public site URL used in emailed links |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` | — / 587 / false | Mail server |
| `SMTP_USER` / `SMTP_PASSWORD` | — | Mail credentials |
| `MAIL_FROM` | `GymVerse <no-reply@gymverse.local>` | Sender |
| `GEMINI_API_KEY` | — | Gemini access |
| `GEMINI_MODELS` | 3 models (see §11) | Fallback order |
| `GEMINI_MODEL` | — | Tried first |
| `GROQ_API_KEY` / `GROQ_MODEL` | — / `llama-3.3-70b-versatile` | Final fallback |
| `AI_TIMEOUT_MS` / `AI_TOTAL_TIMEOUT_MS` | 15000 / 40000 | AI time limits |
| `MONGODB_URI` / `MONGODB_DB_NAME` | — / gymverse_chat | Chat history |
| `MONGOSH_PATH` | mongosh | Used only by `verify_mongo.js` |
| `MAINTENANCE_ENABLED` / `MAINTENANCE_INTERVAL_MINUTES` | true / 60 | Housekeeping job |
| `BACKUP_DIR` / `BACKUP_KEEP` / `PG_DUMP_PATH` | backups / 14 / pg_dump | Backups |

`.env.example` lists every one of these with comments. The backend also reads a repo-root
`.env` for database settings; the backend's own file wins.

### Frontend

| Variable | File | Purpose |
|---|---|---|
| `VITE_API_URL` | `.env.development` | API base URL in development. Leave unset for production builds. |

---

## 15. Operations

**Health.** `GET /api/health` → 200 connected / 503 disconnected.

**Logs.** `morgan` logs each request; client errors are logged as one warning line and 5xx
errors with a stack trace. MongoDB state changes and maintenance counts are logged too.

**Backups and restore.**

```bash
npm run backup                                             # backups/gymverse-<stamp>.dump
pg_restore --clean --if-exists -d gymverse backups/<file>  # restore
```

On Windows, set `PG_DUMP_PATH` to `C:\Program Files\PostgreSQL\18\bin\pg_dump.exe`.

**Changing the schema.** Add `database/NN_description.sql`: re-runnable (`IF NOT EXISTS`,
`CREATE OR REPLACE`) and defining any function it relies on. Back up, then run
`npm run migrate`, then `node verify_stack.js`. Also add the file to `gymverse.sql`.

**Deployment checklist.**

1. `NODE_ENV=production`, a fresh `JWT_SECRET`, a strong `DB_PASSWORD` and a
   least-privilege `DB_USER`.
2. `CORS_ORIGIN` set to the real site, or `SERVE_FRONTEND_DIST`.
3. SMTP and `APP_BASE_URL` configured.
4. `TRUST_PROXY=true` only behind a reverse proxy; serve over HTTPS.
5. `npm run backup`, then `npm run migrate`.
6. Seeded passwords changed; test data removed.
7. The server's IP added to Atlas Network Access (if using chat history).

---

## 16. Troubleshooting

| Symptom | Cause and fix |
|---|---|
| Server exits with "Config error" | `validateEnv` found a production misconfiguration; the message names it. |
| "Failed to connect to the database. Server not started." | Postgres isn't running or the credentials are wrong. |
| Postgres service won't start on Windows | Needs Administrator rights; or memory is exhausted (error 1455 in the log). |
| Health says `disconnected` | The database went away after startup. |
| Every login returns 429 | 10 auth requests per IP per 15 minutes; wait or restart the backend (the limiter is in memory). |
| 401 "Your session has ended" | The token was signed out or its `token_version` changed. |
| 422 on a form | Validation failed; the `errors` array names each field. |
| 500 "function redact_sensitive(jsonb) does not exist" | Migration 17 hasn't been applied: `npm run migrate`. |
| Chat says "temporarily unavailable" | Every AI model failed (quota, overload or no key); see the backend log lines `Gemini API Error (model): status`. |
| "Temporary chat — history isn't being saved" | MongoDB not configured or unreachable. |
| Backend log: "cannot reach MongoDB" with DNS working | Add this machine's public IP in Atlas → Network Access, or resume a paused cluster. It reconnects within ~10 s. |
| MongoDB SRV lookup fails instantly | Node's resolver points at 127.0.0.1; use the non-SRV connection string (see `CHAT_HISTORY.md`). |
| No reset or verification email arrives | Without `SMTP_HOST` in development, emails are files in `gymverse-backend/.mail-outbox/`. |
| Frontend requests blocked | The browser origin isn't in `CORS_ORIGIN`. |
| Dates a day off | Use `fmtDate`/`parseDate` from `utils/dates.js`, never `new Date('YYYY-MM-DD')`. |
| Jest suites "failed to run" en masse | Low memory; use `--runInBand`. |
| Vite can't load `lightningcss…node` | Usually transient under memory pressure; rerun the build. |

---

## 17. Known limitations and future work

- **Trainer double-booking race** — two sessions created simultaneously for the same trainer
  can both pass the overlap check. An exclusion constraint would close it.
- **Suspended members can book classes** — check-in blocks them; enrolment doesn't.
- **Subscriptions page** — shows at most 200 rows, with no pagination.
- **Page data loading** — every page repeats its own fetch/loading/error logic; a shared hook
  would remove it. About 19 lint warnings relate to this pattern.
- **No response compression** when the API serves the built frontend.
- **Coursework tables have no UI** — progress records, goals, diet plans, equipment,
  maintenance, feedback and notifications exist only in SQL.
- **Branch name** "Riverside Branch" is hard-coded in the layout.
- **Migration baseline risk** — databases built before the runner may lack late additions to
  early files; new migrations must be defensive (§6.8).
- **Test data** — live test runs leave rows tagged `QA<number>` in a development database;
  remove them before a demo.

---

## 18. Glossary

| Term | Meaning |
|---|---|
| **Staff** | The admin and receptionist roles, which see all gym records. |
| **Roster** | The members with an active trainer assignment to a given trainer. |
| **Subscription** | A member's enrolment in a membership plan for a period. |
| **Schedule / session** | A dated occurrence of a fitness class, with a trainer, time, room and capacity. |
| **Booking** | A member's seat on a session. |
| **Assignment (workout)** | A workout plan given to a member, with progress tracking. |
| **Assignment (trainer)** | A trainer–member coaching relationship. |
| **`token_version`** | Per-user counter embedded in tokens; incrementing it ends every session. |
| **`jti`** | A token's unique id, recorded when that single session signs out. |
| **Baseline** | Migrations recorded as applied without being run, on first contact with an existing database. |
| **Epoch / gap** | A period of continuous chat-history availability; a gap marks messages that weren't saved between epochs. |
| **Temporary chat** | A chat mode the server never saves. |
| **Projection** | The set of columns a role may see for a record. |
| **Trigram index** | A `pg_trgm` GIN index that speeds up `ILIKE '%text%'` searches. |
