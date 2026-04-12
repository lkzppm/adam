---
name: spec-create
description: Ask adam to create a single new spec on a given subject, grounded in the actual repo, and add it to the index.
argument-hint: "<subject>"
---

Subject from the user: **$ARGUMENTS**

If `$ARGUMENTS` is empty, reply with exactly: `usage: /spec-create "<subject>"` and stop.

Otherwise invoke the `adam` sub-agent with this instruction:

> Run /spec-create with subject: `$ARGUMENTS`. Scan the repo for the 3–5 files most relevant to this subject, write a new `spec/<slug>.md` from the spec template, pick `agents:` from the roster in `.claude/agents/`, and regenerate `spec/INDEX.md`. Follow your system prompt's /spec-create flow exactly. If the subject is ambiguous, ask ONE clarifying question in plain text (one sentence) before proceeding. Output only the final summary line.

Wait for adam to finish, then surface its one-line summary verbatim.
