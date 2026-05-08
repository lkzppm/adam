<p align="center">
  <img src="public/AdamBanner.png" alt="adam" width="720" />
</p>

<p align="center"><em>Spec-driven docs + a knowledge graph for Claude Code. One <code>/adam:setup</code> and every project ships with a curated <code>CLAUDE.md</code>, a <code>spec/</code> tree, and a live GitNexus index Claude can query.</em></p>

<p align="center">
  <a href="#install"><img alt="install" src="https://img.shields.io/badge/install-%2Fplugin%20marketplace%20add-000?style=flat-square"></a>
  <a href="bench/"><img alt="−17% cost, +1 quality" src="https://img.shields.io/badge/cost-%E2%88%9217%25%20%2F%20quality%2B-2da44e?style=flat-square"></a>
  <a href="ARCHITECTURE.md"><img alt="architecture" src="https://img.shields.io/badge/docs-architecture-111?style=flat-square"></a>
  <a href="#license"><img alt="license" src="https://img.shields.io/badge/license-MIT-111?style=flat-square"></a>
</p>

---

## What it is

**adam is a context manager for Claude Code.** Most coding sessions burn tokens because Claude has to re-derive what your repo *is* on every turn — grep for files, read whole modules to find one function, scan callers before editing. adam pre-stages that context so Claude doesn't have to:

- a curated `CLAUDE.md` + `spec/*.md` tree, sized to your project, that frames the codebase in a few thousand cached tokens
- a [GitNexus](https://github.com/abhigyanpatwari/GitNexus) knowledge-graph index Claude can query — symbol → file:line, callers/callees, blast radius — without reading the file
- a hook that keeps the graph fresh after every edit, so the next prompt sees current state

The result: Claude spends fewer turns *finding* code and more turns *changing* it. Which means lower cost, better edits, fewer "let me check..." round-trips.

## Numbers

22 paired tasks against [`lkzppm/portifolio`](https://github.com/lkzppm/portifolio), Claude Sonnet, raw JSON in [`bench/`](bench/). Two metric layers — token cost and output code quality.

| Family | n | Δ cost vs vanilla | Quality (runtime probe) |
|---|---:|---:|---:|
| **Orientation** — *asking about the codebase* | 10 | **−24%** | n/a (read-only) |
| **Coding — additive edits** | 10 | **−16.7%** | baseline 9/10 → adam 10/10 |
| **Coding — multi-touch / refactor** | 2 | +12% (variance, n=2) | baseline 2/2 → adam 2/2 |
| **Total** | 22 | **−17.4%** | **+1 task pass with adam** |

Quality is measured by a runtime probe — invoke the new tool through the dispatcher, assert the resulting envelope matches the prompt's spec. adam's spec recipe contains an explicit *"data MUST be the literal value the prompt asks for, no wrapper object"* rule that bumped one task from baseline-fail to adam-pass. Both versions still miss two cases where Sonnet wraps results in metadata regardless.

For context: the published [AGENTS.md study](https://arxiv.org/html/2602.11988v1) found developer-provided context files typically *raise* coding cost by 20–23%; adam moves the needle the other direction.

## Install

```bash
npm install -g gitnexus            # required prereq
```

```
/plugin marketplace add lkzppm/adam
/plugin install adam@adam
```

Then in any project:

```
/adam:setup
```

## Commands

| | |
|---|---|
| `/adam:setup` | Index with GitNexus, wire `.mcp.json`, scaffold `spec/` + `CLAUDE.md`, prompt for stack-tailored `.claude/` automations. |
| `/adam:spec-create <topic>` | Add one new `spec/<topic>.md` and re-weave the index. |
| `/adam:spec-update [path]` | Drift refresh — verify specs against current code, rewrite stale ones. |
| `/adam:spec-audit` | Read-only health check. |
| `/adam:claude-add [agent\|skill\|hook]` | Add one automation to `.claude/`. |

Each command has a same-named skill, so natural-language triggers also work.

## What lands in your repo

```
your-project/
├── CLAUDE.md                # brief + spec index
├── .mcp.json                # gitnexus MCP entry (merged)
├── .gitnexus/               # graph index — gitignore if you prefer
├── spec/
│   ├── INDEX.md
│   ├── overview.md
│   └── <subsystem>.md       # each with an Anchors block
└── .claude/                 # only what you opted into
    ├── agents/<name>.md
    ├── hooks/<name>.sh
    └── settings.json
```

A small `PostToolUse` hook re-indexes the graph in the background after every edit — no agent-visible noise.

## Where it wins, where it doesn't

- ✅ **Orientation / research / "how does X work?"** — the headline win. Reading one curated spec beats reading 12 source files.
- ✅ **Multi-touch refactors / blast-radius changes** — `gitnexus_impact` scopes work to the call graph, no spelunking.
- ➖ **Tightly-scoped additive edits** — flat. The graph helps target reads, but mechanical "add a thing to a switch" tasks have nowhere to save turns when the prompt already names the file.
- ❌ **Off-spec topics** — if your spec doesn't cover the area, you pay for the spec read *and* still go to source. `spec-lint` catches structure but not depth.

## More

- [Bench report + raw JSON](bench/) — n=10 orientation, n=12 coding, paired baseline vs adam, runtime quality probe included.
- [Architecture](ARCHITECTURE.md) — phases, hooks, MCP servers, skills design, plugin-spec compliance, full file layout.

## License

MIT. Built by [Lucas Pacheco](https://github.com/lkzppm). PRs welcome.
