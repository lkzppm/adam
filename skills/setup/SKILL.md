---
name: setup
description: One-time scaffolding of a spec-driven Claude Code workflow in this project. Use when the user runs /adam:setup, /setup, or asks to "set up adam", "scaffold spec/ folder", "init spec-driven docs", "convert CLAUDE.md into a spec index", or "personalize claude code for this repo". After scaffolding, presents an interactive menu (via AskUserQuestion) to add stack-tailored hooks, skills, and sub-agents to .claude/.
---

# setup

Two-phase bootstrap:

1. **Scaffold** — write `spec/`, `spec/INDEX.md`, and `CLAUDE.md`.
2. **Suggest** — interactively offer hooks / skills / sub-agents tailored to the detected stack, using `AskUserQuestion`. Each accepted item is created on the spot.

## When to run

- Repo has no `spec/`, OR
- Repo has `spec/` but it's empty / placeholder, OR
- User explicitly asks for re-setup with `--force`

If `spec/` already contains content and `--force` was not passed, **stop and tell the user** to run `/adam:spec-update` instead.

## Phase 1 — scaffold

Delegate to the `adam` sub-agent:

> Run first-time setup in the current working directory. Detect the stack (manifest files, top-level dirs, infrastructure files), decide the spec list, write specs grounded in actual code, generate CLAUDE.md as a brief + spec index with token counts (use the token-count MCP), and write spec/INDEX.md. Do **NOT** write to `.claude/` in this phase — that's handled by the parent skill via interactive prompts.

Surface the agent's report to the user before proceeding.

## Phase 2 — interactive suggestion

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
      { label: "ruff PostToolUse hook", description: "Auto-format Python on every Write/Edit. Adds to .claude/settings.json." },
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

## Phase 3 — write the accepted items

For each item the user selected:

- **Hooks** → merge into `.claude/settings.json` (read existing, splice in the new event entry, write back). Never overwrite — preserve unrelated hooks the user already has.
- **Sub-agents** → write `.claude/agents/<kebab-name>.md` with proper frontmatter (`name`, `description` enumerating trigger phrases, `model`, optional `tools`).
- **Skills** → write `.claude/skills/<kebab-name>/SKILL.md` with frontmatter and substantive instructions.

Keep each file substantive — no placeholder content. If you can't write something useful, drop the suggestion rather than ship a stub.

## Output format

Two reports separated:

```
── Phase 1: spec scaffolding ──
<adam agent's standard report — Created/Updated/Deleted/Lint/Notes>

── Phase 2: project automations ──
Created:
  - .claude/agents/<name>.md — <one-line reason>
  - .claude/settings.json     — <which hook events were added>

Skipped (user declined):
  - <name> — <one-line description>

Skipped (no fit detected):
  - <category> — <reason>
```

Then close with:

> Run `/adam:spec-update` after substantive code changes, or `/adam:spec-create <topic>` when introducing a new concept. Use `/adam:claude-add <kind> "<description>"` to add another automation later.

## Guardrails

- Phase 2 must run AFTER phase 1 succeeds. If the agent fails to scaffold, do not proceed to suggestions.
- Never create empty .claude/ files — only write what the user explicitly accepted.
- Merge `.claude/settings.json`, never overwrite.
- If the user has zero automations to suggest, say so and do not call AskUserQuestion at all (don't fake a question).
- Do not commit. Leave the working tree dirty.
