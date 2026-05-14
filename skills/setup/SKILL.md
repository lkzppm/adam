---
name: setup
description: One-time scaffolding of a spec-driven Claude Code workflow in this project. Use when the user runs /adam:setup, /setup, or asks to "set up adam", "scaffold spec/ folder", "init spec-driven docs", "convert CLAUDE.md into a spec index", or "personalize claude code for this repo". Pipeline is strictly ordered: gitnexus analyze → spec scaffolding → per-class AskUserQuestion menus (hooks, subagents, skills) → create only what the user picks → CLAUDE.md → spec-lint verify → final brief.
---

# setup

Strict pipeline. **Do not reorder, do not skip phases, do not write `.claude/` artifacts without going through the AskUserQuestion menus.** Each phase has an output the next phase consumes.

```
P0  gitnexus analyze   ── unconditional first action; script is idempotent
P1  spec/rules/        ── deterministic copy from the plugin
P2  spec scaffolding   ── overview + project/ + concepts/ + INDEX.md (NO CLAUDE.md yet)
P2b pipelines viewer   ── install spec/pipelines.html + empty spec/pipelines/
P3  three menus        ── hooks, subagents, skills (per-class AskUserQuestion)
P4  create accepted    ── only the items the user marked
P5  CLAUDE.md          ── written last, with the .claude/ artifacts in scope
P6  spec-lint verify   ── MCP call, surface + try to fix
P7  final brief        ── enumerate the features now active
```

## Phase 0 — gitnexus analyze (FIRST ACTION, unconditional)

**This is the very first thing you do in any `/setup` invocation.** Before parsing `$ARGUMENTS`, before checking whether `spec/` is populated, before deciding `--force` vs `--merge`, before any reasoning about what the user wants — call the script. The script is idempotent: if the project is already indexed it returns `"indexed":"already"` in milliseconds, so there is no cost to running it every time. **There is no condition under which you skip this call.**

```bash
bash ${CLAUDE_PLUGIN_ROOT}/scripts/tools/setup-graph.sh "$PWD"
```

The script:

1. Verifies `gitnexus` is on PATH. **If missing, exits non-zero with a clear `npm install -g gitnexus` hint** — relay that to the user verbatim and **stop the entire pipeline**. Do not proceed to Arguments parsing or P1.
2. Runs `gitnexus analyze` (or `--skip-git` for non-git folders) if `.gitnexus/` is absent. If present, reports `"indexed":"already"` and moves on.
3. Strips the `<!-- gitnexus:start -->...<!-- gitnexus:end -->` block that `gitnexus analyze` auto-writes into `CLAUDE.md` on first run — its prescriptive rules measurably bias the model toward extra exploration turns.
4. Merges `gitnexus` into `.mcp.json` under `mcpServers` (creates the file or splices into an existing one — never overwrites unrelated entries).

The script emits a single JSON object on stdout, e.g. `{"status":"ok","indexed":"true","stripped":"false","mcp":"created","stats":{"nodes":735,"edges":940,"clusters":18,"processes":16},...}`. **Hold the stats** — you'll surface them in the final brief.

If `status != "ok"`, surface the script's stderr and stop — every later phase depends on a working graph.

**Only after the script returns ok** do you move on to parse `$ARGUMENTS` and check the populated-spec bail-out below.

## Arguments

After P0 completes, parse `$ARGUMENTS`:

- `--force` token → set `force = true`. Allows the run to proceed even if `spec/` already has content; agent writes from scratch and ignores whatever was there.
- `--merge` token → set `merge = true`. Also lifts the populated-spec bail-out. **If merge is true, immediately `Read` `${CLAUDE_PLUGIN_ROOT}/skills/setup/_merge.md` for the merge-specific behavior** — that file extends P2, P3, P5, and P7. Without `--merge`, do NOT load it.
- Everything else (after stripping `--force` and `--merge`) → trim, treat the remainder as a **focus instruction**. The user is telling you which subsystems, modules, or concepts to emphasize when picking what to write in `spec/project/*` and `spec/concepts/*`. Common shapes: `"focus on the auth submodule and the websocket dispatcher"`, `"focus: payments + the migration runner"`, `"prioritize the rendering pipeline"`. Hold the raw text — it is passed verbatim into the P2 agent prompt.

If no focus text is present, the focus instruction is empty and P2 runs in unbiased detection mode. `--merge` and a focus instruction compose freely (focus narrows what to emphasize while mining).

## When to run

- Repo has no `spec/`, OR
- Repo has `spec/` but it's empty / placeholder, OR
- User explicitly asks for re-setup with `--force` (wipe) or `--merge` (mine existing)

If `spec/` already contains content and neither `--force` nor `--merge` was passed, **stop and tell the user** to run `/adam:spec-update` instead (drift fix), `/adam:setup --merge` (migrate existing specs into adam's layout), or `/adam:setup --force` (wipe and rebuild). P0 has already run by this point — that's fine; `setup-graph.sh` is idempotent and a current `.gitnexus/` index is useful for whatever the user runs next.

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
> 2. **Detection signals** — list the stack tags you observed (e.g. `nextjs`, `python+ruff`, `postgres+schema-sql`, `tailwindv4`, `docker-compose`, `tests-pytest`). The parent skill uses these to build the P3 hook/subagent/skill menu candidates.
> 3. **Candidate workflows** — identify **0–3** user-facing or operator-facing workflows worth a pipeline-spec walkthrough. Only surface flows you can substantiate from real code (an auth route, a checkout endpoint, a deploy script, a CRON job, a webhook handler, a queue consumer, a long-running pipeline). For each, return a small JSON-shaped record: `{slug: kebab-case, title: 1-line, description: 1-line, path_hints: [2-4 file paths most relevant to the flow]}`. **Do not pad.** If nothing obvious presents (read-only library, infrastructure shim, plugin), return an empty list. The parent skill turns this into the P3 pipelines menu — every candidate the user accepts becomes a `spec/pipelines/<slug>.html` written in P4.
>
> **Focus instruction from the user (may be empty):** `<focus instruction>`. If non-empty, bias your coverage decisions toward the named subsystems/concepts — write deeper `spec/concepts/<subsystem>.md` pages for them, give them a `spec/project/*.md` entry if the conventions are non-trivial, and put them higher in the reading order in `INDEX.md`. **Do not drop baseline coverage** (`overview.md` and `spec/project/stack.md` are always required). If focus is empty, run unbiased detection.

If `merge = true`, append the merge-mode block from `_merge.md` (section: "P2 — spec scaffolding under `--merge`") to the prompt before dispatching. Otherwise dispatch as-is.

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

## Phase 3 — four per-class AskUserQuestion menus

**This phase is mandatory.** Never write `.claude/` files or pipeline-specs without going through it. Even if you have one obvious recommendation, ask before creating.

Four candidate classes, four potential menus: **hooks**, **subagents**, **skills** (all drawn from the agent's `Detection signals`), and **pipelines** (drawn from the agent's `Candidate workflows`). Build candidates from the detection signals the agent returned in P2. The reference matrix for the first three:

If `merge = true`, apply the merge-mode filter described in `_merge.md` (section: "P3 — menu filter under `--merge`") before presenting any menu — it drops candidates whose target files already exist.

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

### Build the four menus, present in order

For **each** of the four classes (`hooks`, then `subagents`, then `skills`, then `pipelines`), do the following:

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

**Pipelines menu** (only if the agent returned at least one `Candidate workflow`):

```
AskUserQuestion({
  questions: [{
    question: "Which workflows should adam draft as pipeline-specs (HTML walkthroughs with Mermaid flow charts)?",
    header: "Pipelines",
    multiSelect: true,
    options: [
      { label: "user-signup",    description: "User signup flow — from form submit through email confirmation. Writes spec/pipelines/user-signup.html." },
      { label: "deploy-pipeline", description: "CI deploy from main → production. Writes spec/pipelines/deploy-pipeline.html." }
    ]
  }]
})
```

Each pipeline option's `label` is the candidate `slug`; the `description` is the candidate's `description` plus the target file path so the user sees what gets written.

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
- **Pipelines** → **only if the user accepted at least one item in the P3 pipelines menu, `Read` `${CLAUDE_PLUGIN_ROOT}/skills/setup/_pipelines.md` and follow it** for the agent dispatch shape, placeholder list, and batched manifest refresh. If no pipelines were accepted, skip this bullet entirely and do NOT load the file.

Each file must be substantive — no placeholders, no stubs. If you cannot write something useful for an accepted item, drop it and note that in the final brief rather than ship a stub.

## Phase 5 — write CLAUDE.md

CLAUDE.md is generated **last** so it can reference the actual `.claude/` artifacts that now exist. Delegate to the `adam` agent in **finalize** mode:

> Generate `CLAUDE.md` for the project. The spec tree is already in place, and `.claude/` now contains the artifacts the user accepted in P4. Use the structure documented in `agents/adam.md` (sections 1-8). The Spec Index table mirrors `spec/INDEX.md` with a Tokens column populated via the `token-count` MCP. If `.claude/agents/`, `.claude/skills/`, or `.claude/hooks/` contain entries, add a short "Project automations" subsection listing them. Do NOT touch `spec/` — it's frozen for this run.

If `merge = true`, append the merge-mode block from `_merge.md` (section: "P5 — CLAUDE.md preservation under `--merge`") to the prompt before dispatching.

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
      written this run:               <slugs you wrote in P4, or "none">

(If `merge = true`, insert the "Existing automations" block here per `_merge.md` — section "P7 — final brief addition under `--merge`". Omit it entirely in non-merge runs.)

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

- **Phase order is strict.** P0 is unconditional and runs before anything else — including argument parsing and the populated-spec bail-out; skipping it is a bug. P0 missing gitnexus → stop. P2 fails → stop. P2b is best-effort — if `write-pipelines-viewer.sh` fails, surface the error but continue to P3 (the viewer is non-load-bearing). Skipping P3 is a bug — even one accepted item must go through `AskUserQuestion`.
- **Never write `.claude/` files outside P4.** No defaults, no "obvious" auto-additions.
- **CLAUDE.md is P5, not P2.** It must reflect what `.claude/` actually contains by the time you write it.
- **Never overwrite `.claude/settings.json`** — read, splice, write back.
- **Don't commit.** Leave the working tree dirty.
