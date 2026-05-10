#!/usr/bin/env bash
# adam — anchor drift check
#
# Walks every spec/**/*.md, parses the optional `anchors:` list in frontmatter,
# and asks GitNexus to resolve each anchor. Specs whose anchors all resolve
# are clean and can be skipped by `/adam:spec-update`. Specs with at least one
# missing anchor are drifted — only those need the agent to look at them.
# Specs with no `anchors:` frontmatter are reported as `unchecked` so the
# caller can fall back to the legacy "agent re-reads everything" flow without
# false-positive drift signals.
#
# Usage:
#   check-anchors.sh [project-root]
#
# Anchor frontmatter format (YAML block list):
#   anchors:
#     - <file>:<symbol>                 # adam will let gitnexus disambiguate
#     - <Kind>:<file>:<symbol>          # exact UID, zero-ambiguity
#
# Output (stdout, single-line JSON):
#   {
#     "status": "ok",
#     "repo":   "<gitnexus alias>",
#     "summary": { "total": N, "drifted": N, "clean": N, "unchecked": N },
#     "drifted":   [ { "spec": "...", "missing": [ { "anchor", "file", "symbol" } ] } ],
#     "clean":     [ { "spec": "...", "anchor_count": N } ],
#     "unchecked": [ { "spec": "...", "reason": "..." } ]
#   }
#
# Exit codes:
#   0 = ok (briefing on stdout, regardless of drift count)
#   1 = gitnexus CLI missing
#   2 = repo not indexed
#   3 = no spec/ directory
set -euo pipefail

ROOT="${1:-$(pwd -P)}"
ROOT="$(cd "$ROOT" && pwd -P)"

if ! command -v gitnexus >/dev/null 2>&1; then
  jq -nc '{status:"error", code:1, message:"gitnexus CLI not on PATH"}' >&2
  exit 1
fi
if ! command -v jq >/dev/null 2>&1; then
  echo '{"status":"error","message":"jq required but not on PATH"}' >&2
  exit 1
fi
if [ ! -d "$ROOT/spec" ]; then
  jq -nc --arg r "$ROOT" \
    '{status:"error", code:3, message:("no spec/ directory at " + $r)}' >&2
  exit 3
fi

# Same alias-detection trick as spec-preflight.sh.
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
    '{status:"error", code:2, message:("repo at " + $r + " not registered with gitnexus. Run `gitnexus analyze` first.")}' >&2
  exit 2
fi

# Extract anchor entries from a spec's frontmatter. Supported shape:
#   anchors:
#     - foo
#     - bar
# Non-block forms are intentionally not parsed — the convention is the block
# form (matches the rest of the spec frontmatter style adam ships).
extract_anchors() {
  local spec="$1"
  awk '
    BEGIN              { in_fm = 0; in_anchors = 0 }
    /^---[[:space:]]*$/{
      if (in_fm == 0) { in_fm = 1; next }
      else            { exit }
    }
    in_fm == 0         { next }
    /^anchors:[[:space:]]*$/ { in_anchors = 1; next }
    in_anchors == 1 {
      if (/^[[:space:]]+-[[:space:]]+/) {
        sub(/^[[:space:]]+-[[:space:]]+/, "", $0)
        # Strip surrounding quotes if present.
        gsub(/^["'\'']|["'\'']$/, "", $0)
        print $0
      } else if (/^[a-zA-Z_]/) {
        in_anchors = 0
      }
    }
  ' "$spec" 2>/dev/null
}

# Resolve a single anchor against the graph. Anchor format:
#   file:symbol            (1 colon → -f file symbol)
#   Kind:file:symbol       (≥2 colons → --uid Kind:file:symbol)
# Echos "ok" or "missing".
resolve_anchor() {
  local anchor="$1"
  local colons="${anchor//[^:]/}"
  local n_colons=${#colons}
  local result

  if [ "$n_colons" -ge 2 ]; then
    result="$(gitnexus context -r "$REPO" --uid "$anchor" 2>/dev/null || echo '{}')"
  elif [ "$n_colons" -eq 1 ]; then
    local file="${anchor%:*}" sym="${anchor##*:}"
    result="$(gitnexus context -r "$REPO" -f "$file" "$sym" 2>/dev/null || echo '{}')"
  else
    # Bare symbol — not enough info to lookup deterministically. Skip.
    echo "missing"
    return
  fi

  case "$(jq -r '.status // ""' <<<"$result")" in
    found|ambiguous) echo "ok" ;;
    *)               echo "missing" ;;
  esac
}

# Walk every *.md under spec/ (any depth, since adam ships nested project/,
# concepts/, rules/ folders). Skip INDEX.md and rules/ — those don't carry
# anchors by design.
SPEC_FILES=()
while IFS= read -r f; do
  case "$f" in
    */INDEX.md|*/rules/*) continue ;;
  esac
  SPEC_FILES+=("$f")
done < <(find "$ROOT/spec" -type f -name '*.md' 2>/dev/null | sort)

# Per-bucket JSON arrays we'll merge at the end.
DRIFTED='[]'
CLEAN='[]'
UNCHECKED='[]'

for spec in "${SPEC_FILES[@]+"${SPEC_FILES[@]}"}"; do
  rel="${spec#$ROOT/}"
  ANCHORS=()
  while IFS= read -r a; do
    [ -n "$a" ] && ANCHORS+=("$a")
  done < <(extract_anchors "$spec" | sort -u)

  if [ ${#ANCHORS[@]} -eq 0 ]; then
    UNCHECKED="$(jq -c --arg s "$rel" \
      '. + [{spec:$s, reason:"no anchors frontmatter"}]' <<<"$UNCHECKED")"
    continue
  fi

  MISSING='[]'
  for anchor in "${ANCHORS[@]}"; do
    if [ "$(resolve_anchor "$anchor")" = "missing" ]; then
      colons="${anchor//[^:]/}"
      if [ ${#colons} -ge 2 ]; then
        # Kind:file:symbol form
        kind="${anchor%%:*}"
        rest="${anchor#*:}"
        file="${rest%:*}"
        sym="${rest##*:}"
      else
        kind=""
        file="${anchor%:*}"
        sym="${anchor##*:}"
      fi
      MISSING="$(jq -c --arg a "$anchor" --arg f "$file" --arg s "$sym" --arg k "$kind" \
        '. + [{anchor:$a, file:$f, symbol:$s, kind:$k}]' <<<"$MISSING")"
    fi
  done

  if [ "$(jq 'length' <<<"$MISSING")" -gt 0 ]; then
    DRIFTED="$(jq -c --arg s "$rel" --argjson m "$MISSING" \
      '. + [{spec:$s, missing:$m}]' <<<"$DRIFTED")"
  else
    CLEAN="$(jq -c --arg s "$rel" --argjson n "${#ANCHORS[@]}" \
      '. + [{spec:$s, anchor_count:$n}]' <<<"$CLEAN")"
  fi
done

jq -nc \
  --arg repo "$REPO" \
  --argjson drifted "$DRIFTED" \
  --argjson clean "$CLEAN" \
  --argjson unchecked "$UNCHECKED" \
  '{
    status: "ok",
    repo: $repo,
    summary: {
      total: (($drifted | length) + ($clean | length) + ($unchecked | length)),
      drifted: ($drifted | length),
      clean: ($clean | length),
      unchecked: ($unchecked | length)
    },
    drifted: $drifted,
    clean: $clean,
    unchecked: $unchecked
  }'
