/**
 * End-to-end smoke check against a throwaway database.
 * Builds the schema, seeds it, boots the API, exercises every route, then drops the DB.
 *
 * Usage: node verify_stack.js
 */
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });

const TEST_DB = 'gymverse_stack_check';
const PORT = 5099;
const BASE = `http://localhost:${PORT}/api`;

// Creating and dropping databases needs an owner-level role, not the app's runtime role.
const adminCfg = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  user: process.env.MIGRATION_DB_USER || process.env.DB_USER || 'postgres',
  password: process.env.MIGRATION_DB_PASSWORD || process.env.DB_PASSWORD,
};

// The schema comes from the same migration runner a deploy uses, so this check can no
// longer build a different schema from production (it once silently skipped a file).
const { migrate, seed } = require('./src/db/migrations');

let pass = 0;
let fail = 0;
const check = (ok, label, detail = '') => {
  if (ok) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}${detail ? ' -> ' + detail : ''}`); }
};

const call = async (method, route, body, token) => {
  const res = await fetch(BASE + route, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  let data;
  try { data = await res.json(); } catch { data = null; }
  return { status: res.status, data };
};

(async () => {
  // --- build a scratch database -------------------------------------------------
  const admin = new Pool({ ...adminCfg, database: 'postgres' });
  await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB}`);
  await admin.query(`CREATE DATABASE ${TEST_DB}`);
  await admin.end();

  const seedPool = new Pool({ ...adminCfg, database: TEST_DB });
  console.log('\nSchema + seed:');
  try {
    const { applied } = await migrate(seedPool, { log: () => {} });
    for (const file of applied) check(true, file);
    const again = await migrate(seedPool, { log: () => {} });
    check(again.applied.length === 0, 'second migrate run is a no-op');
    await seed(seedPool);
    check(true, '07_seed.sql');
  } catch (e) {
    check(false, 'migrations + seed', e.message);
  }
  await seedPool.end();

  // --- boot the API against it --------------------------------------------------
  process.env.DB_NAME = TEST_DB;
  // The throwaway database is owned by the admin role; the runtime role has no grants on it.
  process.env.DB_USER = adminCfg.user;
  process.env.DB_PASSWORD = adminCfg.password;
  process.env.PORT = String(PORT);
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'stack-check-secret';
  process.env.CORS_ORIGIN = '*';

  const app = require('./src/app');
  const db = require('./src/config/database');
  const server = app.listen(PORT);
  await new Promise((r) => server.once('listening', r));

  console.log('\nAuth:');
  const health = await call('GET', '/health');
  check(health.status === 200 && health.data.database === 'connected', 'GET /health');

  const login = await call('POST', '/auth/login', { email: 'admin@gymverse.com', password: 'Password@123' });
  check(login.status === 200, 'admin logs in with the seeded password', JSON.stringify(login.data));
  const token = login.data?.data?.token;

  const badLogin = await call('POST', '/auth/login', { email: 'admin@gymverse.com', password: 'wrong' });
  check(badLogin.status === 401 && /Invalid email or password/.test(badLogin.data?.message || ''), 'wrong password is rejected with a usable message');
  check(!badLogin.data?.error, 'error response carries no stack trace');

  const stamp = Date.now();
  const reg = await call('POST', '/auth/register', {
    username: `stack${stamp}`, name: 'Stack Check', phone: `9${String(stamp).slice(-9)}`,
    email: `stack${stamp}@example.com`, password: 'secret123', role_name: 'member'
  });
  check(reg.status === 201, 'member self-registration', JSON.stringify(reg.data).slice(0, 120));
  const memberToken = reg.data?.data?.token;

  console.log('\nRead endpoints (admin):');
  const routes = ['/auth/me', '/dashboard/overview', '/dashboard/revenue', '/members?page=1&limit=5',
    '/members?search=a', '/trainers', '/trainers/1', '/membership-plans', '/subscriptions', '/payments',
    '/attendance', '/exercises', '/workout-plans', '/workout-plans/1', '/classes', '/schedules',
    '/reports/revenue', '/reports/members', '/admin/users/pending-trainers', '/members/1',
    '/attendance/member/1', '/payments/member/1', '/subscriptions/member/1', '/member-workouts/member/1',
    '/workout-sessions/member/1', '/schedules/member/1'];
  for (const route of routes) {
    const res = await call('GET', route, null, token);
    check(res.status === 200, `GET ${route}`, `${res.status} ${JSON.stringify(res.data).slice(0, 100)}`);
  }

  console.log('\nRegression checks:');
  const rev = await call('GET', '/dashboard/revenue', null, token);
  const months = rev.data?.data || [];
  check(months.length === 0 || months.every((m) => typeof m.revenue === 'number'), 'revenue chart values are numbers');
  check(months.length < 2 || new Date(months[0].month) < new Date(months[months.length - 1].month), 'revenue months are chronological');

  const paged = await call('GET', '/members?page=2&limit=5', null, token);
  check(paged.data?.meta?.page === 2 && paged.data.data.length <= 5, 'members pagination returns page 2');
  // Out-of-range paging is rejected at the route boundary (paginationQuery) with a 422 that
  // says what is wrong, rather than silently clamped. Either way it must never reach SQL.
  const capped = await call('GET', '/members?limit=99999', null, token);
  check(capped.status === 422, 'an over-limit page size is rejected with 422', `got ${capped.status}`);
  const negative = await call('GET', '/members?page=-3', null, token);
  check(negative.status === 422, 'a negative page is rejected with 422, not a SQL error', `got ${negative.status}`);

  const trainerAsMember = await call('GET', '/trainers', null, memberToken);
  const firstTrainer = trainerAsMember.data?.data?.[0] || {};
  check(!('phone' in firstTrainer) && !('email' in firstTrainer), 'trainer list withholds contact details from members');
  const trainerAsAdmin = await call('GET', '/trainers', null, token);
  check('phone' in (trainerAsAdmin.data?.data?.[0] || {}), 'trainer list still shows contact details to staff');

  const mw = await call('GET', '/member-workouts/member/1', null, token);
  const target = mw.data?.data?.[0];
  if (target) {
    const idor = await call('PATCH', `/member-workouts/${target.member_workout_id}`, { status: 'cancelled' }, memberToken);
    check(idor.status === 403, 'member cannot edit another member\'s workout assignment', `got ${idor.status}`);
  } else {
    check(true, 'member-workout IDOR (no seed data to probe)');
  }

  const foreignMember = await call('GET', '/members/1', null, memberToken);
  check(foreignMember.status === 403, 'member cannot read another member\'s profile');

  const audit = await new Pool({ ...adminCfg, database: TEST_DB });
  const auditRow = await audit.query("SELECT new_data FROM audit_logs WHERE table_name = 'users' LIMIT 1");
  check(auditRow.rows.length === 0 || !('password_hash' in auditRow.rows[0].new_data), 'audit log does not store password hashes');
  const dupSub = await audit.query("SELECT indexname FROM pg_indexes WHERE indexname = 'uniq_active_subscription_per_member'");
  check(dupSub.rows.length === 1, 'unique active-subscription index exists');
  await audit.end();

  console.log('\nPerformance migration (16):');
  const perf = new Pool({ ...adminCfg, database: TEST_DB });
  const indexNames = new Set((await perf.query(`SELECT indexname FROM pg_indexes WHERE schemaname = 'public'`)).rows.map((r) => r.indexname));
  for (const name of ['idx_payments_member_created', 'idx_subscriptions_member_created', 'idx_member_workouts_member_assigned',
    'idx_class_schedules_date_start', 'idx_subscriptions_created_at', 'idx_attendance_date_time', 'idx_members_name_trgm']) {
    check(indexNames.has(name), `index ${name} exists`);
  }
  check(['idx_users_email', 'idx_members_phone', 'idx_members_name', 'idx_payments_member'].every((n) => !indexNames.has(n)),
    'redundant and unusable indexes are gone');

  const userAuditRows = async () => Number((await perf.query(`SELECT COUNT(*) FROM audit_logs WHERE table_name = 'users'`)).rows[0].count);
  const auditBefore = await userAuditRows();
  const relogin = await call('POST', '/auth/login', { email: 'admin@gymverse.com', password: 'Password@123' });
  await new Promise((r) => setTimeout(r, 300)); // last_login is written after the response
  check(relogin.status === 200 && (await userAuditRows()) === auditBefore, 'a sign-in no longer writes an audit row');
  const regAudit = await perf.query(
    `SELECT record_id FROM audit_logs WHERE table_name = 'users' AND action = 'INSERT' AND new_data->>'email' = $1`,
    [`stack${stamp}@example.com`]
  );
  check(regAudit.rows[0]?.record_id === reg.data?.data?.user_id, 'user audit rows are filed under the user id',
    `${JSON.stringify(regAudit.rows)} vs user ${reg.data?.data?.user_id}`);
  await perf.end();

  const plan = await call('POST', '/workout-plans', {
    plan_name: `Stack plan ${stamp}`, trainer_id: 1,
    exercises: [
      { exercise_id: 1, day_number: 1, order_number: 1, sets: 3, repetitions: 10 },
      { exercise_id: 2, day_number: 1, order_number: 2, sets: 4, repetitions: 8, notes: 'bulk insert' },
    ],
  }, token);
  const planDetail = plan.data?.data ? await call('GET', `/workout-plans/${plan.data.data.workout_plan_id}`, null, token) : null;
  check(plan.status === 201 && planDetail?.data?.data?.exercises?.length === 2, 'workout plan exercises are saved in one insert',
    `${plan.status} ${JSON.stringify(plan.data).slice(0, 120)}`);

  const notFound = await call('GET', '/no-such-route', null, token);
  check(notFound.status === 404, 'unknown route returns 404');

  // --- tear down ----------------------------------------------------------------
  server.close();
  await db.pool.end();
  const cleanup = new Pool({ ...adminCfg, database: 'postgres' });
  await cleanup.query(`DROP DATABASE IF EXISTS ${TEST_DB}`);
  await cleanup.end();

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
