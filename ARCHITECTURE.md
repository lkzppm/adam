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
│   ├── hooks.json                             # SessionStart + PostToolUse wiring
│   └── graph-context.js                       # PostToolUse: detached gitnexus re-index after edits
│
├── mcps/                                      # bundled MCP servers (TypeScript via tsx)
│   ├── lib/tokens.ts                          # shared gpt-tokenizer wrapper
│   ├── spec-lint/server.ts                    # validates spec/ + CLAUDE.md + .claude/
│   └── token-count/server.ts                  # offline cl100k_base counter
│
├── scripts/                                   # deterministic infra called by skills
│   ├── setup-graph.sh                         # Phase 0 of /adam:setup
│   ├── strip-gitnexus-block.sh                # idempotent CLAUDE.md cleanup
│   └── smoke-test.sh                          # standalone MCP smoke test
│
├── bench/                                     # the comparison vs portifolio (n=22 paired tasks)
└── public/AdamBanner.png
```

## Phases of `/adam:setup`

Three phases run sequentially. Each can be invoked standalone via its own slash command later.

### Phase 0 — knowledge graph (`scripts/setup-graph.sh`)

Deterministic shell — the skill calls it instead of interpreting the steps itself. Emits one JSON object on stdout the calling skill parses:

1. `which gitnexus` — the CLI is a hard prereq; if it's missing, exit non-zero with `npm install -g gitnexus`.
2. `gitnexus analyze` (or `--skip-git` for non-git folders) if `.gitnexus/` doesn't exist.
3. Strip the `<!-- gitnexus:start --> ... <!-- gitnexus:end -->` block GitNexus auto-injects into `CLAUDE.md` on first analyze (delegates to `strip-gitnexus-block.sh`). Its prescriptive *"MUST run impact analysis before editing any symbol"* rules measurably bias Sonnet toward extra exploration turns; adam's own CLAUDE.md says what we want already.
4. Merge a `gitnexus` entry into `mcpServers` in `.mcp.json` — preserves any unrelated entries (writes a fresh file if absent).

### Phase 1 — scaffold (`agents/adam.md`)

The meta-agent reads the working tree, detects stack and subsystems, and writes:

- `CLAUDE.md` — ~80-line brief: what is this, stack, runtime shape, spec index table, response-style block, editing-code block (graph-first), refresh pointer.
- `spec/<topic>.md × 3-8` — one per detected subsystem. Each has frontmatter + substantive content + an **anchors block** mapping symbols to the `gitnexus_context({name, repo})` call that resolves them.
- `spec/INDEX.md` — one-line summary per spec.

The agent does not write to `.claude/` in this phase — that's Phase 2.

### Phase 2 — automations (interactive)

The setup skill builds a list of stack-tailored suggestions (`PostToolUse` formatter for the detected language, test-runner sub-agent for the detected framework, etc.) and asks via `AskUserQuestion`. Each accepted item lands in `.claude/agents/`, `.claude/skills/`, or `.claude/hooks/` + a merged reference in `.claude/settings.json`. Nothing gets written without explicit selection.

## Hooks

Two hooks ship at plugin scope (auto-applied to every adam-using project):

| Event | Source | Purpose |
|---|---|---|
| `SessionStart` | inline `npm install` | One-time install of bundled MCP server deps into `${CLAUDE_PLUGIN_DATA}` per the official Claude Code spec. Idempotent. |
| `PostToolUse` (`Edit\|Write\|MultiEdit`) | `hooks/graph-context.js` | Detached `gitnexus analyze --skip-git` so the next graph query reads a working-tree-current view. Lockfile-guarded so concurrent edits don't collide on the LadybugDB WAL. Silent — never injects context messages into the chat. |

The PostToolUse hook is intentionally write-only: it doesn't emit `additionalContext`. Earlier prototypes that *also* injected pre-prompt graph context regressed bench performance because pre-injection broke prompt-cache reuse on tightly-scoped prompts. The current design relies on the model querying the graph on demand via the `gitnexus` MCP server — the auto re-index just keeps that data fresh.

## MCP servers

Three MCP servers are in play after `/adam:setup`:

| Server | Source | What it does |
|---|---|---|
| `gitnexus` | `gitnexus` CLI (external — `npm install -g gitnexus`) | Knowledge-graph queries: `gitnexus_context`, `gitnexus_query`, `gitnexus_impact`, `gitnexus_cypher`, `gitnexus_detect_changes`. The runtime adam's editing workflow depends on. |
| `adam:spec-lint` | bundled (TypeScript via `tsx`) | Validates `spec/` + `CLAUDE.md` + `.claude/` integration. Catches oversize specs, broken cross-refs, missing index entries, missing frontmatter. |
| `adam:token-count` | bundled (TypeScript via `tsx`) | Token counts via `gpt-tokenizer` (cl100k_base, pure JS, no WASM, no API key). Within ~3-8% of Anthropic's tokenizer. |

Bundled MCPs run from `${CLAUDE_PLUGIN_DATA}/node_modules` (auto-installed by the SessionStart hook). `gitnexus` is a one-time global install.

## Skills design — scripts over LLM-interpreted shell

Anything that's a deterministic sequence of shell commands lives in `scripts/`, not in the skill's prose. The setup skill calls `scripts/setup-graph.sh` and reads the JSON it returns. `spec-update` calls `scripts/strip-gitnexus-block.sh` as a pre-step. This keeps the LLM out of the parts of the workflow that don't need judgment, which is the whole point of having a tool boundary in the first place.

When a skill *does* need the agent (drafting spec content, naming sub-agents, choosing which subsystems matter), the skill delegates to the `adam` sub-agent with a focused prompt. The agent never runs `gitnexus analyze` or edits `.mcp.json` itself.

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
