#!/usr/bin/env bash
# Diagnostic runner — runs ONE task with --output-format stream-json so we
# can inspect exactly which tools each condition called.
#
# Usage: bash run-trace.sh <task-id> <baseline|with-adam>
set -u
ROOT="/Users/lkz/Desktop/Code/adam"
HONO_SRC="/Users/lkz/Desktop/Code/hono"
TASKS="$ROOT/bench/scripts/tasks-final.json"
OUT="$ROOT/bench/results-hono"
CANONICAL_CLAUDE_MD="$ROOT/bench/with-adam-CLAUDE.md"
CANONICAL_SPEC_DIR="$ROOT/bench/with-adam-spec"
CANONICAL_MCP_JSON="$ROOT/bench/with-adam.mcp.json"

ALLOWED_TOOLS_ORIENT_BASE="Read Glob Grep"
ALLOWED_TOOLS_ORIENT_ADAM="$ALLOWED_TOOLS_ORIENT_BASE mcp__gitnexus__context mcp__gitnexus__query mcp__gitnexus__impact mcp__gitnexus__cypher"
ALLOWED_TOOLS_CODE_BASE="Read Edit Write Glob Grep MultiEdit"
ALLOWED_TOOLS_CODE_ADAM="$ALLOWED_TOOLS_CODE_BASE mcp__gitnexus__context mcp__gitnexus__impact"

RSYNC_EXCLUDES=(
  --exclude=node_modules --exclude=.git --exclude=dist
  --exclude=.gitnexus --exclude=.mcp.json --exclude=CLAUDE.md
  --exclude=spec --exclude=.claude
)

id="$1"; cond="$2"
family=$(jq -r --arg id "$id" '.[] | select(.id == $id) | .family' "$TASKS")
prompt=$(jq -r --arg id "$id" '.[] | select(.id == $id) | .prompt' "$TASKS")

if [ "$cond" = "baseline" ]; then
  dir=/tmp/bench/baseline
  if [ "$family" = "orient" ]; then tools="$ALLOWED_TOOLS_ORIENT_BASE"; else tools="$ALLOWED_TOOLS_CODE_BASE"; fi
else
  dir=/tmp/bench/with-adam
  if [ "$family" = "orient" ]; then tools="$ALLOWED_TOOLS_ORIENT_ADAM"; else tools="$ALLOWED_TOOLS_CODE_ADAM"; fi
fi

# Reset
rsync -a --delete-after "${RSYNC_EXCLUDES[@]}" "$HONO_SRC/" "$dir/"
rm -rf "$dir/.gitnexus" "$dir/.mcp.json" "$dir/spec" "$dir/CLAUDE.md" "$dir/AGENTS.md"

if [ "$cond" = "with-adam" ]; then
  rsync -a "$CANONICAL_SPEC_DIR/" "$dir/spec/"
  cp "$CANONICAL_MCP_JSON" "$dir/.mcp.json"
  ( cd "$dir" && gitnexus analyze --skip-git >/dev/null 2>&1 )
  bash "$ROOT/scripts/strip-gitnexus-block.sh" "$dir" >/dev/null 2>&1 || true
  rm -f "$dir/AGENTS.md"
  cp "$CANONICAL_CLAUDE_MD" "$dir/CLAUDE.md"
fi

mkdir -p "$OUT"
echo "running $id $cond..." >&2
( cd "$dir" && claude -p "$prompt" \
    --output-format stream-json --verbose \
    --model sonnet \
    --allowedTools $tools ) > "$OUT/$id-$cond.stream.jsonl" 2>&1
echo "trace written to $OUT/$id-$cond.stream.jsonl" >&2
