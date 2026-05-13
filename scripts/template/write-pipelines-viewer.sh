#!/usr/bin/env bash
# adam — install the pipelines viewer + folder layout
#
# Copies templates/pipelines/viewer.html into <project>/spec/pipelines.html,
# creates an empty <project>/spec/pipelines/ directory, and runs the manifest
# updater so the freshly-installed viewer reflects whatever pipelines (if any)
# already live in the project.
#
# Idempotent: safe to call repeatedly. Overwrites spec/pipelines.html with the
# latest viewer template (any custom edits there are intentional — keep them
# in templates/pipelines/viewer.html under the plugin instead).
#
# Usage: write-pipelines-viewer.sh <project-root>
#
# Output (stdout, single-line JSON):
#   { "status": "ok", "viewer": "<path>", "dir": "<path>", "pipelines": N }
set -euo pipefail

ROOT="${1:-.}"
ROOT="$(cd "$ROOT" && pwd -P)"
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

SOURCE="$PLUGIN_ROOT/templates/pipelines/viewer.html"
VIEWER_DEST="$ROOT/spec/pipelines.html"
PIPELINES_DIR="$ROOT/spec/pipelines"

[ -f "$SOURCE" ]    || { echo "viewer template not found at $SOURCE" >&2; exit 1; }
[ -d "$ROOT/spec" ] || { echo "spec/ directory missing at $ROOT (run /adam:setup first)" >&2; exit 1; }

mkdir -p "$PIPELINES_DIR"
cp "$SOURCE" "$VIEWER_DEST"

# Refresh the inlined manifest so the new viewer reflects whatever pipelines
# already exist (e.g. when re-running setup over an existing project).
bash "$SCRIPT_DIR/../tools/update-pipelines-manifest.sh" "$ROOT" >/dev/null

count=$(find "$PIPELINES_DIR" -maxdepth 1 -type f -name '*.html' 2>/dev/null | wc -l | tr -d ' ')
printf '{"status":"ok","viewer":"%s","dir":"%s","pipelines":%s}\n' \
  "$VIEWER_DEST" "$PIPELINES_DIR" "$count"
