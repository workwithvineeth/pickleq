#!/usr/bin/env bash
# Runs every SQL check in supabase/tests against a database (default: the local Supabase from `supabase start`).
# Each check rolls back. A check fails if psql errors or any result row contains "FAIL". Prints one line per check.
set -uo pipefail
DB="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
cd "$(dirname "$0")/.."
psql "$DB" -q -v ON_ERROR_STOP=1 -f supabase/tests/ci_seed.sql >/dev/null || { echo "✗ seed failed"; exit 1; }
bad=0
for f in supabase/tests/*.sql; do
  n=$(basename "$f" .sql); [ "$n" = ci_seed ] && continue
  out=$(psql "$DB" -X -A -t -v ON_ERROR_STOP=1 -f "$f" 2>&1); code=$?
  if [ $code -ne 0 ] || grep -q "FAIL" <<<"$out"; then
    bad=1; echo "✗ $n"; grep -E "FAIL|ERROR|error" <<<"$out" | head -8 | sed 's/^/  /'
  else echo "✓ $n"; fi
done
exit $bad
