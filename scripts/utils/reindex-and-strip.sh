#!/usr/bin/env bash
# adam — chained re-index + cleanup
#
# Called detached by the PostToolUse hook after every Edit/Write/MultiEdit so
# the next prompt sees a fresh graph AND a clean CLAUDE.md/AGENTS.md. Order
# matters: `gitnexus analyze` re-injects its `<!-- gitnexus:start --> ...
# <!-- gitnexus:end -->` block back into both files on every run, so we strip
# AFTER the analyze finishes. Without this chain the boilerplate resurfaces
# after every edit.
#
# Best-effort: every step is silently tolerated so a missing gitnexus binary,
# a stale lock, or an unwritable CLAUDE.md never breaks the user's prompt.
#
# Usage: reindex-and-strip.sh <project-root>
set -u

ROOT="${1:-.}"
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}"

cd "$ROOT" 2>/dev/null || exit 0

if command -v gitnexus >/dev/null 2>&1; then
  gitnexus analyze --skip-git >/dev/null 2>&1 || true
else
  npx -y gitnexus analyze --skip-git >/dev/null 2>&1 || true
fi

bash "$PLUGIN_ROOT/scripts/utils/strip-gitnexus-block.sh" "$ROOT" >/dev/null 2>&1 || true
