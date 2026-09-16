/**
 * Store behaviour that needs no real MongoDB: how the store reacts to topology events,
 * retry races and failures, driven through a fake client.
 */
const { EventEmitter } = require('events');
const { randomUUID } = require('crypto');
const { createHistoryStore } = require('../src/services/chatHistoryService');

const SECRET_URI = 'mongodb://chat_user:not-a-real-password@cluster.example.net/?tls=true';

const fakeClient = ({ command = async () => ({ ok: 1 }), updateOne = async () => ({}) } = {}) => {
  const client = new EventEmitter();
  client.db = () => ({ command, collection: () => ({ createIndex: async () => 'ok', updateOne }) });
  client.close = jest.fn(async () => {});
  return client;
};

const topology = (...writable) => ({
  newDescription: { servers: new Map(writable.map((isWritable, i) => [`node${i}`, { isWritable }])) },
});

const exchange = (store) => ({
  userId: 1, conversationId: randomUUID(), requestId: randomUUID(),
  message: 'hi', response: 'hello', startedAt: new Date(), eligible: store.ticket(),
});

test('a secondary dropping out keeps history online; losing every writable member does not', async () => {
  const client = fakeClient();
  const store = createHistoryStore({ uri: SECRET_URI, clientFactory: () => client });
  await store.probe();
  const ticket = store.ticket();
  expect(store.status().available).toBe(true);

  // Primary still writable, one secondary gone: routine on Atlas, no outage, no new epoch.
  client.emit('topologyDescriptionChanged', topology(true, false, false));
  expect(store.status().available).toBe(true);
  expect(store.ticket()).toBe(ticket);

  // No writable member left: a real outage. The old ticket must stop being honoured.
  client.emit('topologyDescriptionChanged', topology(false, false, false));
  expect(store.status().available).toBe(false);
  expect(store.ticket()).toBeNull();

  await store.probe();
  expect(store.ticket()).not.toBe(ticket);
  await store.close();
});

test('a duplicate-key race on a retried request is reported as saved, not as an outage', async () => {
  const duplicate = Object.assign(new Error('E11000 duplicate key'), { code: 11000 });
  const store = createHistoryStore({
    uri: SECRET_URI,
    clientFactory: () => fakeClient({ updateOne: async () => { throw duplicate; } }),
  });
  await store.probe();

  expect(await store.save(exchange(store))).toEqual({ saved: true, available: true, configured: true });
  expect(store.status().available).toBe(true);
  await store.close();
});

test('a failed write reports not-saved and ends the epoch so nothing in flight is backfilled', async () => {
  const store = createHistoryStore({
    uri: SECRET_URI,
    clientFactory: () => fakeClient({ updateOne: async () => { throw new Error('socket closed'); } }),
  });
  await store.probe();
  const inFlight = exchange(store);

  expect((await store.save(inFlight)).saved).toBe(false);
  expect(store.status().available).toBe(false);
  await store.probe();
  expect((await store.save(inFlight)).saved).toBe(false);
  await store.close();
});

test('missing configuration logs what to set and never connects', () => {
  const log = jest.fn();
  const clientFactory = jest.fn();
  const store = createHistoryStore({ log, clientFactory });
  store.start();

  expect(clientFactory).not.toHaveBeenCalled();
  expect(log).toHaveBeenCalledWith(expect.stringMatching(/MONGODB_URI is not set.*temporary mode/));
  expect(log.mock.calls[0][0]).toMatch(/MONGODB_DB_NAME/);
});

test('connection failures are logged without the URI, credentials or driver text', async () => {
  const log = jest.fn();
  const store = createHistoryStore({
    uri: SECRET_URI,
    log,
    clientFactory: () => fakeClient({
      command: async () => { throw new Error(`connection to ${SECRET_URI} failed: bad auth`); },
    }),
  });

  await store.probe();
  expect(store.status()).toEqual({ available: false, configured: true });

  const logged = log.mock.calls.map((call) => call.join(' ')).join('\n');
  expect(logged).not.toMatch(/not-a-real-password|chat_user|cluster\.example|bad auth/);
  await store.close();
});

test('a client that failed its check is replaced, so history recovers once the cluster accepts connections', async () => {
  const broken = fakeClient({ command: async () => { throw new Error('tlsv1 alert internal error'); } });
  const healthy = fakeClient();
  const clientFactory = jest.fn().mockReturnValueOnce(broken).mockReturnValueOnce(healthy);
  const store = createHistoryStore({ uri: SECRET_URI, clientFactory });

  await store.probe();
  expect(store.status().available).toBe(false);

  await store.probe();
  expect(store.status().available).toBe(true);
  expect(clientFactory).toHaveBeenCalledTimes(2);
  await new Promise(setImmediate);
  expect(broken.close).toHaveBeenCalled();

  // A late event from the discarded client must not knock the working one offline.
  broken.emit('topologyDescriptionChanged', topology(false, false, false));
  expect(store.status().available).toBe(true);
  await store.close();
});

test('an unreachable cluster is reported once, with a hint and no driver text', async () => {
  const log = jest.fn();
  const store = createHistoryStore({
    uri: SECRET_URI,
    log,
    clientFactory: () => fakeClient({
      command: async () => { throw new Error('ssl3_read_bytes:tlsv1 alert internal error'); },
    }),
  });

  await store.probe();
  await store.probe();

  const hints = log.mock.calls.filter(([line]) => /cannot reach MongoDB/.test(line));
  expect(hints).toHaveLength(1);
  expect(hints[0][0]).toMatch(/Network Access/);
  expect(hints[0][0]).not.toMatch(/tlsv1|ssl3/);
  await store.close();
});
