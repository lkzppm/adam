#!/usr/bin/env bash
# Copies the plugin's templated workflow rules (spec/rules/*.md) into the
# project's spec/ directory. These rules propagate the bench-validated
# behavior — they are project-agnostic and identical across all installations.
#
# Usage: write-spec-rules.sh <project-root>
#
# Idempotent: safe to call repeatedly; overwrites existing files in
# <project-root>/spec/rules/ with the latest plugin versions.
set -euo pipefail

ROOT="${1:-.}"
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
SOURCE="$PLUGIN_ROOT/templates/spec-rules"
DEST="$ROOT/spec/rules"

[ -d "$SOURCE" ] || { echo "templates/spec-rules not found at $SOURCE" >&2; exit 1; }
[ -d "$ROOT" ] || { echo "project root not found at $ROOT" >&2; exit 1; }

mkdir -p "$DEST"
cp "$SOURCE"/*.md "$DEST/"

count=$(ls "$DEST"/*.md 2>/dev/null | wc -l | tr -d ' ')
echo "{\"status\":\"ok\",\"dest\":\"$DEST\",\"files\":$count}"
