<p align="center">
  <img src="public/AdamBanner.png" alt="adam" width="720" />
</p>

<p align="center"><em>A spec-driven dev workflow for Claude Code. Run once, ship every project with a curated <code>CLAUDE.md</code> + <code>spec/</code>.</em></p>

<p align="center">
  <a href="#install"><img alt="install" src="https://img.shields.io/badge/install-%2Fplugin%20marketplace%20add-000?style=flat-square"></a>
  <a href="bench/"><img alt="-25% cost" src="https://img.shields.io/badge/cost-%E2%88%9225%25%20vs%20baseline-2da44e?style=flat-square"></a>
  <a href="#commands"><img alt="commands" src="https://img.shields.io/badge/commands-5-111?style=flat-square"></a>
  <a href="#mcp-servers"><img alt="mcps" src="https://img.shields.io/badge/MCP-spec--lint%20%2B%20token--count-111?style=flat-square"></a>
  <a href="#license"><img alt="license" src="https://img.shields.io/badge/license-MIT-111?style=flat-square"></a>
</p>

---

## Why

Claude Code reads `CLAUDE.md` on every session start. Most projects either don't have one, or stuff it with everything, or let it drift. **adam** turns `CLAUDE.md` into a tight brief plus a *curated index* of `spec/*.md` files — one spec per topic, refreshed on demand, sized to fit Claude's context budget.

The result is a measurable speedup: across **8 `claude -p` runs** against [`lkzppm/portifolio`](https://github.com/lkzppm/portifolio) (n=2 per task family), Claude Code finished the same orientation + edit tasks in **−16% tokens, −25% cost, −3 turns** when adam had run first. The cost win is bigger than the token win because adam shifts Claude's context from expensive `cache_create` (file-by-file source reads) into cheap `cache_read` (one spec). [Full report in `bench/`.](bench/)

## How it works

```
your repo                                        ┌──────────────────────────┐
   │                                             │ CLAUDE.md (brief + index)│
   │   /adam:setup                               │   spec/                  │
   │   ─────────────►   adam meta-agent  ─►      │     overview.md          │
   │                    (reads code,             │     backend.md           │
   │                     detects stack,          │     frontend.md          │
   │                     writes specs)           │     INDEX.md             │
   │                                             │ .claude/                 │
   │                              + AskUserQuestion │   agents/*.md         │
   │                              ─────────────► │   settings.json (hooks) │
   │                              "want these?"  └──────────────────────────┘
```

`/adam:setup` runs in two phases:

1. **Scaffold.** A meta-agent (`agents/adam.md`) reads your repo, detects stack and subsystems, and writes 3–8 `spec/*.md` files plus a `CLAUDE.md` brief that indexes them. Token count per spec is computed via a bundled offline tokenizer and shown in the index table.
2. **Suggest.** Using `AskUserQuestion`, the skill offers a checklist of stack-tailored sub-agents/skills/hooks. Whatever you accept lands in `.claude/`. Nothing generic, nothing static, nothing gets written without your selection.

After setup, four small commands keep the system honest:

## Commands

| command | what it does |
|---|---|
| `/adam:setup` | One-time bootstrap. Scaffolds `spec/`, rewrites `CLAUDE.md`, then prompts (multi-select) to add stack-tailored hooks/skills/sub-agents. |
| `/adam:claude-add [agent\|skill\|hook] [description]` | Add **one** automation to `.claude/`. Asks for missing details. Merges `.claude/settings.json`, never overwrites. |
| `/adam:spec-create <topic>` | Add a new `spec/<topic>.md` when a fresh concept enters the project. Re-weaves the index. |
| `/adam:spec-update [path]` | Drift refresh — verify specs against current code, rewrite stale ones, refresh the index + token counts. Whole tree, or one spec. |
| `/adam:spec-audit` | Read-only health check. Reports issues without rewriting. |

Each command has a same-named skill so you can also trigger them via natural language ("update spec/", "add a sub-agent for the new auth flow").

## What lands in your repo

```
your-project/
├── CLAUDE.md                         # ~80-line brief + spec index table
├── spec/
│   ├── INDEX.md                      # one-line summary per spec
│   ├── overview.md                   # what the project is
│   ├── <subsystem>.md × 2-7          # one per detected subsystem
│   └── ...
└── .claude/                          # only if you opted in during setup
    ├── agents/<name>.md              # tailored sub-agents
    └── settings.json                 # merged hooks (existing keys preserved)
```

Specs are **self-contained for one topic** — backend conventions, frontend patterns, an integration's auth quirks, a subsystem's pipeline. Each one says *when to read it* in its description, so Claude pulls only what's needed.

## MCP servers

Two MCPs ship with the plugin and start on session start:

| Server | Tool | What it does |
|---|---|---|
| `adam:spec-lint` | `lint(path)` | Verifies `spec/` + `CLAUDE.md` + `.claude/` are well integrated. Catches oversize specs, broken cross-references, missing index entries, missing frontmatter. Returns errors/warnings/token-summary. |
| `adam:token-count` | `count(path \| text)` · `count_many(paths)` | Counts tokens for any file or string using `gpt-tokenizer` (cl100k_base, pure JS, no WASM, no API key). Within ~3-8% of Anthropic's tokenizer. |

Both used by `/adam:spec-update` and `/adam:spec-audit` automatically.

## Install

### Via marketplace

```
/plugin marketplace add lkzppm/adam
/plugin install adam@adam
```

Then in any project:

```
/adam:setup
```

### Via local symlink (development)

```bash
git clone git@github.com:lkzppm/adam.git ~/.claude/plugins/adam
# enable in CC: /plugin
```

The plugin's `SessionStart` hook auto-installs `node_modules` into `${CLAUDE_PLUGIN_DATA}` per the official Claude Code spec — no manual install step.

## Benchmark — real numbers, real repo

Eight `claude -p --output-format json` runs against [lkzppm/portifolio](https://github.com/lkzppm/portifolio): four orientation tasks (n=2 paraphrases) and four code-edit tasks (n=2 distinct features), each run against a vanilla copy and an adam-bootstrapped copy. Same model (`sonnet`), same allowed tools, same machine. [Full report + raw JSON in `bench/`.](bench/)

| Task family | Baseline avg | With-adam avg | Δ tokens | Δ cost |
|---|---:|---:|---:|---:|
| Orientation (n=2) | 61,051 t / $0.1426 | 53,188 t / $0.0829 | **−12.9%** | **−41.8%** |
| Code edit (n=2) | 208,495 t / $0.1644 | 172,402 t / $0.1475 | **−17.3%** | **−10.3%** |
| **Total (8 runs)** | **539,092 t / $0.6139** | **451,180 t / $0.4608** | **−16.3%** | **−24.9%** |

**Where the savings come from:** adam shifts Claude's context from expensive `cache_create` (per-file source reads) into cheap `cache_read` (one spec read once). One orientation run with-adam used 14% *more* tokens but cost 56% *less* dollars — the cache mix tilted heavily toward read-side hits, and `cache_read` is roughly 6× cheaper than `cache_create`.

The edit tasks also produced slightly more robust code on the with-adam side (defensive `?? []` guards, richer response shapes). All four edit runs were functionally correct.

## Preview — what the index looks like

After `/adam:setup` runs on the [portifolio](https://github.com/lkzppm/portifolio) project, `CLAUDE.md` becomes:

```md
# Lucas Pacheco — Portfolio

Personal AI-engineer portfolio site. Single-page Next.js 14 App Router app deployed
on Vercel. Includes a RAG-powered chat (/api/chat) that answers visitor questions
about Lucas's projects/experience using a TF-IDF retriever and Groq's
llama-3.3-70b-versatile for generation, plus tool-calling for fit-scoring.

## Stack
- Next.js 14 App Router on Vercel
- TypeScript 5, Tailwind CSS, JetBrains Mono
- Groq for LLM inference, Upstash Redis for rate limiting (in-memory fallback)
- Three.js / WebGL playground components

## Runtime shape
[ASCII diagram of request flow]

## Spec index
| Spec | Read when… | Tokens |
|------|-----------|--------|
| spec/overview.md | Onboarding — site purpose, deploy target, repo layout | 749 |
| spec/frontend.md | Touching layout/playground/terminal components, fonts, styling | 799 |
| spec/chat-api.md | Editing /api/chat, RAG, MCP-style tools, rate limiter | 1196 |
```

The full sample (CLAUDE.md + 3 specs) is in [`bench/with-adam-CLAUDE.md`](bench/with-adam-CLAUDE.md) and [`bench/with-adam-spec/`](bench/with-adam-spec/).

## Limitations

- **The benchmark is small** (n=2 per task family). The trend was consistent across both pairs but real published numbers want n≥10. Reproduce script + raw JSON in `bench/` so you can run more.
- **Spec quality matters.** A poorly written spec helps less or even hurts. The `spec-lint` MCP catches the obvious failure modes; the meta-agent is told to keep specs under 5,000 tokens and to ground them in real symbols. Beyond that, garbage in / garbage out.
- **adam doesn't run your tests** or check that the resulting code compiles. It's a documentation + automation scaffolder, not a verifier. Pair it with whatever test/typecheck hooks you already use.
- **`.claude/` artifacts are suggestions, not guarantees.** The setup flow proposes hooks/agents based on detected stack, but only writes what you accept via the multi-select prompt. You stay in control.
- **Markdown-only repos.** adam was designed for code repos with a recognizable stack. It also works on docs-only or research repos, but the heuristics that drive subsystem detection are weaker there.

## Compliance with the official Claude Code plugin spec

Verified against [code.claude.com/docs/en/plugins-reference](https://code.claude.com/docs/en/plugins-reference):

- ✅ Manifest at `.claude-plugin/plugin.json`, only `name` required, `$schema` URL referenced.
- ✅ Components at plugin root (commands, agents, skills, hooks, mcps).
- ✅ `${CLAUDE_PLUGIN_ROOT}` for bundled paths; `${CLAUDE_PLUGIN_DATA}` for installed dependencies (survives plugin updates).
- ✅ Agent frontmatter uses only allowed fields (`name`, `description`, `model`, `color`).
- ✅ Skill descriptions enumerate explicit trigger phrases.
- ✅ SessionStart hook follows the official `diff → npm install` pattern.
- ✅ MCP servers wired via `.mcp.json` with portable `${...}` substitutions.
- ✅ All-free, all-offline. No API keys required. Tokenizer is `gpt-tokenizer` (cl100k_base, pure JS).

## Layout

```
adam/
├── .claude-plugin/{plugin,marketplace}.json   # manifest + marketplace entry
├── .mcp.json                                  # spec-lint + token-count
├── package.json                               # one shared dep tree for both MCPs
├── hooks/hooks.json                           # SessionStart: install deps to CLAUDE_PLUGIN_DATA
├── agents/adam.md                             # the meta-agent
├── commands/                                  # slash entrypoints
│   ├── setup.md  ·  claude-add.md
│   └── spec-{create,update,audit}.md
├── skills/                                    # natural-language entrypoints
│   ├── setup/  ·  claude-add/
│   └── spec-{create,update,audit}/
├── mcps/
│   ├── lib/tokens.js                          # shared gpt-tokenizer wrapper
│   ├── spec-lint/server.js
│   └── token-count/server.js
├── scripts/smoke-test.sh                      # standalone MCP smoke test
├── bench/                                     # the comparison vs portifolio
└── public/AdamBanner.png
```

## License

MIT. Built by [Lucas Pacheco](https://github.com/lkzppm). PRs welcome.
