---
name: setup
description: One-time scaffolding of a spec-driven Claude Code workflow in this project. Use when the user runs /adam:setup, /setup, or asks to "set up adam", "scaffold spec/ folder", "init spec-driven docs", "convert CLAUDE.md into a spec index", or "personalize claude code for this repo". Pipeline is strictly ordered: gitnexus analyze → spec scaffolding → per-class AskUserQuestion menus (hooks, subagents, skills) → create only what the user picks → CLAUDE.md → spec-lint verify → final brief.
---

# setup

Strict pipeline. **Do not reorder, do not skip phases, do not write `.claude/` artifacts without going through the AskUserQuestion menus.** Each phase has an output the next phase consumes.

```
P0  gitnexus analyze   ── hard prerequisite, cuts the run if missing
P1  spec/rules/        ── deterministic copy from the plugin
P2  spec scaffolding   ── overview + project/ + concepts/ + INDEX.md (NO CLAUDE.md yet)
P2b pipelines viewer   ── install spec/pipelines.html + empty spec/pipelines/
P3  three menus        ── hooks, subagents, skills (per-class AskUserQuestion)
P4  create accepted    ── only the items the user marked
P5  CLAUDE.md          ── written last, with the .claude/ artifacts in scope
P6  spec-lint verify   ── MCP call, surface + try to fix
P7  final brief        ── enumerate the features now active
```

## Arguments

Parse `$ARGUMENTS` before phase 0:

- `--force` token → set `force = true`. Allows the run to proceed even if `spec/` already has content; agent writes from scratch and ignores whatever was there.
- `--merge` token → set `merge = true`. Also lifts the populated-spec bail-out. The agent **reads** existing `spec/**/*.md`, the current `CLAUDE.md`, and the project's `.claude/` directory (agents, skills, hooks, settings.json) — mining the first two for spec content (port subsystems into `concepts/`, conventions into `project/`, high-level prose into `overview.md`) and inventorying the third so P3 doesn't propose duplicating automations the user already has. If both `--force` and `--merge` are passed, `--merge` wins (and `force` is treated as redundant).
- Everything else (after stripping `--force` and `--merge`) → trim, treat the remainder as a **focus instruction**. The user is telling you which subsystems, modules, or concepts to emphasize when picking what to write in `spec/project/*` and `spec/concepts/*`. Common shapes: `"focus on the auth submodule and the websocket dispatcher"`, `"focus: payments + the migration runner"`, `"prioritize the rendering pipeline"`. Hold the raw text — it is passed verbatim into the P2 agent prompt.

If no focus text is present, the focus instruction is empty and P2 runs in unbiased detection mode. `--merge` and a focus instruction compose freely (focus narrows what to emphasize while mining).

## When to run

- Repo has no `spec/`, OR
- Repo has `spec/` but it's empty / placeholder, OR
- User explicitly asks for re-setup with `--force` (wipe) or `--merge` (mine existing)

If `spec/` already contains content and neither `--force` nor `--merge` was passed, **stop and tell the user** to run `/adam:spec-update` instead (drift fix), `/adam:setup --merge` (migrate existing specs into adam's layout), or `/adam:setup --force` (wipe and rebuild).

## Phase 0 — gitnexus analyze (hard prerequisite)

GitNexus is a hard prerequisite — adam's anchors depend on a current `.gitnexus/` index. **Do not interpret these steps yourself; call the script.** It is idempotent and parseable.

```bash
bash ${CLAUDE_PLUGIN_ROOT}/scripts/tools/setup-graph.sh "$PWD"
```

The script:

1. Verifies `gitnexus` is on PATH. **If missing, exits non-zero with a clear `npm install -g gitnexus` hint** — relay that to the user verbatim and **stop the entire pipeline**. Do not proceed to P1.
2. Runs `gitnexus analyze` (or `--skip-git` for non-git folders) if `.gitnexus/` is absent.
3. Strips the `<!-- gitnexus:start -->...<!-- gitnexus:end -->` block that `gitnexus analyze` auto-writes into `CLAUDE.md` on first run — its prescriptive rules measurably bias the model toward extra exploration turns.
4. Merges `gitnexus` into `.mcp.json` under `mcpServers` (creates the file or splices into an existing one — never overwrites unrelated entries).

The script emits a single JSON object on stdout, e.g. `{"status":"ok","indexed":"true","stripped":"false","mcp":"created","stats":{"nodes":735,"edges":940,"clusters":18,"processes":16},...}`. **Hold the stats** — you'll surface them in the final brief.

If `status != "ok"`, surface the script's stderr and stop — every later phase depends on a working graph.

## Phase 1 — spec/rules/ (deterministic copy)

Copy the plugin's templated workflow rules into the project. **Do not interpret these steps yourself; call the script.**

```bash
bash ${CLAUDE_PLUGIN_ROOT}/scripts/template/write-spec-rules.sh "$PWD"
```

The script copies `templates/rules/*.md` into `<project>/spec/rules/` (currently `refactor.md`, `additive.md`, `orient.md`). It emits `{"status":"ok","dest":"...","files":3}`.

These rules encode adam's workflow contract — they are **not project-specific** and must NOT be edited per project. Project-specific patterns go under `spec/project/` and `spec/concepts/` instead.

## Phase 2 — spec scaffolding (NO CLAUDE.md yet)

Delegate to the `adam` sub-agent in **scaffold-only** mode:

> Run **scaffold-only** first-time setup in the current working directory. `spec/rules/` has already been populated by the parent skill — do NOT touch it. Detect the stack (manifest files, top-level dirs, infrastructure files), then write:
>
> - `spec/overview.md` (high-level "what is this project")
> - `spec/project/<area>.md` files for the conventions you can describe substantively (frontend, backend, stack, infra…)
> - `spec/concepts/<subsystem>.md` deep walkthroughs for the non-trivial subsystems worth their own page (each MUST include an anchors block)
> - `spec/INDEX.md` with a token column populated via the `token-count` MCP
>
> **Do NOT write `CLAUDE.md` in this phase.** It is generated in P5 after the user has chosen which `.claude/` artifacts to add. Do NOT write to `.claude/` either — that's P3+P4.
>
> Return:
> 1. Standard report (Created/Updated/Lint/Notes)
> 2. **Detection signals** — list the stack tags you observed (e.g. `nextjs`, `python+ruff`, `postgres+schema-sql`, `tailwindv4`, `docker-compose`, `tests-pytest`). The parent skill uses these to build the P3 menu candidates.
>
> **Merge mode (`--merge`, may be inactive):** if the parent skill set `merge = true`, the project already has a populated `spec/` tree, a `CLAUDE.md` indexing it, and (often) a `.claude/` directory with hand-built automations — all following the user's own conventions, not adam's. Before writing anything, read every existing `spec/**/*.md`, the current `CLAUDE.md`, **and the existing `.claude/` directory** (`.claude/agents/*.md`, `.claude/skills/*/SKILL.md`, `.claude/hooks/*`, `.claude/settings.json`). For each existing spec doc, decide its closest adam slot: high-level project prose → `overview.md`; style/convention notes → `spec/project/<area>.md`; deep subsystem walkthroughs → `spec/concepts/<subsystem>.md` (add an anchors block grounded in real symbols); workflow flowcharts → list them in the report as candidates for `/adam:spec-create <topic> --pipeline` (do NOT auto-write pipeline-specs). **Drop** any content that duplicates the `spec/rules/*.md` recipes — they are project-agnostic and the parent skill already wrote them in P1. **Preserve verbatim** any prose that already follows adam's terse style; lightly rewrite the rest. Overwrite freely at adam-shaped paths (e.g. `spec/overview.md`, `spec/project/<area>.md`), but **do not delete** existing files at non-adam-shaped paths (e.g. `spec/random-notes.md`) — leave them and report them under **Left for review** so the user can promote them via `/adam:spec-create` or remove them by hand. For the `.claude/` inventory: do NOT modify anything inside `.claude/` — the parent skill owns those writes in P3+P4. Just enumerate what exists and what it does. In your final report, add a **Ported from** section listing each existing spec path you mined and which new file absorbed it, AND an **Existing automations** section listing every `.claude/agents/*.md` (with the agent's purpose from its frontmatter `description:`), every `.claude/skills/*/SKILL.md` (with its purpose), every `.claude/hooks/*` (with the matcher from `settings.json` if known), and any non-trivial top-level keys in `settings.json` (permissions, env, model). The parent skill consumes this inventory in P3 to filter out menu candidates whose target file already exists — so be exhaustive: every existing artifact must appear, named exactly as it lives on disk (kebab-case basenames).
>
> **Focus instruction from the user (may be empty):** `<focus instruction>`. If non-empty, bias your coverage decisions toward the named subsystems/concepts — write deeper `spec/concepts/<subsystem>.md` pages for them, give them a `spec/project/*.md` entry if the conventions are non-trivial, and put them higher in the reading order in `INDEX.md`. **Do not drop baseline coverage** (`overview.md` and `spec/project/stack.md` are always required). If focus is empty, run unbiased detection. Focus and merge mode compose: in merge mode, the focus instruction narrows which mined content gets priority placement.

Surface the agent's report. If the agent reports failure, do not proceed to P2b.

## Phase 2b — pipelines viewer (deterministic copy)

Pipelines are a second kind of spec — static `.html` walkthroughs of how a workflow moves through the project (one HTML file per workflow, plus a global viewer at `spec/pipelines.html` that lists them in a sidebar and opens each in an iframe). They are **purely for user comprehension** and are exempt from `spec-audit`, the `spec-lint` MCP, and `check-anchors.sh` (all of which scan `*.md` only).

Phase 2b installs the **infrastructure** — viewer + empty folder + initial empty manifest. It does **not** auto-generate any individual pipeline-spec; those are written on demand by `/adam:spec-create <topic> --pipeline` once the user knows which workflows are worth a walkthrough. **Do not interpret these steps yourself; call the script.**

```bash
bash ${CLAUDE_PLUGIN_ROOT}/scripts/template/write-pipelines-viewer.sh "$PWD"
```

The script:

1. Copies `templates/pipelines/viewer.html` into `<project>/spec/pipelines.html` (overwrites with the latest template — keep customizations under the plugin, not under the project).
2. Creates an empty `<project>/spec/pipelines/` directory.
3. Calls `scripts/tools/update-pipelines-manifest.sh` to seed the viewer's inlined manifest block (`<!-- BEGIN MANIFEST -->` … `<!-- END MANIFEST -->`) — so if the project already had pipelines, they're picked up; otherwise the block is just empty.

Emits `{"status":"ok","viewer":"<path>","dir":"<path>","pipelines":N}`. Hold the count — surface it in the final brief.

## Phase 3 — three per-class AskUserQuestion menus

**This phase is mandatory.** Never write `.claude/` files without going through it. Even if you have one obvious recommendation, ask before creating.

Build candidates from the detection signals the agent returned in P2. The reference matrix:

**Merge-mode filter (`--merge` only).** If the parent run is in merge mode, the agent's P2 report includes an **Existing automations** inventory listing every `.claude/agents/<name>.md`, `.claude/skills/<name>/SKILL.md`, and `.claude/hooks/<name>.*` already on disk. Before presenting any menu, drop every candidate whose target file already exists (e.g. inventory contains `.claude/agents/py-test-runner.md` → remove `py-test-runner` from the subagents menu). The user shouldn't be asked whether to install something they already have. After filtering, if a class has zero remaining candidates, **skip the menu silently** just as if no candidates had ever existed.


| Detection signal | Hooks | Subagents | Skills |
|---|---|---|---|
| Python + ruff | `ruff-format` PostToolUse on `*.py` writes | `py-test-runner` | — |
| Python + FastAPI | — | `fastapi-route-reviewer` | — |
| Python + pytest | — | `py-test-runner` | — |
| Next.js / TS | `prettier-write` PostToolUse on `*.ts/tsx/css` | `next-route-reviewer` | — |
| Tailwind v4 | — | `tailwind-design-checker` | — |
| Postgres + `db/schema.sql` | schema-change reminder PostToolUse on `db/schema.sql` writes | — | `sql-migration-helper` |
| Rust crate | `cargo-check` PreToolUse | `cargo-test-runner` | — |
| Docker compose | — | — | `docker-compose-helper` |
| Tests dir present (any framework) | — | `test-runner` matched to framework | — |

Add stack-specific candidates beyond this matrix when the project clearly warrants them. Never invent generic options — every candidate has to map to a concrete file the agent will write in P4.

### Build the three menus, present in order

For **each** of the three classes (`hooks`, then `subagents`, then `skills`), do the following:

1. If the class has zero candidates, **skip silently** — do not call `AskUserQuestion` with an empty list.
2. If the class has one or more candidates, call `AskUserQuestion` with `multiSelect: true`. Title and header reflect the class.

**Hooks menu** (only if at least one hook candidate exists):

```
AskUserQuestion({
  questions: [{
    question: "Which hooks should adam wire into .claude/?",
    header: "Hooks",
    multiSelect: true,
    options: [
      { label: "ruff PostToolUse on *.py writes", description: "Writes .claude/hooks/ruff-format.sh and adds a PostToolUse Edit|Write entry to .claude/settings.json. Auto-formats Python after every Write/Edit." },
      { label: "schema-change reminder", description: "PostToolUse on db/schema.sql writes — prints a TODO line reminding the assistant to add a migration. Writes .claude/hooks/schema-warn.sh." }
    ]
  }]
})
```

**Subagents menu** (only if at least one subagent candidate exists):

```
AskUserQuestion({
  questions: [{
    question: "Which sub-agents should adam add to .claude/agents/?",
    header: "Subagents",
    multiSelect: true,
    options: [
      { label: "py-test-runner",        description: "Runs pytest, parses failures, writes a triage summary. .claude/agents/py-test-runner.md" },
      { label: "fastapi-route-reviewer", description: "Reviews app/api/routes/*.py for auth, validation, error shape. .claude/agents/fastapi-route-reviewer.md" }
    ]
  }]
})
```

**Skills menu** (only if at least one skill candidate exists):

```
AskUserQuestion({
  questions: [{
    question: "Which skills should adam add to .claude/skills/?",
    header: "Skills",
    multiSelect: true,
    options: [
      { label: "sql-migration-helper", description: "Slash command to draft a new migration file matching the project's existing migration style. .claude/skills/sql-migration-helper/SKILL.md" }
    ]
  }]
})
```

Hold the user's selections — they drive P4. If the user selects nothing in a class, that class contributes nothing in P4.

### Rules for the menu UX

- Each option's `description` must say **what file is created** and **what it does**, in one line.
- Never include an option for something the project doesn't need — empty class = silent skip.
- Never bundle classes into one question. Three classes, three potential questions.
- Never ask twice for the same class.
- The user's "Other" responses are free text — treat them as a feature request, not as a guaranteed candidate. If the request is concrete enough to act on, fold it into P4; otherwise note it in the final brief and skip.

## Phase 4 — create only what the user marked

For each accepted item from the P3 menus, dispatch the `adam` sub-agent in **claude-add** mode (or write directly using the same rules from `agents/adam.md` — both are valid):

- **Hooks** → write the command body to `.claude/hooks/<kebab-name>.sh` (with `#!/usr/bin/env bash` + `set -euo pipefail`, then `chmod +x`), then merge a `{ "type": "command", "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/<kebab-name>.sh" }` entry into `.claude/settings.json` under the right matcher (read existing, splice in, write back). **Never inline command bodies into `settings.json`. Never overwrite — preserve unrelated hooks the user already has.**
- **Sub-agents** → write `.claude/agents/<kebab-name>.md` with proper frontmatter (`name`, `description` enumerating trigger phrases, `model`, optional `tools`).
- **Skills** → write `.claude/skills/<kebab-name>/SKILL.md` with frontmatter and substantive instructions.

Each file must be substantive — no placeholders, no stubs. If you cannot write something useful for an accepted item, drop it and note that in the final brief rather than ship a stub.

## Phase 5 — write CLAUDE.md

CLAUDE.md is generated **last** so it can reference the actual `.claude/` artifacts that now exist. Delegate to the `adam` agent in **finalize** mode:

> Generate `CLAUDE.md` for the project. The spec tree is already in place, and `.claude/` now contains the artifacts the user accepted in P4. Use the structure documented in `agents/adam.md` (sections 1-8). The Spec Index table mirrors `spec/INDEX.md` with a Tokens column populated via the `token-count` MCP. If `.claude/agents/`, `.claude/skills/`, or `.claude/hooks/` contain entries, add a short "Project automations" subsection listing them. Do NOT touch `spec/` — it's frozen for this run.
>
> **Merge mode (`--merge`, may be inactive):** if merge mode is active, read the **pre-existing** `CLAUDE.md` before overwriting. Preserve any user-authored sections that are NOT part of adam's standard 8-section structure — typically a custom response-style block, project-specific guardrails, links to internal docs, or domain glossary entries. Append them to the new file under a single `## Project notes` heading at the end (after section 8). If the existing CLAUDE.md only contained adam-style content (or was empty / placeholder), there's nothing to preserve.

## Phase 6 — spec-lint verify

Run the `spec-lint` MCP against the project root:

```
spec-lint.lint({ root: "$PWD" })
```

Surface the result. If `ok: false`:

- Errors → fix immediately (re-dispatch the `adam` agent with the error list, or fix in-place if the issue is mechanical, e.g. a missing frontmatter field).
- Warnings → surface but don't block. Note them in the final brief.

Re-run lint after any fix until `errors: []`.

## Phase 7 — final brief

Before composing the brief, capture session token usage so the user can see how much running `/adam:setup` cost. **Do not interpret these steps yourself; call the script.**

```bash
bash ${CLAUDE_PLUGIN_ROOT}/scripts/tools/session-token-usage.sh "$PWD"
```

The script aggregates `message.usage` across every assistant message in the current Claude Code session JSONL (located via the project-slug convention `~/.claude/projects/<slug>/<session-id>.jsonl`) and emits a single JSON object: `{status, session, total, input, output, cache_creation, cache_read, turns}`. If `status != "ok"` (jq missing, session not found, etc.), surface a single `not available` line under the Tokens block instead of failing the brief.

Note: the count is **session-wide**, not strictly setup-only. Since `/adam:setup` is a one-shot bootstrap usually run as the first command in a fresh session, the number is dominated by setup work in practice — but if the user invoked other commands earlier, those tokens are included too. Caveat this in the brief by labelling the line *"this session"*.

Then compose the brief as a single message to the user, in this format:

```
adam setup complete.

Knowledge graph
  GitNexus: <indexed | newly indexed | already current>  (<nodes> nodes / <edges> edges / <clusters> clusters)

Specs
  spec/overview.md                  ── <one-line>
  spec/project/<files>              ── <count> file(s): <names>
  spec/concepts/<files>             ── <count> file(s): <names>
  spec/rules/                       ── 3 workflow recipes
  spec/INDEX.md                     ── token-counted index
  spec/pipelines.html               ── viewer for HTML workflow walkthroughs (audit-exempt)
  spec/pipelines/                   ── <count> pipeline(s) so far

Existing automations  (merge mode only — preserved as-is from .claude/)
  Hooks:     <names or "none">
  Subagents: <names or "none">
  Skills:    <names or "none">

Project automations  (only what you picked this run)
  Hooks:     <names or "none">
  Subagents: <names or "none">
  Skills:    <names or "none">

CLAUDE.md
  written, <token count> tokens

Lint
  <"clean" or summary of warnings left>

Tokens consumed (this session)
  <total>  ── input <N> · output <N> · cache creation <N> · cache read <N>  across <turns> turns
  ("not available" if scripts/tools/session-token-usage.sh returned status != ok)

Try next:
  /adam:spec-update   ── refresh specs after substantive code changes
  /adam:spec-create <topic>   ── add a new spec page
  /adam:spec-create <topic> --pipeline   ── add an HTML workflow walkthrough
  /adam:claude-add <kind> "<description>"   ── add another hook/agent/skill later
```

## Guardrails

- **Phase order is strict.** P0 missing gitnexus → stop. P2 fails → stop. P2b is best-effort — if `write-pipelines-viewer.sh` fails, surface the error but continue to P3 (the viewer is non-load-bearing). Skipping P3 is a bug — even one accepted item must go through `AskUserQuestion`.
- **Never write `.claude/` files outside P4.** No defaults, no "obvious" auto-additions.
- **CLAUDE.md is P5, not P2.** It must reflect what `.claude/` actually contains by the time you write it.
- **Never overwrite `.claude/settings.json`** — read, splice, write back.
- **Don't commit.** Leave the working tree dirty.
