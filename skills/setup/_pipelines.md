# setup — pipeline-spec creation in P4

**Load this file only if the user accepted at least one item in the P3 pipelines menu.** If they accepted nothing, the entire file is dead weight.

## P4 — write the accepted pipeline-specs

For each accepted pipeline candidate (`{slug, title, description, path_hints}` from the P2 agent's `Candidate workflows`), dispatch the `adam` sub-agent in pipeline-spec mode. Pass the candidate metadata plus the contents of `${CLAUDE_PLUGIN_ROOT}/templates/pipelines/pipeline.html` as the seed.

The agent must:

- Fill every placeholder inside the JSON metadata block: `<PIPELINE_SLUG>` / `<PIPELINE_TITLE>` / `<one-line summary…>` / `<YYYY-MM-DD>`.
- Fill every placeholder in the HTML body: `{{PIPELINE_TITLE}}` / `{{BRIEF}}` / `{{AREA}}` / `{{ACTOR}}`.
- Rewrite the placeholder `flowchart TD` block with the actual workflow grounded in the candidate's `path_hints`.
- Replace the brief / steps / touched-surfaces / failure-modes sections with content from the real code.
- Write the final file to `spec/pipelines/<slug>.html`.

**Constraints:**

- The `<script type="application/adam-pipeline+json" id="pipeline-meta">` JSON block MUST stay parseable — the manifest updater reads it.
- Do NOT touch `spec/INDEX.md` or the CLAUDE.md spec table — pipeline-specs live in the viewer's manifest, not the markdown index.

## P4 — batched manifest refresh

After **all** accepted pipelines are written (one batched refresh, not one per pipeline), run:

```bash
bash ${CLAUDE_PLUGIN_ROOT}/scripts/tools/update-pipelines-manifest.sh "$PWD"
```

to refresh the sidebar in `spec/pipelines.html`. Surface any `errors[]` it reports and ask the agent to fix.

## P7 — final brief addition

The pipelines line in the brief lists what was written this run:

```
spec/pipelines/                   ── <count> pipeline(s) so far
    written this run:               <slugs you wrote, or "none">
```

If nothing was accepted in the pipelines menu, the inner "written this run" line reads `none`.
