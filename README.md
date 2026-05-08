<p align="center">
  <img src="public/AdamBanner.png" alt="adam" width="720" />
</p>

<p align="center"><em>Spec-driven docs + a knowledge graph for Claude Code. One <code>/adam:setup</code> and every project ships with a curated <code>CLAUDE.md</code>, a <code>spec/</code> tree, and a live GitNexus index Claude can query for callers, callees, and blast radius.</em></p>

<p align="center">
  <a href="#install"><img alt="install" src="https://img.shields.io/badge/install-%2Fplugin%20marketplace%20add-000?style=flat-square"></a>
  <a href="bench/"><img alt="−24% orientation, −11% overall" src="https://img.shields.io/badge/cost-%E2%88%9224%25%20orientation%20%2F%20%E2%88%9211%25%20overall-2da44e?style=flat-square"></a>
  <a href="#commands"><img alt="commands" src="https://img.shields.io/badge/commands-5-111?style=flat-square"></a>
  <a href="#mcp-servers"><img alt="mcps" src="https://img.shields.io/badge/MCP-spec--lint%20%2B%20token--count%20%2B%20gitnexus-111?style=flat-square"></a>
  <a href="#license"><img alt="license" src="https://img.shields.io/badge/license-MIT-111?style=flat-square"></a>
</p>

---

## Why

Claude Code reads `CLAUDE.md` on every session. Most projects either don't have one, or stuff it with everything, or let it drift. **adam** rewrites `CLAUDE.md` as a tight brief plus a *curated index* of `spec/*.md` files, indexes the repo with [GitNexus](https://github.com/abhigyanpatwari/GitNexus) so Claude can resolve symbols → file:line via the knowledge graph instead of grepping, and ships a hook that keeps the graph fresh after every edit.

Two layers, one workflow:

- **Specs answer "what is this and when do I read it?"** — read once at session start, cached cheap.
- **Graph answers "where does X live, who calls it, what breaks if I change it?"** — queried on demand via the `gitnexus` MCP server.

Across 22 distinct tasks against [`lkzppm/portifolio`](https://github.com/lkzppm/portifolio), adam shaves **−24% cost on orientation/research** and **−11% cost overall** (with a real win on multi-touch refactors and essentially flat on tightly-scoped additive edits — the spec/graph pair pays off where understanding context matters). [Full report + raw JSON in `bench/`.](bench/)

## How it works

```
your repo                                       ┌────────────────────────────────┐
   │                                            │ CLAUDE.md (brief + spec index) │
   │   /adam:setup                              │   spec/                        │
   │   ─────────────►   adam meta-agent  ─►     │     overview.md                │
   │                    + setup-graph.sh        │     <subsystem>.md × 2-7       │
   │                    (gitnexus analyze,      │     INDEX.md                   │
   │                     wire .mcp.json,        │ .gitnexus/  (graph index)      │
   │                     write specs)           │ .mcp.json   (gitnexus stdio)   │
   │                                            └────────────────────────────────┘
   │
   └── (during work) ── PostToolUse hook ─► gitnexus analyze (background, on edit)
```

`/adam:setup` runs three phases:

0. **Knowledge graph.** `scripts/setup-graph.sh` verifies `gitnexus` is on PATH, runs `gitnexus analyze` (or `--skip-git` for non-git folders), strips the prescriptive `<!-- gitnexus:start --> ... <!-- gitnexus:end -->` block that GitNexus auto-injects into CLAUDE.md (it measurably biases the model toward extra exploration turns), and merges a `gitnexus` entry into `.mcp.json` so the next Claude session can call `gitnexus_context`, `gitnexus_query`, `gitnexus_impact`, etc. as MCP tools.
1. **Scaffold.** The meta-agent (`agents/adam.md`) reads your repo, detects stack and subsystems, and writes 3–8 `spec/*.md` files plus a CLAUDE.md brief that indexes them with token counts. Each spec includes an **anchors block** mapping topic-relevant symbols to the `gitnexus_context` call that resolves them.
2. **Suggest.** Using `AskUserQuestion`, the skill offers a checklist of stack-tailored sub-agents/skills/hooks. Whatever you accept lands in `.claude/`. Nothing generic, nothing static, nothing gets written without your selection.

After setup, a small `PostToolUse` hook re-runs `gitnexus analyze` in the background after every Edit/Write so the graph stays current with your working tree — no agent-visible noise, no manual re-index.

## Commands

| command | what it does |
|---|---|
| `/adam:setup` | One-time bootstrap. Indexes the repo with GitNexus, wires `.mcp.json`, scaffolds `spec/`, rewrites `CLAUDE.md`, then prompts (multi-select) for stack-tailored hooks/skills/sub-agents. |
| `/adam:claude-add [agent\|skill\|hook] [description]` | Add **one** automation to `.claude/`. Hooks land as executable scripts in `.claude/hooks/<name>.sh` and are referenced from `.claude/settings.json` (merged, never overwritten). |
| `/adam:spec-create <topic>` | Add a new `spec/<topic>.md` when a fresh concept enters the project. Re-weaves the index. |
| `/adam:spec-update [path]` | Drift refresh — verify specs against current code, rewrite stale ones, refresh the index + token counts. Whole tree, or one spec. |
| `/adam:spec-audit` | Read-only health check. Reports issues without rewriting. |

Each command has a same-named skill so you can also trigger them via natural language ("update spec/", "add a sub-agent for the new auth flow").

## Hooks

The plugin ships two hooks, both at plugin scope (apply to every adam-using project):

| Event | Script | What it does |
|---|---|---|
| `SessionStart` | inline `npm install` | First-run install of MCP server deps into `${CLAUDE_PLUGIN_DATA}` per the official Claude Code spec. Idempotent. |
| `PostToolUse` (`Edit\|Write\|MultiEdit`) | `hooks/graph-context.js` | Detached `gitnexus analyze --skip-git` so the next graph query reads a working-tree-current view. Lockfile-guarded so concurrent edits don't collide on the LadybugDB WAL. Silent — never injects context messages into the chat. |

There's also a small library of project scripts the skills call as deterministic infra (no LLM-interpreted shell):

| Script | Purpose |
|---|---|
| `scripts/setup-graph.sh` | Phase 0 of `/adam:setup` — verifies gitnexus, indexes, strips auto-injection, wires `.mcp.json`. Emits parseable JSON. |
| `scripts/strip-gitnexus-block.sh` | Idempotent strip of the `<!-- gitnexus:start --> ... <!-- gitnexus:end -->` block from `CLAUDE.md`. Called by `setup-graph.sh` and `/adam:spec-update`. |
| `scripts/smoke-test.sh` | Standalone MCP server smoke test for `spec-lint` + `token-count`. |

## What lands in your repo

```
your-project/
├── CLAUDE.md                         # ~80-line brief + spec index table
├── .mcp.json                         # gitnexus MCP entry (merged with whatever's there)
├── .gitnexus/                        # graph index — gitignore this if you prefer
├── spec/
│   ├── INDEX.md                      # one-line summary per spec
│   ├── overview.md                   # what the project is
│   ├── <subsystem>.md × 2-7          # one per detected subsystem (with Anchors block)
│   └── ...
└── .claude/                          # only if you opted in during setup
    ├── agents/<name>.md              # tailored sub-agents
    ├── hooks/<name>.sh               # hook scripts (executable, one per hook)
    └── settings.json                 # merged hook references (existing keys preserved)
```

Specs are **self-contained for one topic** — backend conventions, frontend patterns, an integration's auth quirks, a subsystem's pipeline. Each one says *when to read it* in its description, so Claude pulls only what's needed. Each spec covering code includes an **Anchors block** that pairs symbol names with the `gitnexus_context({name, repo})` call that resolves them — so anchors don't drift when the file is edited; the graph re-indexes after every change.

## MCP servers

Three MCP servers are in play after `/adam:setup`:

| Server | Source | What it does |
|---|---|---|
| `gitnexus` | `gitnexus` CLI (external — `npm install -g gitnexus`) | Knowledge-graph queries: `gitnexus_context`, `gitnexus_query`, `gitnexus_impact`, `gitnexus_cypher`, `gitnexus_detect_changes`. The runtime adam's editing workflow depends on. |
| `adam:spec-lint` | bundled (TypeScript via `tsx`) | Verifies `spec/` + `CLAUDE.md` + `.claude/` are well integrated. Catches oversize specs, broken cross-references, missing index entries, missing frontmatter. |
| `adam:token-count` | bundled (TypeScript via `tsx`) | Counts tokens for any file or string using `gpt-tokenizer` (cl100k_base, pure JS, no WASM, no API key). Within ~3-8% of Anthropic's tokenizer. Used by `spec-update` to refresh the CLAUDE.md token column. |

The bundled MCPs run on demand from `${CLAUDE_PLUGIN_DATA}/node_modules` (auto-installed by the SessionStart hook). `gitnexus` is installed by the user once globally; adam will refuse to run `/adam:setup` until it's on PATH.

## Install

### Prerequisites

```bash
npm install -g gitnexus            # required — adam refuses to set up without it
```

### Plugin install via marketplace

```
/plugin marketplace add lkzppm/adam
/plugin install adam@adam
```

Then in any project:

```
/adam:setup
```

### Local development

```bash
git clone git@github.com:lkzppm/adam.git ~/.claude/plugins/adam
# then in Claude Code: /plugin
```

The plugin's `SessionStart` hook auto-installs `node_modules` into `${CLAUDE_PLUGIN_DATA}` per the official Claude Code spec — no manual install step.

## Benchmark — real numbers, real repo

22 `claude -p --output-format json` runs against [lkzppm/portifolio](https://github.com/lkzppm/portifolio): 10 orientation questions (rate-limiting, tool-calling, RAG, system prompt, streaming, etc.), 10 additive edit tasks (each adds a different MCP-style tool to `lib/mcp.ts`), and 2 graph-favoring edits (cross-file rename + multi-return-update inside the dispatcher). Same model (`sonnet`), same allowed tools, same machine. [Full report + raw JSON + runner in `bench/`.](bench/)

| Family | n | Baseline cost | Adam cost | Δ cost |
|---|---:|---:|---:|---:|
| **Orientation** | 10 | $1.1762 | $0.8913 | **−24.2%** |
| **Additive edits** | 10 | $1.3321 | $1.3524 | +1.5% |
| **Graph-favoring edits** | 2 | $0.2933 | $0.2534 | **−13.6%** |
| **Total** | 22 | **$2.8016** | **$2.4971** | **−10.9%** |

**The honest read:** orientation is the headline win — reading one curated spec beats reading 12 source files. Additive edits are essentially flat — adding a new tool to a switch dispatcher is mechanically straightforward; neither the spec nor the graph reliably saves turns when the prompt already names the file. Graph-favoring edits land a real win on the kind of work the graph was built for: T3b ("update every successful return inside the dispatcher") cost −21% because the model used `gitnexus_context` to scope the work to a single function range and edit each return without spelunking. Bigger wins would come on bigger repos with bigger blast radii.

**Where the orientation savings come from:** adam shifts Claude's context from expensive `cache_create` (per-file source reads) into cheap `cache_read` (one spec read once). `cache_read` is roughly 6× cheaper than `cache_create`, and that's where the dollar win lives.

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

## Spec index
| Spec | Read when… | Tokens |
|------|-----------|--------|
| spec/overview.md | Onboarding — site purpose, deploy target, repo layout | 749 |
| spec/frontend.md | Touching layout/playground/terminal components, fonts, styling | 799 |
| spec/chat-api.md | Editing /api/chat, RAG, MCP-style tools, rate limiter | 1500 |

## Editing code
- Before editing a symbol, locate it via the GitNexus knowledge graph —
  `gitnexus_context({name, repo: "portifolio"})` for callers/callees + file:line.
- For files over ~300 lines, read only the slice the graph returns. Never top-to-bottom.
- If the spec contains a recipe for the kind of change being requested, follow it.

## Response style
- Code requests: 1–3 line briefing of what changed.
- Explanations: reply verbose as needed.
- Default to brief.
```

The full sample (CLAUDE.md + 3 specs) is in [`bench/with-adam-CLAUDE.md`](bench/with-adam-CLAUDE.md) and [`bench/with-adam-spec/`](bench/with-adam-spec/).

## Limitations

- **Workload-shaped wins.** Orientation/research sees a real ~24% reduction; additive edit-only workloads see no measurable improvement. If your typical Claude session is mostly editing files in isolation, expect parity. If it's mostly reasoning about an unfamiliar codebase or doing multi-touch refactors, expect savings.
- **GitNexus is required.** No graceful fallback to spec-only mode — `/adam:setup` exits early if `gitnexus` isn't on PATH. That's a deliberate simplification: anchors that point to graph queries don't make sense without a graph.
- **Single repo, single model.** All bench runs were Sonnet against one Next.js / TypeScript project (~55 files). Cross-repo and cross-model variance not measured. Larger codebases with bigger blast radii should benefit more.
- **Spec coverage matters more than spec quantity.** Topics covered well in `spec/chat-api.md` saw the strongest orientation wins. Off-spec topics see no benefit. `spec-lint` catches structural failure modes (oversize, broken cross-refs, missing index entries) but not depth — writing a thin spec on a topic Claude will be asked about is worse than no spec.
- **Quality is shallow in the bench.** Outputs are typecheck-verified (`tsc --noEmit`) and pattern-counted (`?? `, `if (!`), but not runtime-tested. A "the rename was complete" or "the new tool actually works at runtime" probe is future work.
- **`.claude/` artifacts are suggestions, not guarantees.** The setup flow proposes hooks/agents based on detected stack, but only writes what you accept via the multi-select prompt.

## Compliance with the official Claude Code plugin spec

Verified against [code.claude.com/docs/en/plugins-reference](https://code.claude.com/docs/en/plugins-reference):

- ✅ Manifest at `.claude-plugin/plugin.json`, only `name` required, `$schema` URL referenced.
- ✅ Components at plugin root (commands, agents, skills, hooks, mcps).
- ✅ `${CLAUDE_PLUGIN_ROOT}` for bundled paths; `${CLAUDE_PLUGIN_DATA}` for installed dependencies (survives plugin updates).
- ✅ Agent frontmatter uses only allowed fields (`name`, `description`, `model`, `color`).
- ✅ Skill descriptions enumerate explicit trigger phrases.
- ✅ SessionStart hook follows the official `diff → npm install` pattern.
- ✅ Plugin-level hooks reference scripts via `${CLAUDE_PLUGIN_ROOT}` rather than inlining shell.
- ✅ MCP servers wired via `.mcp.json` with portable `${...}` substitutions.

## Layout

```
adam/
├── .claude-plugin/{plugin,marketplace}.json   # manifest + marketplace entry
├── .mcp.json                                  # spec-lint + token-count
├── package.json                               # one shared dep tree for both MCPs
├── hooks/
│   ├── hooks.json                             # SessionStart + PostToolUse wiring
│   └── graph-context.js                       # PostToolUse: detached re-index after edits
├── agents/adam.md                             # the meta-agent
├── commands/                                  # slash entrypoints
│   ├── setup.md  ·  claude-add.md
│   └── spec-{create,update,audit}.md
├── skills/                                    # natural-language entrypoints
│   ├── setup/  ·  claude-add/
│   └── spec-{create,update,audit}/
├── mcps/                                      # TypeScript sources, run via tsx
│   ├── lib/tokens.ts                          # shared gpt-tokenizer wrapper
│   ├── spec-lint/server.ts
│   └── token-count/server.ts
├── scripts/                                   # deterministic infra called by skills
│   ├── setup-graph.sh                         # Phase 0: gitnexus analyze + strip + .mcp.json
│   ├── strip-gitnexus-block.sh                # idempotent CLAUDE.md cleanup
│   └── smoke-test.sh                          # standalone MCP smoke test
├── tsconfig.json                              # strict TS config (typecheck via tsc --noEmit)
├── bench/                                     # the comparison vs portifolio
└── public/AdamBanner.png
```

## License

MIT. Built by [Lucas Pacheco](https://github.com/lkzppm). PRs welcome.
