# adam — benchmark

Apples-to-apples comparison: the same `claude -p` (model `sonnet`) running 22 distinct tasks against two copies of [lkzppm/portifolio](https://github.com/lkzppm/portifolio) — one vanilla, one bootstrapped with `/adam:setup` (CLAUDE.md + `spec/*.md` + `.mcp.json` wiring the GitNexus knowledge-graph MCP server). Numbers come straight from `claude -p --output-format json`'s `usage` block; raw JSON for every run is in `results/` (orientation) and `edits-final/` (edits).

## Setup

```
rsync portifolio → /tmp/bench/baseline       # vanilla, no CLAUDE.md
rsync portifolio → /tmp/bench/with-adam      # + CLAUDE.md + spec/{overview,frontend,chat-api}.md
                                              # + .mcp.json (gitnexus stdio MCP)
                                              # + .gitnexus/ index (gitnexus analyze)
```

The with-adam scratch dir's CLAUDE.md and `spec/` are checked into this directory (`with-adam-CLAUDE.md`, `with-adam-spec/`) so you can read what Claude saw.

Each task ran with `--allowedTools "Read Edit Write Glob Grep"`; with-adam runs additionally allow `mcp__gitnexus__{context,query,impact,cypher,detect_changes}`. Edit tasks restore `lib/mcp.ts`, `app/api/chat/route.ts`, and `CLAUDE.md` to the canonical state before each run, then re-`gitnexus analyze` the with-adam dir so the graph matches the working tree (and re-strip the gitnexus auto-injected `<!-- gitnexus:start -->...<!-- gitnexus:end -->` block from CLAUDE.md, which `gitnexus analyze` writes on first run).

## Tasks (n=22 across three families)

**10 orientation** questions about `/api/chat` (read-only, distinct topics, not paraphrases):

| ID | Topic |
|---|---|
| T1, T1b | rate-limiting (two paraphrases) |
| T1c | MCP-style tool-calling loop |
| T1d | RAG retriever (TF-IDF) |
| T1e | `compute_fit_score` end-to-end |
| T1f | system prompt assembly |
| T1g | Upstash Redis fallback path |
| T1h | `fetch_contributions` flow |
| T1i | response streaming |
| T1j | `schedule_callback` end-to-end |

**10 additive edit** tasks adding new MCP-style tools to `lib/mcp.ts`:

| ID | New tool |
|---|---|
| T2 | `list_projects_by_tech(tech)` |
| T2b | `list_skills_in_category(category)` |
| T2c | `count_projects()` |
| T2d | `list_featured_projects()` |
| T2e | `find_project_by_id(id)` |
| T2f | `list_experiences_at_company(company)` |
| T2g | `search_projects(query)` |
| T2h | `list_categories()` |
| T2i | `list_techs()` (sorted unique) |
| T2j | `count_skills_per_category()` |

**2 graph-favoring edit** tasks designed to exercise blast-radius and dispatcher refactors:

| ID | Task |
|---|---|
| T3 | rename `executeTool` → `dispatchTool` (touches `lib/mcp.ts` + `app/api/chat/route.ts`) |
| T3b | add `version: string` to `ToolResultEnvelope` and update every successful return inside the dispatcher |

## Results

### Aggregate (all 22 tasks)

|  | Tokens | Cost | Turns |
|---|---:|---:|---:|
| baseline | 3,031,031 | $2.8016 | 123 |
| **adam** | **2,724,910** | **$2.4971** | **117** |
| **Δ** | **−10.1%** | **−10.9%** | **−6** |

### Per family

| Family | n | Baseline cost | Adam cost | Δ cost |
|---|---:|---:|---:|---:|
| Orientation (T1..T1j) | 10 | $1.1762 | $0.8913 | **−24.2%** |
| Additive edit (T2..T2j) | 10 | $1.3321 | $1.3524 | +1.5% |
| Graph-favoring (T3, T3b) | 2 | $0.2933 | $0.2534 | **−13.6%** |

### Honest read

- **Orientation is the clear win.** −24% cost, −20% tokens. Reading one curated spec beats reading 12 source files.
- **Additive edits are essentially flat.** +1.5% cost, +6 turns over 10 tasks. The graph helps target reads, but additive append-to-array tasks have a small enough surface that the savings fall inside run-to-run variance — neither the spec nor the graph reliably saves turns when the model already knows the file from the prompt.
- **Graph-favoring tasks see a real but uneven win.** T3 (cross-file rename) was a wash on this small repo (only one caller of `executeTool`, no graph search needed). T3b — modifying every successful return inside `executeTool` — dropped 21% in cost: the model used `gitnexus_context` to locate the dispatcher's full line range and edit each return without spelunking. Bigger wins would come on bigger repos with bigger blast radii.

`cache_create` (the expensive token bucket — file-by-file Reads) was −1.4% across the additive set. `cache_read` (the cheap one — system prompt + spec re-use) was nearly identical. The shape of the cost win lives in cache mix, not raw token volume.

### Per-run detail

#### Additive (T2..T2j)

| Task | Baseline tokens / cost | Adam tokens / cost | Δ tokens | Δ cost |
|---|---:|---:|---:|---:|
| T2 | 208,000 / $0.1471 | 151,426 / $0.0973 | −27.2% | **−33.9%** |
| T2b | 231,234 / $0.1557 | 262,379 / $0.1799 | +13.5% | +15.6% |
| T2c | 119,057 / $0.1136 | 149,430 / $0.1244 | +25.5% | +9.5% |
| T2d | 118,761 / $0.1108 | 185,797 / $0.1456 | +56.4% | +31.4% |
| T2e | 142,793 / $0.1256 | 119,109 / $0.1173 | −16.6% | −6.6% |
| T2f | 184,614 / $0.1390 | 218,416 / $0.1573 | +18.3% | +13.1% |
| T2g | 208,370 / $0.1491 | 151,132 / $0.1292 | −27.5% | **−13.3%** |
| T2h | 151,146 / $0.1227 | 118,651 / $0.1164 | −21.5% | −5.1% |
| T2i | 184,205 / $0.1390 | 150,961 / $0.1266 | −18.0% | −8.9% |
| T2j | 168,983 / $0.1294 | 226,585 / $0.1583 | +34.1% | +22.3% |

Six tasks went down, four went up. The aggregate falling almost exactly on baseline is the honest read for "no measurable effect on this workload" — the variance dominates any spec/graph effect for tightly-scoped append-to-array tasks.

#### Graph-favoring (T3, T3b)

| Task | Baseline turns / cost | Adam turns / cost | Δ tokens | Δ cost |
|---|---:|---:|---:|---:|
| T3 — rename across 2 files | 8 / $0.0939 | 7 / $0.0960 | +1.8% | +2.3% |
| T3b — update every dispatcher return | 8 / $0.1994 | 11 / $0.1574 | −9.7% | **−21.1%** |

T3b is the headline graph win on this repo: with-adam ran more turns but cheaper because it queried the graph to scope the work to a single function range, then made one targeted edit; baseline read the whole file, made several edits, re-read to verify.

## Quality

`tsc --noEmit` passes for all 14 captured edit outputs. Defensive-pattern counts (`??`, `if (!`) are unchanged from the baseline source — adam doesn't change Sonnet's defensive-coding habits, just where it reads.

```
| Task | Cond       | Δ lines | tsc | `?? ` | `if (!` |
|------|------------|---------|-----|-------|---------|
| T2   | with-adam  | +46     | ✓   | 15    | 8       |
| T2b  | with-adam  | +35     | ✓   | 15    | 9       |
| T2c  | with-adam  | +21     | ✓   | 15    | 7       |
| T2d  | with-adam  | +15     | ✓   | 15    | 7       |
| T2e  | with-adam  | +25     | ✓   | 15    | 9       |
| T2f  | with-adam  | +35     | ✓   | 15    | 8       |
| T2g  | with-adam  | +32     | ✓   | 15    | 8       |
| T2h  | with-adam  | +16     | ✓   | 15    | 7       |
| T2i  | with-adam  | +23     | ✓   | 15    | 7       |
| T2j  | with-adam  | +16     | ✓   | 15    | 7       |
| T3   | baseline   | +0      | ✓   | 15    | 7       |
| T3   | with-adam  | +0      | ✓   | 15    | 7       |
| T3b  | baseline   | +1      | ✓   | 15    | 7       |
| T3b  | with-adam  | +1      | ✓   | 15    | 7       |
```

What this measures: code compiles. What this does **not** measure: does the new tool return the right shape at runtime, does the rename hit every call site (a still-named `executeTool` use that happens to typecheck via `any` would slip), does the output match the project's existing patterns. Adding a runtime probe (invoke each tool, assert envelope shape) is a future iteration.

## Caveats

- **n=10 per family** for orientation and additive — strong enough to call orientation with confidence and additive as "no measurable effect, variance-dominated". n=2 for graph-favoring — directional only.
- **Single repo, single model.** Sonnet against one Next.js / TypeScript project (~55 files). Cross-repo and cross-model variance not measured. Bigger repos with bigger blast radii should benefit more from the graph.
- **Spec coverage matters more than spec quantity.** Topics covered in `spec/chat-api.md` saw the strongest orientation wins. Off-spec topics see no benefit.
- **CLAUDE.md hygiene.** `gitnexus analyze` injects a prescriptive `<!-- gitnexus:start -->...<!-- gitnexus:end -->` block into CLAUDE.md on first run; we strip it every task because its "MUST run impact analysis before editing any symbol" rules biased Sonnet toward extra exploration turns. The bundled `scripts/setup-graph.sh` and `scripts/strip-gitnexus-block.sh` make this idempotent for real-world setup.

## Reproduce

```bash
# 1. Index portifolio with GitNexus.
cd /path/to/portifolio && gitnexus analyze

# 2. Copy to two scratch locations.
rsync -a --exclude=node_modules --exclude=.next /path/to/portifolio/ /tmp/bench/baseline/
rsync -a --exclude=node_modules --exclude=.next /path/to/portifolio/ /tmp/bench/with-adam/

# 3. Run /adam:setup in the with-adam copy (or use the bundled fixture).
cp bench/with-adam-CLAUDE.md /tmp/bench/with-adam/CLAUDE.md
cp -r bench/with-adam-spec /tmp/bench/with-adam/spec
cp bench/with-adam.mcp.json /tmp/bench/with-adam/.mcp.json
cd /tmp/bench/with-adam && gitnexus analyze --skip-git
bash scripts/strip-gitnexus-block.sh /tmp/bench/with-adam

# 4. Run the full suite (orientation + edits).
bash bench/scripts/run-deep.sh                   # 20 orientation+edit runs (older suite, n=10 each)
bash bench/scripts/run-edits-capture-final.sh    # 12 edit runs incl. T3/T3b graph-favoring

# 5. Aggregate.
node bench/scripts/aggregate.mjs                 # orientation + additive
node bench/scripts/aggregate-final.mjs           # final additive + graph-favoring
bash bench/scripts/quality.sh                    # tsc + defensive-pattern check
```
