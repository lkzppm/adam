"""scripts/tools/session-token-usage.sh — aggregate per-session token usage from Claude Code JSONL."""
from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path


SCRIPT = "scripts/tools/session-token-usage.sh"


def _slug(project: Path) -> str:
    """Claude Code's project-slug convention: replace / with -."""
    return str(project).replace("/", "-")


def _session_dir(home: Path, project: Path) -> Path:
    return home / ".claude/projects" / _slug(project)


def _run(plugin_root: Path, project: Path, home: Path) -> subprocess.CompletedProcess[str]:
    env = {
        **os.environ,
        "HOME": str(home),
        "CLAUDE_PLUGIN_ROOT": str(plugin_root),
    }
    return subprocess.run(
        ["bash", str(plugin_root / SCRIPT), str(project)],
        env=env,
        capture_output=True,
        text=True,
    )


def _usage_msg(input_tokens: int, output_tokens: int,
               cache_creation: int = 0, cache_read: int = 0) -> dict:
    return {
        "type": "assistant",
        "message": {
            "usage": {
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
                "cache_creation_input_tokens": cache_creation,
                "cache_read_input_tokens": cache_read,
            }
        },
    }


def test_aggregates_across_assistant_messages(plugin_root: Path, tmp_path: Path, parse_json):
    project = tmp_path / "demo"
    project.mkdir()
    fake_home = tmp_path / "home"
    sdir = _session_dir(fake_home, project)
    sdir.mkdir(parents=True)
    (sdir / "session.jsonl").write_text(
        "\n".join([
            json.dumps(_usage_msg(100, 50, 200, 300)),
            json.dumps({"type": "user", "message": {"content": "no usage here"}}),
            json.dumps(_usage_msg(10, 5, 20, 30)),
        ]) + "\n",
        encoding="utf-8",
    )

    result = _run(plugin_root, project, fake_home)
    assert result.returncode == 0
    body = parse_json(result.stdout)

    assert body["status"] == "ok"
    assert body["turns"] == 2          # only the two assistant messages
    assert body["input"] == 110
    assert body["output"] == 55
    assert body["cache_creation"] == 220
    assert body["cache_read"] == 330
    assert body["total"] == 110 + 55 + 220 + 330


def test_picks_most_recently_modified_jsonl(plugin_root: Path, tmp_path: Path, parse_json):
    project = tmp_path / "demo"
    project.mkdir()
    fake_home = tmp_path / "home"
    sdir = _session_dir(fake_home, project)
    sdir.mkdir(parents=True)

    old = sdir / "old.jsonl"
    new = sdir / "new.jsonl"
    old.write_text(json.dumps(_usage_msg(999_999, 0)) + "\n", encoding="utf-8")
    # mtime: old is 100s in the past, new is now
    os.utime(old, (old.stat().st_atime, old.stat().st_mtime - 100))
    new.write_text(json.dumps(_usage_msg(42, 0)) + "\n", encoding="utf-8")

    result = _run(plugin_root, project, fake_home)
    body = parse_json(result.stdout)
    assert body["session"].endswith("new.jsonl")
    assert body["input"] == 42


def test_error_when_no_session_dir(plugin_root: Path, tmp_path: Path, parse_json):
    project = tmp_path / "demo"
    project.mkdir()
    fake_home = tmp_path / "home"
    fake_home.mkdir()
    # don't create the session dir at all

    result = _run(plugin_root, project, fake_home)
    assert result.returncode == 0      # best-effort: never breaks the brief
    body = parse_json(result.stdout)
    assert body["status"] == "error"
    assert "no session dir" in body["message"]


def test_error_when_no_jsonl_files(plugin_root: Path, tmp_path: Path, parse_json):
    project = tmp_path / "demo"
    project.mkdir()
    fake_home = tmp_path / "home"
    _session_dir(fake_home, project).mkdir(parents=True)

    result = _run(plugin_root, project, fake_home)
    body = parse_json(result.stdout)
    assert body["status"] == "error"
    assert "no .jsonl" in body["message"]


def test_empty_jsonl_returns_zero_totals(plugin_root: Path, tmp_path: Path, parse_json):
    project = tmp_path / "demo"
    project.mkdir()
    fake_home = tmp_path / "home"
    sdir = _session_dir(fake_home, project)
    sdir.mkdir(parents=True)
    (sdir / "empty.jsonl").write_text("", encoding="utf-8")

    result = _run(plugin_root, project, fake_home)
    body = parse_json(result.stdout)
    assert body["status"] == "ok"
    assert body["total"] == 0
    assert body["turns"] == 0


def test_jsonl_with_only_user_messages_returns_zero(plugin_root: Path, tmp_path: Path, parse_json):
    project = tmp_path / "demo"
    project.mkdir()
    fake_home = tmp_path / "home"
    sdir = _session_dir(fake_home, project)
    sdir.mkdir(parents=True)
    (sdir / "user-only.jsonl").write_text(
        "\n".join([
            json.dumps({"type": "user", "message": {"content": "hi"}}),
            json.dumps({"type": "user", "message": {"content": "again"}}),
        ]) + "\n",
        encoding="utf-8",
    )

    result = _run(plugin_root, project, fake_home)
    body = parse_json(result.stdout)
    assert body["status"] == "ok"
    assert body["turns"] == 0
    assert body["total"] == 0
