"""scripts/utils/strip-gitnexus-block.sh — remove gitnexus auto-injected markers from CLAUDE.md/AGENTS.md."""
from __future__ import annotations

from pathlib import Path


SCRIPT = "scripts/utils/strip-gitnexus-block.sh"


def test_removes_block_from_claude_md(run_script, project_root: Path):
    md = project_root / "CLAUDE.md"
    md.write_text(
        "# Title\n"
        "intro paragraph\n"
        "<!-- gitnexus:start -->\n"
        "NOISE: MUST run impact analysis...\n"
        "more noise\n"
        "<!-- gitnexus:end -->\n"
        "## After the block\n"
        "kept content\n",
        encoding="utf-8",
    )

    run_script(SCRIPT, str(project_root))

    after = md.read_text(encoding="utf-8")
    assert "<!-- gitnexus:start -->" not in after
    assert "<!-- gitnexus:end -->" not in after
    assert "NOISE" not in after
    assert "# Title" in after
    assert "kept content" in after


def test_removes_block_from_agents_md(run_script, project_root: Path):
    md = project_root / "AGENTS.md"
    md.write_text(
        "header\n<!-- gitnexus:start -->\nboilerplate\n<!-- gitnexus:end -->\nfooter\n",
        encoding="utf-8",
    )
    run_script(SCRIPT, str(project_root))
    after = md.read_text(encoding="utf-8")
    assert "boilerplate" not in after
    assert "header" in after
    assert "footer" in after


def test_idempotent_when_no_block_present(run_script, project_root: Path):
    md = project_root / "CLAUDE.md"
    original = "# Title\nno gitnexus markers anywhere\n"
    md.write_text(original, encoding="utf-8")
    run_script(SCRIPT, str(project_root))
    assert md.read_text(encoding="utf-8") == original


def test_no_op_when_file_missing(run_script, project_root: Path):
    # Neither CLAUDE.md nor AGENTS.md exists — script must exit cleanly.
    result = run_script(SCRIPT, str(project_root))
    assert result.returncode == 0


def test_trailing_blank_lines_trimmed(run_script, project_root: Path):
    """Strip should not leave a runaway trail of blank lines from the removed block."""
    md = project_root / "CLAUDE.md"
    md.write_text(
        "# Title\n"
        "<!-- gitnexus:start -->\n"
        "block\n"
        "<!-- gitnexus:end -->\n",
        encoding="utf-8",
    )
    run_script(SCRIPT, str(project_root))
    after = md.read_text(encoding="utf-8")
    # Single trailing newline at most
    assert not after.endswith("\n\n\n")


# ─── cleanup_if_empty (new behavior) ──────────────────────────────────


def test_agents_md_removed_when_strip_empties_it(run_script, project_root):
    md = project_root / "AGENTS.md"
    md.write_text(
        "<!-- gitnexus:start -->\nonly boilerplate, nothing else\n<!-- gitnexus:end -->\n",
        encoding="utf-8",
    )
    run_script(SCRIPT, str(project_root))
    assert not md.exists(), "AGENTS.md should be removed when it contains only the stripped block"


def test_agents_md_preserved_when_user_content_remains(run_script, project_root):
    md = project_root / "AGENTS.md"
    md.write_text(
        "# my notes\n<!-- gitnexus:start -->\nboilerplate\n<!-- gitnexus:end -->\nmore notes\n",
        encoding="utf-8",
    )
    run_script(SCRIPT, str(project_root))
    assert md.exists()
    after = md.read_text(encoding="utf-8")
    assert "my notes" in after
    assert "more notes" in after
    assert "boilerplate" not in after


def test_claude_md_never_removed_even_if_empty_after_strip(run_script, project_root):
    """CLAUDE.md is load-bearing for adam (brief + spec index). The cleanup
    helper must skip it even if the strip leaves nothing but whitespace."""
    md = project_root / "CLAUDE.md"
    md.write_text(
        "<!-- gitnexus:start -->\nblock\n<!-- gitnexus:end -->\n",
        encoding="utf-8",
    )
    run_script(SCRIPT, str(project_root))
    assert md.exists(), "CLAUDE.md must not be removed by the strip script under any condition"


# ─── reindex-and-strip wrapper ────────────────────────────────────────


def test_wrapper_chains_strip_after_analyze(plugin_root, project_root, tmp_path):
    """The wrapper runs `gitnexus analyze` then `strip-gitnexus-block.sh`. We
    stub gitnexus as a no-op so the test doesn't depend on the real binary or
    on npm network access, and assert the strip phase still ran."""
    import os
    import subprocess

    md = project_root / "CLAUDE.md"
    md.write_text(
        "# title\n<!-- gitnexus:start -->\nstale\n<!-- gitnexus:end -->\nkept\n",
        encoding="utf-8",
    )

    # Stub gitnexus to a no-op script. Put its directory first on PATH so the
    # wrapper finds it instead of any real binary or npx fallback.
    fake_bin = tmp_path / "fakebin"
    fake_bin.mkdir()
    stub = fake_bin / "gitnexus"
    stub.write_text("#!/usr/bin/env bash\nexit 0\n", encoding="utf-8")
    stub.chmod(0o755)

    env = {
        **os.environ,
        "PATH": f"{fake_bin}:{os.environ.get('PATH', '')}",
        "CLAUDE_PLUGIN_ROOT": str(plugin_root),
    }
    result = subprocess.run(
        ["bash", str(plugin_root / "scripts/utils/reindex-and-strip.sh"), str(project_root)],
        env=env,
        capture_output=True,
        text=True,
        timeout=10,
    )
    assert result.returncode == 0, f"wrapper exited non-zero: {result.stderr}"

    after = md.read_text(encoding="utf-8")
    assert "stale" not in after, "strip phase did not run after analyze"
    assert "kept" in after, "non-block content must be preserved"


def test_wrapper_removes_empty_agents_md(plugin_root, project_root, tmp_path):
    """End-to-end: analyze → strip → cleanup_if_empty. AGENTS.md that contains
    only the gitnexus block should be gone after a single wrapper tick."""
    import os
    import subprocess

    (project_root / "AGENTS.md").write_text(
        "<!-- gitnexus:start -->\nMUST run impact analysis...\n<!-- gitnexus:end -->\n",
        encoding="utf-8",
    )

    fake_bin = tmp_path / "fakebin"
    fake_bin.mkdir()
    stub = fake_bin / "gitnexus"
    stub.write_text("#!/usr/bin/env bash\nexit 0\n", encoding="utf-8")
    stub.chmod(0o755)

    env = {
        **os.environ,
        "PATH": f"{fake_bin}:{os.environ.get('PATH', '')}",
        "CLAUDE_PLUGIN_ROOT": str(plugin_root),
    }
    subprocess.run(
        ["bash", str(plugin_root / "scripts/utils/reindex-and-strip.sh"), str(project_root)],
        env=env, capture_output=True, text=True, timeout=10, check=True,
    )
    assert not (project_root / "AGENTS.md").exists()
