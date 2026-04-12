<p align="center">
  <img src="public/AdamBanner.png" alt="adam" width="720" />
</p>

<p align="center"><em>One meta-agent walks into your repo and walks out with a team that already knows your stack.</em></p>

---

`adam` is a Claude Code plugin. Run `/adam:setup` and it reads your codebase, decides which specialists the project actually needs, and writes a personalized roster of sub-agents, a routing block in `CLAUDE.md`, stack-aware hooks, and a `spec/` folder of token-measured project knowledge — directly into your repo. Nothing generic, nothing fixed. The point is to spend fewer tokens on boilerplate and get better answers from agents that each hold one concern in their own context window.

## Quickstart

```
/plugin marketplace add lkz/adam
/plugin install adam@adam
/adam:setup
```

The MCP server ships pre-built — no `npm install` step, no build step. Install and go.

## What you get

After `/adam:setup`, these files exist in your project:

| path | what it is |
|---|---|
| `.claude/agents/*.md` | 3–6 sub-agents personalized to your actual stack — model, effort, scope, and terse-output rules picked per role. |
| `CLAUDE.md` | Orchestrator rules inside an `<!-- adam-managed -->` block. Contains the stack summary, the agent roster, and parallel-dispatch routing examples. Your hand-written content outside the markers is untouched. |
| `.claude/settings.json` | Merged in place. Adds `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` and only the hooks your stack justifies (prettier, eslint, tsc, ruff, black, rustfmt, gofmt). |
| `spec/*.md` + `spec/INDEX.md` | Machine-maintained project knowledge. Each spec has YAML frontmatter with `agents`, `tags`, and a real `tokens` count. `INDEX.md` is regenerated, never hand-edited. |

## Commands

| command | what it does |
|---|---|
| `/adam:setup` | Scan project, generate agents, write `CLAUDE.md`, merge hooks, seed `spec/`. Idempotent — safe to re-run. |
| `/spec` | Scan project and create or update `spec/*.md`. Preserves hand-edits; merges new findings into an `## Updates` section. |
| `/spec-create "<subject>"` | Create one new spec on a subject, grounded in files the meta-agent actually read. |
| `/spec-dream` | Audit every spec for redundancy, stale content, and preamble. Rewrite for minimum tokens. Report the delta. |

## How it saves tokens

Four mechanics, all concrete:

1. **Terse-output rules in every sub-agent.** Generated sub-agents inline `templates/rules/terse-output.md` into their system prompt: no preamble, no closing recap, ≤2 sentences of prose, `path:line` references, refuse out-of-scope tasks. You stop paying for "I'll now…" and "Let me know if…" on every call.
2. **Specs loaded per-role, not per-session.** Each sub-agent's frontmatter lists only the specs its role cares about. The orchestrator sees `spec/INDEX.md` (titles + token counts, no bodies) through a `SessionStart` hook; bodies are pulled on demand via the MCP server.
3. **Parallel dispatch with isolated context windows.** Cross-cutting work fans out — each teammate runs in its own context window on one concern, merged in the lead. A 4-teammate fan-out is four small prompts, not one bloated one.
4. **`/spec-dream` measures real deltas.** Token counts come from `gpt-tokenizer` (o200k_base), not estimates. `/spec-dream` captures `before`, rewrites, reindexes, captures `after`, and prints `{before}t → {after}t ({delta}t saved, {pct}%)`.

Real example from a Next.js portfolio with 6 specs:

```
| spec             | agents                                                 | tokens |
|------------------|--------------------------------------------------------|--------|
| build-and-deploy | deploy-vercel                                          |    364 |
| contact-api      | api-routes, web-ui                                     |    183 |
| landing-page     | web-ui                                                 |    340 |
| overview         | web-ui, three-playground, terminal, api-routes, …      |    477 |
| playgrounds      | three-playground                                       |    277 |
| terminal         | terminal                                               |    248 |
Total: 6 specs, 1889 tokens.
```

The orchestrator sees that table. A `web-ui` teammate only loads `landing-page`, `contact-api`, and `overview` — it never pays for `playgrounds` or `build-and-deploy`.

## Under the hood

- **`adam-context-mcp`** — stdio MCP server. Tools: `list_specs({ agent?, tag? })`, `read_spec({ name })`, `search_specs({ query, limit? })`, `spec_index()`. Token counts come from `gpt-tokenizer` (o200k_base), cached by file `mtime`. Spec dir is `./spec` by default, overridable with `ADAM_SPEC_DIR`.
- **Meta-agent pattern.** There is one agent — `adam`, opus, high effort. It does not write application code. It generates project-local artifacts and delegates. This keeps the plugin itself small and forces every personalization decision to happen at setup time, inside a real repo scan.
- **Reindex is a script, not a prompt.** `node mcp/adam-context-mcp/dist/reindex.js` walks `spec/*.md`, stamps real token counts into each file's frontmatter, and rewrites `spec/INDEX.md`. No LLM call, no drift between the table and the files.
- **Agent teams, with a fallback.** On Opus sessions with `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`, cross-cutting tasks spawn a real [Claude Code agent team](https://code.claude.com/docs/en/agent-teams) with a shared task list. On Sonnet (where teams aren't available), adam falls back to Agent/Task fan-out — a single message with multiple tool calls, each sub-agent in its own isolated sub-context. You lose cross-teammate messaging, you keep the isolated windows.

## Publishing

`adam` will be submitted to the Claude Code plugin marketplace. The MCP server ships bundled, but `adam-context-mcp` is also publishable as a standalone npm package — any MCP host that can read a `spec/` folder gets the same tools.

## License

MIT — lkz
