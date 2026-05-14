# spec-create — `--pipeline` mode

**Load this file only if `--pipeline` is in `$ARGUMENTS` (or the user clearly asked for a "pipeline", "flow chart", "workflow walkthrough", "visual diagram of how X moves").** Without that signal, the entire file is dead weight.

Pipeline-spec mode produces a user-facing HTML walkthrough at `spec/pipelines/<slug>.html`. It is **distinct** from a markdown spec:

- Does NOT appear in `spec/INDEX.md` or the CLAUDE.md spec table.
- **Exempt** from spec-audit / spec-lint / check-anchors.sh (those scan `*.md`).
- **Skips the GitNexus preflight script entirely** — workflows rarely map to a single symbol; forcing the preflight produces empty briefings.
- Requires `spec/pipelines.html` (installed by `/adam:setup` Phase 2b). If missing, run `bash ${CLAUDE_PLUGIN_ROOT}/scripts/template/write-pipelines-viewer.sh "$PWD"` first.

## Process

1. Confirm there isn't already a `spec/pipelines/<slug>.html` describing the same workflow. The sidebar listing in `spec/pipelines.html` is the canonical view — read the inlined manifest block. If there is, propose `/adam:spec-update spec/pipelines/<existing>.html` instead.

2. Pick a kebab-case `<slug>` from the topic. Today's date is the `updated` field.

3. Collect a **light path-hint set** from the user's `$ARGUMENTS` and (if useful) one or two `gitnexus query` calls. Do **not** call `scripts/tools/spec-preflight.sh` — that script is shaped for symbol-anchored markdown specs and produces noisy/empty output for cross-cutting workflows. Path hints feed the agent's brief; they are not embedded in the file.

4. Read the seed template:

   ```bash
   cat ${CLAUDE_PLUGIN_ROOT}/templates/pipelines/pipeline.html
   ```

5. Delegate to the `adam` sub-agent in pipeline-spec mode:

   > Add a pipeline-spec for `<topic>` at `spec/pipelines/<slug>.html`. The seed template below is your structural starting point — replace every placeholder (`<PIPELINE_SLUG>` / `<PIPELINE_TITLE>` / `<one-line summary…>` / `<YYYY-MM-DD>` inside the JSON metadata block, plus `{{PIPELINE_TITLE}}` / `{{BRIEF}}` / `{{AREA}}` / `{{ACTOR}}` in the HTML body) and the placeholder Mermaid `flowchart TD` block with the actual workflow. Keep the section order (Flow → Brief → Steps → Touched surfaces → Failure modes); drop sections that don't apply rather than inventing content. The file MUST stand alone in a browser (it loads Mermaid from a CDN), and its `<script type="application/adam-pipeline+json" id="pipeline-meta">` block MUST stay parseable JSON — the manifest updater reads it.
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

## Output

Show the agent's final report. Then one follow-up line:

> Open `spec/pipelines.html` in a browser to navigate, or `spec/pipelines/<slug>.html` standalone. Re-run with `/adam:spec-update spec/pipelines/<slug>.html` when the workflow changes.
