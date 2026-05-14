# spec-update — pipeline-spec mode

**Load this file only if the user's path argument matches `spec/pipelines/<slug>.html`.** Without that signal, the entire file is dead weight.

Pipeline-specs are HTML walkthroughs — not markdown, not anchored to symbols. They don't participate in the anchor-drift check, the spec-lint MCP, or the spec-graph xref.

## Skip the pre-steps

In this mode, **skip Pre-step 1 (gitnexus boilerplate strip) and Pre-step 2 (anchor drift check) entirely** — neither applies to HTML files.

## Process

Dispatch the `adam` sub-agent like so:

> Update the pipeline-spec at `spec/pipelines/<slug>.html`. It is a self-contained HTML walkthrough — the user's intent and the path hints below describe what about the workflow has changed (new step, removed actor, refactored failure mode, etc.). Edit the file in place. Preserve the `<script type="application/adam-pipeline+json" id="pipeline-meta">` JSON block — it powers the viewer's sidebar — but bump its `updated` field to today. Mermaid diagram lives inside `<div class="mermaid">…</div>`; rewrite it as needed but keep the syntax valid. Do NOT touch `spec/INDEX.md` or the CLAUDE.md spec table.
>
> Path hints / change description:
>
> ```
> <whatever the user provided>
> ```

## Refresh the viewer manifest

After the agent finishes, refresh the viewer manifest:

```bash
bash ${CLAUDE_PLUGIN_ROOT}/scripts/tools/update-pipelines-manifest.sh "$PWD"
```

Surface any `errors[]` it reports (typically a JSON parse error if the agent broke the `pipeline-meta` block) and ask the agent to fix.

`spec/INDEX.md` and the CLAUDE.md spec table are NOT touched in this mode — pipeline-specs live in the viewer's manifest, not the markdown index.
