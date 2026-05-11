<p align="center">
  <img src="public/AdamBanner.png" alt="adam" width="720" />
</p>

<p align="center"><em>(Spec-driven + Repo knowledge Graph) package for Claude Code. One <code>/setup</code> and every project ships with a curated <code>CLAUDE.md</code>, a <code>spec/</code> tree, and a live GitNexus index Claude can query.</em></p>

<p align="center">
  <a href="#install"><img alt="install" src="https://img.shields.io/badge/install-%2Fplugin%20marketplace%20add-000?style=flat-square"></a>
  <a href="bench/"><img alt="−34.1% cost on Hono" src="https://img.shields.io/badge/Bench-%E2%88%9234.1%25%20cost%20%2F%20100%25%20quality-2da44e?style=flat-square"></a>
  <a href="ARCHITECTURE.md"><img alt="architecture" src="https://img.shields.io/badge/docs-architecture-111?style=flat-square"></a>
  <a href="#license"><img alt="license" src="https://img.shields.io/badge/license-MIT-111?style=flat-square"></a>
</p>

---

## What it is

**adam is a context manager helper for Claude Code.** Most coding sessions burn tokens because Claude has to re-derive what your repo *is* on every turn — grep for files, read whole modules to find one function, scan callers before editing. adam pre-stages that context so Claude doesn't have to:

- a curated `CLAUDE.md` + `spec/*.md` tree, sized to your project, that frames the codebase in a few thousand cached tokens
- a [GitNexus](https://github.com/abhigyanpatwari/GitNexus) knowledge-graph index Claude can query — symbol → file:line, callers/callees, blast radius — without reading the file
- explicit routing rules so Claude *skips* the spec on trivial tasks (no wasted tokens) and *uses* it on cross-file refactors and convention-driven additions
- a hook that keeps the graph fresh after every edit, so the next prompt sees current state

The result: Claude spends fewer turns *finding* code and more turns *changing* it.

## Numbers

30 paired tasks against [`honojs/hono`](https://github.com/honojs/hono) (5,854 graph nodes / 8,893 edges), Claude Sonnet, raw JSON in [`bench/results-hono/`](bench/results-hono/).

| Family | n | Δ cost vs vanilla | Quality (tsc-pass) |
|---|---:|---:|---:|
| **Orientation** — *asking about the codebase* | 10 | **−27.4%** | n/a (read-only) |
| **Coding — additive** *(new middleware / helper / Context method)* | 10 | **−50.4%** | 10/10 ↔ 10/10 |
| **Coding — multi-file refactor** *(rename, signature change)* | 10 | **−30.2%** | 10/10 ↔ 10/10 |
| **Coding (combined)** | **20** | **−35.7%** | **20/20 ↔ 20/20** |
| **Total** | **30** | **−34.1%** | **All pass** |

Adam saves money on every layer with identical quality. Numbers are reproducible from the scripts in `bench/scripts/`.

For context: the published [AGENTS.md study](https://arxiv.org/html/2602.11988v1) found developer-provided context files typically *raise* coding cost by 20–23%. adam moves the needle the other direction.

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
/setup
```

## Skills

Each slash command is a Claude Code **skill** — a `SKILL.md` that orchestrates deterministic `scripts/**/*.sh` plus the `adam` sub-agent. The shell scripts do the parts that don't need an LLM (graph queries, drift detection, stack sniffing, file walking), so the model only spends tokens on the parts that actually require judgment. Natural-language triggers fire the same skills, so you don't have to type the slash form.

### `/setup` — first-time scaffolding
Strict 8-phase pipeline. Two deterministic scripts front-load the boring work:
- **`scripts/tools/setup-graph.sh`** — verifies `gitnexus` is on PATH, runs `gitnexus analyze` if `.gitnexus/` is missing, strips the auto-injected `<!-- gitnexus:start -->` block from `CLAUDE.md` (its prescriptive boilerplate measurably bias the model), and merges the `gitnexus` MCP entry into `.mcp.json` without clobbering existing servers. Emits a single JSON status line the skill parses.
- **`scripts/template/write-spec-rules.sh`** — copies the plugin's `templates/spec-rules/*.md` into `<project>/spec/rules/` (the three workflow recipes that never change per project).

Then the `adam` sub-agent scaffolds `spec/overview.md`, `spec/project/*`, `spec/concepts/*`, and `spec/INDEX.md`, returning the stack signals it detected. The skill builds three per-class `AskUserQuestion` menus (hooks, subagents, skills) from those signals, writes only the items you tick, generates `CLAUDE.md` last so it can reference the actual `.claude/` artifacts in scope, then runs the `spec-lint` MCP and prints a final brief.

### `/spec-create <topic>` — add one new spec
Two deterministic scripts gather code-grounded context before the agent writes a single line:
- **`scripts/tools/spec-preflight.sh`** — calls `gitnexus query` + `gitnexus context` for the topic (and any path hints you pass), flattens incoming/outgoing edge sets, and emits a JSON briefing: `{topic, candidates: [{name, uid, kind, file, line, incoming, outgoing}], primary_files, …}`. The agent treats the briefing as canonical and skips re-grepping for symbols already resolved.
- **`scripts/template/select-seed.sh`** — sniffs `package.json` deps, `pyproject.toml`, `requirements*.txt`, and `manage.py` to pick the right `templates/specs/<stack>.md` seed (currently `nextjs`, `hono`, `fastapi`, `django`). The seed enforces a consistent shape across specs — anchors block, How-to recipe, conventions list.

The agent gets briefing + seed in one prompt, writes `spec/<topic>.md` with verified `file:line:symbol` anchors, then re-weaves `spec/INDEX.md` and the `CLAUDE.md` spec table (token counts via the `token-count` MCP).

### `/spec-update [path]` — drift refresh
Two deterministic scripts scope the agent's work to specs that actually need rewriting:
- **`scripts/utils/strip-gitnexus-block.sh`** — removes the `<!-- gitnexus:start -->` block that `gitnexus analyze` re-injects into `CLAUDE.md` on every run, so the agent reads the version adam actually authored.
- **`scripts/tools/check-anchors.sh`** — walks every `spec/**/*.md`, parses the machine-readable `anchors:` frontmatter list, asks GitNexus to resolve each entry, and partitions output into `{drifted, clean, unchecked}`. Specs in `clean` are skipped entirely; specs in `drifted` get a focused agent prompt naming the broken anchors; specs in `unchecked` (no `anchors:` yet) fall back to a full re-read and get an anchors block added for next time.

Single-path mode (`/spec-update spec/foo.md`) skips the partition and goes straight to a single-spec rewrite.

### `/spec-audit` — read-only health check
One deterministic script plus two MCP calls, no agent dispatch:
- **`spec-lint` MCP** — checks `spec/INDEX.md` ↔ `spec/*.md` coverage, `CLAUDE.md` spec table consistency, frontmatter, cross-references, and per-spec token ceilings.
- **`scripts/validators/spec-graph-xref.sh`** — reports two distinct classes of dangling references: **errors** for backticked file paths in spec bodies that don't exist on disk, **warnings** for symbols in `## Anchors` tables that don't resolve in GitNexus.
- **`token-count` MCP** — per-spec token counts for the summary table.

The skill formats the combined result as a single readable report and points you at `/spec-update` for any errors.

### `/claude-add [agent|skill|hook]` — add one automation
No backing script — this one is intentionally interactive. The skill resolves the kind via `AskUserQuestion` (if not given), reads `CLAUDE.md` + the relevant `spec/*.md` for grounding, asks at most two follow-ups for missing details, then delegates writing to the `adam` sub-agent. For hooks, the command body always lands in `.claude/hooks/<name>.sh` (executable, with shebang); `.claude/settings.json` is **merged** (read, splice, write back), never overwritten.

### Background hook
A small `PostToolUse` hook re-indexes the graph after every edit, so the next prompt sees current state. No agent-visible noise.

## What lands in your repo

```
your-project/
├── CLAUDE.md                # brief + spec index + routing rules
├── .mcp.json                # gitnexus MCP entry (merged)
├── .gitnexus/               # graph index — gitignore if you prefer
├── spec/
│   ├── INDEX.md             # one row per spec, all folders combined
│   ├── overview.md          # high-level "what is this project"
│   ├── rules/               # adam workflow rules — IDENTICAL across projects
│   │   ├── refactor.md      # cross-file refactor recipe
│   │   ├── additive.md      # adding new functionality
│   │   └── orient.md        # read-only Q&A
│   ├── project/             # project-specific conventions
│   │   ├── frontend.md
│   │   ├── backend.md
│   │   └── stack.md
│   └── concepts/            # deep walkthroughs of important subsystems
│       └── <subsystem>.md   # each with an Anchors block + "How to add a new X" recipe
└── .claude/                 # only what you opted into
    ├── agents/<name>.md
    ├── hooks/<name>.sh
    └── settings.json
```

## Where it wins, where it doesn't

- ✅ **Orientation / research / "how does X work?"** (−27%). Reading one curated spec beats reading 12 source files.
- ✅ **Convention-driven additions** *(new middleware, helper, class method)* (−50%). The spec recipe captures the multi-file shape; one read replaces multiple neighbor-file lookups.
- ✅ **Cross-file refactors** (−30%). Routing rules tell the model when to use the graph (function/method renames), when to skip it (class/type/const renames), to batch multi-symbol queries in parallel, and to keep grep narrow — wins both the unambiguous-name and ambiguous-name cases.
- ❌ **Off-spec topics** — if your spec doesn't cover the area, you pay for the spec read *and* still go to source. `spec-lint` catches structure but not depth.

## More

- [Bench report + raw JSON](bench/) — n=30 paired runs (Hono), full tsc gate, runtime traces.
- [Architecture](ARCHITECTURE.md) — phases, hooks, MCP servers, skills design, plugin-spec compliance, full file layout.

## License

MIT. Built by [Lucas Pacheco](https://github.com/lkzppm). PRs welcome.
