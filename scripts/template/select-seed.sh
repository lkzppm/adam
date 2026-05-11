#!/usr/bin/env bash
# adam — stack-specific spec seed selector
#
# Inspects the project's manifest files (package.json, pyproject.toml,
# requirements.txt, manage.py) and emits the path of the matching seed
# template under templates/specs/<stack>.md. The `spec-create` skill reads
# this seed and passes its skeleton to the adam agent so new specs land on
# the conventional layout for the detected stack instead of being invented
# from scratch each time.
#
# Usage:
#   select-seed.sh [project-root]
#
# Output (stdout, single-line JSON):
#   { "status": "ok", "stack": "<name>",      "seed": "<absolute path>" }
#   { "status": "ok", "stack": "unknown",     "seed": null }
#
# Exit codes:
#   0 = ok, JSON on stdout (stack may be "unknown" — that's not an error)
set -euo pipefail

ROOT="${1:-$(pwd -P)}"
ROOT="$(cd "$ROOT" && pwd -P)"
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}"
SEEDS_DIR="$PLUGIN_ROOT/templates/specs"

if ! command -v jq >/dev/null 2>&1; then
  echo '{"status":"error","message":"jq required but not on PATH"}' >&2
  exit 1
fi

emit() {
  local stack="$1" seed="$2"
  if [ -z "$seed" ]; then
    jq -nc --arg s "$stack" '{status:"ok", stack:$s, seed:null}'
  else
    jq -nc --arg s "$stack" --arg p "$seed" '{status:"ok", stack:$s, seed:$p}'
  fi
}

# Collect raw signals first; pick a winner with explicit precedence below.
HAS_NEXT=0; HAS_HONO=0; HAS_FASTAPI=0; HAS_DJANGO=0

if [ -f "$ROOT/package.json" ] && command -v jq >/dev/null 2>&1; then
  if jq -e '(.dependencies // {}) | has("next")' "$ROOT/package.json" >/dev/null 2>&1; then
    HAS_NEXT=1
  fi
  if jq -e '(.dependencies // {}) | has("hono")' "$ROOT/package.json" >/dev/null 2>&1; then
    HAS_HONO=1
  fi
  # devDependencies is sometimes where frameworks land in monorepos.
  if jq -e '(.devDependencies // {}) | has("next")' "$ROOT/package.json" >/dev/null 2>&1; then
    HAS_NEXT=1
  fi
  if jq -e '(.devDependencies // {}) | has("hono")' "$ROOT/package.json" >/dev/null 2>&1; then
    HAS_HONO=1
  fi
fi

# Python: check pyproject.toml deps tables and requirements*.txt as a fallback.
if [ -f "$ROOT/pyproject.toml" ]; then
  if grep -Eq '^[[:space:]]*"?fastapi"?[[:space:]]*[=~><]' "$ROOT/pyproject.toml" 2>/dev/null \
     || grep -Eq 'fastapi[[:space:]]*=' "$ROOT/pyproject.toml" 2>/dev/null; then
    HAS_FASTAPI=1
  fi
  if grep -Eqi '^[[:space:]]*"?django"?[[:space:]]*[=~><]' "$ROOT/pyproject.toml" 2>/dev/null \
     || grep -Eqi 'django[[:space:]]*=' "$ROOT/pyproject.toml" 2>/dev/null; then
    HAS_DJANGO=1
  fi
fi

for req in "$ROOT/requirements.txt" "$ROOT/requirements-dev.txt" "$ROOT/requirements/base.txt"; do
  [ -f "$req" ] || continue
  grep -Eqi '^fastapi([[:space:]]|=|<|>|~|$)' "$req" && HAS_FASTAPI=1
  grep -Eqi '^django([[:space:]]|=|<|>|~|$)' "$req"  && HAS_DJANGO=1
done

[ -f "$ROOT/manage.py" ] && HAS_DJANGO=1

# Precedence: a project with both Next.js and Hono is "next" (Hono is usually
# a sub-router on Next workers); a project with both FastAPI and Django would
# pick fastapi (rare but explicit). Tweak as fixtures emerge.
STACK=""
if   [ "$HAS_NEXT"    -eq 1 ]; then STACK="nextjs"
elif [ "$HAS_HONO"    -eq 1 ]; then STACK="hono"
elif [ "$HAS_FASTAPI" -eq 1 ]; then STACK="fastapi"
elif [ "$HAS_DJANGO"  -eq 1 ]; then STACK="django"
fi

if [ -z "$STACK" ]; then
  emit "unknown" ""
  exit 0
fi

SEED="$SEEDS_DIR/$STACK.md"
if [ ! -f "$SEED" ]; then
  # Detected stack but seed file is missing — surface as unknown rather than
  # fail loudly; the caller can still proceed with no seed.
  emit "unknown" ""
  exit 0
fi

emit "$STACK" "$SEED"
