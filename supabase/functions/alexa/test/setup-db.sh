#!/usr/bin/env bash
# TEST ONLY: throwaway supabase/postgres with every Orion migration replayed (port 54399, container orion-alexa-pgtest).
#   supabase/functions/alexa/test/setup-db.sh        (re)create and migrate
#   docker rm -f orion-alexa-pgtest                   clean up
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
NAME=orion-alexa-pgtest
IMAGE=${ORION_PG_IMAGE:-public.ecr.aws/supabase/postgres:17.6.1.121}
docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" -e POSTGRES_PASSWORD=postgres -e PGPASSWORD=postgres -p 127.0.0.1:54399:5432 "$IMAGE" >/dev/null
for _ in $(seq 1 60); do docker exec "$NAME" pg_isready -U postgres -h 127.0.0.1 >/dev/null 2>&1 && break; sleep 2; done
sleep 3
psql_file() { docker exec -i "$NAME" psql -U postgres -h 127.0.0.1 -v ON_ERROR_STOP=1 -q < "$1"; }
# auth/storage shims need the image superuser (postgres cannot write to schema auth).
admin_file() { docker exec -i -e PGPASSWORD=postgres "$NAME" psql -U supabase_admin -h 127.0.0.1 -d postgres -v ON_ERROR_STOP=1 -q < "$1"; }
docker exec "$NAME" psql -U postgres -h 127.0.0.1 -qc "create extension if not exists pg_cron; create extension if not exists pg_net;" >/dev/null
admin_file "$ROOT/supabase/functions/alexa/test/pg-shims.sql"
for f in "$ROOT"/tools/ba400-log-monitor/sql/*.sql; do psql_file "$f" >/dev/null; done
fails=0
for f in "$ROOT"/supabase/migrations/*.sql; do
  if ! out=$(psql_file "$f" 2>&1); then fails=$((fails + 1)); echo "FAIL $(basename "$f"): $(echo "$out" | grep -m1 ERROR)"; fi
done
echo "migrations replayed, failures: $fails"
