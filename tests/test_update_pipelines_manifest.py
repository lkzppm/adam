"""scripts/tools/update-pipelines-manifest.sh — scan spec/pipelines/*.html → rewrite sentinel block."""
from __future__ import annotations

import re
from pathlib import Path


SCRIPT = "scripts/tools/update-pipelines-manifest.sh"
INSTALL = "scripts/template/write-pipelines-viewer.sh"

PIPELINE_TEMPLATE = """\
<!doctype html><html><head>
<script type="application/adam-pipeline+json" id="pipeline-meta">
{{
  "slug": "{slug}",
  "title": "{title}",
  "description": "{desc}",
  "tags": [{tags}],
  "updated": "{updated}"
}}
</script>
</head><body></body></html>
"""


def _pipeline(path: Path, slug: str, title: str = "T", desc: str = "D",
              tags: tuple[str, ...] = (), updated: str = "2026-05-13") -> None:
    payload = PIPELINE_TEMPLATE.format(
        slug=slug,
        title=title,
        desc=desc,
        tags=", ".join(f'"{t}"' for t in tags),
        updated=updated,
    )
    path.write_text(payload, encoding="utf-8")


def _manifest_text(viewer: Path) -> str:
    """Extract the manifest JSON between the BEGIN/END sentinels."""
    text = viewer.read_text(encoding="utf-8")
    m = re.search(r"<!-- BEGIN MANIFEST -->(.*?)<!-- END MANIFEST -->", text, re.DOTALL)
    assert m, "sentinel block missing from viewer"
    return m.group(1)


def test_empty_manifest_for_fresh_install(run_script, project_root: Path, parse_json):
    run_script(INSTALL, str(project_root))
    body = parse_json(run_script(SCRIPT, str(project_root)).stdout)
    assert body["status"] == "ok"
    assert body["count"] == 0
    assert body["pipelines"] == []
    assert body["errors"] == []


def test_picks_up_one_pipeline(run_script, project_root: Path, parse_json):
    run_script(INSTALL, str(project_root))
    _pipeline(project_root / "spec/pipelines/foo.html", slug="foo", title="Foo Flow",
              desc="describes foo", tags=("ingest", "user"))

    body = parse_json(run_script(SCRIPT, str(project_root)).stdout)
    assert body["count"] == 1
    assert body["pipelines"] == ["foo"]

    rendered = _manifest_text(project_root / "spec/pipelines.html")
    assert '"slug": "foo"' in rendered
    assert "Foo Flow" in rendered
    assert "describes foo" in rendered
    assert '"ingest"' in rendered


def test_sorts_by_title_case_insensitive(run_script, project_root: Path, parse_json):
    run_script(INSTALL, str(project_root))
    _pipeline(project_root / "spec/pipelines/b.html", slug="b", title="zebra")
    _pipeline(project_root / "spec/pipelines/a.html", slug="a", title="Alpha")
    _pipeline(project_root / "spec/pipelines/c.html", slug="c", title="middle")

    body = parse_json(run_script(SCRIPT, str(project_root)).stdout)
    assert body["pipelines"] == ["a", "c", "b"]   # Alpha, middle, zebra


def test_malformed_json_metadata_surfaces_as_error(run_script, project_root: Path, parse_json):
    run_script(INSTALL, str(project_root))
    (project_root / "spec/pipelines/broken.html").write_text(
        '<html><script type="application/adam-pipeline+json" id="pipeline-meta">'
        '{not-json,</script></html>',
        encoding="utf-8",
    )
    body = parse_json(run_script(SCRIPT, str(project_root)).stdout)

    assert body["status"] == "ok"     # script never crashes on bad inputs
    assert body["count"] == 0
    assert len(body["errors"]) == 1
    assert body["errors"][0]["file"] == "pipelines/broken.html"
    assert "invalid JSON" in body["errors"][0]["reason"]


def test_pipeline_missing_metadata_block_is_skipped(run_script, project_root: Path, parse_json):
    run_script(INSTALL, str(project_root))
    (project_root / "spec/pipelines/noscript.html").write_text(
        "<!doctype html><html><body><p>no metadata here</p></body></html>",
        encoding="utf-8",
    )
    body = parse_json(run_script(SCRIPT, str(project_root)).stdout)
    assert body["count"] == 0
    assert any("no pipeline metadata" in e["reason"] for e in body["errors"])


def test_good_and_bad_pipelines_coexist(run_script, project_root: Path, parse_json):
    run_script(INSTALL, str(project_root))
    _pipeline(project_root / "spec/pipelines/good.html", slug="good", title="Good")
    (project_root / "spec/pipelines/bad.html").write_text(
        '<script type="application/adam-pipeline+json" id="pipeline-meta">{</script>',
        encoding="utf-8",
    )

    body = parse_json(run_script(SCRIPT, str(project_root)).stdout)
    assert body["count"] == 1
    assert body["pipelines"] == ["good"]
    assert len(body["errors"]) == 1


def test_re_run_is_idempotent(run_script, project_root: Path, parse_json):
    run_script(INSTALL, str(project_root))
    _pipeline(project_root / "spec/pipelines/foo.html", slug="foo", title="Foo")

    body1 = parse_json(run_script(SCRIPT, str(project_root)).stdout)
    block1 = _manifest_text(project_root / "spec/pipelines.html")

    body2 = parse_json(run_script(SCRIPT, str(project_root)).stdout)
    block2 = _manifest_text(project_root / "spec/pipelines.html")

    assert body1["count"] == body2["count"] == 1
    # The `generated` ISO timestamp may differ between runs; everything else
    # should be byte-identical.
    strip_generated = lambda s: re.sub(r'"generated":\s*"[^"]+"', '"generated": "X"', s)
    assert strip_generated(block1) == strip_generated(block2)


def test_fails_when_viewer_missing(run_script, project_root: Path, parse_json):
    # No INSTALL call → spec/pipelines.html doesn't exist
    (project_root / "spec/pipelines").mkdir(parents=True, exist_ok=True)
    result = run_script(SCRIPT, str(project_root), check=False)
    assert result.returncode != 0
    body = parse_json(result.stderr)
    assert body["status"] == "error"
    assert "not found" in body["message"]
