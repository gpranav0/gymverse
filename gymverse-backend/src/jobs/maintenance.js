const db = require('../config/database');

// Held for the length of a run so two backend instances never do the same work at once.
const LOCK_KEY = 74_210_614;

/**
 * One maintenance pass. The rules themselves live in SQL (database/14 and 15):
 *  - expire_subscriptions()       active subscriptions past their end date → expired
 *  - close_stale_attendance()     check-ins from earlier days with no check-out → closed
 *  - purge_expired_auth_tokens()  spent reset/verification tokens and revoked-token ids
 */
async function runMaintenance({ log = console.log } = {}) {
  const client = await db.pool.connect();
  try {
    const { rows } = await client.query('SELECT pg_try_advisory_lock($1) AS locked', [LOCK_KEY]);
    if (!rows[0].locked) return { skipped: true, reason: 'another instance is running maintenance' };

    try {
      const expired = await client.query('SELECT expire_subscriptions() AS n');
      const closed = await client.query('SELECT close_stale_attendance() AS n');
      const purged = await client.query('SELECT purge_expired_auth_tokens() AS n');
      const result = {
        skipped: false,
        expired_subscriptions: Number(expired.rows[0].n),
        closed_check_ins: Number(closed.rows[0].n),
        purged_tokens: Number(purged.rows[0].n),
        ran_at: new Date().toISOString(),
      };
      if (result.expired_subscriptions || result.closed_check_ins || result.purged_tokens) {
        log(`Maintenance: expired ${result.expired_subscriptions} subscription(s), closed ${result.closed_check_ins} check-in(s), purged ${result.purged_tokens} token(s).`);
      }
      return result;
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => {});
    }
  } finally {
    client.release();
  }
}

/** Runs once now, then every MAINTENANCE_INTERVAL_MINUTES (default 60). Returns a stop function. */
function startMaintenance() {
  if (process.env.MAINTENANCE_ENABLED === 'false') {
    console.log('Maintenance jobs disabled (MAINTENANCE_ENABLED=false).');
    return () => {};
  }
  const minutes = Math.max(1, parseInt(process.env.MAINTENANCE_INTERVAL_MINUTES, 10) || 60);
  const tick = () => runMaintenance().catch((err) => console.error('Maintenance run failed:', err.message));
  tick();
  const timer = setInterval(tick, minutes * 60 * 1000);
  timer.unref();
  console.log(`Maintenance jobs scheduled every ${minutes} minute(s).`);
  return () => clearInterval(timer);
}

module.exports = { runMaintenance, startMaintenance };
