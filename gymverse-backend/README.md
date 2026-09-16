# GymVerse Backend API

The Node.js/Express REST API powering GymVerse, a gym management system.

## Tech Stack
- **Node.js & Express 5** — core server framework.
- **PostgreSQL** — the sole source of truth for relationships and data constraints.
- **pg** — native Postgres driver using parameterized queries throughout (no ORM).
- **JWT** — bearer-token authentication mapped to database roles.
- **Jest** — unit and regression tests.
- **Swagger / OpenAPI 3.0** — interactive API documentation.

## Features
- **Authentication** — JWT issuance, bcrypt password hashing, and an admin approval
  gate for trainer self-registration.
- **Role-based access control** — `admin`, `receptionist`, `trainer`, `member`, enforced
  at the route level and again at the record level (members only reach their own data).
- **Members & Trainers** — full CRUD. Trainer contact details are withheld from members
  on both the list and detail endpoints.
- **Membership operations** — subscription creation and its opening payment run in one
  transaction; a unique partial index guarantees one active subscription per member.
- **Classes** — `SELECT ... FOR UPDATE` pessimistic locking so two members racing for the
  last seat cannot both win.
- **Dashboard & reporting** — aggregation is done in SQL rather than by pulling rows into
  JavaScript.
- **AI assistant** — Gemini with a Groq fallback, grounded on the live plan catalogue so
  it cannot quote prices that do not exist.
- **Chat history (optional)** — MongoDB Atlas stores chat conversations only; PostgreSQL
  stays the database for everything else. Users can also start a temporary chat that is
  never saved. Setup and guarantees: [CHAT_HISTORY.md](CHAT_HISTORY.md).

## Running Locally

```bash
npm install
```

Copy `.env.example` to `.env` and fill it in. `JWT_SECRET` is required — the server
refuses to start without it. Generate one with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Create and seed the database. This **drops and rebuilds the schema**, so the script makes
you retype the database name from `.env` before it runs, and refuses in production:

```bash
node reset_db.js --confirm gymverse
```

Then start the server:

```bash
npm run dev
```

### Seeded accounts

Every seeded account uses the password `Password@123`.

| Email                  | Role         |
| ---------------------- | ------------ |
| `admin@gymverse.com`   | admin        |
| `rec@gymverse.com`     | receptionist |
| `arjun@gv.com`         | trainer      |

These are development credentials. Change them before deploying anywhere real:

```bash
node set_passwords.js "a-new-password"
```

## API Documentation

With the server running, open `http://localhost:5000/api-docs` for the interactive
Swagger UI. Use the **Authorize** button to paste a bearer token from `/api/auth/login`.

## Testing

```bash
npm test
```

The suite is self-contained: 16 suites and about 235 tests, with the database driver
mocked, so no Postgres instance is needed. It covers:

- **Routes and roles** — authentication required on data routes, role enforcement,
  financial scoping, and validation at the route boundary.
- **Record ownership** — members reach only their own records, trainers only their roster,
  and plan and assignment ownership.
- **Account security** — login timing and messages, registration conflicts, session
  revocation, password change and reset, email confirmation, and one-time link tokens.
- **Business features** — trainer rosters, schedule management, payment auditing,
  dashboards and the maintenance job.
- **Helpers** — pagination, PUT/PATCH statement building, the error handler and
  environment validation.
- **AI and chat** — Gemini model fallback and time limits; chat history ownership,
  temporary chats, outages and reconnection (one suite uses an in-memory MongoDB).

`jest.config.js` sets `resetMocks`, which clears `jest.fn()` implementations before each
test, so give mocks their behaviour in `beforeEach`. On a machine short of memory, run
`npx jest --runInBand` instead of the parallel default.

For an end-to-end check against real Postgres, `verify_stack.js` builds a throwaway
database from every migration, boots the API, exercises every route plus regression checks,
and drops the database afterwards:

```bash
node verify_stack.js
```

## Scripts

| Script                 | Purpose                                                      |
| ---------------------- | ------------------------------------------------------------ |
| `npm run dev`          | Start with nodemon.                                           |
| `npm start`            | Start normally.                                               |
| `npm test`             | Run the Jest suite.                                           |
| `node reset_db.js`     | Drop, rebuild and seed the database.                          |
| `node run_seed.js`     | Re-run only the seed against the existing schema.             |
| `node set_passwords.js`| Reset development account passwords.                          |
| `node verify_stack.js` | Full-stack smoke test on a throwaway database.                |

## Configuration

All settings come from `.env` — see `.env.example` for the full list. Notable ones:

- `JWT_SECRET` — **required**, no default.
- `CORS_ORIGIN` — comma-separated allowlist of browser origins. Defaults to the local
  Vite dev server; do not use `*` in production.
- `NODE_ENV` — set to `development` to include stack traces in error responses. Any
  other value (including unset) withholds them.
- `GEMINI_MODELS` — Gemini models tried in order; the next is used when one is out of
  quota, overloaded or retired. `GEMINI_MODEL` goes first; `GROQ_MODEL` for the fallback.
- `AI_TIMEOUT_MS` / `AI_TOTAL_TIMEOUT_MS` — per-model and whole-reply time limits.
- `MONGODB_URI` — chat history. A "tlsv1 alert internal error" means Atlas Network Access
  does not allow this machine's IP.

## Security Notes

- `.env` is gitignored. Never commit real API keys or database passwords.
- The audit-log trigger strips `password_hash` before writing rows, so credential
  material never reaches `audit_logs`.
- Auth endpoints are rate limited to 10 requests per IP per 15 minutes, chat to 15, and
  the API as a whole to 500.
