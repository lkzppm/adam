---
name: spec-create
description: Add a single new spec/<topic>.md when a fresh concept, subsystem, or integration enters the project. Use when the user runs /adam:spec-create, /spec-create, or asks to "add a spec for X", "document the new <subsystem>", "create a spec covering <topic>", "we just added <X>, write its spec". Will refuse if spec-driven scaffolding (`spec/INDEX.md`, `CLAUDE.md`) is missing — points the user at /adam:setup instead.
---

# spec-create

Add ONE new spec to the project's spec set, then re-weave the index.

## Preconditions

- `spec/INDEX.md` must exist. If it doesn't → tell the user to run `/adam:setup` first and stop.
- `CLAUDE.md` must contain a spec index table. If it doesn't → same.
- The user must have specified (or implied) a topic. If unclear, ask.

## Process

1. Confirm the topic isn't already covered. Read every existing `spec/*.md` description; if there's a clear match, propose updating that spec instead.
2. **Select a stack-specific seed** so the new spec lands on the conventional layout for the project's framework. **Do not interpret these steps yourself; call the script.**

   ```bash
   bash ${CLAUDE_PLUGIN_ROOT}/scripts/template/select-seed.sh "$PWD"
   ```

   The script inspects `package.json`, `pyproject.toml`, `requirements*.txt`, and `manage.py` to detect the stack and emits JSON: `{"stack": "<name>", "seed": "<absolute path>"}` or `{"stack": "unknown", "seed": null}`. Currently shipped seeds: `nextjs`, `hono`, `fastapi`, `django`. If `seed` is `null`, skip step 3's seed-injection paragraph in the agent prompt and fall back to the prior unseeded behavior.

3. Open the actual code the new spec will describe so it's grounded in real symbols/paths.
4. Delegate to the `adam` sub-agent. If a seed was returned, pass its content to the agent as a structural skeleton:

   > Add a new spec for `<topic>` to this project. The relevant code lives at `<paths or globs>`. Use the following stack-specific seed as your structural starting point — keep its section layout (anchors block, How-to recipe, conventions list), replace the `<…>` placeholders with concrete project values, and drop sections that don't apply. Do **not** invent sections that aren't in the seed; consistency across specs is part of how adam keeps the index readable.
   >
   > ```md
   > <contents of the seed file>
   > ```
   >
   > Then add a row to both `spec/INDEX.md` and the spec table in `CLAUDE.md`, picking the correct reading-order position. Run the spec-lint MCP and token-count MCP to verify and to fill the token column.

   If `seed: null`, omit the seed paragraph and dispatch with the original unseeded prompt.

5. Surface the agent's report.

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
