#!/usr/bin/env bash
# Strip the auto-injected `<!-- gitnexus:start -->...<!-- gitnexus:end -->`
# block that `gitnexus analyze` writes into CLAUDE.md on first run.
#
# Usage: strip-gitnexus-block.sh <project-root>
#
# Idempotent: safe to call repeatedly; no-op when the markers aren't present.
# Exit codes: 0 = success (stripped or unchanged), 1 = bad args / IO error.
set -euo pipefail

ROOT="${1:-.}"
FILE="$ROOT/CLAUDE.md"

[ -f "$FILE" ] || { echo "no CLAUDE.md at $FILE — nothing to strip" >&2; exit 0; }

if ! grep -q '<!-- gitnexus:start -->' "$FILE"; then
  exit 0
fi

# Use awk for portable inline edit. Drop everything between the markers
# inclusive, plus a single leading blank line if present.
TMP="$(mktemp)"
awk '
  /<!-- gitnexus:start -->/ { skip = 1 }
  !skip { print }
  /<!-- gitnexus:end -->/   { skip = 0; next }
' "$FILE" > "$TMP"

# Trim trailing blank lines that the strip may have left behind.
awk 'NR==FNR{a[NR]=$0; n=NR; next} END{
  while (n > 0 && a[n] == "") n--
  for (i=1; i<=n; i++) print a[i]
}' "$TMP" "$TMP" > "$FILE"

rm -f "$TMP"
echo "stripped gitnexus block from $FILE"
