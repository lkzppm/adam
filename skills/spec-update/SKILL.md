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

## Pre-step 1 — clean the gitnexus auto-injection

`gitnexus analyze` re-injects a `<!-- gitnexus:start -->...<!-- gitnexus:end -->` block into `CLAUDE.md` on every fresh run. Before delegating to the agent, run the strip script — idempotent and silent when the markers aren't present:

```bash
bash ${CLAUDE_PLUGIN_ROOT}/scripts/strip-gitnexus-block.sh "$PWD"
```

This keeps the CLAUDE.md the agent reads in sync with what adam actually authors.

## Pre-step 2 — anchor drift check (no-arg mode only)

When invoked without a path argument, run the anchor-drift script first to scope the agent's work to specs that actually need refreshing. **Do not interpret these steps yourself; call the script.**

```bash
bash ${CLAUDE_PLUGIN_ROOT}/scripts/tools/check-anchors.sh "$PWD"
```

The script walks every `spec/**/*.md`, parses the optional `anchors:` block list in frontmatter, asks GitNexus to resolve each entry, and emits JSON:

```
{
  "summary":   { "total", "drifted", "clean", "unchecked" },
  "drifted":   [ { "spec", "missing": [{ anchor, file, symbol, kind }] } ],
  "clean":     [ { "spec", "anchor_count" } ],
  "unchecked": [ { "spec", "reason" } ]
}
```

Hold the JSON. Then:

- **`drifted` specs** → known stale, dispatch the agent with a focused prompt naming the broken anchors (cheaper than a full re-read).
- **`clean` specs** → all anchors still resolve; **skip** them entirely.
- **`unchecked` specs** → no machine-readable anchors yet; fall back to the legacy "agent re-reads everything" path for these only.

If `status != "ok"` (no spec/, gitnexus missing, repo not indexed), surface the error and stop.

## Process

Delegate to the `adam` sub-agent. The dispatch shape depends on what Pre-step 2 returned (no-arg mode) or on the user's path argument (single-spec mode).

**No-arg mode, drift-driven:**

> Run a scoped drift refresh. The anchor checker has identified the following specs as drifted (anchors no longer resolve in the GitNexus graph):
>
> ```json
> <drifted block from check-anchors.sh>
> ```
>
> For each drifted spec, open the code it describes, fix the broken anchors (the missing entries above are the seeds), and rewrite stale prose to match. **Do not touch the specs in `clean`** — their anchors all resolve, treat them as up-to-date. For specs in `unchecked` (no `anchors:` frontmatter yet), do a normal full re-read and add an `anchors:` block list to the frontmatter as you go so future runs can fast-path them. Refresh spec/INDEX.md and the CLAUDE.md spec table, re-counting tokens. Use the spec-lint MCP to verify the result.

**Single-spec mode** (user passed a path):

> Update spec/<topic>.md against the current code at <paths>. Then refresh the row in spec/INDEX.md and CLAUDE.md (re-count tokens for that spec). If the spec already has an `anchors:` frontmatter block, refresh it to match the new code state.

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
