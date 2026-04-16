#!/usr/bin/env bash
#
# check-migration-drift.sh
#
# Compares supabase/migrations/*.sql against supabase_migrations.schema_migrations
# in the database and fails if they don't match.
#
# Catches the "applied via SQL editor, never registered" failure mode that
# caused the 034→063 tracker drift discovered during the 2026-04-15 pilot debug.
#
# Usage:
#   SUPABASE_DB_URL=postgres://... bash scripts/check-migration-drift.sh
#
# Expects psql on PATH (preinstalled in GitHub Actions ubuntu-latest).

set -euo pipefail

if [[ -z "${SUPABASE_DB_URL:-}" ]]; then
  echo "❌ SUPABASE_DB_URL is not set"
  echo "   Locally: export SUPABASE_DB_URL=postgres://... (from Supabase dashboard → Connect)"
  echo "   CI: ensure the secret is exposed to this job"
  exit 2
fi

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
migrations_dir="$repo_root/supabase/migrations"

# Versions from files: first 3 chars of filename (e.g. 034_host_onboarding.sql → 034).
files=$(ls "$migrations_dir" | grep -E '^[0-9]{3}_.*\.sql$' | cut -c1-3 | sort -u)

# Versions from tracker. Use -tAc for clean output (no header, no padding).
tracker=$(psql "$SUPABASE_DB_URL" -tAc \
  "SELECT version FROM supabase_migrations.schema_migrations ORDER BY version" \
  | sort -u)

# What's in the repo but missing from the tracker?
missing_from_tracker=$(comm -23 <(printf "%s\n" "$files") <(printf "%s\n" "$tracker") || true)

# What's in the tracker but missing from the repo?
missing_from_repo=$(comm -13 <(printf "%s\n" "$files") <(printf "%s\n" "$tracker") || true)

if [[ -z "$missing_from_tracker" && -z "$missing_from_repo" ]]; then
  count=$(printf "%s\n" "$files" | wc -l | tr -d ' ')
  echo "✅ Migration tracker in sync — $count migrations"
  exit 0
fi

echo "❌ Migration drift detected"
echo ""

if [[ -n "$missing_from_tracker" ]]; then
  echo "Files present in repo but NOT in tracker:"
  printf "  %s\n" $missing_from_tracker
  echo ""
  echo "  Likely cause: migration applied via SQL editor, not via 'supabase db push'."
  echo "  Fix: run the migration through the Supabase CLI, OR backfill the tracker"
  echo "       via supabase/repair-migration-tracker.sql."
  echo ""
fi

if [[ -n "$missing_from_repo" ]]; then
  echo "Versions in tracker but NOT in repo files:"
  printf "  %s\n" $missing_from_repo
  echo ""
  echo "  Likely cause: a migration was applied in prod but the file was never committed."
  echo "  Fix: find the SQL, commit it as supabase/migrations/<version>_<name>.sql."
  echo ""
fi

exit 1
