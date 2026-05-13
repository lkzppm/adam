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

Each slash command is a Claude Code **skill** pairing deterministic shell scripts with the `adam` sub-agent. The shell handles what doesn't need an LLM (graph queries, drift detection, stack sniffing, file walking); the model spends tokens only where judgment matters. Natural-language triggers fire the same skills — no need to type the slash form.

| Skill | What | How |
|---|---|---|
| **`/setup`** | turn a virgin repo into a spec-driven one | 8-phase pipeline: GitNexus index → `spec/rules/` copy → adam scaffolds `overview`/`project/`/`concepts/`/`INDEX.md` → pipelines viewer → three `AskUserQuestion` menus (hooks/subagents/skills) → `.claude/` artifacts → `CLAUDE.md` last → spec-lint → token-cost brief |
| **`/spec-create <topic>`** | add one new spec | GitNexus preflight emits a `{symbols, files, edges}` briefing so the agent doesn't re-grep, a stack-specific seed enforces consistent shape (anchors block + How-to recipe), result is `spec/<topic>.md` with verified `file:line:symbol` anchors and INDEX + CLAUDE.md re-woven |
| **`/spec-create <topic> --pipeline`** | add an HTML workflow walkthrough | writes `spec/pipelines/<topic>.html` with embedded Mermaid flow chart + brief + steps; manifest updater re-scans the folder and rewrites the inlined index in `spec/pipelines.html` (sidebar + iframe viewer, `file://`-safe). Audit-exempt |
| **`/spec-update [path]`** | drift refresh | anchor-drift script asks GitNexus to resolve every spec's `anchors:` frontmatter, partitions output into `{drifted, clean, unchecked}` — clean specs are skipped entirely, drifted get a focused agent prompt naming the broken anchors. Single-path mode bypasses the partition |
| **`/spec-audit`** | read-only health check | `spec-lint` MCP + `spec-graph-xref` (dangling paths = errors, unresolved symbols = warnings) + `token-count` MCP, formatted into one report. No rewrites — point at `/spec-update` to fix |
| **`/claude-add [agent\|skill\|hook]`** | add one automation | the interactive one: `AskUserQuestion` resolves the kind, agent reads CLAUDE.md + relevant specs for grounding, writes the file, then **merges** (read-splice-write-back) `.claude/settings.json` for hooks — never overwrites |

### `/setup` extras
- `--force` — wipe and rebuild against a populated `spec/`.
- `--merge` — **mine** the existing `spec/` + `CLAUDE.md` into adam's layout instead of nuking; the agent maps each existing doc to its closest adam slot, preserves prose verbatim where it already reads adam-style, and reports what couldn't be mapped under *Left for review*.
- Free-text focus — `/setup focus on the auth submodule and the websocket dispatcher` biases P2 toward the named areas without dropping baseline coverage.

### Background hook
A `PostToolUse` hook re-indexes the graph after every edit so the next prompt sees current state. Detached, lockfile-guarded, silent — no agent-visible noise.

## What lands in your repo

```
your-project/
├── CLAUDE.md                # brief + spec index + routing rules
├── .mcp.json                # gitnexus MCP entry (merged)
├── .gitnexus/               # graph index — gitignore if you prefer
├── spec/
│   ├── INDEX.md             # one row per markdown spec, all folders combined
│   ├── overview.md          # high-level "what is this project"
│   ├── rules/               # adam workflow rules — IDENTICAL across projects
│   │   ├── refactor.md      # cross-file refactor recipe
│   │   ├── additive.md      # adding new functionality
│   │   └── orient.md        # read-only Q&A
│   ├── project/             # project-specific conventions
│   │   ├── frontend.md
│   │   ├── backend.md
│   │   └── stack.md
│   ├── concepts/            # deep walkthroughs of important subsystems
│   │   └── <subsystem>.md   # each with an Anchors block + "How to add a new X" recipe
│   ├── pipelines.html       # global viewer (sidebar + iframe), opens via file://
│   └── pipelines/           # user-facing HTML workflow walkthroughs (audit-exempt)
│       └── <workflow>.html  # embedded Mermaid flow chart + brief + steps
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
