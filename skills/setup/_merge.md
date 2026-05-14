# setup — `--merge` behavior

**Load this file only if `merge = true` after argument parsing.** Without `--merge` the entire file is dead weight.

`--merge` lets `/setup` run against a project that already has a populated `spec/`, a `CLAUDE.md` indexing it, and (often) a `.claude/` directory with hand-built automations — all following the user's own conventions, not adam's. Instead of bailing out (default behavior on populated spec/) or wiping (`--force`), merge mode **mines** the existing tree.

Merge mode lifts the populated-spec bail-out by itself. If both `--force` and `--merge` are passed, `--merge` wins (and `force` is treated as redundant).

## P2 — spec scaffolding under `--merge`

Append the following block to the P2 agent prompt so the agent ports existing content into adam's layout instead of writing from scratch:

> **Merge mode active.** Before writing anything, read every existing `spec/**/*.md`, the current `CLAUDE.md`, **and the existing `.claude/` directory** (`.claude/agents/*.md`, `.claude/skills/*/SKILL.md`, `.claude/hooks/*`, `.claude/settings.json`).
>
> For each existing spec doc, decide its closest adam slot:
> - high-level project prose → `overview.md`
> - style/convention notes → `spec/project/<area>.md`
> - deep subsystem walkthroughs → `spec/concepts/<subsystem>.md` (add an anchors block grounded in real symbols)
> - workflow flowcharts → list them in the report as candidates for `/adam:spec-create <topic> --pipeline` (do NOT auto-write pipeline-specs)
>
> **Drop** any content that duplicates the `spec/rules/*.md` recipes — they are project-agnostic and the parent skill already wrote them in P1. **Preserve verbatim** any prose that already follows adam's terse style; lightly rewrite the rest. Overwrite freely at adam-shaped paths (e.g. `spec/overview.md`, `spec/project/<area>.md`), but **do not delete** existing files at non-adam-shaped paths (e.g. `spec/random-notes.md`) — leave them and report them under **Left for review** so the user can promote them via `/adam:spec-create` or remove them by hand.
>
> For the `.claude/` inventory: do NOT modify anything inside `.claude/` — the parent skill owns those writes in P3+P4. Just enumerate what exists and what it does. In your final report, add a **Ported from** section listing each existing spec path you mined and which new file absorbed it, AND an **Existing automations** section listing every `.claude/agents/*.md` (with the agent's purpose from its frontmatter `description:`), every `.claude/skills/*/SKILL.md` (with its purpose), every `.claude/hooks/*` (with the matcher from `settings.json` if known), and any non-trivial top-level keys in `settings.json` (permissions, env, model). The parent skill consumes this inventory in P3 to filter out menu candidates whose target file already exists — so be exhaustive: every existing artifact must appear, named exactly as it lives on disk (kebab-case basenames).

If a focus instruction is also present, the two compose: focus narrows which mined content gets priority placement.

## P3 — menu filter under `--merge`

After P2 returns, before presenting any menu, drop every candidate whose target file already exists per the agent's **Existing automations** inventory. Examples:

- Inventory contains `.claude/agents/py-test-runner.md` → remove `py-test-runner` from the subagents menu.
- Inventory contains `.claude/hooks/ruff-format.sh` → remove the ruff PostToolUse hook from the hooks menu.
- Inventory contains `.claude/skills/sql-migration-helper/SKILL.md` → remove that skill from the skills menu.

The user shouldn't be asked whether to install something they already have. After filtering, if a class has zero remaining candidates, **skip the menu silently** just as if no candidates had ever existed.

## P5 — CLAUDE.md preservation under `--merge`

Append the following block to the P5 (finalize) agent prompt:

> **Merge mode active.** Read the **pre-existing** `CLAUDE.md` before overwriting. Preserve any user-authored sections that are NOT part of adam's standard 8-section structure — typically a custom response-style block, project-specific guardrails, links to internal docs, or domain glossary entries. Append them to the new file under a single `## Project notes` heading at the end (after section 8). If the existing CLAUDE.md only contained adam-style content (or was empty / placeholder), there's nothing to preserve.

## P7 — final brief addition under `--merge`

Include the **Existing automations** block in the final brief (between **Specs** and **Project automations**):

```
Existing automations  (preserved as-is from .claude/)
  Hooks:     <names or "none">
  Subagents: <names or "none">
  Skills:    <names or "none">
```

In non-merge runs this block is omitted entirely.
