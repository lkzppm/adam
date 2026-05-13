"""mcps/token-count/server.ts — token counter MCP exercised over JSON-RPC stdio."""
from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

pytestmark = pytest.mark.mcp


SERVER = "mcps/token-count/server.ts"


def _mcp_call(plugin_root: Path, server_rel: str, tool: str, arguments: dict) -> dict:
    """Send a minimal initialize → notifications/initialized → tools/call sequence.

    Returns the JSON-RPC response for the tools/call request.
    """
    if not shutil.which("node"):
        pytest.skip("node not on PATH")
    if not (plugin_root / "node_modules").exists():
        pytest.skip("plugin node_modules missing — run `npm install` in the plugin root")

    server_path = plugin_root / server_rel
    assert server_path.exists(), server_path

    messages = [
        {
            "jsonrpc": "2.0", "id": 1, "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {"name": "adam-test", "version": "0"},
            },
        },
        {"jsonrpc": "2.0", "method": "notifications/initialized"},
        {
            "jsonrpc": "2.0", "id": 2, "method": "tools/call",
            "params": {"name": tool, "arguments": arguments},
        },
    ]
    stdin = "\n".join(json.dumps(m) for m in messages) + "\n"

    env = {
        **os.environ,
        "NODE_PATH": str(plugin_root / "node_modules"),
    }
    result = subprocess.run(
        ["node", "--import", "tsx", str(server_path)],
        input=stdin,
        capture_output=True,
        text=True,
        env=env,
        timeout=30,
    )

    # Each JSON-RPC reply is a single line on stdout. Find the one for id=2.
    for line in result.stdout.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
        except json.JSONDecodeError:
            continue
        if msg.get("id") == 2:
            return msg

    pytest.fail(
        f"no tools/call response on stdout\nstdout:\n{result.stdout}\nstderr:\n{result.stderr}"
    )


def _content_json(response: dict) -> dict:
    """The MCP wraps tool output as content[0].text containing a JSON string."""
    assert "result" in response, response
    assert response["result"]["content"][0]["type"] == "text"
    return json.loads(response["result"]["content"][0]["text"])


def test_count_a_file(plugin_root: Path, tmp_path: Path):
    target = tmp_path / "hello.md"
    target.write_text("hello world. " * 200, encoding="utf-8")

    body = _content_json(_mcp_call(plugin_root, SERVER, "count", {"path": str(target)}))

    assert body["path"] == str(target)
    assert body["bytes"] == target.stat().st_size
    assert body["chars"] == target.stat().st_size  # ASCII, 1 byte/char
    assert body["tokens"] > 0
    assert body["tokens"] < body["chars"]          # tokens are denser than chars
    assert body["encoding"]                        # encoding name string is present


def test_count_grows_with_input_size(plugin_root: Path, tmp_path: Path):
    small = tmp_path / "small.md"
    large = tmp_path / "large.md"
    small.write_text("alpha beta gamma\n", encoding="utf-8")
    large.write_text("alpha beta gamma\n" * 500, encoding="utf-8")

    s = _content_json(_mcp_call(plugin_root, SERVER, "count", {"path": str(small)}))
    L = _content_json(_mcp_call(plugin_root, SERVER, "count", {"path": str(large)}))

    assert L["tokens"] > s["tokens"]
    # 500× input → 500× tokens, within a tight tolerance (tokenizer caching etc.)
    assert L["tokens"] > 400 * s["tokens"]
    assert L["tokens"] < 600 * s["tokens"]


def test_count_is_deterministic(plugin_root: Path, tmp_path: Path):
    target = tmp_path / "seed.md"
    target.write_text("deterministic input " * 50, encoding="utf-8")

    a = _content_json(_mcp_call(plugin_root, SERVER, "count", {"path": str(target)}))
    b = _content_json(_mcp_call(plugin_root, SERVER, "count", {"path": str(target)}))

    assert a == b


def test_count_non_existent_file_returns_error(plugin_root: Path, tmp_path: Path):
    missing = tmp_path / "does-not-exist.md"
    response = _mcp_call(plugin_root, SERVER, "count", {"path": str(missing)})

    # The MCP surfaces tool errors via JSON-RPC error or via content[0].text
    # with an `isError` flag — accept either shape.
    err = response.get("error")
    if err is not None:
        assert "no such file" in str(err).lower() or "enoent" in str(err).lower()
    else:
        # Some MCP SDK versions wrap errors as content with isError=true
        assert response["result"].get("isError") or "error" in response["result"]["content"][0]["text"].lower()
