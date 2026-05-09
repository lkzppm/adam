#!/usr/bin/env bash
# Strip the auto-injected `<!-- gitnexus:start -->...<!-- gitnexus:end -->`
# block that `gitnexus analyze` writes into CLAUDE.md and AGENTS.md on first
# run. Both files get auto-loaded by Claude Code at session start, so leaving
# the prescriptive "MUST run gitnexus_impact" boilerplate in either pollutes
# the model's context and biases it toward expensive impact-analysis turns.
#
# Usage: strip-gitnexus-block.sh <project-root>
#
# Idempotent: safe to call repeatedly; no-op when the markers aren't present.
# Exit codes: 0 = success (stripped or unchanged), 1 = bad args / IO error.
set -euo pipefail

ROOT="${1:-.}"

strip_one() {
  local file=$1
  [ -f "$file" ] || return 0
  if ! grep -q '<!-- gitnexus:start -->' "$file"; then
    return 0
  fi

  local tmp
  tmp="$(mktemp)"
  awk '
    /<!-- gitnexus:start -->/ { skip = 1 }
    !skip { print }
    /<!-- gitnexus:end -->/   { skip = 0; next }
  ' "$file" > "$tmp"

  # Trim trailing blank lines that the strip may have left behind.
  awk 'NR==FNR{a[NR]=$0; n=NR; next} END{
    while (n > 0 && a[n] == "") n--
    for (i=1; i<=n; i++) print a[i]
  }' "$tmp" "$tmp" > "$file"

  rm -f "$tmp"
  echo "stripped gitnexus block from $file"
}

strip_one "$ROOT/CLAUDE.md"
strip_one "$ROOT/AGENTS.md"
