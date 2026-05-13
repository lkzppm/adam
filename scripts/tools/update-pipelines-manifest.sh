#!/usr/bin/env bash
# adam — refresh the pipelines viewer manifest
#
# Walks <project>/spec/pipelines/*.html, extracts the
# `<script type="application/adam-pipeline+json" id="pipeline-meta">` block
# from each, and rewrites the inlined manifest in spec/pipelines.html between
# the `<!-- BEGIN MANIFEST -->` / `<!-- END MANIFEST -->` sentinels.
#
# Inlined (not fetched) because the viewer must work when opened via file://
# URLs, where fetch() is blocked by default.
#
# Idempotent. Called automatically by:
#   - write-pipelines-viewer.sh (first install / re-install)
#   - the spec-create skill, after writing a new pipeline-spec
#   - the spec-update skill, after rewriting a pipeline-spec
#
# Usage: update-pipelines-manifest.sh <project-root>
#
# Output (stdout, single-line JSON):
#   { "status": "ok", "viewer": "<path>", "count": N, "pipelines": [<slug>, ...] }
#
# Exit codes:
#   0 = ok
#   1 = environment problem (jq/python missing, viewer missing, etc.)
set -euo pipefail

ROOT="${1:-.}"
ROOT="$(cd "$ROOT" && pwd -P)"

VIEWER="$ROOT/spec/pipelines.html"
DIR="$ROOT/spec/pipelines"

if ! command -v jq >/dev/null 2>&1; then
  echo '{"status":"error","message":"jq required but not on PATH"}' >&2
  exit 1
fi
if ! command -v python3 >/dev/null 2>&1; then
  echo '{"status":"error","message":"python3 required but not on PATH"}' >&2
  exit 1
fi
if [ ! -f "$VIEWER" ]; then
  echo "{\"status\":\"error\",\"message\":\"spec/pipelines.html not found at $VIEWER — run write-pipelines-viewer.sh first\"}" >&2
  exit 1
fi
mkdir -p "$DIR"

GENERATED="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# Collect metadata from each pipeline HTML. We delegate to python3 because the
# extraction has to be tolerant of multi-line JSON embedded in HTML — easy with
# a real parser, painful with sed/awk.
MANIFEST_JSON="$(
  ROOT="$ROOT" DIR="$DIR" GENERATED="$GENERATED" python3 - <<'PY'
import json, os, re, sys
from pathlib import Path

root = Path(os.environ["ROOT"])
pdir = Path(os.environ["DIR"])
generated = os.environ["GENERATED"]

# Pull <script type="application/adam-pipeline+json" id="pipeline-meta">...</script>
SCRIPT_RE = re.compile(
    r'<script[^>]*\btype\s*=\s*"application/adam-pipeline\+json"[^>]*>(.*?)</script>',
    re.IGNORECASE | re.DOTALL,
)

entries = []
errors = []
for fp in sorted(pdir.glob("*.html")):
    text = fp.read_text(encoding="utf-8", errors="replace")
    m = SCRIPT_RE.search(text)
    rel = "pipelines/" + fp.name
    if not m:
        errors.append({"file": rel, "reason": "no pipeline metadata script block"})
        continue
    raw = m.group(1).strip()
    try:
        meta = json.loads(raw)
    except json.JSONDecodeError as e:
        errors.append({"file": rel, "reason": f"invalid JSON: {e}"})
        continue
    if not isinstance(meta, dict):
        errors.append({"file": rel, "reason": "metadata is not an object"})
        continue

    slug = meta.get("slug") or fp.stem
    entries.append({
        "slug":        str(slug),
        "title":       str(meta.get("title") or slug),
        "description": str(meta.get("description") or ""),
        "tags":        meta.get("tags") if isinstance(meta.get("tags"), list) else [],
        "updated":     str(meta.get("updated") or ""),
        "file":        rel,
    })

entries.sort(key=lambda e: (e["title"].lower(), e["slug"].lower()))
out = {"generated": generated, "pipelines": entries, "errors": errors}
json.dump(out, sys.stdout, ensure_ascii=False)
PY
)"

# Split errors out for the script's own output; the viewer only needs the
# generated timestamp + pipelines list.
ERRORS_JSON="$(jq -c '.errors // []' <<<"$MANIFEST_JSON")"
VIEWER_JSON="$(jq -c '{generated: .generated, pipelines: .pipelines}' <<<"$MANIFEST_JSON")"

# Rewrite the inlined manifest block between the sentinels.
NEW_BLOCK="$(
  cat <<EOF
<!-- BEGIN MANIFEST -->
<script id="pipelines-manifest" type="application/json">
$(jq '.' <<<"$VIEWER_JSON")
</script>
<!-- END MANIFEST -->
EOF
)"

TMP="$(mktemp)"
NEW_BLOCK_VAR="$NEW_BLOCK" python3 - "$VIEWER" "$TMP" <<'PY'
import os, re, sys
src, dst = sys.argv[1], sys.argv[2]
text = open(src, "r", encoding="utf-8").read()
new_block = os.environ["NEW_BLOCK_VAR"]
pat = re.compile(r"<!-- BEGIN MANIFEST -->.*?<!-- END MANIFEST -->", re.DOTALL)
if not pat.search(text):
    sys.stderr.write("sentinel markers not found in spec/pipelines.html\n")
    sys.exit(2)
out = pat.sub(lambda _m: new_block, text, count=1)
open(dst, "w", encoding="utf-8").write(out)
PY
mv "$TMP" "$VIEWER"

COUNT="$(jq '.pipelines | length' <<<"$VIEWER_JSON")"
SLUGS="$(jq -c '[.pipelines[].slug]' <<<"$VIEWER_JSON")"

jq -nc \
  --arg viewer "$VIEWER" \
  --argjson count "$COUNT" \
  --argjson slugs "$SLUGS" \
  --argjson errors "$ERRORS_JSON" \
  '{status:"ok", viewer:$viewer, count:$count, pipelines:$slugs, errors:$errors}'
