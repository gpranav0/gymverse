# Updating GymVerse on Neon and Render

PostgreSQL is the source for live account retrieval. Local Docker uses its own database;
updating it does not migrate Neon or redeploy Render. Atlas mirrors must be scoped by
environment so local data cannot overwrite production profiles with the same member IDs.

## Existing Render backend

Keep the existing Neon connection, JWT secret, AI keys and allowed website origins.
Set these backend environment variables privately:

- `MONGODB_URI`: the working Atlas connection string.
- `MONGODB_DB_NAME`: use a dedicated production database, such as `gymverse_chat_production`.
  Keep an existing production-only database if already configured. Local Docker uses
  `gymverse_chat`; do not share its chat collection with production because PostgreSQL
  user IDs can overlap between the two environments. Inspect existing hosted chat history
  before changing its database so it remains accessible or can be migrated appropriately.
- `MONGODB_PROFILE_NAMESPACE`: `production`.

Do not copy Docker's `DB_HOST=db`, database password or JWT secret to production.
Allow Render's outbound addresses in Atlas Network Access if they are not already allowed.

## Apply migrations before starting the new code

With the backend directory as the working directory, the native Node start command is:

```sh
node migrate.js && node src/server.js
```

With the repository root as the working directory:

```sh
node gymverse-backend/migrate.js && node gymverse-backend/src/server.js
```

The backend Dockerfile already runs migrations before starting. Use the existing migration
runner against Neon rather than running migration 19 separately: it records the new nullable
health field, its length constraint and audit redaction in `schema_migrations`.
Never run demo seeds or database reset scripts against production.

## Deploy and verify

Publish the reviewed backend/frontend source changes to the service's configured Git branch.
Redeploy the backend with the updated environment settings and frontend on its existing host.
Preserve the frontend's existing API URL unless its backend address changes.

Verify `/api/health` reports a connected database. Confirm migration 19 is applied with
`node migrate.js --status`. Atlas should report connected; the profile reconciliation
refreshes current Neon members every minute when the backend is running. To sync immediately,
run `node sync_atlas.js` in the backend environment. It prints counts rather than personal data.

Check signup without health information still works, then save and clear an optional health
field under Account settings. Verify chat uses current signed-in member information and
temporary chats do not save exchanges. Existing chat exchanges remain readable.
