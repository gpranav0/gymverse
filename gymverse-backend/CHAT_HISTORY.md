# Optional MongoDB chat history

PostgreSQL remains the only database for gym records and authentication — users, roles,
memberships, payments, attendance, workouts and classes. MongoDB stores **only** chat
exchanges, in the `chat_exchanges` collection. Each document holds one request: the user
message and the AI reply, inserted together.

Stored fields: `userId` (the PostgreSQL `user_id`), `conversationId`, `requestId`,
`createdAt`, `epoch`, `gapBefore`, and `messages[]` with `id`, `role`, `content`,
`timestamp`. No tokens, passwords or API keys are written.

## Atlas setup

1. **Database user** — Atlas > Database Access. Grant `readWrite` on `gymverse_chat`
   only, not `atlasAdmin` or "read and write to any database".
2. **Network access** — Atlas > Network Access. Add the backend machine's public IP.
3. **Connection string** — Atlas > Connect > Drivers. Put it in `gymverse-backend/.env`:
   ```
   MONGODB_URI=mongodb+srv://<db_user>:<url_encoded_password>@<cluster-host>/?w=majority
   MONGODB_DB_NAME=gymverse_chat
   ```
   URL-encode special characters in the password. `.env` is gitignored; never commit it.
4. **Restart the backend.** The log reports the state without printing the URI:
   ```
   Chat history: connecting to MongoDB in the background...
   Chat history: MongoDB connected — new messages will be saved.
   ```
5. **Verify with mongosh** (optional): set `MONGOSH_PATH` to the absolute path of
   `mongosh.exe`, then run `node verify_mongo.js` from `gymverse-backend`. It passes the
   URI through the child environment, never the command line, and prints only
   collection names, index definitions and the saved exchange count.

### If it never says "connected": SRV lookup failures

A `mongodb+srv://` string requires a DNS SRV lookup. Node uses its own resolver for that,
and on some Windows machines it is pointed at `127.0.0.1` with nothing listening, so the
lookup fails instantly with `ECONNREFUSED` even though browsers and Windows resolve the
name fine. mongosh is built on Node and fails the same way.

Check with `node -e "console.log(require('dns').getServers())"`. If it prints
`["127.0.0.1"]`, use the standard connection string instead (Atlas > Connect > Drivers >
choose an older driver version), which lists the hosts directly:
```
MONGODB_URI=mongodb://<db_user>:<password>@<host-00>:27017,<host-01>:27017,<host-02>:27017/?tls=true&authSource=admin&replicaSet=<replica-set>&w=majority
```
This machine uses that form for exactly this reason.

## Without MongoDB

Leaving `MONGODB_URI` blank is supported. No connection is attempted, the backend logs
`MONGODB_URI is not set — chat runs in temporary mode` with the settings to add, and the
assistant keeps working.

## Reliability guarantees

- **Startup never waits for MongoDB.** The server listens as soon as PostgreSQL answers;
  a background probe connects and retries every 10 seconds.
- **Bounded on the request path.** Saving, listing and reading share a 1.5-second
  deadline. The background probe gets 10 seconds, since a cold Atlas connection (TLS,
  auth, index builds) often needs more than 1.5s and nobody is waiting on it.
- **A MongoDB failure never discards an AI reply.** The reply is returned with
  `persistence.saved: false`, and the widget marks it temporary.
- **"Saved" means durable.** Writes use `w: 'majority', journal: true`, set in code
  regardless of the URI. A plain acknowledgement can arrive before the journal is flushed,
  so a crash moments later would lose an exchange already shown as saved.
- **Replica-set aware.** Losing one Atlas secondary is routine and does not take history
  offline. Only losing every writable member counts as an outage.
- **No duplicates on retry.** A unique index on `(userId, conversationId, requestId)`
  plus an upsert makes a retried request a no-op, and a duplicate-key race counts as saved.
- **Credentials never logged.** Driver errors are swallowed without their message, which
  can contain the host list or username.

## Temporary chat (user choice)

The dashed-bubble button in the chat header turns on **Temporary chat**, for conversations
the user doesn't want kept. It is separate from outage mode: storage can be fully connected
and a temporary chat is still not saved.

- The widget sends `temporary: true`; the **server** enforces it. A temporary request never
  reaches `history.save`, whatever the connection state or save ticket.
- It also bypasses the per-user reply cache in both directions, so no copy lingers in
  server memory for the cache's ten-minute lifetime.
- The flag must be a real boolean; `"true"` as a string is rejected with 422.
- Switching the mode on or off always starts a fresh conversation, so temporary messages are
  never continued inside a saved one. *New chat* stays in the current mode; opening a saved
  conversation turns temporary mode off, because continuing it means saving to it.
- Messages live only in React memory: gone on reload, sign-out or account change.
- The response reports `persistence: { saved: false, temporary: true, available, configured }`.

## Outages, reconnection and gaps

When storage is unavailable, messages exist only in React memory and are marked
temporary. The widget shows *Temporary chat — history isn't being saved*. Reload,
sign-out, account change, New chat, or loading another conversation discards them.

There is no queue anywhere — not in PostgreSQL, localStorage, or the server — and no
backfill. Each chat request captures a ticket (the connection epoch) when it starts, and
is saved only if the store is still in that same epoch when the reply arrives. A request
that started during an outage, or that spanned a reconnect, is never saved.

After reconnecting, new exchanges save normally. The first one carries `gapBefore`, and
exchanges from different epochs are separated on read by a marker: *Some earlier messages
were temporary and are not in saved history.*

A write acknowledgement lost to a network failure can leave its outcome unknown. Such a
reply is conservatively shown as temporary; the unique index prevents a duplicate if the
same request is retried.

## Ownership

Every query includes the `user_id` from the verified JWT (`req.user`, loaded from
PostgreSQL by `requireAuth`). A `userId` in the body or query string is ignored. Asking for
another user's conversation ID returns 404, identical to a conversation that does not
exist, so IDs cannot be probed. The store never touches financial or other gym data.

Routes (all require a valid JWT, all roles):
- `GET /api/chat/status` — `{ available, configured }`
- `GET /api/chat/conversations` — the caller's 50 most recent conversations
- `GET /api/chat/conversations/:id?before=<cursor>` — 50 exchanges per page
- `POST /api/chat` — optional UUID `conversationId` and `requestId`, boolean `gapBefore`;
  the response includes `persistence.saved` and `persistence.available`

## Verification

- **Backend:** `npm test -- --runInBand`. History tests run against a throwaway local
  MongoDB that they stop and restart to simulate outages; they never touch Atlas or
  PostgreSQL. The first run downloads a `mongod` test binary. If tests hang in
  `MongoMemoryServer.create()`, delete `node_modules/.cache/mongodb-memory-server`: an
  interrupted download leaves a lock file that later runs wait on.
- **mongosh test:** set `MONGOSH_PATH` in the shell before `npm test` to include the
  mongosh verification test.
- **Frontend:** `npm test` and `npm run build` in `gymverse-frontend`.
- **Atlas:** restart the backend, send a message, reload the page, pick the conversation
  from *Load saved conversation*, then run `node verify_mongo.js`.

Isolated tests cannot prove Atlas network rules, user permissions or cluster
configuration — only a live check against your cluster does.
