---
description: One-time scaffolding — creates spec/, rewrites CLAUDE.md as a brief + spec index, then interactively suggests per-project hooks/skills/sub-agents
argument-hint: "[--force] [focus: <instruction guiding which subsystems / concepts to emphasize>]"
---

Run the `setup` skill. $ARGUMENTS may include:
- `--force` — allow overwriting an existing populated `spec/` directory.
- Anything else (free-text) — a **focus instruction** passed to the adam agent during spec scaffolding (P2). Example: `/setup focus on the auth submodule and the websocket message dispatcher`. The agent will emphasize those areas when picking which `spec/project/*.md` and `spec/concepts/*.md` files to write, without dropping baseline coverage (overview, stack).
