// Index ablation benchmark for GymVerse on a throwaway database with synthetic volumes.
// Builds gymverse_bench from the real migrations, loads scaled data, times the app's own
// list/search queries under three index configurations, writes bench-results.json, drops the DB.
const { createRequire } = require('module');
const path = require('path');
const fs = require('fs');

const BACKEND = 'D:/klh/klh/II-sem1/DEDB_PROJECT/gymverse/gymverse-backend';
const req = createRequire(path.join(BACKEND, 'package.json'));
req('dotenv').config({ path: path.join(BACKEND, '.env'), quiet: true });
const { Pool } = req('pg');
const { migrate } = req('./src/db/migrations');

const DB = 'gymverse_bench';
const cfg = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  user: process.env.MIGRATION_DB_USER || process.env.DB_USER || 'postgres',
  password: process.env.MIGRATION_DB_PASSWORD || process.env.DB_PASSWORD,
};
const RUNS = 15;
const WARMUP = 3;
const OUT = path.join(__dirname, 'bench-results.json');
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// The exact list/search statements the API runs (page 1, 20 rows).
const QUERIES = [
  {
    key: 'payments_member', label: 'Member payment history',
    sql: `SELECT * FROM payments WHERE member_id = $1 ORDER BY created_at DESC LIMIT 20 OFFSET 0`,
    params: [25000],
  },
  {
    key: 'subscriptions_list', label: 'Subscriptions list (staff)',
    sql: `SELECT s.*, m.member_name, mp.plan_name FROM subscriptions s
          JOIN members m ON s.member_id = m.member_id
          JOIN membership_plans mp ON s.plan_id = mp.plan_id
          ORDER BY s.created_at DESC LIMIT 20 OFFSET 0`,
    params: [],
  },
  {
    key: 'attendance_log', label: 'Attendance log (staff)',
    sql: `SELECT a.*, m.member_name, m.member_code FROM attendance a
          JOIN members m ON a.member_id = m.member_id
          ORDER BY a.attendance_date DESC, a.check_in_time DESC LIMIT 20 OFFSET 0`,
    params: [],
  },
  {
    key: 'member_search', label: 'Member search (phone/name/email)',
    sql: `SELECT m.member_id, m.member_code, m.member_name, m.email, m.phone, m.status, m.join_date
          FROM members m WHERE (m.member_name ILIKE $1 OR m.email ILIKE $1 OR m.phone ILIKE $1)
          ORDER BY m.created_at DESC LIMIT 20 OFFSET 0`,
    params: ['%47113%'],
  },
];

// Index configurations, applied in order (each step only removes or swaps indexes).
const CONFIGS = [
  { key: 'after16', label: 'After migration 16', sql: [] },
  {
    key: 'before16', label: 'Before migration 16',
    sql: [
      'DROP INDEX IF EXISTS idx_payments_member_created',
      'DROP INDEX IF EXISTS idx_subscriptions_member_created',
      'DROP INDEX IF EXISTS idx_subscriptions_created_at',
      'DROP INDEX IF EXISTS idx_attendance_date_time',
      'DROP INDEX IF EXISTS idx_members_name_trgm',
      'DROP INDEX IF EXISTS idx_members_email_trgm',
      'DROP INDEX IF EXISTS idx_members_phone_trgm',
      'CREATE INDEX IF NOT EXISTS idx_payments_member ON payments (member_id)',
      'CREATE INDEX IF NOT EXISTS idx_subscriptions_member ON subscriptions (member_id)',
      'CREATE INDEX IF NOT EXISTS idx_members_name ON members (LOWER(member_name))',
    ],
  },
  {
    key: 'none', label: 'No supporting indexes',
    sql: [
      'DROP INDEX IF EXISTS idx_payments_member',
      'DROP INDEX IF EXISTS idx_payments_created_at',
      'DROP INDEX IF EXISTS idx_payments_date',
      'DROP INDEX IF EXISTS idx_subscriptions_member',
      'DROP INDEX IF EXISTS idx_attendance_member_date',
      'DROP INDEX IF EXISTS idx_members_created_at',
      'DROP INDEX IF EXISTS idx_members_name',
    ],
  },
];

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const topNode = (plan) => {
  // First node that actually touches a table or sorts, for a readable plan summary.
  const nodes = [];
  const walk = (n) => { nodes.push(n['Node Type'] + (n['Index Name'] ? ` (${n['Index Name']})` : n['Relation Name'] ? ` (${n['Relation Name']})` : '')); (n.Plans || []).forEach(walk); };
  walk(plan);
  return nodes.filter((n) => !/^Limit|^Nested Loop|^Hash$|^Hash Join|^Gather/.test(n)).slice(0, 3).join(' > ');
};

async function main() {
  const admin = new Pool({ ...cfg, database: 'postgres' });
  await admin.query(`DROP DATABASE IF EXISTS ${DB}`);
  await admin.query(`CREATE DATABASE ${DB}`);
  await admin.end();

  const pool = new Pool({ ...cfg, database: DB, max: 2 });
  const results = { generated_at: new Date().toISOString(), runs: RUNS, volumes: {}, configs: CONFIGS.map((c) => ({ key: c.key, label: c.label })), queries: [] };
  try {
    log('migrating throwaway database');
    await migrate(pool, { log: () => {} });

    log('loading synthetic data');
    const load = [
      'ALTER TABLE members DISABLE TRIGGER USER',
      'ALTER TABLE attendance DISABLE TRIGGER USER',
      `INSERT INTO membership_plans (plan_name, duration_months, price, status)
       SELECT 'Bench plan ' || g, g, 999 + g * 500, 'active' FROM generate_series(1, 5) g`,
      `INSERT INTO members (member_code, member_name, phone, email, join_date, status, created_at)
       SELECT 'B' || g,
              (ARRAY['Arjun','Priya','Rahul','Sneha','Vikram','Ananya','Karthik','Divya'])[1 + g % 8] || ' ' ||
              (ARRAY['Sharma','Reddy','Rao','Iyer','Nair','Das','Gupta','Singh'])[1 + (g / 8) % 8] || ' ' || g,
              '9' || lpad(g::text, 9, '0'), 'member' || g || '@bench.test',
              CURRENT_DATE - (g % 1000), 'active', now() - (g * interval '10 minutes')
       FROM generate_series(1, 50000) g`,
      `INSERT INTO subscriptions (member_id, plan_id, start_date, end_date, subscription_status, created_at)
       SELECT m.member_id, 1 + (m.member_id + k) % 5, CURRENT_DATE - k * 400, CURRENT_DATE - k * 400 + 365,
              CASE WHEN k = 0 THEN 'active' ELSE 'expired' END,
              now() - (k * interval '400 days') - (m.member_id * interval '1 minute')
       FROM members m CROSS JOIN generate_series(0, 2) k`,
      `INSERT INTO payments (subscription_id, member_id, amount, payment_date, payment_method, payment_status, created_at)
       SELECT s.subscription_id, s.member_id, 999 + (s.subscription_id % 5) * 500, s.created_at + j * interval '30 days',
              (ARRAY['cash','card','upi','bank_transfer'])[1 + (s.subscription_id + j) % 4], 'completed',
              s.created_at + j * interval '30 days'
       FROM subscriptions s CROSS JOIN generate_series(0, 1) j`,
      `INSERT INTO attendance (member_id, attendance_date, check_in_time, check_out_time, check_in_method)
       SELECT 1 + ((g::bigint * 7919) % 50000)::int, CURRENT_DATE - (g % 1095),
              time '06:00' + (g % 600) * interval '1 minute',
              time '06:00' + (g % 600) * interval '1 minute' + interval '75 minutes', 'manual'
       FROM generate_series(1, 1000000) g`,
      'ALTER TABLE members ENABLE TRIGGER USER',
      'ALTER TABLE attendance ENABLE TRIGGER USER',
    ];
    for (const sql of load) await pool.query(sql);
    await pool.query('VACUUM ANALYZE');
    for (const t of ['members', 'subscriptions', 'payments', 'attendance']) {
      results.volumes[t] = Number((await pool.query(`SELECT COUNT(*) FROM ${t}`)).rows[0].count);
    }
    log('volumes', JSON.stringify(results.volumes));

    const byQuery = Object.fromEntries(QUERIES.map((q) => [q.key, { key: q.key, label: q.label, results: {} }]));
    for (const config of CONFIGS) {
      for (const sql of config.sql) await pool.query(sql);
      if (config.sql.length) await pool.query('ANALYZE');
      for (const q of QUERIES) {
        const times = [];
        let plan;
        for (let i = 0; i < WARMUP + RUNS; i++) {
          const { rows } = await pool.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${q.sql}`, q.params);
          const p = rows[0]['QUERY PLAN'][0];
          if (i >= WARMUP) times.push(p['Execution Time'] + p['Planning Time']);
          plan = p.Plan;
        }
        const entry = { median_ms: +median(times).toFixed(3), min_ms: +Math.min(...times).toFixed(3), max_ms: +Math.max(...times).toFixed(3), plan: topNode(plan) };
        byQuery[q.key].results[config.key] = entry;
        log(`${config.key.padEnd(9)} ${q.key.padEnd(20)} median ${String(entry.median_ms).padStart(9)} ms  ${entry.plan}`);
      }
    }
    results.queries = Object.values(byQuery);
    results.postgres = (await pool.query('SHOW server_version')).rows[0].server_version;
    fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
    log('wrote', OUT);
  } finally {
    await pool.end();
    const cleanup = new Pool({ ...cfg, database: 'postgres' });
    await cleanup.query(`DROP DATABASE IF EXISTS ${DB}`);
    await cleanup.end();
    log('dropped', DB);
  }
}

main().catch((e) => { console.error('BENCH FAILED:', e.message); process.exit(1); });
