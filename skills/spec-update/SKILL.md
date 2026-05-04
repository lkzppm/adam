---
name: spec-update
description: Refresh existing specs to match the current code. Use when the user runs /adam:spec-update, /spec-update, or asks to "update spec/", "refresh project docs", "audit specs against code", "check CLAUDE.md against the code", or "sync the spec after my refactor". Detects drift between spec/*.md and the actual working tree, rewrites stale specs, merges duplicates, and refreshes spec/INDEX.md plus the CLAUDE.md spec index table (including token counts). Accepts an optional path argument to update a single spec only.
---

# spec-update

Reconcile `spec/*.md` and `CLAUDE.md` against the current state of the code.

## Modes

- **No argument** → audit all specs, rewrite drifted ones, refresh INDEX + CLAUDE.md table.
- **Single path / topic argument** → update only that spec, then refresh INDEX + table.

## Preconditions

- `spec/` directory exists and has at least one `*.md`. If not → tell the user to run `/adam:setup` and stop.
- `CLAUDE.md` exists with a spec index table.

## Process

Delegate to the `adam` sub-agent. For an all-spec audit:

> Run a drift refresh on this project. Read CLAUDE.md and every spec/*.md. For each spec, open the code it claims to describe and verify file paths, function/class names, and key constants. The code wins disputes. Rewrite stale specs in place. Delete specs whose subject was removed. Merge specs whose topics overlap > ~50%. Refresh spec/INDEX.md and the CLAUDE.md spec table, re-counting tokens. Use the spec-lint MCP to verify the result.

For a single-spec update, narrow the prompt:

> Update spec/<topic>.md against the current code at <paths>. Then refresh the row in spec/INDEX.md and CLAUDE.md (re-count tokens for that spec).

## Drift signals to look for

The agent should flag:

- File paths that no longer exist (e.g. spec mentions `src/foo.py` but code is at `core/foo.py`).
- Function / class / method names that have been renamed.
- Constants and thresholds that have changed value.
- DB tables / columns that have migrated.
- Stack claims that are wrong (e.g. spec says Node, code is Python).
- Dated "Current State (YYYY-MM-DD)" blocks more than ~3 months old that no longer match reality.

## Output format

Show the agent's final report. The standard sections it produces — `Rewrote / Deleted / Left alone / Lint / Notes` — already cover what the user needs.

## Guardrails

- Do not commit. Leave the working tree dirty.
- Do not touch `TODO.md`.
- Do not delete a spec just because the lint flagged a warning — only delete when the subject is truly gone from the code.
- Do not invent state. If a subsystem is unclear, leave a `TODO:` line in the spec and call it out in the notes section.
