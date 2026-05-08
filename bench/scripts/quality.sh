#!/usr/bin/env bash
# Two-layer quality check for captured edit outputs (bench/edits-final/):
#
#   1. Compile  — `tsc --noEmit` on each output
#   2. Runtime  — invoke the per-task tool through the dispatcher and assert
#                 envelope shape (see quality-runtime.ts for per-task probes)
#
# Reports per-task pass/fail per layer, plus aggregate quality scores so
# baseline-vs-adam comparisons cover correctness, not just compilation.
set -u
ROOT="/Users/lkz/Desktop/Code/adam"
EDITS="$ROOT/bench/edits-final"
PROBE="$ROOT/bench/scripts/quality-runtime.ts"
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
  echo "Two layers: \`tsc --noEmit\` (does the patch compile?) and runtime invocation (does the new/renamed tool actually work end-to-end?)."
  echo
  echo "| Task | Cond | Δ lines | tsc | runtime | reason |"
  echo "|---|---|---:|:-:|:-:|---|"
} > "$REPORT"

# Per-condition pass counters (plain vars — macOS bash 3.2 has no associative arrays).
TOTAL_BASELINE=0
TOTAL_ADAM=0
PASS_COMPILE_BASELINE=0
PASS_COMPILE_ADAM=0
PASS_RUNTIME_BASELINE=0
PASS_RUNTIME_ADAM=0

inc_total() { if [ "$1" = baseline ]; then TOTAL_BASELINE=$((TOTAL_BASELINE+1)); else TOTAL_ADAM=$((TOTAL_ADAM+1)); fi }
inc_compile() { if [ "$1" = baseline ]; then PASS_COMPILE_BASELINE=$((PASS_COMPILE_BASELINE+1)); else PASS_COMPILE_ADAM=$((PASS_COMPILE_ADAM+1)); fi }
inc_runtime() { if [ "$1" = baseline ]; then PASS_RUNTIME_BASELINE=$((PASS_RUNTIME_BASELINE+1)); else PASS_RUNTIME_ADAM=$((PASS_RUNTIME_ADAM+1)); fi }

check_one() {
  local id=$1 cond=$2
  local file="$EDITS/$id-$cond.ts"
  local route_file="$EDITS/$id-$cond.route.ts"
  [ -f "$file" ] || return 0
  inc_total "$cond"

  local lines delta
  lines=$(wc -l < "$file" | tr -d ' ')
  delta=$((lines - orig_lines))

  cp "$file" "$ORIG_MCP"
  if [ -f "$route_file" ]; then cp "$route_file" "$ORIG_ROUTE"; else cp "$BACKUP_ROUTE" "$ORIG_ROUTE"; fi

  local tsc_status="✗"
  local rt_status="-"
  local reason=""

  if (cd "$PORT" && npx --yes tsc --noEmit --project tsconfig.json) > /tmp/tsc-out.txt 2>&1; then
    tsc_status="✓"
    inc_compile "$cond"

    # Run runtime probe via tsx.
    local probe_out
    probe_out=$(cd "$PORT" && MCP_PATH="$ORIG_MCP" npx --yes tsx "$PROBE" "$id" 2>&1 | tail -1)
    if printf '%s' "$probe_out" | jq -e '.status == "pass"' >/dev/null 2>&1; then
      rt_status="✓"
      inc_runtime "$cond"
    else
      rt_status="✗"
      reason=$(printf '%s' "$probe_out" | jq -r '.reason // .' 2>/dev/null | head -c 80)
    fi
  else
    local errs
    errs=$(grep -c "error TS" /tmp/tsc-out.txt || true)
    reason="$errs tsc error(s)"
  fi

  echo "| $id | $cond | +$delta | $tsc_status | $rt_status | $reason |" >> "$REPORT"
}

for id in T2 T2b T2c T2d T2e T2f T2g T2h T2i T2j T3 T3b; do
  for cond in baseline with-adam; do
    check_one "$id" "$cond"
  done
done

{
  echo
  echo "## Summary"
  echo
  echo "| Cond | Compile | Runtime |"
  echo "|---|---:|---:|"
  echo "| baseline  | $PASS_COMPILE_BASELINE/$TOTAL_BASELINE | $PASS_RUNTIME_BASELINE/$TOTAL_BASELINE |"
  echo "| with-adam | $PASS_COMPILE_ADAM/$TOTAL_ADAM | $PASS_RUNTIME_ADAM/$TOTAL_ADAM |"
} >> "$REPORT"

cp "$BACKUP_MCP" "$ORIG_MCP"
cp "$BACKUP_ROUTE" "$ORIG_ROUTE"
cat "$REPORT"
