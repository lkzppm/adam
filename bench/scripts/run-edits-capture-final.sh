#!/usr/bin/env bash
# Final runner — adam with both MCP server (gitnexus) AND hooks active.
# Saves into bench/edits-final/. Restores lib/mcp.ts and route.ts before each task,
# re-indexes the bench dir before each task so the hook reads a fresh graph.
set -u
ROOT="/Users/lkz/Desktop/Code/adam"
TASKS="$ROOT/bench/scripts/tasks-final.json"
EDITS="$ROOT/bench/edits-final"
LOG="$ROOT/bench/scripts/run-edits-final.log"
SOURCE_MCP="/Users/lkz/Desktop/Code/portifolio/lib/mcp.ts"
SOURCE_ROUTE="/Users/lkz/Desktop/Code/portifolio/app/api/chat/route.ts"
CANONICAL_CLAUDE_MD="/Users/lkz/Desktop/Code/adam/bench/with-adam-CLAUDE.md"

ALLOWED_TOOLS_BASE="Read Edit Write Glob Grep"
ALLOWED_TOOLS_ADAM="$ALLOWED_TOOLS_BASE mcp__gitnexus__context mcp__gitnexus__query mcp__gitnexus__impact mcp__gitnexus__cypher mcp__gitnexus__detect_changes"

mkdir -p "$EDITS"
: > "$LOG"

restore_files() {
  local dir=$1
  cp "$SOURCE_MCP" "$dir/lib/mcp.ts"
  cp "$SOURCE_ROUTE" "$dir/app/api/chat/route.ts"
  # Always restore CLAUDE.md from the canonical fixture — `gitnexus analyze`
  # auto-injects a `<!-- gitnexus:start -->...<!-- gitnexus:end -->` block of
  # prescriptive rules on first run that biases the model toward extra
  # impact-analysis turns. We strip it back to the canonical text every task.
  cp "$CANONICAL_CLAUDE_MD" "$dir/CLAUDE.md"
}

run_one() {
  local id=$1 cond=$2 prompt=$3
  local dir tools
  if [ "$cond" = "baseline" ]; then
    dir=/tmp/bench/baseline
    tools="$ALLOWED_TOOLS_BASE"
    restore_files "$dir"
  else
    dir=/tmp/bench/with-adam
    tools="$ALLOWED_TOOLS_ADAM"
    restore_files "$dir"
    # Re-index AFTER restoring source so the graph matches the original code.
    # analyze re-injects the gitnexus block into CLAUDE.md, so we strip it
    # again right after.
    ( cd "$dir" && gitnexus analyze --skip-git >/dev/null 2>&1 )
    cp "$CANONICAL_CLAUDE_MD" "$dir/CLAUDE.md"
  fi
  local start_ts
  start_ts=$(date +%s)
  echo "[$(date +%H:%M:%S)] start $id $cond" | tee -a "$LOG"
  ( cd "$dir" && claude -p "$prompt" \
      --output-format json \
      --model sonnet \
      --allowedTools $tools ) > "$EDITS/$id-$cond.json" 2>>"$LOG"
  cp "$dir/lib/mcp.ts" "$EDITS/$id-$cond.ts"
  cp "$dir/app/api/chat/route.ts" "$EDITS/$id-$cond.route.ts" 2>/dev/null || true
  local end_ts duration
  end_ts=$(date +%s)
  duration=$((end_ts - start_ts))
  echo "[$(date +%H:%M:%S)] done  $id $cond (${duration}s)" | tee -a "$LOG"
}

N_TASKS=$(jq 'length' "$TASKS")
for i in $(seq 0 $((N_TASKS - 1))); do
  family=$(jq -r ".[$i].family" "$TASKS")
  id=$(jq -r ".[$i].id" "$TASKS")
  prompt=$(jq -r ".[$i].prompt" "$TASKS")
  echo "[$(date +%H:%M:%S)] === task $id ($family) ===" | tee -a "$LOG"

  # Run both conditions in parallel for every task so quality.sh has paired
  # `.ts` outputs for runtime probing.
  run_one "$id" "baseline" "$prompt" &
  pid_b=$!
  run_one "$id" "with-adam" "$prompt" &
  pid_w=$!
  wait $pid_b $pid_w
done

echo "[$(date +%H:%M:%S)] all done" | tee -a "$LOG"
