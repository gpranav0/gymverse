const { randomUUID } = require('crypto');
const { MongoClient } = require('mongodb');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { createHistoryStore } = require('../src/services/chatHistoryService');

jest.setTimeout(60000);
let server, store, client, uri;
beforeAll(async () => {
  server = await MongoMemoryServer.create();
  uri = server.getUri();
  store = createHistoryStore({ uri, database: 'history_test' });
  await store.probe();
  client = new MongoClient(uri);
  await client.connect();
});
afterAll(async () => { await store?.close(); await client?.close(); await server?.stop(); });
const exchange = (userId, conversationId, extra = {}) => ({ userId, conversationId,
  requestId: randomUUID(), message: 'Hello', response: 'Welcome', startedAt: new Date(), eligible: store.ticket(), ...extra });

test('missing configuration stays temporary without attempting a connection', async () => {
  const factory = jest.fn();
  const missing = createHistoryStore({ clientFactory: factory });
  missing.start(); await missing.probe();
  expect(missing.status()).toEqual({ configured: false, available: false });
  expect((await missing.save(exchange(1, randomUUID()))).saved).toBe(false);
  expect(factory).not.toHaveBeenCalled();
});

test('saves and restores atomic exchanges, with indexes and idempotent retries', async () => {
  const id = randomUUID(); const pair = exchange(1, id);
  expect((await store.save(pair)).saved).toBe(true);
  await store.save(pair);
  const rows = await store.read(1, id);
  expect(rows.messages.map(m => m.content)).toEqual(['Hello', 'Welcome']);
  const indexes = await client.db('history_test').collection('chat_exchanges').indexes();
  expect(indexes.find(i => i.name === 'owned_exchange').unique).toBe(true);
  expect((await store.list(1)).conversations.some(c => c.id === id)).toBe(true);
});

test.each([1, 2, 3, 4])('user %i cannot read another account history', async userId => {
  const id = randomUUID(); await store.save(exchange(userId, id));
  expect((await store.read(userId + 10, id)).missing).toBe(true);
  expect((await store.list(userId + 10)).conversations).toEqual([]);
});

(process.env.MONGOSH_PATH ? test : test.skip)('mongosh verifies collections, indexes and saved exchanges', () => {
  const { spawnSync } = require('child_process');
  const path = require('path');
  const result = spawnSync(process.execPath, [path.join(__dirname, '../verify_mongo.js')], {
    env: { ...process.env, MONGODB_URI: uri, MONGODB_DB_NAME: 'history_test' },
    encoding: 'utf8', timeout: 20000, windowsHide: true,
  });
  expect(result.status).toBe(0);
  const report = JSON.parse(result.stdout.trim());
  expect(report.connected).toBe(true);
  expect(report.savedExchanges).toBeGreaterThan(0);
  expect(report.indexes.some(i => i.name === 'owned_exchange' && i.unique)).toBe(true);
});

test('outage is bounded, reconnect saves new messages only and marks gaps', async () => {
  const id = randomUUID(); await store.save(exchange(7, id));
  const beforeOutageTicket = store.ticket();
  await server.stop({ doCleanup: false });
  const start = Date.now();
  expect((await store.save(exchange(7, id))).saved).toBe(false);
  expect(Date.now() - start).toBeLessThan(5000);
  expect(store.status().available).toBe(false);
  const skipped = exchange(7, id, { message: 'Temporary only' });
  expect((await store.save(skipped)).saved).toBe(false);
  await server.start();
  await store.probe();
  expect(store.status().available).toBe(true);
  // Neither an old in-flight ticket nor a message begun offline may be backfilled.
  expect((await store.save({ ...skipped, eligible: beforeOutageTicket })).saved).toBe(false);
  expect((await store.save(skipped)).saved).toBe(false);
  await store.save(exchange(7, id, { message: 'After reconnect', gapBefore: true }));
  const restored = await store.read(7, id);
  expect(restored.messages.some(m => m.content === 'Temporary only')).toBe(false);
  expect(restored.messages.some(m => m.role === 'gap')).toBe(true);
  expect(restored.messages.some(m => m.content === 'After reconnect')).toBe(true);
});

test('unreachable database at startup never blocks start()', async () => {
  const down = createHistoryStore({ uri: 'mongodb://127.0.0.1:1/test' });
  const start = Date.now(); down.start();
  expect(Date.now() - start).toBeLessThan(100);
  expect(down.status().available).toBe(false);
  await down.close();
});
