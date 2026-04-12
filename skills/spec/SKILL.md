---
name: spec
description: Scan the current project and create or update spec/*.md files from observed state. Idempotent — preserves hand-edits under a Updates section.
---

Invoke the `adam` sub-agent and tell it to run its **/spec flow** against the current working directory.

Exact instruction to pass to adam:

> Run /spec on this project. Ensure `spec/` exists, ensure `spec/overview.md` exists, scan for topic candidates, and create or merge `spec/*.md` files for each. Preserve hand-written sentences in existing specs (never clobber — append under `## Updates`). Regenerate `spec/INDEX.md` from the MCP `spec_index()` tool. Follow your system prompt's /spec flow exactly. Output only the final summary line.

Wait for adam to finish, then surface its one-line summary verbatim.
