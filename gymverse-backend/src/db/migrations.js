/**
 * Versioned schema migrations.
 *
 * The schema used to be a folder of numbered SQL files run in a hand-maintained order, with
 * reset_db.js (which wipes everything) as the only tool. That cannot update a live database,
 * and the order had already drifted between scripts. This runner records every applied file
 * in schema_migrations, applies only what is pending, one transaction per file, and is the
 * single source of the order for migrate.js, reset_db.js and verify_stack.js.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');

const DB_DIR = path.resolve(__dirname, '../../../database');

// Not schema changes: development seed data and sample reporting queries.
const NOT_MIGRATIONS = new Set(['07_seed.sql', '08_queries.sql']);

// Files that predate this runner. An existing database already has them applied, so on a
// runner's first contact with such a database they are recorded rather than re-run.
const BASELINE = [
  '01_schema.sql', '02_constraints.sql', '03_indexes.sql', '04_functions.sql', '05_triggers.sql',
  '06_views.sql', '09_add_user_status.sql', '10_integrity.sql', '11_hardening.sql',
];

// Arbitrary constant: serialises concurrent runners (two deploys starting at once).
const LOCK_KEY = 74_210_613;

const listMigrations = () =>
  fs.readdirSync(DB_DIR)
    .filter((f) => /^\d+_[\w-]+\.sql$/.test(f) && !NOT_MIGRATIONS.has(f))
    .sort((a, b) => parseInt(a, 10) - parseInt(b, 10) || a.localeCompare(b));

const read = (file) => fs.readFileSync(path.join(DB_DIR, file), 'utf8');
// Line endings are normalised so a git CRLF checkout does not look like an edited file.
const checksum = (sql) => crypto.createHash('sha256').update(sql.replace(/\r\n/g, '\n')).digest('hex');

/** A pool with owner privileges, for DDL. Falls back to the app credentials. */
const createMigrationPool = (overrides = {}) => new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  database: process.env.DB_NAME || 'gymverse',
  user: process.env.MIGRATION_DB_USER || process.env.DB_USER || 'postgres',
  password: process.env.MIGRATION_DB_PASSWORD || process.env.DB_PASSWORD,
  max: 2,
  ...overrides,
});

const ensureTable = (client) => client.query(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    filename   TEXT PRIMARY KEY,
    checksum   CHAR(64) NOT NULL,
    baseline   BOOLEAN NOT NULL DEFAULT FALSE,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);

async function readApplied(client) {
  const { rows } = await client.query('SELECT filename, checksum, baseline, applied_at FROM schema_migrations');
  return new Map(rows.map((r) => [r.filename, r]));
}

/**
 * Applies pending migrations. Returns { baselined: [...], applied: [...], modified: [...] }.
 * Throws (after rolling back that file) if a migration fails; later files are not attempted.
 */
async function migrate(pool, { log = console.log } = {}) {
  const client = await pool.connect();
  const summary = { baselined: [], applied: [], modified: [] };
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);
    await ensureTable(client);
    let applied = await readApplied(client);

    if (applied.size === 0) {
      const { rows } = await client.query(`SELECT to_regclass('public.users') IS NOT NULL AS existing`);
      if (rows[0].existing) {
        for (const file of BASELINE) {
          await client.query(
            'INSERT INTO schema_migrations (filename, checksum, baseline) VALUES ($1, $2, TRUE) ON CONFLICT DO NOTHING',
            [file, checksum(read(file))]
          );
          summary.baselined.push(file);
        }
        log(`Existing schema detected: recorded ${BASELINE.length} pre-runner files as applied.`);
        applied = await readApplied(client);
      }
    }

    for (const file of listMigrations()) {
      const sql = read(file);
      const previous = applied.get(file);
      if (previous) {
        if (!previous.baseline && previous.checksum !== checksum(sql)) summary.modified.push(file);
        continue;
      }
      log(`Applying ${file} ...`);
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)', [file, checksum(sql)]);
        await client.query('COMMIT');
        summary.applied.push(file);
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        error.message = `Migration ${file} failed and was rolled back: ${error.message}`;
        throw error;
      }
    }

    if (summary.modified.length) {
      log(`WARNING: already-applied migrations were edited afterwards: ${summary.modified.join(', ')}. ` +
        'Write a new migration instead of changing an applied one.');
    }
    return summary;
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => {});
    client.release();
  }
}

async function status(pool) {
  const client = await pool.connect();
  try {
    await ensureTable(client);
    const applied = await readApplied(client);
    return listMigrations().map((file) => {
      const row = applied.get(file);
      return {
        filename: file,
        state: !row ? 'pending' : row.baseline ? 'baseline' : 'applied',
        applied_at: row?.applied_at || null,
        modified: !!row && !row.baseline && row.checksum !== checksum(read(file)),
      };
    });
  } finally {
    client.release();
  }
}

/** Development seed data. Refuses to run in production. */
async function seed(pool) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to load development seed data with NODE_ENV=production.');
  }
  await pool.query(read('07_seed.sql'));
  // Seeded accounts are fixtures, not signups: they count as verified.
  await pool.query('UPDATE users SET email_verified_at = COALESCE(email_verified_at, created_at, CURRENT_TIMESTAMP)');
}

module.exports = { createMigrationPool, migrate, status, seed };
