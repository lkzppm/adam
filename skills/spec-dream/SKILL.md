---
name: spec-dream
description: Ask adam to audit all specs for redundancy, stale content, and preamble, then rewrite each spec and the index for minimum tokens and maximum clarity. Reports before/after token delta.
---

Invoke the `adam` sub-agent and tell it to run its **/spec-dream flow** against the current working directory.

Exact instruction to pass to adam:

> Run /spec-dream on this project. Call `mcp__adam__spec_index()` to get a baseline token count, call `mcp__adam__read_spec()` for every spec, strip redundancies / outdated facts / preamble / closing summaries, rewrite each spec in place (preserving frontmatter and `name`), and regenerate `spec/INDEX.md`. Never invent facts. Never merge specs without explicit user confirmation. Follow your system prompt's /spec-dream flow exactly. Output only the final delta line.

Wait for adam to finish, then surface its one-line summary verbatim.
