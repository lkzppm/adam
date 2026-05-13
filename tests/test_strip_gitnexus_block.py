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
