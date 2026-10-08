const db = require('../config/database');
const atlas = require('./chatHistoryService');

const syncMemberById = async memberId => {
  if (!atlas.status()?.available) return;
  try {
    const { rows } = await db.query(`SELECT member_id, member_name, date_of_birth, status,
      join_date, health_conditions FROM members WHERE member_id = $1`, [memberId]);
    if (rows[0]) await atlas.syncMember(rows[0]);
  } catch { console.error('Atlas member profile sync unavailable; PostgreSQL records remain current.'); }
};

const reconcileMemberProfiles = async () => {
  if (!atlas.status()?.available) return { synced: false };
  const { rows } = await db.query(`SELECT member_id, member_name, date_of_birth, status,
    join_date, health_conditions FROM members ORDER BY member_id`);
  let count = 0;
  for (const row of rows) {
    if (!(await atlas.syncMember(row)).synced) return { synced: false, count };
    count++;
  }
  return { synced: true, count };
};

// Retry current profiles after an outage; never replay old health values.
const startProfileSync = () => {
  let running = false;
  const tick = async () => {
    if (running || !atlas.status()?.available) return;
    running = true;
    try { await reconcileMemberProfiles(); }
    catch { console.error('Atlas profile reconciliation unavailable.'); }
    finally { running = false; }
  };
  const timer = setInterval(() => { void tick(); }, 60000);
  timer.unref();
  return () => clearInterval(timer);
};

module.exports = { syncMemberById, reconcileMemberProfiles, startProfileSync };
