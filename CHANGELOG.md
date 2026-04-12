# Changelog

## 0.1.0 — 2026-04-12

Initial release.

- `adam` meta-agent that scaffolds per-project sub-agents, CLAUDE.md, and hooks.
- `/adam:setup`, `/spec`, `/spec-create`, `/spec-dream` slash commands.
- `adam-context-mcp` MCP server with `list_specs`, `read_spec`, `search_specs`, `spec_index` tools and real token counts via `gpt-tokenizer`.
- `SessionStart` plugin hook that injects `spec/INDEX.md` into the orchestrator context.
- Project-level templates for generated agents, CLAUDE.md, and hooks — including the `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` flag for parallel dispatch.
