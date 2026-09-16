/**
 * Drops and rebuilds the whole GymVerse schema, then loads the development seed.
 * Connection settings come from .env — see .env.example.
 *
 * THIS DESTROYS EVERY ROW in the target database. It reads whatever .env currently
 * points at, so a stale .env is all it takes to aim it somewhere it should not go.
 * To update an existing database without losing data, use `node migrate.js` instead.
 *
 * Usage: node reset_db.js --confirm <database name>
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });
const { createMigrationPool, migrate, seed } = require('./src/db/migrations');

// Naming the target back to the script is the check that actually catches a wrong
// .env: you have to read the database name you are about to destroy and retype it.
const assertConfirmed = () => {
  const target = process.env.DB_NAME || 'gymverse';
  const host = process.env.DB_HOST || 'localhost';

  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to run with NODE_ENV=production. This script destroys data.');
  }

  const args = process.argv.slice(2);
  const flag = args.indexOf('--confirm');
  const named = flag !== -1 ? args[flag + 1] : undefined;

  if (named !== target) {
    throw new Error(
      `This will DROP every table in "${target}" on ${host}.\n` +
      `Re-run with:  node reset_db.js --confirm ${target}`
    );
  }
  return { target, host };
};

async function main() {
  const { target, host } = assertConfirmed();
  const pool = createMigrationPool();
  try {
    console.log(`Resetting database "${target}" on ${host}...`);
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    console.log('Schema dropped and recreated.');

    // The same ordered migrations a live deploy runs, so a reset can never drift from it.
    const { applied } = await migrate(pool, { log: () => {} });
    for (const file of applied) console.log(`  ok   ${file}`);

    await seed(pool);
    console.log('  ok   07_seed.sql');

    console.log('\nDone. Seeded accounts use the password: Password@123');
    console.log('  admin@gymverse.com (admin) / rec@gymverse.com (receptionist)');
    console.log('  Change them before exposing this database: node set_passwords.js "<new password>"');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  // A refused confirmation is expected operator feedback, not a crash; a stack trace
  // here just buries the instruction telling them what to type.
  console.error(err.message);
  process.exit(1);
});
