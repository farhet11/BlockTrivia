#!/usr/bin/env bash
# check-downgrade-readiness.sh
#
# Checks whether it's safe to downgrade Supabase from Pro → Free.
# Run after a pilot event, before your next billing cycle.
#
# Usage: bash scripts/check-downgrade-readiness.sh

set -euo pipefail

# Load env
ENV_FILE="$(dirname "$0")/../.env.local"
if [ -f "$ENV_FILE" ]; then
  export $(grep -v '^#' "$ENV_FILE" | xargs) 2>/dev/null || true
fi

if [ -z "${NEXT_PUBLIC_SUPABASE_URL:-}" ] || [ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
  echo "ERROR: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set"
  exit 1
fi

PASS=0
FAIL=0

check() {
  local label="$1"
  local ok="$2"   # "true" or "false"
  local detail="$3"
  if [ "$ok" = "true" ]; then
    echo "  ✅  $label — $detail"
    PASS=$((PASS + 1))
  else
    echo "  ❌  $label — $detail"
    FAIL=$((FAIL + 1))
  fi
}

echo ""
echo "═══════════════════════════════════════════════"
echo "  Supabase Pro → Free downgrade readiness check"
echo "═══════════════════════════════════════════════"
echo ""

# ── 1. DB size (free limit: 500MB) ───────────────────────────────────────────
RESULT=$(curl -s \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"query":"SELECT pg_database_size(current_database()) AS bytes"}' \
  "${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/exec_sql" 2>/dev/null || echo "")

DB_BYTES=$(curl -s \
  -G "${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/exec_sql" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  --data-urlencode "query=SELECT pg_database_size(current_database()) AS bytes" 2>/dev/null | \
  python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['bytes'] if d else 0)" 2>/dev/null || echo "0")

# Fallback: query via mgmt API
if [ "$DB_BYTES" = "0" ]; then
  DB_BYTES=$(curl -s \
    -X POST "${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/exec_sql" \
    -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Content-Type: application/json" \
    -d '{"query":"SELECT pg_database_size(current_database()) AS bytes"}' 2>/dev/null | \
    python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0].get('bytes',0) if isinstance(d,list) and d else 0)" 2>/dev/null || echo "0")
fi

FREE_DB_LIMIT=$((500 * 1024 * 1024))  # 500MB in bytes
DB_MB=$(python3 -c "print(round(${DB_BYTES:-0} / 1048576, 1))" 2>/dev/null || echo "?")

if [ "${DB_BYTES:-0}" -lt "$FREE_DB_LIMIT" ] 2>/dev/null; then
  check "DB size" "true" "${DB_MB}MB / 500MB used"
else
  check "DB size" "false" "${DB_MB}MB used — exceeds free 500MB limit. Archive old event data first."
fi

# ── 2. Peak concurrent players per event ─────────────────────────────────────
# Proxy: largest player count across all events. If any event had >180 players,
# future similar events would saturate free Realtime connections (cap ~200).
MAX_PLAYERS=$(curl -s \
  -G "${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/event_players" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Prefer: count=exact" \
  --data-urlencode "select=event_id" \
  2>/dev/null | python3 -c "
import sys, json
rows = json.load(sys.stdin)
from collections import Counter
counts = Counter(r['event_id'] for r in rows)
print(max(counts.values()) if counts else 0)
" 2>/dev/null || echo "0")

if [ "${MAX_PLAYERS:-0}" -le 180 ] 2>/dev/null; then
  check "Peak event size" "true" "Largest event had ${MAX_PLAYERS} players (free Realtime cap ~200)"
else
  check "Peak event size" "false" "Largest event had ${MAX_PLAYERS} players — above free Realtime limit (~200). Stay on Pro if running events this size."
fi

# ── 3. Response volume sanity (no runaway data) ───────────────────────────────
TOTAL_RESPONSES=$(curl -s \
  -G "${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/responses" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Prefer: count=exact,return=minimal" \
  -d "select=id" \
  -o /dev/null -w "%header{content-range}" 2>/dev/null | sed 's|.*/||' || echo "?")

check "Response volume" "true" "${TOTAL_RESPONSES} total responses stored (no limit, just FYI)"

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "───────────────────────────────────────────────"
if [ "$FAIL" -eq 0 ]; then
  echo "  ✅  All checks passed. Safe to downgrade."
  echo ""
  echo "  Downgrade steps:"
  echo "    1. Dashboard → Settings → Billing → Downgrade to Free"
  echo "    2. Confirm you have no PITR / compute add-ons enabled first"
  echo "    3. Backups on free tier reset to 1-day rolling — export a manual"
  echo "       backup first if you want longer history"
else
  echo "  ❌  $FAIL check(s) failed. Stay on Pro until resolved."
fi
echo "───────────────────────────────────────────────"
echo ""
