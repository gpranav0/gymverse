/**
 * Applies pending database migrations. Safe to run on every deploy.
 *
 * Usage:
 *   node migrate.js            apply pending migrations
 *   node migrate.js --status   list migrations and their state
 *
 * Uses MIGRATION_DB_USER / MIGRATION_DB_PASSWORD when set (a role that owns the schema),
 * otherwise the app's DB_USER / DB_PASSWORD.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });
const { createMigrationPool, migrate, status } = require('./src/db/migrations');

async function main() {
  const pool = createMigrationPool();
  try {
    if (process.argv.includes('--status')) {
      const rows = await status(pool);
      for (const r of rows) {
        const when = r.applied_at ? new Date(r.applied_at).toISOString().replace('T', ' ').slice(0, 19) : '';
        console.log(`${r.state.padEnd(9)} ${r.filename.padEnd(32)} ${when}${r.modified ? '  (EDITED AFTER APPLYING)' : ''}`);
      }
      const pending = rows.filter((r) => r.state === 'pending').length;
      console.log(`\n${pending} pending`);
      return;
    }
    const { baselined, applied, modified } = await migrate(pool);
    console.log(applied.length
      ? `Applied ${applied.length} migration(s): ${applied.join(', ')}`
      : 'Database is up to date.');
    if (baselined.length) console.log(`Baselined ${baselined.length} existing file(s).`);
    if (modified.length) process.exitCode = 2;
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
