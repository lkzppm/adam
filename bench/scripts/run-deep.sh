#!/usr/bin/env bash
# Deep benchmark runner: 20 tasks × 2 conditions = 40 runs.
# Runs baseline and with-adam in parallel per task (different scratch dirs).
# Edit tasks restore lib/mcp.ts before each run.
set -u
ROOT="/Users/lkz/Desktop/Code/adam"
TASKS="$ROOT/bench/scripts/tasks.json"
RESULTS="$ROOT/bench/results"
LOG="$ROOT/bench/scripts/run.log"
SOURCE_MCP="/Users/lkz/Desktop/Code/portifolio/lib/mcp.ts"

mkdir -p "$RESULTS"
: > "$LOG"

run_one() {
  local id=$1 family=$2 cond=$3 prompt=$4
  local dir
  if [ "$cond" = "baseline" ]; then dir=/tmp/bench/baseline; else dir=/tmp/bench/with-adam; fi
  if [ "$family" = "edit" ]; then
    cp "$SOURCE_MCP" "$dir/lib/mcp.ts"
  fi
  local start_ts
  start_ts=$(date +%s)
  echo "[$(date +%H:%M:%S)] start $id $cond" | tee -a "$LOG"
  ( cd "$dir" && claude -p "$prompt" \
      --output-format json \
      --model sonnet \
      --allowedTools "Read Edit Write Glob Grep" ) > "$RESULTS/$id-$cond.json" 2>>"$LOG"
  local end_ts duration
  end_ts=$(date +%s)
  duration=$((end_ts - start_ts))
  echo "[$(date +%H:%M:%S)] done  $id $cond (${duration}s)" | tee -a "$LOG"
}

# Iterate tasks, fire baseline + with-adam in parallel, wait for both.
N_TASKS=$(jq 'length' "$TASKS")
for i in $(seq 0 $((N_TASKS - 1))); do
  id=$(jq -r ".[$i].id" "$TASKS")
  family=$(jq -r ".[$i].family" "$TASKS")
  prompt=$(jq -r ".[$i].prompt" "$TASKS")
  echo "[$(date +%H:%M:%S)] === task $((i+1))/$N_TASKS: $id ($family) ===" | tee -a "$LOG"
  run_one "$id" "$family" "baseline" "$prompt" &
  pid_b=$!
  run_one "$id" "$family" "with-adam" "$prompt" &
  pid_w=$!
  wait $pid_b $pid_w
done

echo "[$(date +%H:%M:%S)] all done" | tee -a "$LOG"
