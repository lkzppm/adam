---
name: setup
description: Analyze the current project and bootstrap a personalized adam ecosystem — generates sub-agents into .claude/agents/, writes project CLAUDE.md, merges project hooks into .claude/settings.json, and seeds spec/.
---

Invoke the `adam` sub-agent and tell it to run its **SETUP FLOW** against the current working directory.

Exact instruction to pass to adam:

> Run /adam:setup on this project. Scan the repo, generate a personalized agent roster into `.claude/agents/`, write or merge `CLAUDE.md` at project root (adam-managed block only), write or merge `.claude/settings.json` with `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` and the detected-stack hooks, and seed `spec/` with an overview. Follow your system prompt's SETUP FLOW exactly. Output only the final summary line.

Wait for adam to finish, then surface its one-line summary verbatim.
