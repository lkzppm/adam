#!/usr/bin/env bash
# adam — install the pipelines viewer + folder layout
#
# Copies templates/pipelines/viewer.html into <project>/spec/pipelines.html,
# substitutes the project name and adam-banner data URI, creates an empty
# <project>/spec/pipelines/ directory, and runs the manifest updater so the
# freshly-installed viewer reflects whatever pipelines (if any) already live
# in the project.
#
# Project name detection (first match wins):
#   1. $ADAM_PROJECT_NAME (env override — explicit user intent)
#   2. package.json `.name`  (scope stripped: @scope/foo → foo)
#   3. pyproject.toml `[project] name`  or  `[tool.poetry] name`
#   4. Cargo.toml `[package] name`
#   5. basename "$ROOT"
#
# Idempotent: safe to call repeatedly. Overwrites spec/pipelines.html with the
# latest viewer template (keep customizations under the plugin, not under
# the project).
#
# Usage: write-pipelines-viewer.sh <project-root>
#
# Output (stdout, single-line JSON):
#   { "status":"ok", "viewer":"<path>", "dir":"<path>",
#     "project":"<name>", "pipelines":N }
set -euo pipefail

ROOT="${1:-.}"
ROOT="$(cd "$ROOT" && pwd -P)"
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

SOURCE="$PLUGIN_ROOT/templates/pipelines/viewer.html"
BANNER="$PLUGIN_ROOT/public/AdamBannerBlackShort.png"
VIEWER_DEST="$ROOT/spec/pipelines.html"
PIPELINES_DIR="$ROOT/spec/pipelines"

[ -f "$SOURCE" ]    || { echo "viewer template not found at $SOURCE" >&2; exit 1; }
[ -d "$ROOT/spec" ] || { echo "spec/ directory missing at $ROOT (run /adam:setup first)" >&2; exit 1; }

mkdir -p "$PIPELINES_DIR"

# ─── Detect project name ──────────────────────────────────────────────
detect_project_name() {
  local root="$1" n=""

  if [ -f "$root/package.json" ] && command -v jq >/dev/null 2>&1; then
    n="$(jq -r '.name // empty' "$root/package.json" 2>/dev/null || true)"
    [ -n "$n" ] && { echo "${n##*/}"; return; }   # strip @scope/
  fi

  for f in "$root/pyproject.toml" "$root/Cargo.toml"; do
    [ -f "$f" ] || continue
    n="$(awk '
      /^\[(project|package|tool\.poetry)\][[:space:]]*$/ { in_sec = 1; next }
      /^\[/                                              { in_sec = 0 }
      in_sec && /^[[:space:]]*name[[:space:]]*=/ {
        line = $0
        sub(/^[[:space:]]*name[[:space:]]*=[[:space:]]*/, "", line)
        sub(/[[:space:]]*$/, "", line)
        gsub(/^["'\'']|["'\'']$/, "", line)
        print line
        exit
      }
    ' "$f" 2>/dev/null)"
    [ -n "$n" ] && { echo "$n"; return; }
  done

  basename "$root"
}

PROJECT_NAME="${ADAM_PROJECT_NAME:-$(detect_project_name "$ROOT")}"

# ─── Base64-encode the banner (self-contained viewer) ─────────────────
BANNER_DATA_URI=""
if [ -f "$BANNER" ] && command -v base64 >/dev/null 2>&1; then
  if base64 -w0 "$BANNER" >/dev/null 2>&1; then
    BANNER_DATA_URI="data:image/png;base64,$(base64 -w0 "$BANNER")"
  else
    # macOS base64 has no -w; strip newlines manually
    BANNER_DATA_URI="data:image/png;base64,$(base64 "$BANNER" | tr -d '\n')"
  fi
fi

# ─── Substitute placeholders ─────────────────────────────────────────
PROJECT_NAME="$PROJECT_NAME" BANNER="$BANNER_DATA_URI" SOURCE="$SOURCE" DEST="$VIEWER_DEST" \
python3 - <<'PY'
import html, os, pathlib
src = pathlib.Path(os.environ["SOURCE"]).read_text(encoding="utf-8")
name = html.escape(os.environ["PROJECT_NAME"] or "project")
banner = os.environ["BANNER"]
out = src.replace("{{ADAM_PROJECT_NAME}}", name) \
         .replace("{{ADAM_BANNER_DATA_URI}}", banner)
pathlib.Path(os.environ["DEST"]).write_text(out, encoding="utf-8")
PY

# Refresh the inlined manifest so the new viewer reflects whatever pipelines
# already exist (e.g. when re-running setup over an existing project).
bash "$SCRIPT_DIR/../tools/update-pipelines-manifest.sh" "$ROOT" >/dev/null

count=$(find "$PIPELINES_DIR" -maxdepth 1 -type f -name '*.html' 2>/dev/null | wc -l | tr -d ' ')
jq -nc \
  --arg v "$VIEWER_DEST" \
  --arg d "$PIPELINES_DIR" \
  --arg p "$PROJECT_NAME" \
  --argjson c "$count" \
  '{status:"ok", viewer:$v, dir:$d, project:$p, pipelines:$c}'
