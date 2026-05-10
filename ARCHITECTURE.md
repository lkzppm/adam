# adam — architecture

How the plugin is laid out and how the pieces fit together. Read [`README.md`](README.md) first for the high-level pitch and benchmark numbers.

## Layout

```
adam/
├── .claude-plugin/{plugin,marketplace}.json   # manifest + marketplace entry
├── .mcp.json                                  # spec-lint + token-count MCP wiring
├── package.json                               # one shared dep tree for both bundled MCPs
├── tsconfig.json                              # strict TS (typecheck via tsc --noEmit)
│
├── agents/adam.md                             # the meta-agent — generates per-project artifacts
├── commands/                                  # slash entrypoints (forward to skills)
│   ├── setup.md  ·  claude-add.md
│   └── spec-{create,update,audit}.md
├── skills/                                    # natural-language entrypoints
│   ├── setup/  ·  claude-add/
│   └── spec-{create,update,audit}/
│
├── hooks/
│   ├── hooks.json                             # PostToolUse wiring
│   └── graph-context.ts                       # PostToolUse: detached gitnexus re-index after edits
│
├── mcps/                                      # bundled MCP servers (TypeScript via tsx)
│   ├── lib/tokens.ts                          # shared gpt-tokenizer wrapper
│   ├── spec-lint/server.ts                    # validates spec/ + CLAUDE.md + .claude/
│   └── token-count/server.ts                  # offline cl100k_base counter
│
├── scripts/                                   # deterministic infra called by skills
│   ├── setup-graph.sh                         # Phase 0 of /adam:setup
│   ├── write-spec-rules.sh                    # Phase 1: copy templates/spec-rules/
│   ├── strip-gitnexus-block.sh                # idempotent CLAUDE.md cleanup
│   ├── smoke-test.sh                          # standalone MCP smoke test
│   ├── tools/                                 # gitnexus-driven helpers
│   │   ├── spec-preflight.sh                  # JSON briefing for spec-create
│   │   └── check-anchors.sh                   # drift fast-path for spec-update
│   └── template/                              # spec template selection
│       └── select-seed.sh                     # detect stack → return seed path
│
├── templates/
│   ├── spec-rules/*.md                        # Phase 1 deterministic copy
│   └── specs/                                 # stack-specific seed templates
│       ├── nextjs.md  ·  hono.md
│       └── fastapi.md ·  django.md
│
├── bench/                                     # the comparison vs portifolio (n=22 paired tasks)
└── public/AdamBanner.png
```

## Phases of `/adam:setup`

Eight phases, strictly ordered. The full prose lives in [`skills/setup/SKILL.md`](skills/setup/SKILL.md); the table below is the index.

| P | What | Where |
|---|---|---|
| 0 | `gitnexus analyze` (hard prereq — cuts the run if missing) | `scripts/setup-graph.sh` |
| 1 | `spec/rules/` deterministic copy | `scripts/write-spec-rules.sh` |
| 2 | spec scaffolding — `overview` + `project/` + `concepts/` + `INDEX.md` (no `CLAUDE.md` yet) | `agents/adam.md` (scaffold-only) |
| 3 | three per-class `AskUserQuestion` menus — hooks, then subagents, then skills | `skills/setup/SKILL.md` |
| 4 | create only the items the user picked | `agents/adam.md` (claude-add) |
| 5 | `CLAUDE.md` — written last so it can list the actual `.claude/` artifacts | `agents/adam.md` (finalize) |
| 6 | `spec-lint` MCP verify | `mcps/spec-lint/server.ts` |
| 7 | final brief — graph stats, specs, automations, tokens, lint state | `skills/setup/SKILL.md` |

P0 strips the `<!-- gitnexus:start --> ... <!-- gitnexus:end -->` block GitNexus auto-injects into `CLAUDE.md` on first analyze — its prescriptive *"MUST run impact analysis before editing any symbol"* rules measurably bias Sonnet toward extra exploration turns. P0 also merges a `gitnexus` entry into `mcpServers` in `.mcp.json`, preserving any unrelated entries.

P3 is mandatory: `.claude/` files are only ever created via the menu — no defaults, no auto-additions. CLAUDE.md is deferred to P5 so it can reference the real artifacts in `.claude/`.

## Hooks

One hook ships at plugin scope (auto-applied to every adam-using project):

| Event | Source | Purpose |
|---|---|---|
| `PostToolUse` (`Edit\|Write\|MultiEdit`) | `hooks/graph-context.ts` (run via the bundled `tsx`) | Detached `gitnexus analyze --skip-git` so the next graph query reads a working-tree-current view. Lockfile-guarded so concurrent edits don't collide on the LadybugDB WAL. Silent — never injects context messages into the chat. |

The PostToolUse hook is intentionally write-only: it doesn't emit `additionalContext`. Earlier prototypes that *also* injected pre-prompt graph context regressed bench performance because pre-injection broke prompt-cache reuse on tightly-scoped prompts. The current design relies on the model querying the graph on demand via the `gitnexus` MCP server — the auto re-index just keeps that data fresh.

## MCP servers

Three MCP servers are in play after `/adam:setup`:

| Server | Source | What it does |
|---|---|---|
| `gitnexus` | `gitnexus` CLI (external — `npm install -g gitnexus`) | Knowledge-graph queries: `gitnexus_context`, `gitnexus_query`, `gitnexus_impact`, `gitnexus_cypher`, `gitnexus_detect_changes`. The runtime adam's editing workflow depends on. |
| `adam:spec-lint` | bundled (TypeScript via `tsx`) | Validates `spec/` + `CLAUDE.md` + `.claude/` integration. Catches oversize specs, broken cross-refs, missing index entries, missing frontmatter. |
| `adam:token-count` | bundled (TypeScript via `tsx`) | Token counts via `gpt-tokenizer` (cl100k_base, pure JS, no WASM, no API key). Within ~3-8% of Anthropic's tokenizer. |

Bundled MCPs and the PostToolUse hook run from `${CLAUDE_PLUGIN_ROOT}/node_modules/.bin/tsx` — Claude Code installs the plugin's `package.json` deps into `${CLAUDE_PLUGIN_ROOT}/node_modules` at plugin install time, so no SessionStart bootstrap is needed. `gitnexus` is a one-time global install.

## Skills design — scripts over LLM-interpreted shell

Anything that's a deterministic sequence of shell commands lives in `scripts/`, not in the skill's prose. The setup skill calls `scripts/setup-graph.sh` and reads the JSON it returns. `spec-update` calls `scripts/strip-gitnexus-block.sh` as a pre-step. This keeps the LLM out of the parts of the workflow that don't need judgment, which is the whole point of having a tool boundary in the first place.

When a skill *does* need the agent (drafting spec content, naming sub-agents, choosing which subsystems matter), the skill delegates to the `adam` sub-agent with a focused prompt. The agent never runs `gitnexus analyze` or edits `.mcp.json` itself.

## Compliance with the official Claude Code plugin spec

Verified against [code.claude.com/docs/en/plugins-reference](https://code.claude.com/docs/en/plugins-reference):

- ✅ Manifest at `.claude-plugin/plugin.json`, only `name` required, `$schema` URL referenced.
- ✅ Components at plugin root (commands, agents, skills, hooks, mcps).
- ✅ `${CLAUDE_PLUGIN_ROOT}` for bundled paths and the auto-installed `node_modules`.
- ✅ Agent frontmatter uses only allowed fields (`name`, `description`, `model`, `color`).
- ✅ Skill descriptions enumerate explicit trigger phrases.
- ✅ Plugin-level hooks reference scripts via `${CLAUDE_PLUGIN_ROOT}` rather than inlining shell.
- ✅ MCP servers wired via `.mcp.json` with portable `${...}` substitutions.

## What lands in your repo after `/adam:setup`

```
your-project/
├── CLAUDE.md                         # brief + spec index table
├── .mcp.json                         # gitnexus MCP entry (merged with whatever's there)
├── .gitnexus/                        # graph index — gitignore if you prefer
├── spec/
│   ├── INDEX.md
│   ├── overview.md
│   └── <subsystem>.md × 2-7          # each with an Anchors block
└── .claude/                          # only if you opted in during Phase 2
    ├── agents/<name>.md
    ├── hooks/<name>.sh
    └── settings.json
```
