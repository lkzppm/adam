---
name: spec-create
description: Add a single new spec/<topic>.md when a fresh concept, subsystem, or integration enters the project — OR add a pipeline-spec (HTML workflow walkthrough) at spec/pipelines/<topic>.html when the user passes --pipeline or asks for a "flow chart", "pipeline", "workflow diagram". Use when the user runs /adam:spec-create, /spec-create, or asks to "add a spec for X", "document the new <subsystem>", "create a spec covering <topic>", "we just added <X>, write its spec", "draw a pipeline for <flow>", "add a workflow walkthrough for <X>". Will refuse if spec-driven scaffolding (`spec/INDEX.md`, `CLAUDE.md`) is missing — points the user at /adam:setup instead.
---

# spec-create

Add ONE new spec to the project's spec set, then re-weave the index (markdown specs) or refresh the viewer manifest (pipeline-specs).

## Mode selection — markdown spec vs pipeline-spec

Inspect `$ARGUMENTS` for `--pipeline` (or interpret intent: "pipeline", "flow chart", "workflow walkthrough", "visual diagram of how X moves"). Two distinct flows below — they share Step 1 only.

- **Markdown spec** (default): grounded in symbols, anchored to code, lives in `spec/<topic>.md`, participates in the spec index + audit. Use the GitNexus preflight.
- **Pipeline-spec** (`--pipeline`): user-facing HTML walkthrough of a workflow, lives in `spec/pipelines/<topic>.html`, **does not** appear in `spec/INDEX.md` or the CLAUDE.md table, and is **exempt** from spec-audit / spec-lint. Skip the preflight entirely (a workflow rarely maps to a single symbol; forcing the preflight produces empty briefings).

## Preconditions

- `spec/INDEX.md` must exist. If it doesn't → tell the user to run `/adam:setup` first and stop.
- `CLAUDE.md` must contain a spec index table. If it doesn't → same.
- The user must have specified (or implied) a topic. If unclear, ask.
- **Pipeline mode** additionally requires `spec/pipelines.html` to exist (installed by `/adam:setup` Phase 2b). If it's missing, run `bash ${CLAUDE_PLUGIN_ROOT}/scripts/template/write-pipelines-viewer.sh "$PWD"` first to install it, then continue.

## Process — markdown spec (default)

1. Confirm the topic isn't already covered. Read every existing `spec/*.md` description; if there's a clear match, propose updating that spec instead.

2. **Run the GitNexus preflight script** to get a code-grounded briefing for the topic. **Do not interpret these steps yourself; call the script.**

   ```bash
   bash ${CLAUDE_PLUGIN_ROOT}/scripts/tools/spec-preflight.sh "<topic>" [path-hint ...]
   ```

   The script:
   - Verifies `gitnexus` is on PATH and that the current repo is indexed.
   - Calls `gitnexus query` for processes/definitions matching the topic.
   - Calls `gitnexus context` on the resulting symbols (plus any path hints the user passed).
   - Emits a single JSON briefing on stdout: `{topic, repo, summary, candidates, search_processes, path_hints}` where `candidates[]` contains `{name, uid, kind, file, line, incoming, outgoing}` for each symbol.

   Capture the JSON. **If `status != "ok"`** (gitnexus missing or repo unindexed), surface the error and stop — tell the user to run `/adam:setup` or `gitnexus analyze`. Do not delegate to the agent without a briefing.

3. **Select a stack-specific seed** so the new spec lands on the conventional layout for the project's framework. **Do not interpret these steps yourself; call the script.**

   ```bash
   bash ${CLAUDE_PLUGIN_ROOT}/scripts/template/select-seed.sh "$PWD"
   ```

   The script inspects `package.json`, `pyproject.toml`, `requirements*.txt`, and `manage.py` to detect the stack and emits JSON: `{"stack": "<name>", "seed": "<absolute path>"}` or `{"stack": "unknown", "seed": null}`. Currently shipped seeds: `nextjs`, `hono`, `fastapi`, `django`. If `seed` is `null`, skip the seed-injection paragraph in step 4 and fall back to the unseeded prompt.

4. Open the actual code the new spec will describe (use the briefing's `primary_files` as the read list) so the spec is grounded in real symbols/paths.

5. Delegate to the `adam` sub-agent, passing **both the preflight briefing and (if available) the seed contents** in one prompt:

   > Add a new spec for `<topic>` to this project. The GitNexus preflight identified the following code structure — treat it as canonical, do not re-grep symbols already resolved here:
   >
   > ```json
   > <briefing JSON from step 2>
   > ```
   >
   > Use the following stack-specific seed as your structural starting point — keep its section layout (anchors block, How-to recipe, conventions list), replace the `<…>` placeholders with concrete project values, and drop sections that don't apply. Do **not** invent sections that aren't in the seed; consistency across specs is part of how adam keeps the index readable.
   >
   > ```md
   > <contents of the seed file from step 3>
   > ```
   >
   > Write `spec/<topic>.md` with standard frontmatter (name, description, tags, updated, anchors). Use the `candidates[]` list from the briefing to populate the anchors block — every entry there is a verified `file:line:symbol` triple. Then add a row to both `spec/INDEX.md` and the spec table in `CLAUDE.md`, picking the correct reading-order position. Run the spec-lint MCP and token-count MCP to verify and to fill the token column.

   If `seed: null`, drop the seed paragraph but keep the briefing paragraph.

6. Surface the agent's report.

## Process — pipeline-spec (`--pipeline`)

1. Confirm there isn't already a `spec/pipelines/<slug>.html` describing the same workflow (sidebar listing in `spec/pipelines.html` is the canonical view — read the inlined manifest block). If there is, propose `/adam:spec-update spec/pipelines/<existing>.html` instead.

2. Pick a kebab-case `<slug>` from the topic. Today's date is the `updated` field.

3. Collect a **light path-hint set** from the user's `$ARGUMENTS` and (if useful) one or two `gitnexus query` calls. Do **not** call `scripts/tools/spec-preflight.sh` — that script is shaped for symbol-anchored markdown specs and produces noisy/empty output for cross-cutting workflows. Path hints feed the agent's brief; they are not embedded in the file.

4. Read the seed template:

   ```bash
   cat ${CLAUDE_PLUGIN_ROOT}/templates/pipelines/pipeline.html
   ```

5. Delegate to the `adam` sub-agent in pipeline-spec mode:

   > Add a pipeline-spec for `<topic>` at `spec/pipelines/<slug>.html`. The seed template below is your structural starting point — replace every `<PLACEHOLDER>` and the placeholder Mermaid `flowchart TD` block with the actual workflow. Keep the section order (Flow → Brief → Steps → Touched surfaces → Failure modes); drop sections that don't apply rather than inventing content. The file MUST stand alone in a browser (it loads Mermaid from a CDN), and its `<script type="application/adam-pipeline+json" id="pipeline-meta">` block MUST stay parseable JSON — the manifest updater reads it.
   >
   > Path hints from the user (use these to ground the Steps + Touched surfaces sections):
   >
   > ```
   > <path hints>
   > ```
   >
   > Seed template (verbatim, replace placeholders):
   >
   > ```html
   > <contents of templates/pipelines/pipeline.html>
   > ```
   >
   > Do NOT touch `spec/INDEX.md` or the `CLAUDE.md` spec table — pipeline-specs live in `spec/pipelines.html`, not the markdown index.

6. Once the file is written, refresh the viewer manifest:

   ```bash
   bash ${CLAUDE_PLUGIN_ROOT}/scripts/tools/update-pipelines-manifest.sh "$PWD"
   ```

   The script walks `spec/pipelines/*.html`, extracts each file's `pipeline-meta` JSON, and rewrites the manifest block inside `spec/pipelines.html` between the `<!-- BEGIN MANIFEST -->` / `<!-- END MANIFEST -->` sentinels. If it reports any `errors[]` (e.g. malformed JSON in the new file), surface them and ask the agent to fix.

7. Tell the user the path they can open in a browser: `spec/pipelines.html` (the viewer auto-selects the new pipeline if they pass `#<slug>` in the fragment) or `spec/pipelines/<slug>.html` (standalone view).

## Frontmatter for the new spec

```
---
name: <topic>
description: <one-line summary, used by future spec-create/update calls for relevance checks>
tags: [<a few>]
updated: YYYY-MM-DD
---
```

Use today's date. Tags should be the 2–4 closest topical labels (e.g. `[backend, fastapi, auth]`).

## Reading-order placement

In `INDEX.md` and the CLAUDE.md table:

- `overview.md` always first.
- Major subsystem specs (backend, frontend, infrastructure) before integration / detail specs.
- Integration specs (one per external service) grouped together, after subsystem specs.
- Workflow / flowchart specs last.

## Output format

Show the agent's final report to the user. Then one line:

> If this concept replaces or overlaps with an existing spec, run `/adam:spec-update` to reconcile.

For pipeline-spec mode the "follow-up" line is instead:

> Open `spec/pipelines.html` in a browser to navigate, or `spec/pipelines/<slug>.html` standalone. Re-run with `/adam:spec-update spec/pipelines/<slug>.html` when the workflow changes.
