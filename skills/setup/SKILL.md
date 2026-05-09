---
name: setup
description: One-time scaffolding of a spec-driven Claude Code workflow in this project. Use when the user runs /adam:setup, /setup, or asks to "set up adam", "scaffold spec/ folder", "init spec-driven docs", "convert CLAUDE.md into a spec index", or "personalize claude code for this repo". After scaffolding, presents an interactive menu (via AskUserQuestion) to add stack-tailored hooks, skills, and sub-agents to .claude/.
---

# setup

Three-phase bootstrap:

0. **Index** — verify GitNexus is installed and the repo is indexed. Wire `.mcp.json` so Claude can query the graph.
1. **Scaffold** — write `spec/`, `spec/INDEX.md`, and `CLAUDE.md`.
2. **Suggest** — interactively offer hooks / skills / sub-agents tailored to the detected stack, using `AskUserQuestion`. Each accepted item is created on the spot.

## When to run

- Repo has no `spec/`, OR
- Repo has `spec/` but it's empty / placeholder, OR
- User explicitly asks for re-setup with `--force`

If `spec/` already contains content and `--force` was not passed, **stop and tell the user** to run `/adam:spec-update` instead.

## Phase 0 — knowledge graph

GitNexus is a hard prerequisite — adam's anchors depend on a current `.gitnexus/` index. **Do not interpret these steps yourself; call the script.** The script is idempotent, deterministic, and parseable.

```bash
bash ${CLAUDE_PLUGIN_ROOT}/scripts/setup-graph.sh "$PWD"
```

The script:

1. Verifies `gitnexus` is on PATH (exits non-zero with a clear `npm install -g gitnexus` hint if missing — relay that to the user verbatim and stop).
2. Indexes the repo if `.gitnexus/` is absent (`gitnexus analyze` for git repos, `--skip-git` otherwise).
3. Strips the `<!-- gitnexus:start -->...<!-- gitnexus:end -->` block that `gitnexus analyze` auto-writes into `CLAUDE.md` on first run — its prescriptive "MUST run impact analysis…" rules measurably bias the model toward extra exploration turns; adam's own CLAUDE.md says what we want already.
4. Merges `gitnexus` into `.mcp.json` under `mcpServers` (creates the file or splices into an existing one — never overwrites unrelated entries).

The script emits a single JSON object on stdout, e.g. `{"status":"ok","indexed":"true","stripped":"false","mcp":"created","stats":{"nodes":735,"edges":940,"clusters":18,"processes":16},...}`. Surface those stats in the Phase 0 section of the final report. If `status != "ok"`, surface the script's stderr and stop — Phase 1 depends on a working graph.

## Phase 1 — workflow rules

Copy the plugin's templated workflow rules into the project. **Do not interpret these steps yourself; call the script.** It is deterministic and identical across every install — that's what propagates the bench-validated routing behavior.

```bash
bash ${CLAUDE_PLUGIN_ROOT}/scripts/write-spec-rules.sh "$PWD"
```

The script copies `templates/spec-rules/*.md` from the plugin into `<project>/spec/rules/`. Currently three files: `refactor.md` (cross-file refactor recipe), `additive.md` (adding new functionality), `orient.md` (read-only Q&A). It emits `{"status":"ok","dest":"...","files":3}` on stdout. Surface that in the report.

These rules are **not project-specific** and must NOT be edited per project. They encode adam's workflow contract; project-specific patterns go under `spec/project/` and `spec/concepts/` instead.

## Phase 2 — scaffold

Delegate to the `adam` sub-agent:

> Run first-time setup in the current working directory. `spec/rules/` has already been populated by the parent skill — do NOT touch it. Detect the stack (manifest files, top-level dirs, infrastructure files), then write `spec/project/<area>.md` files for the conventions you can describe substantively (frontend, backend, stack), and `spec/concepts/<subsystem>.md` deep walkthroughs for the non-trivial subsystems worth their own page. Write `spec/overview.md` and `spec/INDEX.md`. Generate CLAUDE.md as a brief + spec index with token counts (use the token-count MCP). Do **NOT** write to `.claude/` in this phase — that's handled by the parent skill via interactive prompts.

Surface the agent's report to the user before proceeding.

## Phase 3 — interactive suggestion

After the agent returns, build a list of stack-appropriate suggestions. Use the same detection signals the agent reported:

| Detection signal | Suggested artifacts |
|---|---|
| Python + ruff | `PostToolUse` hook running `ruff format` on `*.py` writes; `py-test-runner` agent |
| Python + FastAPI | `fastapi-route-reviewer` agent that reviews `app/api/routes/*.py` for auth, validation, error handling |
| Next.js / TS | `PostToolUse` hook running `prettier --write` on `*.tsx/*.ts/*.css`; `next-route-reviewer` agent |
| Tailwind v4 | `tailwind-design-checker` agent for visual consistency |
| Postgres + `db/schema.sql` | `PostToolUse` warning hook reminding to add a migration when schema changes; `sql-migration-helper` skill |
| Rust crate | `cargo-test-runner` agent; `PreToolUse` hook running `cargo check` |
| Docker compose | `docker-compose-helper` skill |
| Tests directory exists (any framework) | `test-runner` agent matched to the framework |

For each candidate, present the user with one (occasionally two) `AskUserQuestion` calls:

```
AskUserQuestion({
  questions: [{
    question: "Which automations should adam add to .claude/?",
    header: "Automations",
    multiSelect: true,
    options: [
      { label: "ruff PostToolUse hook", description: "Auto-format Python on every Write/Edit. Writes .claude/hooks/ruff-format.sh and references it from .claude/settings.json." },
      { label: "py-test-runner agent",  description: "Sub-agent that runs pytest and triages failures." },
      { label: "fastapi-route-reviewer agent", description: "Reviews route files for auth/validation/errors." }
    ]
  }]
})
```

**Rules for the question UX:**

- Group all suggestions into ONE multi-select question if there are ≤4 candidates.
- If there are >4 candidates, split into two groups (hooks vs agents/skills) — at most 2 questions total.
- Every option needs a 1-line `description` that says what file gets created and what it does.
- Never include an option for something the project doesn't need — empty is a valid suggestion list. If you have nothing useful to suggest, skip Phase 2 entirely and tell the user.

## Phase 4 — write the accepted items

For each item the user selected:

- **Hooks** → write the command body to `.claude/hooks/<kebab-name>.sh` (with `#!/usr/bin/env bash` + `set -euo pipefail`, then `chmod +x`), then merge a `{ "type": "command", "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/<kebab-name>.sh" }` entry into `.claude/settings.json` under the right matcher (read existing, splice in, write back). Never inline command bodies into `settings.json`. Never overwrite — preserve unrelated hooks the user already has.
- **Sub-agents** → write `.claude/agents/<kebab-name>.md` with proper frontmatter (`name`, `description` enumerating trigger phrases, `model`, optional `tools`).
- **Skills** → write `.claude/skills/<kebab-name>/SKILL.md` with frontmatter and substantive instructions.

Keep each file substantive — no placeholder content. If you can't write something useful, drop the suggestion rather than ship a stub.

## Output format

Three reports separated:

```
── Phase 0: knowledge graph ──
GitNexus: <indexed | newly indexed | already current>
Stats: <nodes / edges / clusters / processes>
.mcp.json: <created | merged | already wired>

── Phase 1: workflow rules ──
spec/rules/: <N files written from plugin templates>

── Phase 2: spec scaffolding ──
<adam agent's standard report — Created/Updated/Deleted/Lint/Notes — broken down by spec/project/ and spec/concepts/>

── Phase 3: project automations ──
Created:
  - .claude/agents/<name>.md  — <one-line reason>
  - .claude/hooks/<name>.sh   — <one-line reason>
  - .claude/settings.json     — <which hook events now reference which scripts>

Skipped (user declined):
  - <name> — <one-line description>

Skipped (no fit detected):
  - <category> — <reason>
```

Then close with:

> Run `/adam:spec-update` after substantive code changes, or `/adam:spec-create <topic>` when introducing a new concept. Use `/adam:claude-add <kind> "<description>"` to add another automation later.

## Guardrails

- Phase 3 must run AFTER phase 2 succeeds. If the agent fails to scaffold, do not proceed to suggestions.
- Phase 1 (rules) must run BEFORE phase 2 (scaffold) — the meta-agent references `spec/rules/` from the CLAUDE.md it generates.
- Never create empty .claude/ files — only write what the user explicitly accepted.
- Merge `.claude/settings.json`, never overwrite. The actual command body for any hook lives in `.claude/hooks/<name>.sh`; `settings.json` only references it.
- If the user has zero automations to suggest, say so and do not call AskUserQuestion at all (don't fake a question).
- Do not commit. Leave the working tree dirty.
