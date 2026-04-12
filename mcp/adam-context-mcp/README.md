# adam-context-mcp

Bundled MCP server for the [`adam`](https://github.com/lkzrat/adam) Claude Code plugin. **Not published to npm** — it ships as part of the plugin and is started automatically via the plugin's `.mcp.json`.

Exposes a project's `spec/` folder as four tools so agents can load only the context they need:

- `list_specs({ agent?, tag? })` — list specs, optionally filtered
- `read_spec({ name })` — full markdown body of one spec
- `search_specs({ query, limit? })` — keyword search with snippets
- `spec_index()` — structured dump of the whole index

Token counts come from [`gpt-tokenizer`](https://www.npmjs.com/package/gpt-tokenizer) (o200k_base) and are cached by file mtime.

## Spec frontmatter

Each `spec/<name>.md` file should have YAML frontmatter:

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

`tokens:` is advisory — the server recomputes at read time from the body. `node dist/reindex.js` stamps real counts back into every file's frontmatter and rewrites `spec/INDEX.md`.

## Development

If you are hacking on the MCP server itself:

```bash
cd mcp/adam-context-mcp
npm install
npm run build
```

The committed `dist/` is what the plugin actually runs. Rebuild and commit `dist/` whenever you touch `src/`.

## License

MIT
