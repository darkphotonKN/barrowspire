#!/usr/bin/env bash
# One-time cutover from one Postgres container per service to the single
# `postgres` instance (ADR-0023). Copies each service's data across with
# pg_dump, restoring it as that service's new role so the role owns every
# object.
#
# Run from game-server/ while the OLD per-service containers are still up.
# Stop the Go services first, so nothing writes mid-copy.
# Never removes or stops the old containers or their volumes: rolling back is
# reverting the .env files.
#
# Re-runnable: a database that already has tables is skipped.
set -euo pipefail

NEW=barrowspire-postgres
SERVICES="auth character game items ledger marketplace notification payment stats wallet"

docker compose up -d postgres
for _ in $(seq 1 30); do
  docker exec "$NEW" pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 1
done
docker exec "$NEW" pg_isready -U postgres >/dev/null || { echo "postgres did not come up" >&2; exit 1; }

for svc in $SERVICES; do
  role="${svc}_service"
  db="barrowspire_${svc}_service_db"
  old="barrowspire_${svc}_service_db" # old container name == old database name

  if [ "$(docker inspect -f '{{.State.Running}}' "$old" 2>/dev/null)" != "true" ]; then
    echo "skip  $svc: old container $old is not running (starts empty; migrations build the schema)"
    continue
  fi

  tables=$(docker exec "$NEW" psql -U postgres -d "$db" -qAtc \
    "select count(*) from pg_tables where schemaname = 'public'")
  if [ "$tables" != "0" ]; then
    echo "skip  $svc: $db already has $tables tables"
    continue
  fi

  # --no-owner/--no-privileges: objects are recreated by, and so owned by, the
  # new role instead of the old shared `user`.
  docker exec "$old" pg_dump -U user -d "$db" --no-owner --no-privileges \
    | docker exec -i "$NEW" psql -U "$role" -d "$db" -v ON_ERROR_STOP=1 -q >/dev/null

  copied=$(docker exec "$NEW" psql -U postgres -d "$db" -qAtc \
    "select count(*) from pg_tables where schemaname = 'public'")
  echo "done  $svc: $copied tables -> $db (owner $role)"
done
