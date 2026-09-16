/**
 * Re-runs only the development seed against the existing schema.
 * Connection settings come from .env — see .env.example.
 *
 * Usage: node run_seed.js   (or: npm run seed)
 *
 * Uses the migration runner's seed(), the same one reset_db.js and verify_stack.js use, so
 * it refuses to run in production and marks seeded accounts as email-verified.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });
const { createMigrationPool, seed } = require('./src/db/migrations');

async function main() {
  const pool = createMigrationPool();
  try {
    await seed(pool);
    console.log('Seed executed successfully.');
  } catch (err) {
    console.error('Error executing seed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
