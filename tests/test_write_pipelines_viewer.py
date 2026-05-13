"""scripts/template/write-pipelines-viewer.sh — install viewer, detect project name, inline banner."""
from __future__ import annotations

import json
from pathlib import Path


SCRIPT = "scripts/template/write-pipelines-viewer.sh"


def test_installs_viewer_and_pipelines_dir(run_script, project_root: Path, parse_json):
    body = parse_json(run_script(SCRIPT, str(project_root)).stdout)

    assert body["status"] == "ok"
    assert (project_root / "spec/pipelines.html").exists()
    assert (project_root / "spec/pipelines").is_dir()


def test_placeholders_are_substituted(run_script, project_root: Path):
    run_script(SCRIPT, str(project_root))
    content = (project_root / "spec/pipelines.html").read_text(encoding="utf-8")
    assert "{{ADAM_PROJECT_NAME}}" not in content
    assert "{{ADAM_BANNER_DATA_URI}}" not in content


def test_banner_inlined_as_data_uri(run_script, project_root: Path):
    run_script(SCRIPT, str(project_root))
    content = (project_root / "spec/pipelines.html").read_text(encoding="utf-8")
    assert "data:image/png;base64," in content


def test_project_name_from_package_json(run_script, project_root: Path, parse_json):
    (project_root / "package.json").write_text(
        json.dumps({"name": "my-app"}), encoding="utf-8"
    )
    body = parse_json(run_script(SCRIPT, str(project_root)).stdout)
    assert body["project"] == "my-app"
    assert ">my-app<" in (project_root / "spec/pipelines.html").read_text(encoding="utf-8")


def test_project_name_strips_npm_scope(run_script, project_root: Path, parse_json):
    (project_root / "package.json").write_text(
        json.dumps({"name": "@scope/foo"}), encoding="utf-8"
    )
    body = parse_json(run_script(SCRIPT, str(project_root)).stdout)
    assert body["project"] == "foo"


def test_project_name_from_pyproject(run_script, project_root: Path, parse_json):
    (project_root / "pyproject.toml").write_text(
        '[project]\nname = "py-app"\nversion = "0.1.0"\n',
        encoding="utf-8",
    )
    body = parse_json(run_script(SCRIPT, str(project_root)).stdout)
    assert body["project"] == "py-app"


def test_project_name_from_cargo(run_script, project_root: Path, parse_json):
    (project_root / "Cargo.toml").write_text(
        '[package]\nname = "rust-app"\nversion = "0.1.0"\n',
        encoding="utf-8",
    )
    body = parse_json(run_script(SCRIPT, str(project_root)).stdout)
    assert body["project"] == "rust-app"


def test_env_override_wins(run_script, project_root: Path, parse_json):
    (project_root / "package.json").write_text(
        json.dumps({"name": "from-pkg"}), encoding="utf-8"
    )
    body = parse_json(
        run_script(
            SCRIPT, str(project_root), env={"ADAM_PROJECT_NAME": "overridden"}
        ).stdout
    )
    assert body["project"] == "overridden"


def test_basename_fallback_when_no_manifests(run_script, tmp_path: Path, parse_json):
    target = tmp_path / "my-fallback-project"
    (target / "spec").mkdir(parents=True)
    body = parse_json(run_script(SCRIPT, str(target)).stdout)
    assert body["project"] == "my-fallback-project"


def test_html_escapes_special_chars_in_name(run_script, project_root: Path):
    run_script(SCRIPT, str(project_root), env={"ADAM_PROJECT_NAME": "a<script>"})
    content = (project_root / "spec/pipelines.html").read_text(encoding="utf-8")
    # raw <script> tag from the name must not appear; it should be escaped
    assert "a<script>" not in content
    assert "a&lt;script&gt;" in content


def test_re_install_is_idempotent(run_script, project_root: Path, parse_json):
    run_script(SCRIPT, str(project_root))
    body = parse_json(run_script(SCRIPT, str(project_root)).stdout)
    assert body["status"] == "ok"


def test_refuses_when_spec_dir_missing(run_script, tmp_path: Path):
    # tmp_path has no spec/ — the script must bail rather than silently create
    target = tmp_path / "virgin"
    target.mkdir()
    result = run_script(SCRIPT, str(target), check=False)
    assert result.returncode != 0
