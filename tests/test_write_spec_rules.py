"""scripts/template/write-spec-rules.sh — copy templates/rules/*.md → spec/rules/."""
from __future__ import annotations

from pathlib import Path


SCRIPT = "scripts/template/write-spec-rules.sh"


def test_copies_three_rule_files(run_script, project_root: Path, parse_json):
    result = run_script(SCRIPT, str(project_root))
    body = parse_json(result.stdout)

    assert body["status"] == "ok"
    assert body["files"] == 3

    rules = project_root / "spec/rules"
    assert (rules / "refactor.md").exists()
    assert (rules / "additive.md").exists()
    assert (rules / "orient.md").exists()


def test_dest_path_in_output_matches_filesystem(run_script, project_root: Path, parse_json):
    body = parse_json(run_script(SCRIPT, str(project_root)).stdout)
    assert Path(body["dest"]).resolve() == (project_root / "spec/rules").resolve()


def test_idempotent_on_second_call(run_script, project_root: Path, parse_json):
    run_script(SCRIPT, str(project_root))
    body = parse_json(run_script(SCRIPT, str(project_root)).stdout)
    assert body["files"] == 3


def test_rule_files_carry_frontmatter(run_script, project_root: Path):
    run_script(SCRIPT, str(project_root))
    for name in ("refactor.md", "additive.md", "orient.md"):
        text = (project_root / "spec/rules" / name).read_text(encoding="utf-8")
        assert text.startswith("---"), f"{name} missing YAML frontmatter"


def test_fails_when_project_root_missing(run_script, tmp_path: Path):
    missing = tmp_path / "does-not-exist"
    result = run_script(SCRIPT, str(missing), check=False)
    assert result.returncode != 0
