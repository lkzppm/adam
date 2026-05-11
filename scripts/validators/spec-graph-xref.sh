#!/usr/bin/env bash
# adam — spec ↔ graph cross-reference linter
#
# Walks every spec/**/*.md and verifies every code reference resolves:
#   • file paths mentioned in spec body must exist on disk
#   • backticked symbols inside `## Anchors` markdown tables must resolve in
#     the GitNexus graph
#
# Distinct from scripts/tools/check-anchors.sh: that one only inspects the
# `anchors:` frontmatter list and partitions specs into drifted/clean/
# unchecked for spec-update's fast-path. This script is a stricter, lint-
# style audit suitable for spec-audit and CI — it surfaces every dangling
# reference, not just the ones declared in frontmatter.
#
# Usage:
#   spec-graph-xref.sh [project-root]
#
# Output (stdout, single-line JSON):
#   {
#     "ok": bool,
#     "errors":   [ { "spec", "kind", "ref", "reason" } ],   # missing files
#     "warnings": [ { "spec", "kind", "ref", "reason" } ],   # unresolved symbols
#     "summary":  { "specs", "checked_paths", "checked_symbols" }
#   }
#
# Exit codes:
#   0 = ok=true,  1 = at least one error,
#   2 = repo not indexed,  3 = no spec/ directory,  4 = gitnexus missing
set -euo pipefail

ROOT="${1:-$(pwd -P)}"
ROOT="$(cd "$ROOT" && pwd -P)"

if ! command -v gitnexus >/dev/null 2>&1; then
  jq -nc '{ok:false, errors:[{kind:"env", ref:"gitnexus", reason:"CLI not on PATH"}], warnings:[], summary:{}}' >&2
  exit 4
fi
if ! command -v jq >/dev/null 2>&1; then
  echo '{"ok":false,"errors":[{"kind":"env","ref":"jq","reason":"required but not on PATH"}]}' >&2
  exit 4
fi
if [ ! -d "$ROOT/spec" ]; then
  jq -nc --arg r "$ROOT" \
    '{ok:false, errors:[{kind:"env", ref:($r+"/spec"), reason:"missing"}], warnings:[], summary:{}}' >&2
  exit 3
fi

detect_repo_alias() {
  local target="$1"
  gitnexus list 2>/dev/null | awk -v t="$target" '
    /^  [^ ]/ && NF == 1 { alias = $1; next }
    $1 == "Path:" {
      $1 = ""; sub(/^ +/, "")
      if ($0 == t) { print alias; exit }
    }
  '
}
REPO="$(detect_repo_alias "$ROOT" || true)"
if [ -z "$REPO" ]; then
  jq -nc --arg r "$ROOT" \
    '{ok:false, errors:[{kind:"env", ref:$r, reason:"not registered with gitnexus"}], warnings:[], summary:{}}' >&2
  exit 2
fi

# Extract candidate file-path references from a spec body. We look for
# backticked tokens that contain a forward slash AND a dot — the standard
# shape for "src/foo.ts", "app/api/route.ts", "core/utils/helpers.py".
# Frontmatter is skipped via a sed range; backticked tokens are pulled with
# grep -oE; the awk filter at the end keeps only the path-shaped ones.
extract_paths() {
  local spec="$1"
  # 1) Strip frontmatter (the awk version was tangling with character classes).
  # 2) grep for `...` runs (one per line).
  # 3) awk filter for tokens with / and . and no whitespace, no leading slash/dot.
  awk 'NR==1 && /^---[[:space:]]*$/ { in_fm = 1; next }
       in_fm && /^---[[:space:]]*$/ { in_fm = 0; next }
       !in_fm { print }' "$spec" \
    | grep -oE '`[^`]+`' \
    | sed -E 's/^`(.+)`$/\1/' \
    | awk '
        {
          tok = $0
          if (tok ~ /[[:space:]]/) next
          if (index(tok, "/") == 0) next
          if (index(tok, ".") == 0) next
          first = substr(tok, 1, 1)
          if (first == "/" || first == ".") next
          # Strip trailing punctuation.
          sub(/[\),:;]+$/, "", tok)
          # Trim a trailing dot — common at end-of-sentence — but only if
          # there is another dot earlier (so "src/foo.ts." → "src/foo.ts").
          if (substr(tok, length(tok), 1) == "." && index(substr(tok, 1, length(tok)-1), ".") > 0) {
            tok = substr(tok, 1, length(tok)-1)
          }
          print tok
        }'
}

# Extract symbol names from `## Anchors` markdown tables. The convention is:
#   | `<symbol>` | `gitnexus_*(...)` |
# We pull the first backticked token on rows under an `## Anchors` heading,
# until the next `##` heading or EOF.
extract_anchor_symbols() {
  local spec="$1"
  awk '
    BEGIN              { in_section = 0 }
    /^##[[:space:]]+Anchors([[:space:]]|$)/ { in_section = 1; next }
    /^##[[:space:]]/   { in_section = 0 }
    in_section == 0    { next }
    /^\|/ {
      # Skip header / separator rows.
      if ($0 ~ /^\|[[:space:]]*Symbol/)        next
      if ($0 ~ /^\|[[:space:]]*-/ || $0 ~ /^\|[[:space:]]*:/) next
      # First backticked token in the row.
      if (match($0, /`[^`]+`/)) {
        tok = substr($0, RSTART + 1, RLENGTH - 2)
        # Only treat as symbol if it looks like an identifier (no slash, no dot).
        if (tok ~ /^[A-Za-z_][A-Za-z0-9_]*$/) print tok
      }
    }
  ' "$spec"
}

resolve_symbol() {
  local sym="$1" file_hint="${2:-}"
  local result
  if [ -n "$file_hint" ]; then
    result="$(gitnexus context -r "$REPO" -f "$file_hint" "$sym" 2>/dev/null || echo '{}')"
  else
    result="$(gitnexus context -r "$REPO" "$sym" 2>/dev/null || echo '{}')"
  fi
  case "$(jq -r '.status // ""' <<<"$result")" in
    found|ambiguous) echo "ok" ;;
    *)               echo "missing" ;;
  esac
}

ERRORS='[]'
WARNINGS='[]'
SPEC_COUNT=0
PATH_COUNT=0
SYMBOL_COUNT=0

while IFS= read -r spec; do
  case "$spec" in
    */INDEX.md|*/rules/*) continue ;;
  esac
  SPEC_COUNT=$((SPEC_COUNT + 1))
  rel="${spec#$ROOT/}"

  # Disk-existence check for path mentions.
  while IFS= read -r p; do
    [ -z "$p" ] && continue
    PATH_COUNT=$((PATH_COUNT + 1))
    if [ ! -e "$ROOT/$p" ]; then
      ERRORS="$(jq -c --arg s "$rel" --arg p "$p" \
        '. + [{spec:$s, kind:"path", ref:$p, reason:"file not found in working tree"}]' <<<"$ERRORS")"
    fi
  done < <(extract_paths "$spec" | sort -u)

  # Graph-resolution check for anchors-table symbols.
  while IFS= read -r sym; do
    [ -z "$sym" ] && continue
    SYMBOL_COUNT=$((SYMBOL_COUNT + 1))
    if [ "$(resolve_symbol "$sym")" = "missing" ]; then
      WARNINGS="$(jq -c --arg s "$rel" --arg n "$sym" \
        '. + [{spec:$s, kind:"symbol", ref:$n, reason:"unresolved in gitnexus graph"}]' <<<"$WARNINGS")"
    fi
  done < <(extract_anchor_symbols "$spec" | sort -u)
done < <(find "$ROOT/spec" -type f -name '*.md' 2>/dev/null | sort)

OK=true
[ "$(jq 'length' <<<"$ERRORS")" -gt 0 ] && OK=false

jq -nc \
  --argjson ok "$OK" \
  --argjson errors "$ERRORS" \
  --argjson warnings "$WARNINGS" \
  --argjson specs "$SPEC_COUNT" \
  --argjson paths "$PATH_COUNT" \
  --argjson syms "$SYMBOL_COUNT" \
  '{
    ok: $ok,
    errors: $errors,
    warnings: $warnings,
    summary: { specs: $specs, checked_paths: $paths, checked_symbols: $syms }
  }'

[ "$OK" = "true" ] && exit 0 || exit 1
