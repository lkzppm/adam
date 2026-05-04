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
2. Open the actual code the new spec will describe so it's grounded in real symbols/paths.
3. Delegate to the `adam` sub-agent with a prompt like:

   > Add a new spec for `<topic>` to this project. The relevant code lives at `<paths or globs>`. Write `spec/<topic>.md` with standard frontmatter (name, description, tags, updated) and substantive code-grounded content. Then add a row to both `spec/INDEX.md` and the spec table in `CLAUDE.md`, picking the correct reading-order position. Run the spec-lint MCP and token-count MCP to verify and to fill the token column.

4. Surface the agent's report.

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
