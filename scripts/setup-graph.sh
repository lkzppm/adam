#!/usr/bin/env bash
# adam — Phase 0: knowledge-graph bootstrap
#
# Deterministic script run by the `setup` skill (and callable standalone) to
# (1) verify gitnexus is on PATH, (2) index the project if not yet indexed,
# (3) strip the gitnexus auto-injection from CLAUDE.md, and (4) merge the
# `gitnexus` MCP server entry into `.mcp.json`.
#
# Usage: setup-graph.sh <project-root>
#
# Output (JSON to stdout) so the calling skill can parse without re-running
# discovery commands. Failures go to stderr and exit non-zero.
set -euo pipefail

ROOT="${1:-.}"
ROOT="$(cd "$ROOT" && pwd)"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

emit_json() {
  printf '{"status":"%s","gitnexus":"%s","indexed":%s,"stripped":%s,"mcp":"%s","stats":%s,"message":"%s"}\n' \
    "$1" "$2" "$3" "$4" "$5" "$6" "$7"
}

# 1. gitnexus on PATH?
if ! command -v gitnexus >/dev/null 2>&1; then
  emit_json "error" "missing" "false" "false" "skipped" "null" \
    "gitnexus CLI not found. Install with: npm install -g gitnexus"
  exit 1
fi
GITNEXUS_VER="$(gitnexus --version 2>/dev/null | head -1)"

# 2. Index if missing.
INDEXED="false"
STATS="null"
if [ -d "$ROOT/.gitnexus" ] && [ -f "$ROOT/.gitnexus/meta.json" ]; then
  INDEXED="already"
  STATS="$(jq -c '.stats // {}' "$ROOT/.gitnexus/meta.json" 2>/dev/null || echo 'null')"
else
  ANALYZE_FLAG=""
  [ -d "$ROOT/.git" ] || ANALYZE_FLAG="--skip-git"
  if ( cd "$ROOT" && gitnexus analyze $ANALYZE_FLAG ) >/dev/null 2>&1; then
    INDEXED="true"
    STATS="$(jq -c '.stats // {}' "$ROOT/.gitnexus/meta.json" 2>/dev/null || echo 'null')"
  else
    emit_json "error" "$GITNEXUS_VER" "false" "false" "skipped" "null" \
      "gitnexus analyze failed; run it manually to see the error"
    exit 1
  fi
fi

# 3. Strip the auto-injected boilerplate from CLAUDE.md.
STRIPPED="false"
if [ -f "$ROOT/CLAUDE.md" ] && grep -q '<!-- gitnexus:start -->' "$ROOT/CLAUDE.md"; then
  bash "$SCRIPT_DIR/strip-gitnexus-block.sh" "$ROOT" >/dev/null 2>&1 || true
  STRIPPED="true"
fi

# 4. Merge the `gitnexus` MCP entry into .mcp.json.
MCP_PATH="$ROOT/.mcp.json"
MCP_STATE="created"
if [ -f "$MCP_PATH" ]; then
  if jq -e '.mcpServers.gitnexus' "$MCP_PATH" >/dev/null 2>&1; then
    MCP_STATE="already"
  else
    TMP="$(mktemp)"
    jq '.mcpServers = ((.mcpServers // {}) + {"gitnexus":{"command":"gitnexus","args":["mcp"]}})' \
      "$MCP_PATH" > "$TMP" && mv "$TMP" "$MCP_PATH"
    MCP_STATE="merged"
  fi
else
  cat > "$MCP_PATH" <<'EOF'
{
  "mcpServers": {
    "gitnexus": { "command": "gitnexus", "args": ["mcp"] }
  }
}
EOF
fi

emit_json "ok" "$GITNEXUS_VER" "$INDEXED" "$STRIPPED" "$MCP_STATE" "$STATS" \
  "Phase 0 complete"
