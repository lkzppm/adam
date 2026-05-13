---
description: One-time scaffolding — creates spec/, rewrites CLAUDE.md as a brief + spec index, then interactively suggests per-project hooks/skills/sub-agents
argument-hint: "[--force | --merge] [focus: <instruction guiding which subsystems / concepts to emphasize>]"
---

Run the `setup` skill. $ARGUMENTS may include:
- `--force` — wipe and re-scaffold against a populated `spec/`. The adam agent writes from scratch and ignores whatever was there.
- `--merge` — re-scaffold against a populated `spec/` **mining the existing content** instead of nuking it. The adam agent reads every existing `spec/**/*.md` and the current `CLAUDE.md`, maps each into adam's layout (overview / project / concepts), preserves prose worth keeping, and reports what couldn't be mapped. Use this when you already have project docs in your own conventions and want to migrate without losing what's there. **Commit your tree before running** — the agent overwrites adam-shaped paths freely.
- Anything else (free-text) — a **focus instruction** passed to the adam agent during spec scaffolding (P2). Example: `/setup focus on the auth submodule and the websocket message dispatcher`. The agent will emphasize those areas when picking which `spec/project/*.md` and `spec/concepts/*.md` files to write, without dropping baseline coverage (overview, stack).

`--force` and `--merge` are mutually exclusive — if both are passed, `--merge` wins (the mining behavior also lifts the populated-spec bail-out, making the explicit `--force` redundant).
