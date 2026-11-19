#!/usr/bin/env bash
# A local Postgres 16 with a small Supabase stand-in (scripts/local-db/shim.sql) and every migration, for running the SQL checks
# without Docker: bash scripts/local-db/reset.sh && DB_URL="postgresql://postgres@localhost:54322/postgres?host=/tmp" bash scripts/db-tests.sh
# Needs postgresql-16 (initdb, pg_ctl) installed. CI uses the real Supabase CLI instead (club-checks.yml); both must pass.
# Usage: reset.sh [last-migration-number, e.g. 0013]
set -euo pipefail
B=${PG_BIN:-/usr/lib/postgresql/16/bin}; D=${PG_DATA:-/tmp/pqdb}; HERE=$(cd "$(dirname "$0")/../.." && pwd)
run() { if [ "$(id -u)" = 0 ]; then su postgres -c "$*"; else bash -c "$*"; fi; }
if [ -f "$D/postmaster.pid" ]; then run "$B/pg_ctl -D $D stop -m fast" >/dev/null 2>&1 || true; fi
rm -rf "$D"; mkdir -p "$D"; [ "$(id -u)" = 0 ] && chown postgres "$D"
run "$B/initdb -D $D -A trust -U postgres" >/dev/null
run "$B/pg_ctl -D $D -o '-p 54322 -k /tmp' -l /tmp/pqdb.log start" >/dev/null
sleep 1.5
P="psql -h /tmp -p 54322 -U postgres -q -v ON_ERROR_STOP=1"
$P -f "$HERE/scripts/local-db/shim.sql" >/dev/null
for f in "$HERE"/supabase/migrations/*.sql; do
  n=$(basename "$f" | cut -c1-4); if [ -n "${1:-}" ] && [ "$n" \> "$1" ]; then break; fi
  $P -f "$f" >/dev/null 2>/tmp/mig.err || { echo "✗ $f"; cat /tmp/mig.err; exit 1; }
done
echo "Local database ready on port 54322 (socket /tmp)."
