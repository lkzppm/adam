<p align="center">
  <img src="public/AdamBanner.png" alt="adam" width="720" />
</p>

<p align="center"><em>One meta-agent walks into your repo and walks out with a team that already knows your stack.</em></p>

<p align="center">
  <a href="#quickstart"><img alt="install" src="https://img.shields.io/badge/install-%2Fplugin%20install%20adam-000?style=flat-square"></a>
  <a href="#projected-benchmarks"><img alt="tokens" src="https://img.shields.io/badge/tokens-~60%25%20less-111?style=flat-square"></a>
  <a href="#commands"><img alt="commands" src="https://img.shields.io/badge/commands-4-111?style=flat-square"></a>
  <a href="#license"><img alt="license" src="https://img.shields.io/badge/license-MIT-111?style=flat-square"></a>
</p>

---

`adam` is a Claude Code plugin. Run `/adam:setup` and it reads your codebase, decides which specialists the project actually needs, and writes a personalized roster of sub-agents, a routing block in `CLAUDE.md`, stack-aware hooks, and a `spec/` folder of token-measured project knowledge — straight into your repo. Nothing generic, nothing fixed. Every project gets a team that was built for *that* project.

The goal is simple: **spend fewer tokens on boilerplate, and get better answers from agents that hold one concern at a time in their own context window.**

## Quickstart

```
/plugin marketplace add lkzrat/adam
/plugin install adam@adam
/adam:setup
```

Three commands. No build step, no dependencies to wire up. When `/adam:setup` finishes, open `CLAUDE.md` and `.claude/agents/` in your project — you'll see a team that mentions your actual frameworks by name.

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

## Projected benchmarks

> These are **projections** based on the component savings above, not end-to-end measurements. Your numbers will depend on project size and task shape. The one real number in the table — 1889 — is taken from a live `/spec-dream` run on a Next.js portfolio with six specs.

Feature-sized task ("add a login form") in a mid-sized Next.js + Postgres repo:

| layer | vanilla Claude Code | with `adam` | delta |
|---|---:|---:|---:|
| Orchestrator pickup (CLAUDE.md + initial file reads) | ~6,000 in | ~1,200 in | **−80%** |
| Spec / context injection per specialist | ~12,000 in | ~4,000 in | **−66%** |
| Output prose per sub-agent (preamble + recap) | ~800 out | ~250 out | **−69%** |
| Four-agent cross-cutting feature (total session) | ~52,000 | ~21,000 | **−60%** |

Per-role spec load, real numbers from the Next.js portfolio:

```
Total spec corpus:                1,889 tokens
Orchestrator sees (INDEX.md):       ~150 tokens     ( 12× smaller )
web-ui teammate loads:            ~1,000 tokens     ( 47% of total )
deploy-vercel teammate loads:        364 tokens     ( 19% of total )
```

Why the multipliers are plausible:

- **Preamble stripping alone** is a verifiable 50–150 tokens saved per sub-agent response. Over a 30-turn feature, that's 1.5k–4.5k output tokens you no longer pay for.
- **The orchestrator never reads a spec body.** It only sees a table of titles + token counts, and delegates. That's an hard cap on orchestrator context growth.
- **Parallel isolation multiplies the gains.** Four specialists in four small context windows beat one bloated session on both latency *and* total tokens — they don't have to drag each other's scratch work through every turn.
- **`/spec-dream` is the escape hatch.** Run it when specs bloat, watch it print the delta, merge the rewrite. No manual audit.

### Quality, not just tokens

Fewer tokens isn't the only win. Specialized context also changes *what* each agent can see:

| axis | vanilla Claude Code | with `adam` |
|---|---|---|
| Agent identity | one generalist | 3–6 specialists, each named for your stack |
| Context per turn | everything the session has ever touched | only the specs + files the role needs |
| Routing a cross-cutting task | sequential, one mind | parallel fan-out, one mind per concern |
| Out-of-scope guard | none | explicit `out of scope, dispatch to <agent>` reply |
| "What does this project do?" | derived from scratch each time | read from `spec/INDEX.md` in one tool call |

The result: sub-agents that say less and do more, and an orchestrator that routes instead of guesses.

## Under the hood

- **`adam-context-mcp`** — stdio MCP server. Tools: `list_specs({ agent?, tag? })`, `read_spec({ name })`, `search_specs({ query, limit? })`, `spec_index()`. Token counts come from `gpt-tokenizer` (o200k_base), cached by file `mtime`. Spec dir is `./spec` by default, overridable with `ADAM_SPEC_DIR`.
- **Meta-agent pattern.** There is one agent — `adam`, opus, high effort. It does not write application code. It generates project-local artifacts and delegates. This keeps the plugin itself small and forces every personalization decision to happen at setup time, inside a real repo scan.
- **Reindex is a script, not a prompt.** A tiny Node CLI walks `spec/*.md`, stamps real token counts into each file's frontmatter, and rewrites `spec/INDEX.md`. No LLM call, no drift between the table and the files.
- **Agent teams, with a fallback.** On Opus sessions with `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`, cross-cutting tasks spawn a real [Claude Code agent team](https://code.claude.com/docs/en/agent-teams) with a shared task list. On Sonnet (where teams aren't available), adam falls back to Agent/Task fan-out — a single message with multiple tool calls, each sub-agent in its own isolated sub-context. You lose cross-teammate messaging, you keep the isolated windows.

## License

MIT — lkz
