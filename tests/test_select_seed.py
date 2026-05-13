"""scripts/template/select-seed.sh — stack detection → templates/specs/<stack>.md."""
from __future__ import annotations

import json
from pathlib import Path


SCRIPT = "scripts/template/select-seed.sh"


def _write_package_json(root: Path, deps: dict | None = None, dev: dict | None = None):
    payload = {"name": "x"}
    if deps:
        payload["dependencies"] = deps
    if dev:
        payload["devDependencies"] = dev
    (root / "package.json").write_text(json.dumps(payload), encoding="utf-8")


def test_detects_nextjs(run_script, tmp_path: Path, parse_json):
    _write_package_json(tmp_path, deps={"next": "^14"})
    body = parse_json(run_script(SCRIPT, str(tmp_path)).stdout)
    assert body["stack"] == "nextjs"
    assert body["seed"].endswith("nextjs.md")


def test_detects_hono(run_script, tmp_path: Path, parse_json):
    _write_package_json(tmp_path, deps={"hono": "^4"})
    body = parse_json(run_script(SCRIPT, str(tmp_path)).stdout)
    assert body["stack"] == "hono"
    assert body["seed"].endswith("hono.md")


def test_detects_fastapi_pyproject_multiline(run_script, tmp_path: Path, parse_json):
    """select-seed.sh expects each dependency on its own line.

    Matches both PEP 621 multi-line arrays and Poetry table-style deps.
    """
    (tmp_path / "pyproject.toml").write_text(
        '[project]\n'
        'name = "x"\n'
        'dependencies = [\n'
        '  "fastapi>=0.100",\n'
        ']\n',
        encoding="utf-8",
    )
    body = parse_json(run_script(SCRIPT, str(tmp_path)).stdout)
    assert body["stack"] == "fastapi"
    assert body["seed"].endswith("fastapi.md")


def test_detects_fastapi_requirements_txt(run_script, tmp_path: Path, parse_json):
    (tmp_path / "requirements.txt").write_text("fastapi==0.110.0\n", encoding="utf-8")
    body = parse_json(run_script(SCRIPT, str(tmp_path)).stdout)
    assert body["stack"] == "fastapi"


def test_detects_django_via_manage_py(run_script, tmp_path: Path, parse_json):
    (tmp_path / "manage.py").write_text("# django marker\n", encoding="utf-8")
    body = parse_json(run_script(SCRIPT, str(tmp_path)).stdout)
    assert body["stack"] == "django"
    assert body["seed"].endswith("django.md")


def test_unknown_when_no_signals(run_script, tmp_path: Path, parse_json):
    body = parse_json(run_script(SCRIPT, str(tmp_path)).stdout)
    assert body["stack"] == "unknown"
    assert body["seed"] is None


def test_nextjs_precedes_hono_when_both_present(run_script, tmp_path: Path, parse_json):
    """Documented precedence: Next.js wins over Hono if both are declared."""
    _write_package_json(tmp_path, deps={"next": "^14", "hono": "^4"})
    body = parse_json(run_script(SCRIPT, str(tmp_path)).stdout)
    assert body["stack"] == "nextjs"


def test_devdependencies_also_count(run_script, tmp_path: Path, parse_json):
    _write_package_json(tmp_path, dev={"next": "^14"})
    body = parse_json(run_script(SCRIPT, str(tmp_path)).stdout)
    assert body["stack"] == "nextjs"
