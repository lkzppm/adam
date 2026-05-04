---
name: claude-add
description: Add a single project-local Claude Code automation — sub-agent, skill, or hook — into .claude/. Use when the user runs /adam:claude-add, /claude-add, or asks to "add a sub-agent that...", "add a skill for X", "add a hook that runs Y on file write", "wire ruff into claude-code", "give me a code-reviewer agent for this project", or "create a new agent/skill/hook for the project". Distinct from /adam:setup (which suggests a batch); this adds exactly ONE artifact at a time, prompting for missing details via AskUserQuestion.
---

# claude-add

Add **one** Claude Code automation to the project's `.claude/` directory. Ground it in the actual stack and writing conventions adam already established (read `CLAUDE.md` and `spec/` first so the new artifact fits in).

## Modes

| Argument shape | Behavior |
|---|---|
| `agent <description>` | Create one sub-agent in `.claude/agents/`. |
| `skill <description>` | Create one skill in `.claude/skills/<name>/SKILL.md`. |
| `hook <event> <description>` | Write `.claude/hooks/<name>.sh` and add an entry to `.claude/settings.json` that references it (merged, not overwritten). |
| (no args / unclear) | Ask via `AskUserQuestion`: which kind, then what it should do. |

## Process

1. **Resolve the kind.** If the user's prompt clearly says `agent` / `skill` / `hook` (or matches a phrase like "sub-agent that…"), use that. Otherwise call:

   ```
   AskUserQuestion({
     questions: [{
       question: "What do you want to add?",
       header: "Kind",
       multiSelect: false,
       options: [
         { label: "Sub-agent", description: "A specialized agent Claude can spawn for a focused task. Lives in .claude/agents/<name>.md." },
         { label: "Skill",     description: "A natural-language-triggered procedure with its own instructions. Lives in .claude/skills/<name>/SKILL.md." },
         { label: "Hook",      description: "Event handler that runs a command (e.g. lint on file write). Writes a script to .claude/hooks/<name>.sh and references it from .claude/settings.json." }
       ]
     }]
   })
   ```

2. **Resolve the spec.** Read `CLAUDE.md` + `spec/INDEX.md` + the relevant `spec/*.md` so the new artifact references real paths and conventions. If `CLAUDE.md` lacks a spec index, tell the user to run `/adam:setup` first and stop.

3. **Resolve missing details.** If the user gave a description like `"reviews routes"` but you need to know which routes / which framework, ask one focused `AskUserQuestion`. Cap follow-ups at 2 questions total — if you still don't have what you need, ask the user to be more specific rather than guessing.

4. **Delegate writing to the `adam` sub-agent.** Pass the kind + description + the spec context you collected. Tell the agent **exactly which file** to write and what frontmatter shape to use:

   - **Sub-agent** (`.claude/agents/<kebab-name>.md`):

     ```
     ---
     name: <kebab-name>
     description: <one-line + several explicit trigger phrases>
     model: sonnet
     ---

     <substantive instructions, code-grounded>
     ```

   - **Skill** (`.claude/skills/<kebab-name>/SKILL.md`):

     ```
     ---
     name: <kebab-name>
     description: <one-line + explicit trigger phrases — e.g. "Use when the user runs /<name>, asks to ...">
     ---

     <substantive instructions>
     ```

   - **Hook** — write the executable script to `.claude/hooks/<kebab-name>.sh`, then merge a reference to it into `.claude/settings.json`. The script holds the actual command body; `settings.json` only points at it.

     Script (`.claude/hooks/ruff-format.sh`, `chmod +x`):

     ```bash
     #!/usr/bin/env bash
     set -euo pipefail
     ruff format "$CLAUDE_FILE_PATH"
     ```

     Settings entry (merged into `.claude/settings.json`):

     ```
     {
       "hooks": {
         "PostToolUse": [
           { "matcher": "Write|Edit",
             "hooks": [{ "type": "command", "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/ruff-format.sh" }] }
         ]
       }
     }
     ```

     Read the existing `.claude/settings.json` first; preserve every key that's not part of this new entry; pretty-print the result. Never inline the command body into `settings.json` — always route through a script in `.claude/hooks/`.

5. **Verify.** After writing:

   - For agents/skills: re-read the file you just wrote, confirm frontmatter parses, confirm the description includes trigger phrases.
   - For hooks: re-read `.claude/settings.json`, confirm valid JSON; confirm `.claude/hooks/<name>.sh` exists, is executable (`chmod +x`), and the `command` in settings points at it.

6. **Report.** One line per artifact created, plus a usage hint:

   > Created `.claude/agents/fastapi-route-reviewer.md`. Trigger by asking "review my routes" or auto-invoked when Claude needs route-review expertise.

## Guardrails

- One artifact per invocation. If the user asks for multiple, do them sequentially with one report each, or politely point them at `/adam:setup --force` for a batch.
- Never overwrite an existing `.claude/agents/<name>.md` or `.claude/skills/<name>/SKILL.md` without explicit confirmation. If a name collides, append a suffix (`-v2`) or ask via `AskUserQuestion`.
- Always **merge** `.claude/settings.json` — never overwrite. Use a JSON parser (e.g. read with Read, parse, mutate, stringify, Write).
- The hook command body always lives in `.claude/hooks/<name>.sh` (executable, with shebang). `settings.json` only holds the matcher + a `command` that invokes that script. Never inline a multi-token command directly into `settings.json`.
- Hooks must use `${CLAUDE_PLUGIN_ROOT}` substitutions only if the script actually lives in a plugin — for project-local hooks, use `$CLAUDE_PROJECT_DIR/.claude/hooks/<name>.sh` (and `$CLAUDE_FILE_PATH` inside the script).
- Sub-agent `tools` field should be omitted unless you have a strong reason to restrict — agents inherit all tools by default.
- Do not commit.
