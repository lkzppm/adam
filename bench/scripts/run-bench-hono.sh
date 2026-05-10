#!/usr/bin/env bash
# Hono benchmark runner — all 30 tasks (Orientation / Additive / Multi-coding)
# paired baseline vs with-adam.
#
# Strategy:
#   - One-time setup creates /tmp/bench/baseline + /tmp/bench/with-adam, each
#     a full copy of Hono with node_modules installed.
#   - Before each task we rsync src/ + tsconfig*.json from the canonical Hono
#     repo (excluding node_modules + .git) so each task starts clean.
#   - with-adam additionally has CLAUDE.md, spec/, .mcp.json, and a fresh
#     .gitnexus/ index per task.
#   - Tasks run paired (baseline + with-adam in parallel) with claude -p, JSON
#     output captured to bench/results-hono/.
#   - For coding tasks (additive + multi) we run tsc gate via tsconfig.build.json
#     (which excludes *.test.ts) and capture pass/fail + diff snapshot.
#   - Orient tasks have no edit tools allowed and no tsc gate — we just capture
#     the model's textual answer.

set -u
ROOT="/Users/lkz/Desktop/Code/adam"
HONO_SRC="/Users/lkz/Desktop/Code/hono"
TASKS="$ROOT/bench/scripts/tasks-final.json"
OUT="$ROOT/bench/results-hono"
LOG="$ROOT/bench/scripts/run-bench-hono.log"
CANONICAL_CLAUDE_MD="$ROOT/bench/with-adam-CLAUDE.md"
CANONICAL_SPEC_DIR="$ROOT/bench/with-adam-spec"
CANONICAL_MCP_JSON="$ROOT/bench/with-adam.mcp.json"

ALLOWED_TOOLS_ORIENT_BASE="Read Glob Grep"
ALLOWED_TOOLS_ORIENT_ADAM="$ALLOWED_TOOLS_ORIENT_BASE mcp__gitnexus__context mcp__gitnexus__query mcp__gitnexus__impact mcp__gitnexus__cypher"

ALLOWED_TOOLS_CODE_BASE="Read Edit Write Glob Grep MultiEdit"
ALLOWED_TOOLS_CODE_ADAM="$ALLOWED_TOOLS_CODE_BASE mcp__gitnexus__context mcp__gitnexus__impact"

# rsync excludes — keep node_modules from being touched between tasks
RSYNC_EXCLUDES=(
  --exclude=node_modules --exclude=.git --exclude=dist
  --exclude=.gitnexus --exclude=.mcp.json --exclude=CLAUDE.md
  --exclude=spec --exclude=.claude
)

mkdir -p "$OUT"
: > "$LOG"

# ── Setup phase (idempotent) ─────────────────────────────────────────────────
setup_scratch() {
  local dir=$1
  if [ ! -d "$dir/node_modules" ]; then
    echo "[$(date +%H:%M:%S)] bootstrapping $dir (full copy + bun install)" | tee -a "$LOG"
    mkdir -p "$dir"
    rsync -a --delete --exclude=.git --exclude=node_modules --exclude=dist "$HONO_SRC/" "$dir/"
    ( cd "$dir" && bun install --silent ) 2>>"$LOG" || true
  fi
}

# ── Per-task reset ────────────────────────────────────────────────────────────
reset_scratch() {
  local dir=$1
  rsync -a --delete-after "${RSYNC_EXCLUDES[@]}" "$HONO_SRC/" "$dir/"
  rm -rf "$dir/.gitnexus" "$dir/.mcp.json" "$dir/spec"
  rm -f "$dir/CLAUDE.md"
}

apply_adam_fixture() {
  local dir=$1
  rsync -a "$CANONICAL_SPEC_DIR/" "$dir/spec/"
  cp "$CANONICAL_MCP_JSON" "$dir/.mcp.json"
  # Re-index so the graph reflects current source. analyze auto-injects a
  # `<!-- gitnexus:start -->...<!-- gitnexus:end -->` block into both
  # CLAUDE.md and AGENTS.md (both files get auto-loaded by Claude Code), so
  # strip them, then write our canonical CLAUDE.md fixture on top.
  ( cd "$dir" && gitnexus analyze --skip-git >/dev/null 2>&1 )
  bash "$ROOT/scripts/utils/strip-gitnexus-block.sh" "$dir" >/dev/null 2>&1 || true
  rm -f "$dir/AGENTS.md"
  cp "$CANONICAL_CLAUDE_MD" "$dir/CLAUDE.md"
}

# ── Task runner ──────────────────────────────────────────────────────────────
run_one() {
  local id=$1 cond=$2 family=$3 prompt=$4
  local dir tools
  if [ "$cond" = "baseline" ]; then
    dir=/tmp/bench/baseline
    if [ "$family" = "orient" ]; then tools="$ALLOWED_TOOLS_ORIENT_BASE"; else tools="$ALLOWED_TOOLS_CODE_BASE"; fi
    reset_scratch "$dir"
  else
    dir=/tmp/bench/with-adam
    if [ "$family" = "orient" ]; then tools="$ALLOWED_TOOLS_ORIENT_ADAM"; else tools="$ALLOWED_TOOLS_CODE_ADAM"; fi
    reset_scratch "$dir"
    apply_adam_fixture "$dir"
  fi

  local start_ts
  start_ts=$(date +%s)
  echo "[$(date +%H:%M:%S)] start $id $cond ($family)" | tee -a "$LOG"
  ( cd "$dir" && claude -p "$prompt" \
      --output-format json \
      --model sonnet \
      --allowedTools $tools ) > "$OUT/$id-$cond.json" 2>>"$LOG"

  # tsc gate for coding tasks only
  if [ "$family" != "orient" ]; then
    local tsc_status="fail" tsc_errors=0
    if (cd "$dir" && npx --yes tsc --noEmit --project tsconfig.build.json) > "$OUT/$id-$cond.tsc.txt" 2>&1; then
      tsc_status="pass"
    else
      tsc_errors=$(grep -c "error TS" "$OUT/$id-$cond.tsc.txt" || true)
    fi
    # snapshot diff vs canonical Hono
    ( cd "$dir" && diff -ruN "$HONO_SRC" . 2>/dev/null \
        --exclude=node_modules --exclude=.git --exclude=dist \
        --exclude=.gitnexus --exclude=.mcp.json --exclude=CLAUDE.md \
        --exclude=spec --exclude=.claude ) > "$OUT/$id-$cond.diff" 2>/dev/null || true
    local end_ts duration
    end_ts=$(date +%s)
    duration=$((end_ts - start_ts))
    echo "[$(date +%H:%M:%S)] done  $id $cond (${duration}s) tsc=$tsc_status${tsc_errors:+ ($tsc_errors errs)}" | tee -a "$LOG"
  else
    local end_ts duration
    end_ts=$(date +%s)
    duration=$((end_ts - start_ts))
    echo "[$(date +%H:%M:%S)] done  $id $cond (${duration}s)" | tee -a "$LOG"
  fi
}

# ── Main ─────────────────────────────────────────────────────────────────────
echo "[$(date +%H:%M:%S)] === setup ===" | tee -a "$LOG"
setup_scratch /tmp/bench/baseline
setup_scratch /tmp/bench/with-adam

# Optional task filter via FAMILY env var (orient|additive|multi) or TASK_IDS env var
FAMILY_FILTER="${FAMILY:-}"
TASK_FILTER="${TASK_IDS:-}"

N_TASKS=$(jq 'length' "$TASKS")
for i in $(seq 0 $((N_TASKS - 1))); do
  family=$(jq -r ".[$i].family" "$TASKS")
  id=$(jq -r ".[$i].id" "$TASKS")
  prompt=$(jq -r ".[$i].prompt" "$TASKS")

  [ -n "$FAMILY_FILTER" ] && [ "$family" != "$FAMILY_FILTER" ] && continue
  [ -n "$TASK_FILTER" ] && [[ ",$TASK_FILTER," != *",$id,"* ]] && continue

  echo "[$(date +%H:%M:%S)] === task $id ($family) ===" | tee -a "$LOG"
  run_one "$id" "baseline" "$family" "$prompt" &
  pid_b=$!
  run_one "$id" "with-adam" "$family" "$prompt" &
  pid_w=$!
  wait $pid_b $pid_w
done

echo "[$(date +%H:%M:%S)] all done" | tee -a "$LOG"
