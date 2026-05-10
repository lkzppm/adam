#!/usr/bin/env bash
# adam — spec-create preflight
#
# Given a topic (and optional code-path hints), ask the GitNexus knowledge
# graph what's relevant in the project and emit a structured JSON briefing.
# The `spec-create` skill calls this BEFORE delegating to the adam agent so
# the agent starts with a code-grounded shortlist of symbols/files instead
# of grepping its way to them.
#
# Usage:
#   spec-preflight.sh <topic> [path-hint ...]
#
# Output (stdout, single-line JSON):
#   {
#     "status": "ok",
#     "topic": "<topic>",
#     "repo":  "<gitnexus alias>",
#     "summary": { "symbol_count": N, "file_count": N, "primary_files": [...] },
#     "candidates": [
#       { "name", "uid", "kind", "file", "line", "incoming": [...], "outgoing": [...] }
#     ],
#     "search_processes": [...],
#     "path_hints": [...]
#   }
#
# Exit codes:
#   0 = ok, briefing on stdout
#   1 = gitnexus CLI missing
#   2 = current repo not indexed (run `gitnexus analyze` first)
#   3 = bad arguments
set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo '{"status":"error","message":"usage: spec-preflight.sh <topic> [path-hint ...]"}' >&2
  exit 3
fi

TOPIC="$1"; shift
PATH_HINTS=("$@")
ROOT="$(pwd -P)"

emit_error() {
  local code="$1" msg="$2"
  jq -nc --arg msg "$msg" --arg code "$code" \
    '{status:"error", code:($code|tonumber), message:$msg}'
}

if ! command -v gitnexus >/dev/null 2>&1; then
  emit_error 1 "gitnexus CLI not on PATH. Install with: npm install -g gitnexus" >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo '{"status":"error","message":"jq required but not on PATH"}' >&2
  exit 1
fi

# Resolve the gitnexus alias for this project. `gitnexus list` prints blocks
# of `  <alias>\n    Path: <path>\n    ...`. We scan for the block whose Path
# matches $ROOT (resolved) and emit its alias.
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
  emit_error 2 "current path is not registered with gitnexus. Run 'gitnexus analyze' from $ROOT first." >&2
  exit 2
fi

# 1. Search the graph for processes/definitions related to the topic. The
# gitnexus CLI prints a noisy startup banner to stderr (FTS index warnings)
# that we drop on the floor — we only care about the JSON body on stdout.
QUERY_JSON="$(gitnexus query -r "$REPO" -l 5 "$TOPIC" 2>/dev/null || echo '{}')"

# 2. Pull candidate symbol names: definitions[].name (preferred), then any
# unique symbols mentioned by name in process_symbols[]. Portable read loop
# instead of mapfile (bash 3.2 on macOS does not have mapfile).
CANDIDATE_NAMES=()
while IFS= read -r line; do
  [ -n "$line" ] && CANDIDATE_NAMES+=("$line")
done < <(
  jq -r '
    [(.definitions // [])[].name?,
     (.process_symbols // [])[].name?]
    | map(select(. != null and . != ""))
    | unique
    | .[]
  ' <<<"$QUERY_JSON" 2>/dev/null
)

# Cap candidate fan-out to 8 — beyond that the briefing balloons without
# adding useful signal. Keep symbol names from path_hints in priority order.
declare -a SHORTLIST=()
for hint in "${PATH_HINTS[@]+"${PATH_HINTS[@]}"}"; do
  [ ${#SHORTLIST[@]} -ge 8 ] && break
  # If hint looks like a symbol (no slashes), include it directly.
  if [[ "$hint" != */* ]]; then
    SHORTLIST+=("$hint")
  fi
done
for name in "${CANDIDATE_NAMES[@]+"${CANDIDATE_NAMES[@]}"}"; do
  [ ${#SHORTLIST[@]} -ge 8 ] && break
  SHORTLIST+=("$name")
done

# 3. For each shortlisted symbol, fetch a 360-degree context block.
# `gitnexus context` returns either {status:"ambiguous", candidates:[...]} or
# {symbol:{...}, incoming:[...], outgoing:[...]}; we capture both shapes.
CONTEXT_ARRAY="["
first=1
for name in "${SHORTLIST[@]+"${SHORTLIST[@]}"}"; do
  ctx="$(gitnexus context -r "$REPO" "$name" 2>/dev/null || echo '{}')"
  # If ambiguous, take the first candidate and re-query with its UID.
  uid="$(jq -r 'select(.status=="ambiguous") | .candidates[0].uid // empty' <<<"$ctx")"
  if [ -n "$uid" ]; then
    ctx="$(gitnexus context -r "$REPO" --uid "$uid" 2>/dev/null || echo "$ctx")"
  fi
  enriched="$(jq -c --arg name "$name" '. + {requested_name: $name}' <<<"$ctx")"
  if [ "$first" -eq 1 ]; then
    CONTEXT_ARRAY+="$enriched"
    first=0
  else
    CONTEXT_ARRAY+=",$enriched"
  fi
done
CONTEXT_ARRAY+="]"

# Debug: optionally dump the raw context array for troubleshooting.
[ "${ADAM_PREFLIGHT_DEBUG:-}" = "1" ] && echo "DEBUG_CONTEXTS=$CONTEXT_ARRAY" >&2

# Build the path-hints JSON array. printf with an empty bash array would emit
# a single empty line and jq would turn it into [""], so guard explicitly.
if [ ${#PATH_HINTS[@]} -eq 0 ]; then
  HINTS_JSON='[]'
else
  HINTS_JSON="$(printf '%s\n' "${PATH_HINTS[@]}" | jq -R . | jq -sc .)"
fi

# 4. Assemble the briefing. jq does the heavy lifting so the output is valid
# JSON regardless of weird symbol names / characters.
jq -nc \
  --arg topic "$TOPIC" \
  --arg repo "$REPO" \
  --argjson query "$QUERY_JSON" \
  --argjson contexts "$CONTEXT_ARRAY" \
  --argjson hints "$HINTS_JSON" \
  '
  def file_of: (.symbol.filePath // .filePath // .file // "");
  def line_of: (.symbol.startLine // .symbol.line // .line // null);
  def kind_of: (.symbol.kind // .kind // "");
  def name_of: (.symbol.name // .name // .requested_name // "");
  def uid_of:  (.symbol.uid  // .uid  // "");

  # gitnexus context returns incoming/outgoing as an object-of-arrays
  # (e.g. {"calls":[...], "reads":[...]}) — flatten to a single array of edges.
  def edges($field):
    (.[$field] // {})
    | if type == "array" then .
      else [.[]? // empty] | add // []
      end
    | map({
        name: (.name? // ""),
        file: (.filePath? // .file? // ""),
        line: (.startLine? // .line? // null)
      });

  ($contexts | map(select(.status != "ambiguous"))) as $ok |
  ($ok | map(file_of) | map(select(. != "")) | unique) as $files |
  {
    status: "ok",
    topic: $topic,
    repo: $repo,
    path_hints: $hints,
    summary: {
      symbol_count: ($ok | length),
      file_count: ($files | length),
      primary_files: $files[0:6]
    },
    candidates: ($ok | map({
      name: name_of,
      uid:  uid_of,
      kind: kind_of,
      file: file_of,
      line: line_of,
      incoming: edges("incoming"),
      outgoing: edges("outgoing")
    })),
    search_processes: ($query.processes // [])
  }
  '
