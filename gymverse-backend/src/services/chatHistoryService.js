const { MongoClient, ObjectId } = require('mongodb');
const { randomUUID } = require('crypto');

// Budgets. Request-path operations (save/list/read) share one short deadline so a slow
// or unreachable cluster can never hold up a chat reply for long. The background probe
// is not on anyone's request path, so it gets room for a cold Atlas start: SRV lookup,
// TLS handshake, auth, and index builds routinely take longer than 1.5s from scratch.
const REQUEST_TIMEOUT_MS = 1500;
const PROBE_TIMEOUT_MS = 10000;
const PROBE_INTERVAL_MS = 10000;

const GAP_NOTICE = 'Some earlier messages were temporary and are not in saved history.';

// True while at least one member of the deployment can accept writes.
const hasWritableServer = (description) =>
  [...(description?.servers?.values?.() || [])].some((server) => server.isWritable);

// A disconnected store never buffers writes. The next successful probe only enables
// future requests; it never replays an exchange from the outage.
function createHistoryStore({
  uri,
  database = 'gymverse_chat',
  clientFactory = (u, o) => new MongoClient(u, o),
  log = () => {},
} = {}) {
  let client, collection, timer, probing = false, closed = false;
  let available = false, epoch = randomUUID();
  // The first failed probe used to log nothing at all, so the log said "connecting..."
  // forever. Say once that it failed and what usually causes it, still without driver text.
  let reportedUnreachable = false;
  const status = () => ({ available, configured: !!uri });

  // Every transition out of "available" starts a new epoch. Exchanges saved in different
  // epochs are separated by a gap marker on read, because messages exchanged between
  // them were only ever held in browser memory.
  const offline = () => {
    if (available) {
      epoch = randomUUID();
      log('Chat history: MongoDB unavailable — chat continues in temporary mode.');
    }
    available = false;
  };

  async function probe() {
    if (!uri || probing || closed) return;
    probing = true;
    try {
      if (!client) {
        client = clientFactory(uri, {
          serverSelectionTimeoutMS: PROBE_TIMEOUT_MS,
          connectTimeoutMS: PROBE_TIMEOUT_MS,
          timeoutMS: REQUEST_TIMEOUT_MS,
          maxPoolSize: 5,
          // A retried write after an ambiguous failure could land after the client was
          // already told "not saved". The unique index makes that harmless, but there is
          // no reason to invite it.
          retryWrites: false,
          retryReads: false,
          // "Saved" is shown to the user, so it must mean durable. A plain w:1 ack returns
          // before the journal is flushed: a crash moments later silently loses an exchange
          // the widget already reported as saved. Set here rather than trusting the URI.
          writeConcern: { w: 'majority', journal: true },
        });
        // An Atlas cluster is a replica set: one secondary missing a heartbeat is routine
        // and must not flip the whole store offline (which would also stamp a spurious
        // gap into history). Only losing every writable member counts as an outage.
        const created = client;
        client.on('topologyDescriptionChanged', (event) => {
          // A client discarded after a failed probe can still emit; only the current one counts.
          if (created === client && !hasWritableServer(event.newDescription)) offline();
        });
      }
      await client.db(database).command({ ping: 1 }, { timeoutMS: PROBE_TIMEOUT_MS });
      if (!collection) {
        const target = client.db(database).collection('chat_exchanges');
        const opts = { timeoutMS: PROBE_TIMEOUT_MS };
        // One document per request, so a retried POST can never create a duplicate.
        await target.createIndex({ userId: 1, conversationId: 1, requestId: 1 }, { unique: true, name: 'owned_exchange', ...opts });
        await target.createIndex({ userId: 1, conversationId: 1, _id: -1 }, { name: 'owned_history', ...opts });
        await target.createIndex({ userId: 1, createdAt: -1 }, { name: 'owned_recent', ...opts });
        collection = target;
      }
      if (!closed && !available) {
        available = true;
        reportedUnreachable = false;
        log('Chat history: MongoDB connected — new messages will be saved.');
      }
    } catch {
      // Never log the driver's error: it can carry the URI, hostnames or the username.
      if (!available && !reportedUnreachable) {
        reportedUnreachable = true;
        log('Chat history: cannot reach MongoDB — chat continues in temporary mode and will keep retrying. ' +
          'If the hosts resolve but TLS fails, add this server\'s IP under Atlas > Network Access.');
      }
      offline();
      // Throw away a client that failed its check; the next probe builds a fresh one. A client
      // created while Atlas was refusing this IP never recovered on its own, so history stayed
      // offline until the process was restarted, even after the IP was allowed.
      const failed = client;
      client = undefined;
      collection = undefined;
      Promise.resolve().then(() => failed?.close()).catch(() => {});
    } finally {
      probing = false;
    }
  }

  function start() {
    if (closed || timer) return;
    if (!uri) {
      log('Chat history: MONGODB_URI is not set — chat runs in temporary mode. ' +
        'Set MONGODB_URI and MONGODB_DB_NAME in gymverse-backend/.env to save history (see CHAT_HISTORY.md).');
      return;
    }
    log('Chat history: connecting to MongoDB in the background...');
    void probe();
    timer = setInterval(() => { void probe(); }, PROBE_INTERVAL_MS);
    timer.unref();
  }

  // Captured when a chat request begins. A request that started offline, or in an earlier
  // epoch, is never saved — that is what stops an outage's messages being backfilled.
  const ticket = () => (available ? epoch : null);

  async function save({ userId, conversationId, requestId, message, response, gapBefore, startedAt, eligible }) {
    if (!eligible || !available || eligible !== epoch) return { saved: false, ...status() };
    const createdAt = new Date();
    try {
      await collection.updateOne({ userId, conversationId, requestId }, {
        $setOnInsert: {
          userId, conversationId, requestId, createdAt, epoch,
          gapBefore: !!gapBefore,
          messages: [
            { id: `${requestId}:user`, role: 'user', content: message, timestamp: startedAt },
            { id: `${requestId}:model`, role: 'model', content: response, timestamp: createdAt },
          ],
        },
      }, { upsert: true });
      return { saved: true, ...status() };
    } catch (error) {
      // A concurrent retry of the same request won the upsert race: already saved.
      if (error?.code === 11000) return { saved: true, ...status() };
      offline();
      return { saved: false, ...status() };
    }
  }

  async function list(userId) {
    if (!available) return { ...status(), conversations: [] };
    try {
      const conversations = await collection.aggregate([
        { $match: { userId } }, { $sort: { createdAt: -1 } },
        { $group: { _id: '$conversationId', updatedAt: { $first: '$createdAt' }, title: { $last: { $arrayElemAt: ['$messages.content', 0] } } } },
        { $sort: { updatedAt: -1 } }, { $limit: 50 },
        { $project: { _id: 0, id: '$_id', updatedAt: 1, title: { $substrCP: ['$title', 0, 70] } } },
      ]).toArray();
      return { ...status(), conversations };
    } catch { offline(); return { ...status(), conversations: [] }; }
  }

  async function read(userId, conversationId, before) {
    if (!available) return { ...status(), messages: [] };
    try {
      const filter = { userId, conversationId };
      if (before) filter._id = { $lt: new ObjectId(before) };
      const rows = await collection.find(filter).sort({ _id: -1 }).limit(51).toArray();
      if (!rows.length) return { ...status(), missing: true, messages: [] };
      const nextCursor = rows.length > 50 ? String(rows[49]._id) : null;
      const page = rows.slice(0, 50).reverse();
      const messages = [];
      let previousEpoch = rows.length > 50 ? rows[50].epoch : undefined;
      for (const row of page) {
        if (row.gapBefore || (previousEpoch && previousEpoch !== row.epoch)) {
          messages.push({ role: 'gap', content: GAP_NOTICE });
        }
        messages.push(...row.messages);
        previousEpoch = row.epoch;
      }
      return { ...status(), messages, nextCursor };
    } catch { offline(); return { ...status(), messages: [] }; }
  }

  async function close() { closed = true; clearInterval(timer); available = false; await client?.close(); }

  return { start, probe, status, ticket, save, list, read, close };
}

const store = createHistoryStore({
  uri: process.env.MONGODB_URI,
  database: process.env.MONGODB_DB_NAME || 'gymverse_chat',
  log: (line) => console.log(line),
});

module.exports = { ...store, createHistoryStore, hasWritableServer };
