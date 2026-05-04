# adam

Claude Code plugin that installs a **spec-driven dev workflow** into any project. Inspired by the way `Meridian/` uses `CLAUDE.md` as a curated index of `spec/*.md` files — generalized to work on any repo.

## What it does

- Turns your `CLAUDE.md` into a **brief + spec index** (under ~80 lines): one paragraph of "what is this", a stack summary, a runtime diagram, and a markdown table linking to `spec/*.md` with token counts per spec.
- Each `spec/*.md` describes one topic — backend conventions, frontend patterns, an integration's auth quirks, a subsystem's pipeline. Self-contained, code-grounded, refreshed on demand.
- After scaffolding, **interactively suggests** sub-agents / skills / hooks tailored to the detected stack and writes only what you accept into `.claude/`.

## Commands

| Command | What it does |
|---------|--------------|
| `/adam:setup` | One-time: scaffolds `spec/`, rewrites `CLAUDE.md` as a brief + index, then prompts (via AskUserQuestion) to add stack-tailored hooks/skills/sub-agents. |
| `/adam:claude-add [kind] [description]` | Adds ONE sub-agent, skill, or hook to `.claude/`. Prompts interactively for missing details. |
| `/adam:spec-create <topic>` | Adds a new `spec/<topic>.md` when you've introduced a fresh concept. Re-weaves the index. |
| `/adam:spec-update [path]` | Refreshes specs to match current code — drift detection across all specs, or just one when a path is given. |
| `/adam:spec-audit` | Read-only health check of `spec/`, `CLAUDE.md`, `.claude/`. Reports issues without rewriting. |

## Skills

Each command is backed by a same-named skill in `skills/` so Claude can also invoke them via natural language ("update spec/", "add a sub-agent for the new auth flow", etc.).

## MCP servers

| Server | Tools | Notes |
|--------|-------|-------|
| `adam:spec-lint` | `lint(path)` | Checks `spec/` + `CLAUDE.md` + `.claude/` for integration issues. |
| `adam:token-count` | `count(path \| text)`, `count_many(paths)` | Uses Anthropic's `/v1/messages/count_tokens` for billing-grade accuracy when `ANTHROPIC_API_KEY` is set; falls back to a chars/3.7 heuristic (~5% accurate) when no key is present. |

### Configure the API-grade token counter

When you enable the plugin, Claude Code prompts for two `userConfig` values:

- `anthropic_api_key` — optional. Stored in the system keychain when set.
- `token_count_model` — defaults to `claude-sonnet-4-5`.

Without the key the heuristic mode runs offline with no setup.

## Meta-agent

`agents/adam.md` is the orchestrator that does the actual scaffolding. The skills delegate to it for non-trivial work. It analyzes the project from the working tree (no static templates) and produces per-project artifacts only — never writes to `~/.claude/`.

## Install

Install via your usual marketplace, or symlink locally for development:

```
ln -s /path/to/adam ~/.claude/plugins/adam
```

Enable the plugin in Claude Code, then run `/adam:setup` in any project.

## Dependencies

The MCP servers depend on `@modelcontextprotocol/sdk`. The plugin's `SessionStart` hook auto-installs `node_modules` into `${CLAUDE_PLUGIN_DATA}/` (a per-plugin persistent dir that survives plugin updates) by reading the root `package.json`. **No manual install step.**

For local development without a hook firing (e.g. running smoke tests):

```
npm install
```

## Plugin layout

```
adam/
├── .claude-plugin/plugin.json    # manifest with $schema + userConfig
├── .mcp.json                      # MCP servers (NODE_PATH points to CLAUDE_PLUGIN_DATA)
├── package.json                   # shared deps for the MCP servers
├── hooks/hooks.json               # SessionStart: installs deps to CLAUDE_PLUGIN_DATA
├── README.md
├── agents/adam.md                 # the meta-agent
├── commands/                      # slash entrypoints
│   ├── setup.md
│   ├── claude-add.md
│   ├── spec-create.md
│   ├── spec-update.md
│   └── spec-audit.md
├── skills/                        # natural-language entrypoints
│   ├── setup/SKILL.md
│   ├── claude-add/SKILL.md
│   ├── spec-create/SKILL.md
│   ├── spec-update/SKILL.md
│   └── spec-audit/SKILL.md
├── mcps/
│   ├── spec-lint/server.js
│   └── token-count/server.js
└── scripts/
    └── smoke-test.sh              # standalone MCP smoke test
```

## Compliance with the official plugin spec

Verified against [code.claude.com/docs/en/plugins-reference](https://code.claude.com/docs/en/plugins-reference):

- Manifest at `.claude-plugin/plugin.json`, only `name` required, `$schema` referenced for editor autocomplete.
- All component dirs at plugin root (not nested in `.claude-plugin/`).
- `${CLAUDE_PLUGIN_ROOT}` for bundled paths; `${CLAUDE_PLUGIN_DATA}` for installed dependencies.
- `userConfig` for optional secrets — stored in keychain when `sensitive: true`.
- Agent frontmatter uses only supported fields (`name`, `description`, `model`, `color`).
