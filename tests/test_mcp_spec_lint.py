"""mcps/spec-lint/server.ts — spec ecosystem linter MCP."""
from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

pytestmark = pytest.mark.mcp


SERVER = "mcps/spec-lint/server.ts"


def _mcp_call(plugin_root: Path, tool: str, arguments: dict) -> dict:
    if not shutil.which("node"):
        pytest.skip("node not on PATH")
    if not (plugin_root / "node_modules").exists():
        pytest.skip("plugin node_modules missing — run `npm install` in the plugin root")

    messages = [
        {"jsonrpc": "2.0", "id": 1, "method": "initialize",
         "params": {"protocolVersion": "2024-11-05", "capabilities": {},
                    "clientInfo": {"name": "adam-test", "version": "0"}}},
        {"jsonrpc": "2.0", "method": "notifications/initialized"},
        {"jsonrpc": "2.0", "id": 2, "method": "tools/call",
         "params": {"name": tool, "arguments": arguments}},
    ]
    stdin = "\n".join(json.dumps(m) for m in messages) + "\n"

    result = subprocess.run(
        ["node", "--import", "tsx", str(plugin_root / SERVER)],
        input=stdin,
        capture_output=True,
        text=True,
        env={**os.environ, "NODE_PATH": str(plugin_root / "node_modules")},
        timeout=30,
    )
    for line in result.stdout.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
        except json.JSONDecodeError:
            continue
        if msg.get("id") == 2:
            return json.loads(msg["result"]["content"][0]["text"])
    pytest.fail(f"no tool response\nstdout:{result.stdout}\nstderr:{result.stderr}")


def _seed_minimal_project(root: Path, *, with_claude_md: bool = True,
                          with_spec_table: bool = True,
                          spec_files: tuple[str, ...] = ("overview.md",)) -> None:
    """Plant the smallest viable spec ecosystem so spec-lint has something to chew on."""
    spec = root / "spec"
    spec.mkdir(parents=True, exist_ok=True)

    today = "2026-05-13"
    for fname in spec_files:
        (spec / fname).write_text(
            "---\n"
            f"name: {fname[:-3]}\n"
            f"description: stub for {fname}\n"
            f"updated: {today}\n"
            "---\n\n"
            f"# {fname}\n\n"
            "body text body text\n",
            encoding="utf-8",
        )

    # INDEX.md — references every spec
    index_rows = "\n".join(f"| [{f}](./{f}) | stub | 0 |" for f in spec_files)
    (spec / "INDEX.md").write_text(
        "# Spec index\n\n| Spec | Read when… | Tokens |\n|---|---|---|\n" + index_rows + "\n",
        encoding="utf-8",
    )

    if with_claude_md:
        rows = "\n".join(f"| [{f}](spec/{f}) | stub | 0 |" for f in spec_files) if with_spec_table else ""
        head = "# Project\n\nStub claude.md.\n\n"
        table = ("## Spec index\n\n| Spec | Read when… | Tokens |\n|---|---|---|\n" + rows + "\n") if with_spec_table else ""
        (root / "CLAUDE.md").write_text(head + table, encoding="utf-8")


def test_lint_clean_minimal_project(plugin_root: Path, tmp_path: Path):
    _seed_minimal_project(tmp_path)
    body = _mcp_call(plugin_root, "lint", {"path": str(tmp_path)})
    assert body["ok"] is True
    assert body["errors"] == []


def test_missing_spec_dir_is_an_error(plugin_root: Path, tmp_path: Path):
    body = _mcp_call(plugin_root, "lint", {"path": str(tmp_path)})
    assert body["ok"] is False
    assert any("spec/" in e for e in body["errors"])


def test_missing_claude_md_is_an_error(plugin_root: Path, tmp_path: Path):
    _seed_minimal_project(tmp_path, with_claude_md=False)
    body = _mcp_call(plugin_root, "lint", {"path": str(tmp_path)})
    assert body["ok"] is False
    assert any("CLAUDE.md" in e for e in body["errors"])


def test_claude_md_without_spec_table_is_an_error(plugin_root: Path, tmp_path: Path):
    _seed_minimal_project(tmp_path, with_spec_table=False)
    body = _mcp_call(plugin_root, "lint", {"path": str(tmp_path)})
    assert body["ok"] is False
    assert any("spec index table" in e for e in body["errors"])


def test_token_summary_lists_every_spec(plugin_root: Path, tmp_path: Path):
    _seed_minimal_project(tmp_path, spec_files=("overview.md", "stack.md"))
    body = _mcp_call(plugin_root, "lint", {"path": str(tmp_path)})

    by_file = {row["file"]: row["tokens"] for row in body["tokenSummary"]}
    assert "spec/overview.md" in by_file
    assert "spec/stack.md" in by_file
    assert all(v > 0 for v in by_file.values())
