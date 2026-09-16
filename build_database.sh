#!/usr/bin/env bash
# Builds the GymVerse database from the SQL scripts in database/.
#
# Creates the database, then runs every SQL file in dependency order: 01-06 (schema,
# constraints, indexes, functions, triggers, views), 09-17 (later changes), and finally
# 07_seed.sql. 08_queries.sql is NOT run: it holds sample reports and two transaction
# demos that insert extra rows. Stops at the first SQL error.
#
# Usage: ./build_database.sh [-d database] [-U user] [-h host] [-p port] [--force] [--no-seed]
#   PGPASSWORD=secret ./build_database.sh --force
set -euo pipefail

DB=gymverse
DB_USER=postgres
DB_HOST=localhost
DB_PORT=5432
FORCE=0
SEED=1

while [ $# -gt 0 ]; do
  case "$1" in
    -d|--database) DB="$2"; shift 2 ;;
    -U|--user)     DB_USER="$2"; shift 2 ;;
    -h|--host)     DB_HOST="$2"; shift 2 ;;
    -p|--port)     DB_PORT="$2"; shift 2 ;;
    --force)       FORCE=1; shift ;;
    --no-seed)     SEED=0; shift ;;
    --help)        sed -n '2,10p' "$0"; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

cd "$(dirname "$0")"
command -v psql >/dev/null || { echo "psql not found on PATH." >&2; exit 1; }
PSQL=(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -v ON_ERROR_STOP=1)

# 01-06 build the original design, 09-17 are later changes, 07 seeds data last so the rows
# land in the final table shape. Plain numeric order would be wrong.
FILES=(01_schema 02_constraints 03_indexes 04_functions 05_triggers 06_views
       09_add_user_status 10_integrity 11_hardening 12_trainer_assignments
       13_account_security 14_maintenance_jobs 15_revoked_tokens 16_performance
       17_audit_redaction)
[ "$SEED" -eq 1 ] && FILES+=(07_seed)

for f in "${FILES[@]}"; do
  [ -f "database/$f.sql" ] || { echo "Missing SQL file: database/$f.sql" >&2; exit 1; }
done

echo "target: $DB_USER@$DB_HOST:$DB_PORT/$DB"
if [ -n "$("${PSQL[@]}" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '$DB'")" ]; then
  if [ "$FORCE" -ne 1 ]; then
    echo "Database '$DB' already exists. Re-run with --force to drop and rebuild it," >&2
    echo "or run 'npm run migrate' in gymverse-backend to update it in place." >&2
    exit 1
  fi
  echo "Dropping existing database '$DB' ..."
  "${PSQL[@]}" -q -d postgres -c "DROP DATABASE IF EXISTS \"$DB\" WITH (FORCE)"
fi
"${PSQL[@]}" -q -d postgres -c "CREATE DATABASE \"$DB\""
echo "Created database '$DB'."
echo

step=0
for f in "${FILES[@]}"; do
  step=$((step + 1))
  printf '[%2d/%d] %s\n' "$step" "${#FILES[@]}" "$f"
  "${PSQL[@]}" -q -d "$DB" -f "database/$f.sql"
done

echo
printf 'Done: '
"${PSQL[@]}" -d "$DB" -tAc "SELECT (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE') || ' tables, ' || (SELECT COUNT(*) FROM information_schema.views WHERE table_schema='public') || ' views, ' || (SELECT COUNT(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public') || ' functions, ' || (SELECT COUNT(*) FROM members) || ' members, ' || (SELECT COUNT(*) FROM attendance) || ' check-ins'"

[ "$SEED" -eq 1 ] && echo "Seeded logins use the password Password@123 (admin@gymverse.com, rec@gymverse.com)."
echo "Sample reports: psql -d $DB -f database/08_queries.sql   (also inserts demo rows)"
