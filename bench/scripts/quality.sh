#!/usr/bin/env bash
# Quality check for captured edit-task outputs in bench/edits-final/.
# - Restores the captured lib/mcp.ts (and route.ts for graph-edit tasks) into
#   the portifolio repo and runs `tsc --noEmit` to confirm it typechecks.
# - Reports per-task pass/fail + line delta + counts of common defensive
#   patterns so output style is comparable across conditions.
set -u
ROOT="/Users/lkz/Desktop/Code/adam"
EDITS="$ROOT/bench/edits-final"
PORT="/Users/lkz/Desktop/Code/portifolio"
ORIG_MCP="$PORT/lib/mcp.ts"
ORIG_ROUTE="$PORT/app/api/chat/route.ts"
BACKUP_MCP="/tmp/portifolio-mcp.original.ts"
BACKUP_ROUTE="/tmp/portifolio-route.original.ts"
REPORT="$ROOT/bench/scripts/quality.md"

cp "$ORIG_MCP" "$BACKUP_MCP"
cp "$ORIG_ROUTE" "$BACKUP_ROUTE"
trap 'cp "$BACKUP_MCP" "$ORIG_MCP"; cp "$BACKUP_ROUTE" "$ORIG_ROUTE"' EXIT

orig_lines=$(wc -l < "$BACKUP_MCP" | tr -d ' ')

{
  echo "# Edit-task quality check"
  echo
  echo "| Task | Cond | Δ lines | tsc | \`?? \` | \`if (!\` |"
  echo "|---|---|---:|:-:|---:|---:|"
} > "$REPORT"

check_one() {
  local id=$1 cond=$2
  local file="$EDITS/$id-$cond.ts"
  local route_file="$EDITS/$id-$cond.route.ts"
  [ -f "$file" ] || return 0
  local lines delta nullish guards tsc_status tsc_errors=0
  lines=$(wc -l < "$file" | tr -d ' ')
  delta=$((lines - orig_lines))
  cp "$file" "$ORIG_MCP"
  if [ -f "$route_file" ]; then cp "$route_file" "$ORIG_ROUTE"; else cp "$BACKUP_ROUTE" "$ORIG_ROUTE"; fi
  if (cd "$PORT" && npx --yes tsc --noEmit --project tsconfig.json) > /tmp/tsc-out.txt 2>&1; then
    tsc_status="✓"
  else
    tsc_status="✗"
    tsc_errors=$(grep -c "error TS" /tmp/tsc-out.txt || true)
  fi
  nullish=$(grep -c '?? ' "$file" || true)
  guards=$(grep -c 'if (!' "$file" || true)
  echo "| $id | $cond | +$delta | $tsc_status${tsc_errors:+ ($tsc_errors)} | $nullish | $guards |" >> "$REPORT"
}

for id in T2 T2b T2c T2d T2e T2f T2g T2h T2i T2j; do
  check_one "$id" with-adam
done
for id in T3 T3b; do
  for cond in baseline with-adam; do
    check_one "$id" "$cond"
  done
done

cp "$BACKUP_MCP" "$ORIG_MCP"
cp "$BACKUP_ROUTE" "$ORIG_ROUTE"
cat "$REPORT"
