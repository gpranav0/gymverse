const db = require('../config/database');

/**
 * Runs `work(client)` inside BEGIN/COMMIT on one pooled connection and returns its result.
 * Anything it throws rolls the transaction back and is rethrown, so the caller's error
 * handling still sees the original error; the connection is always released.
 *
 * Every controller that writes more than one row used to carry its own copy of this
 * connect / BEGIN / COMMIT / ROLLBACK / release block.
 */
async function withTransaction(work) {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    try {
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      // A failed rollback must not mask the error that caused it.
      await client.query('ROLLBACK').catch((e) => console.error('Rollback failed:', e.message));
      throw error;
    }
  } finally {
    client.release();
  }
}

module.exports = { withTransaction };
