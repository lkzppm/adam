#!/usr/bin/env bash
# adam — bench regression guard
#
# Runs a six-task subset of the Hono bench (two tasks per family) and
# compares the with-adam costs against bench/baseline.json. Exits non-zero
# if any family's mean cost regressed by more than the configured threshold
# (default 10 %).
#
# This is a *manual-trigger* gate. It actually invokes `claude -p` ~12 times
# (six tasks × two conditions) — real money per run. Do not wire it into a
# push-triggered CI job. Run it before/after a substantive change to the
# spec-create / spec-update / setup pipeline to confirm the change didn't
# silently regress the cost win.
#
# Usage:
#   scripts/bench/regression.sh           # run subset + compare
#   scripts/bench/regression.sh --check   # just compare existing results
#   scripts/bench/regression.sh --update-baseline   # capture current run as new baseline
#
# Output: a markdown table on stdout + a non-zero exit code when regressed.
set -euo pipefail

PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}"
BASELINE="$PLUGIN_ROOT/bench/baseline.json"
RESULTS="$PLUGIN_ROOT/bench/results-hono"
RUNNER="$PLUGIN_ROOT/bench/scripts/run-bench-hono.sh"

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required" >&2
  exit 1
fi
if [ ! -f "$BASELINE" ]; then
  echo "baseline missing at $BASELINE" >&2
  exit 1
fi

MODE="run"
case "${1:-}" in
  --check)            MODE="check" ;;
  --update-baseline)  MODE="update" ;;
  --help|-h)
    sed -n '2,/^set -/p' "$0" | sed 's/^# \?//' | head -25
    exit 0 ;;
esac

# Load the locked subset and threshold from baseline.json.
SUBSET=$(jq -r '.subset_task_ids | join(",")' "$BASELINE")
THRESHOLD=$(jq -r '.regression_threshold_pct' "$BASELINE")

if [ "$MODE" = "run" ] || [ "$MODE" = "update" ]; then
  if [ ! -f "$RUNNER" ]; then
    echo "bench runner not found at $RUNNER" >&2
    exit 1
  fi
  echo "▶ running regression subset: $SUBSET" >&2
  TASK_IDS="$SUBSET" bash "$RUNNER" >&2
fi

# Read the current with-adam costs for the subset.
read_cost() {
  local id="$1"
  local f="$RESULTS/$id-with-adam.json"
  if [ ! -f "$f" ]; then echo "missing"; return; fi
  jq -r '.total_cost_usd // "missing"' "$f"
}

# If just updating the baseline, write the current numbers back into baseline.json.
if [ "$MODE" = "update" ]; then
  TMP="$(mktemp)"
  jq --arg date "$(date +%Y-%m-%d)" '
    .captured = $date
    | .with_adam |= with_entries(
        .key as $id
        | .value as $v
        | .value = $v
      )
  ' "$BASELINE" > "$TMP"

  # Now overwrite each per-task cost with the freshly run value.
  for id in $(jq -r '.subset_task_ids[]' "$BASELINE"); do
    cost="$(read_cost "$id")"
    if [ "$cost" = "missing" ]; then
      echo "no result for $id — aborting baseline update" >&2
      rm -f "$TMP"
      exit 1
    fi
    jq --arg id "$id" --argjson c "$cost" \
      '.with_adam[$id].cost_usd = $c' "$TMP" > "$TMP.next" && mv "$TMP.next" "$TMP"
  done

  # Recompute by_family_mean_usd from the freshly written per-task costs.
  jq '
    .with_adam as $w
    | .by_family_mean_usd = (
        $w
        | to_entries
        | group_by(.value.family)
        | map({key: .[0].value.family, value: ((map(.value.cost_usd) | add) / length)})
        | from_entries
      )
  ' "$TMP" > "$TMP.next" && mv "$TMP.next" "$TMP"

  mv "$TMP" "$BASELINE"
  echo "✓ baseline updated" >&2
  echo "$(jq '.by_family_mean_usd' "$BASELINE")" >&2
  exit 0
fi

# ── Compare current run to baseline ──────────────────────────────────────────
echo
echo "## adam bench regression — subset n=$(jq '.subset_task_ids | length' "$BASELINE")"
echo
printf "| Task | Family | Baseline | Current | Δ |\n"
printf "|---|---|---:|---:|---:|\n"

regressed=0
for id in $(jq -r '.subset_task_ids[]' "$BASELINE"); do
  base=$(jq -r --arg id "$id" '.with_adam[$id].cost_usd' "$BASELINE")
  family=$(jq -r --arg id "$id" '.with_adam[$id].family' "$BASELINE")
  curr="$(read_cost "$id")"
  if [ "$curr" = "missing" ]; then
    printf "| %s | %s | \$%.4f | — | (no result) |\n" "$id" "$family" "$base"
    regressed=1
    continue
  fi
  delta_pct=$(jq -nr --argjson b "$base" --argjson c "$curr" '(($c - $b) / $b) * 100')
  printf "| %s | %s | \$%.4f | \$%.4f | %+.1f%% |\n" "$id" "$family" "$base" "$curr" "$delta_pct"
done

echo
echo "## by-family means"
echo
printf "| Family | Baseline mean | Current mean | Δ | Verdict |\n"
printf "|---|---:|---:|---:|---|\n"

# Per-family comparison: if any family's current mean exceeds baseline mean by
# more than the threshold, mark the run as regressed.
for family in orient additive multi; do
  base_mean=$(jq -r --arg f "$family" '.by_family_mean_usd[$f]' "$BASELINE")
  ids_in_family=$(jq -r --arg f "$family" \
    '[.with_adam | to_entries[] | select(.value.family == $f) | .key] | join(" ")' \
    "$BASELINE")
  total=0; count=0
  for id in $ids_in_family; do
    c="$(read_cost "$id")"
    [ "$c" = "missing" ] && continue
    total=$(jq -nr --argjson t "$total" --argjson v "$c" '$t + $v')
    count=$((count + 1))
  done
  if [ "$count" -eq 0 ]; then
    printf "| %s | \$%.4f | — | — | NO DATA |\n" "$family" "$base_mean"
    regressed=1
    continue
  fi
  curr_mean=$(jq -nr --argjson t "$total" --argjson n "$count" '$t / $n')
  delta_pct=$(jq -nr --argjson b "$base_mean" --argjson c "$curr_mean" '(($c - $b) / $b) * 100')
  verdict="ok"
  if jq -e -nr --argjson d "$delta_pct" --argjson th "$THRESHOLD" '$d > $th' >/dev/null; then
    verdict="REGRESSED"
    regressed=1
  fi
  printf "| %s | \$%.4f | \$%.4f | %+.1f%% | %s |\n" \
    "$family" "$base_mean" "$curr_mean" "$delta_pct" "$verdict"
done

echo
if [ "$regressed" -eq 0 ]; then
  echo "✓ no regression beyond ${THRESHOLD}%"
else
  echo "✗ at least one family regressed beyond ${THRESHOLD}% — investigate before merging."
fi

exit "$regressed"
