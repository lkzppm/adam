#!/usr/bin/env bash
# Smoke-test both MCP servers via JSON-RPC over stdio.
# Use: ./scripts/tests/smoke-test.sh [project-root-to-lint]

set -euo pipefail

PLUGIN_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LINT_TARGET="${1:-$PLUGIN_ROOT}"

run_server() {
  local cmd="$1" tool="$2" input="$3"
  printf '%s\n' \
    '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}' \
    '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
    "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/call\",\"params\":{\"name\":\"$tool\",\"arguments\":$input}}" \
    | NODE_PATH="$PLUGIN_ROOT/node_modules" node --import tsx "$cmd" 2>&1
}

echo "── token-count: count(README.md) ──"
run_server "$PLUGIN_ROOT/mcps/token-count/server.ts" "count" \
  "{\"path\":\"$PLUGIN_ROOT/README.md\"}" | tail -1
echo

echo "── spec-lint: lint($LINT_TARGET) ──"
run_server "$PLUGIN_ROOT/mcps/spec-lint/server.ts" "lint" \
  "{\"path\":\"$LINT_TARGET\"}" | tail -1
echo

echo "── done ──"
