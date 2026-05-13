# adam test suite

Pytest exercises the plugin's shell scripts and bundled MCP servers as black-box subprocesses. No assertions reach into TypeScript or shell internals — every test runs the actual artifact a real `/adam:setup` would invoke.

## Setup

```bash
pip install -r requirements-dev.txt        # pytest only
npm install                                # for the MCP servers (bundled deps under node_modules/)
```

The MCPs run via `node --import tsx` and need the plugin's `node_modules/` populated. `npm install` is the same step `/plugin install` performs at install time.

## Running

```bash
pytest                                     # whole suite
pytest tests/test_write_pipelines_viewer.py # one file
pytest -k "project_name"                   # one pattern
pytest -m "not gitnexus"                   # skip gitnexus-dependent tests explicitly
```

## Markers

| Marker | When to add | Auto-skip |
|---|---|---|
| `gitnexus` | test requires the `gitnexus` CLI on PATH | yes, when CLI is missing |
| `mcp`      | test exercises a bundled MCP over JSON-RPC stdio | no |

The `gitnexus` skip is enforced from `conftest.py::pytest_collection_modifyitems` — never gate the test body on `shutil.which("gitnexus")` directly, that hides the skipped count in the summary.

## Layout

```
tests/
├── conftest.py                              # fixtures: plugin_root, project_root, run_script, parse_json
├── test_write_spec_rules.py                 # scripts/template/write-spec-rules.sh
├── test_write_pipelines_viewer.py           # scripts/template/write-pipelines-viewer.sh
├── test_select_seed.py                      # scripts/template/select-seed.sh
├── test_update_pipelines_manifest.py        # scripts/tools/update-pipelines-manifest.sh
├── test_session_token_usage.py              # scripts/tools/session-token-usage.sh
├── test_strip_gitnexus_block.py             # scripts/utils/strip-gitnexus-block.sh
└── test_token_count_mcp.py                  # mcps/token-count/server.ts
```

Add new tests by mirroring this structure: one file per artifact under test.
