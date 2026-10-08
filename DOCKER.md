# GymVerse Docker

There are three services and three images:

| Service | Image | Address |
| --- | --- | --- |
| frontend | gymverse-frontend:local | http://localhost:5000 |
| backend | gymverse-backend:local | backend:5000 inside Docker |
| db | postgres:17 | db:5432 inside Docker; 127.0.0.1:5433 on Windows |

The backend applies pending SQL migrations before starting Express. The frontend
waits for the API/database health check and serves React through Nginx, forwarding
`/api` to the backend. No separate migration container is needed.

## Build and run

Start Docker Desktop's Linux engine. Keep your existing `.env.docker`, or copy
`.env.docker.example` to `.env.docker` and fill in DB_PASSWORD and JWT_SECRET.
The real file is ignored by Git and excluded from both images.

From the project root:

```powershell
.\start-docker.ps1
```

Or run Compose directly:

```powershell
docker compose --env-file .env.docker up --build -d --wait
```

This builds the two application images, downloads PostgreSQL when needed, and
creates containers with the required network, settings, ports, and storage.
Building an image alone does not start containers or include passwords. Docker
Desktop's Images > Run button does not load this Compose configuration. Manage
the running project under Containers > gymverse instead.

For a clean image rebuild with fresh base images and container recreation:

```powershell
.\start-docker.ps1 -Rebuild -Check
```

The `-Check` switch runs the database/API integration check against a randomly
named disposable database, which is removed after the check.

## Build images without starting containers

Run these from the repository root, not C:\Users\John:

```powershell
docker build -t gymverse-backend:local -f gymverse-backend/Dockerfile .
docker build -t gymverse-frontend:local -f gymverse-frontend/Dockerfile .
docker pull postgres:17
```

Then create containers from those images:

```powershell
docker compose --env-file .env.docker up -d --wait
```

Existing containers remember their environment settings. Newly created containers
receive them from Compose; you do not have to retype the saved passwords.

## Connect with pgAdmin on Windows

Register a server with these connection settings:

- Host: 127.0.0.1
- Port: 5433
- Maintenance database: gymverse
- Username: gymverse
- Password: DB_PASSWORD from `.env.docker`

This is separate from your original Windows PostgreSQL on port 5432. Docker data
is stored in `gymverse_postgres_data`; recreating containers reuses that volume.
The configuration does not copy your original Windows database into Docker.

## Optional local demo accounts

On an empty database only:

```powershell
.\start-docker.ps1 -DemoData
```

Admin: admin@gymverse.com / Password@123. The development seed is optional and
transactional. Do not load it into a populated database or public deployment.
Without demo data, required roles exist and members can register; administrator
provisioning is separate.

## Inspect or stop

```powershell
docker compose --env-file .env.docker ps -a
docker compose --env-file .env.docker logs --tail 100 db backend frontend
docker compose --env-file .env.docker exec backend node migrate.js --status
docker compose --env-file .env.docker down
```

`down` retains the database volume. `down -v` deletes the database; do not use it
for ordinary cleanup or troubleshooting.

## Settings and troubleshooting

- Missing JWT_SECRET, DB_PASSWORD or POSTGRES_PASSWORD: use the full Compose
  command and make sure `.env.docker` has nonempty values. Do not start the images
  individually without configuring their environment and network.
- Missing Docker Linux engine: start Docker Desktop and wait for Engine running.
- Password authentication failed after changing DB_PASSWORD: the stored database
  password remains unchanged in an existing volume. Restore the original setting
  or change the stored password with an authenticated administrator connection.
- Migration failure: inspect backend logs. The API will not start until pending
  migrations succeed. Preserve existing SQL files and add new migration files.
- Website port already occupied: set FRONTEND_PORT. APP_BASE_URL can be blank for
  a locally derived URL, or set explicitly for public hosting. Set CORS_ORIGIN to
  your allowed public origin(s) when hosting.
- Optional AI/chat history/email warnings: supply the relevant provider settings
  in `.env.docker`. Images do not contain API keys or mail credentials.

Public hosting also requires HTTPS, backups, and separate migration/runtime
PostgreSQL privileges. This configuration keeps the backend private, restricts
pgAdmin access to the Windows loopback address, and uses the database owner for
runtime in this local learning setup.
