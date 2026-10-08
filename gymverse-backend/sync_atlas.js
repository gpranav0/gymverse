// Reconcile Atlas coaching profiles from the current PostgreSQL records.
require('./src/config/database');
const db = require('./src/config/database');
const atlas = require('./src/services/chatHistoryService');

(async () => {
  await atlas.probe();
  if (!atlas.status().available) throw new Error('Atlas unavailable');
  const { rows } = await db.query(`SELECT member_id, member_name, date_of_birth, status,
    join_date, health_conditions FROM members ORDER BY member_id`);
  let synced = 0;
  for (const member of rows) {
    if (!(await atlas.syncMember(member)).synced) throw new Error('Atlas sync interrupted');
    synced++;
  }
  console.log(JSON.stringify({ connected: true, profilesSynced: synced }));
})().catch(() => {
  console.error('Atlas profile sync failed. Check Atlas access and connection settings; no credentials or member data printed.');
  process.exitCode = 1;
}).finally(async () => { await atlas.close(); await db.pool.end(); });
