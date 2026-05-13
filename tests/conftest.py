"""Shared fixtures for the adam plugin test suite.

Most tests exercise shell scripts and MCP servers as black-box subprocesses,
so the bulk of what we share is path resolution, environment plumbing, and
small project-root scaffolding helpers.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path
from typing import Iterable, Mapping

import pytest

PLUGIN_ROOT = Path(__file__).resolve().parent.parent


@pytest.fixture(scope="session")
def plugin_root() -> Path:
    """Absolute path to the adam plugin checkout (this repo)."""
    return PLUGIN_ROOT


@pytest.fixture
def project_root(tmp_path: Path) -> Path:
    """A throwaway project root with spec/INDEX.md seeded.

    Adam's scripts uniformly expect <project>/spec/ to exist before running.
    Tests that want a virgin tree (no spec/) should accept tmp_path directly.
    """
    spec = tmp_path / "spec"
    spec.mkdir()
    (spec / "INDEX.md").write_text("# placeholder\n", encoding="utf-8")
    return tmp_path


@pytest.fixture
def run_script(plugin_root: Path):
    """Invoke a plugin script with CLAUDE_PLUGIN_ROOT set.

    Returns the completed CompletedProcess. By default fails the test on a
    non-zero exit; pass check=False to inspect failures explicitly.
    """
    def _run(
        rel_script: str,
        *args: str,
        env: Mapping[str, str] | None = None,
        check: bool = True,
    ) -> subprocess.CompletedProcess[str]:
        script = plugin_root / rel_script
        assert script.exists(), f"script not found: {rel_script}"
        merged = {**os.environ, "CLAUDE_PLUGIN_ROOT": str(plugin_root)}
        if env:
            merged.update(env)
        result = subprocess.run(
            ["bash", str(script), *args],
            env=merged,
            capture_output=True,
            text=True,
        )
        if check and result.returncode != 0:
            pytest.fail(
                f"{rel_script} exited {result.returncode}\n"
                f"stderr:\n{result.stderr}\n"
                f"stdout:\n{result.stdout}"
            )
        return result
    return _run


@pytest.fixture
def parse_json():
    """Parse a script's single-line JSON output, failing helpfully on garbage."""
    def _parse(stdout: str) -> dict:
        s = stdout.strip()
        if not s:
            pytest.fail("expected JSON on stdout, got empty string")
        try:
            return json.loads(s)
        except json.JSONDecodeError as e:
            pytest.fail(f"stdout is not JSON: {e}\n---\n{stdout}\n---")
    return _parse


# ─── Skip helpers ────────────────────────────────────────────────────
def _have(*tools: str) -> bool:
    return all(shutil.which(t) is not None for t in tools)


def pytest_collection_modifyitems(config, items):
    """Auto-skip tests marked `gitnexus` when the CLI isn't on PATH."""
    has_gn = _have("gitnexus")
    skip_gn = pytest.mark.skip(reason="gitnexus CLI not on PATH")
    for item in items:
        if "gitnexus" in item.keywords and not has_gn:
            item.add_marker(skip_gn)
