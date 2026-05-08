# adam — benchmark

Apples-to-apples comparison of Claude Code (`claude -p`, Sonnet) running 22 distinct tasks against two copies of [lkzppm/portifolio](https://github.com/lkzppm/portifolio): one vanilla, one bootstrapped with `/adam:setup`. Numbers come from `claude -p --output-format json`'s `usage` block; raw JSON for every run is in `results/` (orientation) and `edits-final/` (edits). Quality probe outputs are checked into `edits-final/*.ts`.

The bench has **two classes** with **three subbenches**:

```
Orientation     — "Asking about the codebase"
Coding          — Token cost
                  Output code quality
```

## Setup

```
rsync portifolio → /tmp/bench/baseline       # vanilla
rsync portifolio → /tmp/bench/with-adam      # + CLAUDE.md + spec/ + .mcp.json + .gitnexus/
```

Each task ran with `--allowedTools "Read Edit Write Glob Grep"`; with-adam runs additionally allow `mcp__gitnexus__{context,query,impact,cypher,detect_changes}`. Edit tasks restore `lib/mcp.ts`, `app/api/chat/route.ts`, and `CLAUDE.md` to the canonical state before each run, then re-`gitnexus analyze` the with-adam dir so the graph matches the working tree (and re-strip the `<!-- gitnexus:start -->...<!-- gitnexus:end -->` block GitNexus auto-injects on first analyze).

The with-adam fixture is checked in: `with-adam-CLAUDE.md`, `with-adam-spec/`, `with-adam.mcp.json`. You can read what Claude actually saw.

## Class 1 — Orientation

> *"Asking about the codebase."* Read-only tasks: rate-limiting, tool-calling, RAG retriever, system-prompt assembly, fallback paths, streaming, end-to-end traces. 10 distinct topics, not paraphrases. n=10 paired.

| Task | Topic | Baseline cost | Adam cost | Δ |
|---|---|---:|---:|---:|
| T1, T1b | rate-limiting (paraphrase) | $0.305 | $0.151 | **−50%** |
| T1c | MCP tool-calling loop | $0.177 | $0.103 | −41% |
| T1d | RAG retriever | $0.099 | $0.067 | −32% |
| T1e | `compute_fit_score` trace | $0.125 | $0.108 | −13% |
| T1f | system prompt assembly | $0.101 | $0.087 | −14% |
| T1g | Upstash fallback path | $0.067 | $0.081 | +20% |
| T1h | `fetch_contributions` flow | $0.094 | $0.149 | +58% |
| T1i | response streaming | $0.088 | $0.069 | −21% |
| T1j | `schedule_callback` trace | $0.121 | $0.076 | −37% |

**Aggregate (n=10):** $1.176 → $0.891 — **−24.2% cost, −23.9% tokens, −8 turns.**

**Why it wins:** adam shifts Claude's context from expensive `cache_create` (per-file source reads) into cheap `cache_read` (one spec read once). `cache_read` is roughly 6× cheaper than `cache_create`, and that's where the dollar win lives. Orientation prompts that touch a topic well-covered in `spec/chat-api.md` see the largest drops; the two regressions (T1g, T1h) hit on areas the spec only sketched, where Claude paid for the spec read *and* still went to source.

## Class 2 — Coding

### Subbench 2a — Token cost

#### Additive edits (T2..T2j) — n=10 paired

Each task adds a different new MCP-style tool to `lib/mcp.ts`. Append-to-array shape: schema → union → dispatcher case.

| Task | New tool | Baseline turns / cost | Adam turns / cost | Δ cost |
|---|---|---:|---:|---:|
| T2 | `list_projects_by_tech(tech)` | 6 / $0.130 | 6 / $0.100 | **−23%** |
| T2b | `list_skills_in_category(category)` | 5 / $0.114 | 11 / $0.132 | +16% |
| T2c | `count_projects()` | 5 / $0.110 | 6 / $0.088 | −20% |
| T2d | `list_featured_projects()` | 6 / $0.125 | 6 / $0.092 | −26% |
| T2e | `find_project_by_id(id)` | 6 / $0.127 | 6 / $0.098 | −23% |
| T2f | `list_experiences_at_company(c)` | 8 / $0.154 | 8 / $0.131 | −15% |
| T2g | `search_projects(query)` | 6 / $0.127 | 7 / $0.109 | −14% |
| T2h | `list_categories()` | 7 / $0.137 | 11 / $0.133 | −3% |
| T2i | `list_techs()` | 7 / $0.138 | 6 / $0.066 | **−52%** |
| T2j | `count_skills_per_category()` | 7 / $0.143 | 11 / $0.138 | −4% |

**Aggregate (n=10):** $1.306 → $1.088 — **−16.7% cost, +15 turns.**

#### Graph-favoring edits (T3, T3b) — n=2 paired

| Task | Description | Baseline turns / cost | Adam turns / cost | Δ cost |
|---|---|---:|---:|---:|
| T3 | rename `executeTool` → `dispatchTool` (touches lib/mcp.ts + route.ts) | 8 / $0.063 | 10 / $0.097 | +55% |
| T3b | add `version` field, update every successful return | 12 / $0.179 | 13 / $0.174 | −3% |

**Aggregate (n=2):** $0.241 → $0.271 — **+12% cost.** Mixed result on n=2; T3 is a one-caller rename that adam over-explores via graph queries, T3b lands flat.

#### Total

|  | Tokens | Cost | Turns |
|---|---:|---:|---:|
| baseline (22) | 2,996,443 | $2.7236 | 123 |
| **adam** (22) | **3,063,167** | **$2.2504** | **133** |
| **Δ** | +2.2% | **−17.4%** | +10 |

### Subbench 2b — Output code quality

Two-layer probe per captured edit (`bench/scripts/quality.sh`, `bench/scripts/quality-runtime.ts`):

1. **Compile** — `tsc --noEmit` on the resulting `lib/mcp.ts` (and `route.ts` for the rename).
2. **Runtime** — import the dispatcher, invoke the new/renamed tool with realistic args, assert the envelope matches the prompt's specification (e.g. *"returns the matching projects"* → `data` is the array, not a metadata wrapper).

| Cond | Compile | Runtime |
|---|---:|---:|
| baseline  | 12/12 ✓ | **9/12** |
| **adam** | 12/12 ✓ | **10/12** |

Per-task detail in `scripts/quality.md`. The improvement: adam's spec recipe includes an explicit *"data MUST be the literal value the prompt asks for, no wrapper object"* rule, which moved T2h from baseline-fail (`{categories: [...]}`) to adam-pass (bare array). T2f and T2i still wrap in metadata under both conditions — Sonnet defaults to that shape and the rule isn't strong enough to override it.

What this measures: code that compiles **and** does what the prompt asked at runtime. What it doesn't: hand-judged style fit, edge-case correctness, security review.

## Methodology

Inspired by the AGENTbench paper ([Evaluating AGENTS.md](https://arxiv.org/html/2602.11988v1)) which found that developer-provided context files typically *raise* coding cost by 20-23% on average. adam's −17.4% total moves the needle the other way; the spec-recipe's data-shape rule is what closes the quality gap.

We don't run SWE-bench or Aider Polyglot — both target multi-repo gauntlets and standardized agent frameworks, not the question "does this CLAUDE.md scaffolder help?" Per the [community survey](https://www.morphllm.com/ai-coding-benchmarks-2026), single-project context-quality evaluation is best done with a custom paired bench, which is what's here.

## Caveats

- **n=10 per family** for orientation and additive (n=2 for graph-favoring — directional only).
- **Single repo, single model.** Sonnet against one Next.js / TypeScript project (~55 files, 747 graph nodes). Bigger repos with bigger blast radii should benefit more from the graph layer.
- **Spec coverage matters more than spec quantity.** Off-spec topics (T1g, T1h) regressed.
- **CLAUDE.md hygiene.** `gitnexus analyze` injects a prescriptive `<!-- gitnexus:start -->...<!-- gitnexus:end -->` block on first run; the bundled `scripts/strip-gitnexus-block.sh` makes the cleanup idempotent.

## Reproduce

```bash
# 1. Index the project
cd /path/to/portifolio && gitnexus analyze
bash scripts/strip-gitnexus-block.sh /path/to/portifolio

# 2. Two scratch copies
rsync -a --exclude=node_modules --exclude=.next /path/to/portifolio/ /tmp/bench/baseline/
rsync -a --exclude=node_modules --exclude=.next /path/to/portifolio/ /tmp/bench/with-adam/
cp bench/with-adam-CLAUDE.md /tmp/bench/with-adam/CLAUDE.md
cp -r bench/with-adam-spec /tmp/bench/with-adam/spec
cp bench/with-adam.mcp.json /tmp/bench/with-adam/.mcp.json
cd /tmp/bench/with-adam && gitnexus analyze --skip-git && bash scripts/strip-gitnexus-block.sh .

# 3. Run
bash bench/scripts/run-deep.sh                   # 20 orientation+additive (older suite)
bash bench/scripts/run-edits-capture-final.sh    # 12 paired edit runs (the canonical set)

# 4. Aggregate + quality
node bench/scripts/aggregate-final.mjs
bash bench/scripts/quality.sh
```
