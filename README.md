# adam

A Claude Code plugin that scaffolds a **personalized multi-agent dev ecosystem** inside any project. Instead of shipping a fixed roster of generic agents, `adam` is a single meta-agent that inspects your repo and writes stack-aware sub-agents, a project `CLAUDE.md`, and sensible hooks directly into your `.claude/` folder. It also manages a `spec/` folder of token-measured project knowledge that every sub-agent consults through a dedicated MCP server.

Two goals:

1. **Spend fewer tokens** — every generated sub-agent is instructed to skip preamble, skip recaps, and load only the specs it needs. Token counts come from a real tokenizer so `/spec-dream` can measurably trim waste.
2. **Produce better results** — sub-agents run in parallel as an experimental Claude Code agent team, each in its own context window focused on one concern. Merging happens in the lead.

## Install

```
/plugin marketplace add lkz/adam
/plugin install adam@adam
```

The bundled MCP server (`adam-context-mcp`) needs a one-time build:

```bash
cd ~/.claude/plugins/.../mcp/adam-context-mcp
npm install
npm run build
```

Then in any project:

```
/adam:setup
```

That's it — adam scans your repo, generates sub-agents into `.claude/agents/`, writes or updates `CLAUDE.md` at the project root (inside a `<!-- adam-managed -->` block), merges stack-appropriate hooks into `.claude/settings.json`, and seeds a `spec/` folder.

## Commands

| command | what it does |
|---|---|
| `/adam:setup` | Scan project, generate agents, write CLAUDE.md, merge hooks, seed spec/. Idempotent — safe to re-run. |
| `/spec` | Scan project and create or update spec/*.md. Preserves hand-edits. |
| `/spec-create "<subject>"` | Create one new spec on a subject, grounded in the repo. |
| `/spec-dream` | Audit all specs for redundancy / stale content / preamble, rewrite them for minimum tokens, report the delta. |

## How it works

### The spec folder

`spec/` is machine-maintained project knowledge. Each file has YAML frontmatter:

```yaml
---
name: api-contract
description: REST + websocket contract between web and api
agents: [web-ui, api-server]
tags: [api, auth]
tokens: 412
updated: 2026-04-12
---
```

`spec/INDEX.md` is a generated table mapping every spec to the agents that care about it. The plugin's `SessionStart` hook injects this index into the orchestrator's context — so the lead knows what specs exist without loading their bodies.

### The MCP server

`adam-context-mcp` exposes four tools:

- `list_specs({ agent?, tag? })` — filtered list
- `read_spec({ name })` — full markdown body
- `search_specs({ query })` — keyword snippet search
- `spec_index()` — structured dump

Token counts come from [`gpt-tokenizer`](https://www.npmjs.com/package/gpt-tokenizer) (o200k_base), cached by file mtime.

### Generated sub-agents

Every sub-agent adam writes into `.claude/agents/*.md` has:

- A personalized description naming your actual stack.
- `tools:` including `mcp__adam__*` so it can load its assigned specs.
- A hard rules block: no preamble, no closing recap, ≤2 sentences of prose, `path:line` references, refuse out-of-scope tasks.
- Model and effort picked by role (opus for architect, sonnet for coders, haiku for docs/tester).

### Team-based parallel dispatch

`/adam:setup` writes `"CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"` into `.claude/settings.json`, so cross-cutting tasks fan out across a real [Claude Code agent team](https://code.claude.com/docs/en/agent-teams) — each teammate runs in its own session with its own context window, coordinating through a shared task list.

## Tokenizer vs knowledge graph

`adam` uses a **flat index with real token counts**, not a knowledge graph. For a markdown spec folder, a graph is overkill — the flat `agents: [...]` + `tags: [...]` mapping gives O(1) "who cares about this spec" lookups, and the tokenizer gives `/spec-dream` a real optimization target. If a project ever outgrows the flat model, the natural upgrade is adding a `links:` frontmatter field and letting the graph emerge lazily; embeddings in `search_specs` are a cheaper middle step.

## The `adam-context-mcp` package

The MCP server is also [published to npm](https://www.npmjs.com/package/adam-context-mcp) as a standalone package, so you can run it from any MCP host:

```bash
npm i -g adam-context-mcp
adam-context-mcp   # reads ./spec from cwd
```

## License

MIT © lkz
