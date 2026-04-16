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
# Auto-repair: the Supabase MCP tool registers migrations with 14-digit timestamps
# (e.g. 20260416020415) instead of the 3-digit file prefix format (e.g. 064).
# This script detects those and renames them before comparing, so no manual
# intervention is needed when migrations are applied via MCP.
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

# ── Auto-repair: normalize any 14-digit timestamp entries (MCP tool artifact) ──
# The Supabase MCP apply_migration tool registers migrations as timestamps
# (20YYMMDDHHMMSS) instead of our 3-digit prefix format. Detect these, pair them
# with the file versions that are missing from the tracker, and rename them.

timestamp_entries=$(psql "$SUPABASE_DB_URL" -tAc \
  "SELECT version FROM supabase_migrations.schema_migrations
   WHERE version ~ '^[0-9]{14}$'
   ORDER BY version" 2>/dev/null | grep -E '^[0-9]{14}$' | sort || true)

if [[ -n "$timestamp_entries" ]]; then
  echo "⚠️  Found timestamp-format tracker entries (Supabase MCP artifact):"
  printf "   %s\n" $timestamp_entries

  # Which file-prefix versions are currently missing from the tracker?
  current_3digit=$(psql "$SUPABASE_DB_URL" -tAc \
    "SELECT version FROM supabase_migrations.schema_migrations
     WHERE version ~ '^[0-9]{3}$'
     ORDER BY version" | sort || true)

  missing_file_versions=$(comm -23 \
    <(printf "%s\n" "$files") \
    <(printf "%s\n" "$current_3digit") || true)

  ts_count=$(printf "%s\n" "$timestamp_entries" | grep -c . || echo 0)
  missing_count=$(printf "%s\n" "$missing_file_versions" | grep -c . || echo 0)

  if [[ "$ts_count" -eq "$missing_count" && -n "$missing_file_versions" ]]; then
    echo "   Auto-repairing: renaming $ts_count timestamp → file-prefix..."
    # Pair by sort order: oldest timestamp ↔ lowest missing version
    ts_array=($timestamp_entries)
    missing_array=($missing_file_versions)
    for i in "${!ts_array[@]}"; do
      ts="${ts_array[$i]}"
      target="${missing_array[$i]}"
      psql "$SUPABASE_DB_URL" -c \
        "UPDATE supabase_migrations.schema_migrations
         SET version = '$target' WHERE version = '$ts';" > /dev/null
      echo "   ✔ Renamed $ts → $target"
    done
    echo "   Auto-repair complete."
  else
    echo "   ⚠️  Cannot auto-repair: $ts_count timestamp entries but $missing_count missing file versions."
    echo "   Manual fix required — see supabase/repair-migration-tracker.sql"
  fi
fi

# ── Main drift check ──────────────────────────────────────────────────────────

# Re-fetch tracker after any repairs above
tracker=$(psql "$SUPABASE_DB_URL" -tAc \
  "SELECT version FROM supabase_migrations.schema_migrations ORDER BY version" \
  | sort -u)

# What's in the repo but missing from the tracker?
missing_from_tracker=$(comm -23 <(printf "%s\n" "$files") <(printf "%s\n" "$tracker") || true)

# What's in the tracker but missing from the repo? (ignore timestamp-format entries)
tracker_3digit=$(printf "%s\n" "$tracker" | grep -E '^[0-9]{3}$' | sort || true)
missing_from_repo=$(comm -13 <(printf "%s\n" "$files") <(printf "%s\n" "$tracker_3digit") || true)

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
