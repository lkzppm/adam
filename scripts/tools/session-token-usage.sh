#!/usr/bin/env bash
# adam — session token usage report
#
# Aggregates token usage across every assistant message in the current Claude
# Code session transcript and emits a JSON summary. The setup skill calls this
# in Phase 7 to surface a "tokens consumed" line in the final brief so users
# can see how much running /adam:setup cost.
#
# Best-effort: locates the most recently-modified session file under
#   ~/.claude/projects/<slug>/<session-id>.jsonl
# where <slug> is the project root with every "/" replaced by "-" (Claude Code's
# encoding — e.g. /home/me/code/foo → -home-me-code-foo).
#
# If jq is missing, the session dir doesn't exist, or no .jsonl is present, the
# script emits {"status":"error",...} and exits 0 — never break the brief over
# a missing optional metric.
#
# The aggregate is **session-wide**: if the user ran other commands before
# /adam:setup in the same session, those tokens are included too. /setup is a
# one-shot bootstrap, usually the first thing in a fresh session, so the count
# is typically dominated by setup work.
#
# Usage:
#   session-token-usage.sh [project-root]
#
# Output (stdout, single-line JSON):
#   { "status":"ok", "session":"<file>",
#     "total":N, "input":N, "output":N,
#     "cache_creation":N, "cache_read":N, "turns":N }
#   { "status":"error", "message":"..." }
set -euo pipefail

ROOT="${1:-$(pwd -P)}"
ROOT="$(cd "$ROOT" && pwd -P)"

if ! command -v jq >/dev/null 2>&1; then
  echo '{"status":"error","message":"jq required but not on PATH"}'
  exit 0
fi

SLUG="${ROOT//\//-}"
SESSIONS_DIR="$HOME/.claude/projects/$SLUG"

if [ ! -d "$SESSIONS_DIR" ]; then
  jq -nc --arg m "no session dir at $SESSIONS_DIR" '{status:"error", message:$m}'
  exit 0
fi

LATEST="$(find "$SESSIONS_DIR" -maxdepth 1 -name '*.jsonl' -printf '%T@\t%p\n' 2>/dev/null \
  | sort -nr | head -1 | cut -f2-)"
if [ -z "$LATEST" ]; then
  jq -nc --arg d "$SESSIONS_DIR" '{status:"error", message:("no .jsonl in " + $d)}'
  exit 0
fi

USAGE_AGG="$(
  jq -c '.message?.usage // empty' "$LATEST" 2>/dev/null \
  | jq -s '
      reduce .[] as $u (
        {input:0, output:0, cache_creation:0, cache_read:0, turns:0};
        .input            += ($u.input_tokens                 // 0)
        | .output         += ($u.output_tokens                // 0)
        | .cache_creation += ($u.cache_creation_input_tokens  // 0)
        | .cache_read     += ($u.cache_read_input_tokens      // 0)
        | .turns          += 1
      )
      | . + {total:(.input + .output + .cache_creation + .cache_read)}
    ' 2>/dev/null
)"
USAGE_AGG="${USAGE_AGG:-{\}}"

jq -nc --arg sess "$LATEST" --argjson agg "$USAGE_AGG" \
  '{status:"ok", session:$sess} + $agg'
