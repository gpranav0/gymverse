/**
 * Takes a compressed pg_dump of the database and prunes old backups.
 *
 * Usage: node backup_db.js
 * Schedule it (cron / Windows Task Scheduler) — see DEPLOYMENT.md.
 *
 * Env:
 *   BACKUP_DIR      where dumps go (default ./backups, gitignored)
 *   BACKUP_KEEP     how many dumps to keep (default 14)
 *   PG_DUMP_PATH    pg_dump executable (default: pg_dump on PATH)
 *   MIGRATION_DB_USER / MIGRATION_DB_PASSWORD, falling back to DB_USER / DB_PASSWORD
 *
 * Restore with: pg_restore --clean --if-exists -d <database> <file>
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });

const dir = path.resolve(__dirname, process.env.BACKUP_DIR || 'backups');
const keep = Math.max(1, parseInt(process.env.BACKUP_KEEP, 10) || 14);
const database = process.env.DB_NAME || 'gymverse';

fs.mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
const file = path.join(dir, `${database}-${stamp}.dump`);

const result = spawnSync(process.env.PG_DUMP_PATH || 'pg_dump', [
  '-h', process.env.DB_HOST || 'localhost',
  '-p', String(process.env.DB_PORT || 5432),
  '-U', process.env.MIGRATION_DB_USER || process.env.DB_USER || 'postgres',
  '-d', database,
  '--format=custom',
  '--no-owner',
  '-f', file,
], {
  // Password through the environment, never the command line where `ps` can see it.
  env: { ...process.env, PGPASSWORD: process.env.MIGRATION_DB_PASSWORD || process.env.DB_PASSWORD || '' },
  encoding: 'utf8',
  windowsHide: true,
});

if (result.error || result.status !== 0) {
  fs.rmSync(file, { force: true });
  console.error(`Backup failed: ${result.error ? result.error.message : (result.stderr || '').trim().split('\n')[0]}`);
  process.exit(1);
}

const size = fs.statSync(file).size;
console.log(`Backup written: ${path.basename(file)} (${(size / 1024).toFixed(0)} KB)`);

const dumps = fs.readdirSync(dir)
  .filter((f) => f.startsWith(`${database}-`) && f.endsWith('.dump'))
  .sort()
  .reverse();
for (const old of dumps.slice(keep)) {
  fs.rmSync(path.join(dir, old));
  console.log(`Pruned old backup: ${old}`);
}
