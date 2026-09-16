jest.mock('../src/config/database', () => ({ query: jest.fn(), pool: { connect: jest.fn() } }));

const db = require('../src/config/database');
const { runMaintenance } = require('../src/jobs/maintenance');

const ran = (client, fragment) => client.query.mock.calls.some(([sql]) => String(sql).includes(fragment));

const fakeClient = (answer) => {
  const client = { query: jest.fn(async (sql) => answer(String(sql))), release: jest.fn() };
  db.pool.connect.mockResolvedValue(client);
  return client;
};

const counts = { expire_subscriptions: '3', close_stale_attendance: '2', purge_expired_auth_tokens: '5' };
const normal = (locked) => (sql) => {
  if (sql.includes('pg_try_advisory_lock')) return { rows: [{ locked }] };
  const fn = Object.keys(counts).find((name) => sql.includes(name));
  return { rows: [{ n: fn ? counts[fn] : 0 }] };
};

test('skips the run when another instance holds the lock', async () => {
  const client = fakeClient(normal(false));
  const result = await runMaintenance({ log: () => {} });
  expect(result.skipped).toBe(true);
  expect(ran(client, 'expire_subscriptions')).toBe(false);
  expect(ran(client, 'pg_advisory_unlock')).toBe(false);
  expect(client.release).toHaveBeenCalled();
});

test('runs every job, reports the counts and releases the lock', async () => {
  const client = fakeClient(normal(true));
  const log = jest.fn();
  const result = await runMaintenance({ log });
  expect(result).toMatchObject({ skipped: false, expired_subscriptions: 3, closed_check_ins: 2, purged_tokens: 5 });
  expect(ran(client, 'close_stale_attendance')).toBe(true);
  expect(ran(client, 'purge_expired_auth_tokens')).toBe(true);
  expect(ran(client, 'pg_advisory_unlock')).toBe(true);
  expect(log).toHaveBeenCalledWith(expect.stringMatching(/expired 3 subscription/));
  expect(client.release).toHaveBeenCalled();
});

test('stays quiet when there was nothing to do', async () => {
  fakeClient((sql) => (sql.includes('pg_try_advisory_lock') ? { rows: [{ locked: true }] } : { rows: [{ n: 0 }] }));
  const log = jest.fn();
  await runMaintenance({ log });
  expect(log).not.toHaveBeenCalled();
});

test('releases the lock and the connection even when a job fails', async () => {
  const client = fakeClient((sql) => {
    if (sql.includes('pg_try_advisory_lock')) return { rows: [{ locked: true }] };
    if (sql.includes('close_stale_attendance')) throw new Error('boom');
    return { rows: [{ n: 0 }] };
  });
  await expect(runMaintenance({ log: () => {} })).rejects.toThrow('boom');
  expect(ran(client, 'pg_advisory_unlock')).toBe(true);
  expect(client.release).toHaveBeenCalled();
});
