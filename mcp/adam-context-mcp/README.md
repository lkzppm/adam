# adam-context-mcp

MCP server for the [`adam`](https://github.com/lkz/adam) Claude Code plugin. Exposes a project's `spec/` folder as four tools so agents can load only the context they need:

- `list_specs({ agent?, tag? })` — list specs, optionally filtered
- `read_spec({ name })` — full markdown body of one spec
- `search_specs({ query, limit? })` — keyword search with snippets
- `spec_index()` — structured dump of the whole index

Token counts come from [`gpt-tokenizer`](https://www.npmjs.com/package/gpt-tokenizer) (o200k_base) and are cached by file mtime.

## Install

```bash
npm i -g adam-context-mcp
```

## Run

```bash
adam-context-mcp
```

Reads `./spec/*.md` from `cwd` by default. Override with `ADAM_SPEC_DIR=/path/to/spec adam-context-mcp`.

Each spec file should have YAML frontmatter:

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

`tokens:` is advisory — the server recomputes at read time from the body.

## Use inside the adam plugin

If you installed the `adam` Claude Code plugin, this server is already bundled and registered via the plugin's `.mcp.json`. You don't need a separate install. This npm package exists for standalone use from other MCP hosts.

## License

MIT
