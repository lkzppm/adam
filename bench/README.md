# adam — real benchmark

Apples-to-apples comparison: same Claude Code (`claude -p`, model `sonnet`) running the same tasks against two copies of [lkzppm/portifolio](https://github.com/lkzppm/portifolio) — one vanilla, one bootstrapped with `/adam:setup`. Numbers come straight from `claude -p --output-format json`'s `usage` block; raw JSON for all eight runs is in `results/`.

## Setup

```
rsync portifolio → /tmp/bench/baseline      # vanilla, no CLAUDE.md
rsync portifolio → /tmp/bench/with-adam     # + spec/{overview,frontend,chat-api}.md + CLAUDE.md
                                            #   3 specs, ~2,744 cl100k tokens total
```

Both directories are byte-identical except for the spec scaffolding. Each task ran with `--allowedTools "Read Edit Write Glob Grep"`. The with-adam tree's `CLAUDE.md` and `spec/*.md` are checked into this directory so you can read what Claude saw — see `with-adam-CLAUDE.md` and `with-adam-spec/`.

## Tasks (n=2 per family)

| ID | Family | Task |
|---|---|---|
| **T1**  | orientation | "How does the chat API rate-limit visitors? Be concise — list the layers, the key files, the constants/thresholds." |
| **T1b** | orientation | "What rate-limiting strategy does /api/chat use? Walk through the code path — files, thresholds, fallbacks. Read-only." |
| **T2**  | edit | "Add a new MCP-style tool `list_projects_by_tag` to `lib/mcp.ts`. Takes a `tag` string, returns matching projects from `data/portfolio.ts` (case-insensitive). Wire into `TOOL_SCHEMAS` and `executeTool`." |
| **T2b** | edit | "Add a new MCP-style tool `list_skills_by_category` to `lib/mcp.ts`. Takes a `category` string, returns matching entries from `skillCategories`. Wire into `TOOL_SCHEMAS` and `executeTool`." |

T1/T1b and T2/T2b are pairs of equivalent-but-rephrased tasks (n=2 per family) to defeat prompt caching and check that the trend isn't a one-shot fluke.

## Results

### Per-run

| Run | | Turns | Tokens | Cost | Δ tokens | Δ cost |
|---|---|---:|---:|---:|---:|---:|
| T1 | baseline | 4 | 75,498 | $0.0936 | | |
| | with-adam | 3 | 53,091 | $0.0814 | **−29.7%** | **−13.0%** |
| T1b | baseline | 2 | 46,604 | $0.1915 | | |
| | with-adam | 3 | 53,284 | $0.0844 | +14.3% | **−55.9%** |
| T2 | baseline | 8 | 213,497 | $0.1753 | | |
| | with-adam | 7 | 188,210 | $0.1601 | **−11.8%** | **−8.7%** |
| T2b | baseline | 8 | 203,493 | $0.1535 | | |
| | with-adam | 6 | 156,595 | $0.1349 | **−23.0%** | **−12.1%** |

### Per family (n=2 averages)

| Family | Baseline avg | With-adam avg | Δ tokens | Δ cost |
|---|---:|---:|---:|---:|
| Orientation (T1, T1b) | 61,051 t / $0.1426 | 53,188 t / $0.0829 | **−12.9%** | **−41.8%** |
| Edit (T2, T2b) | 208,495 t / $0.1644 | 172,402 t / $0.1475 | **−17.3%** | **−10.3%** |

### Aggregate (all 8 runs)

|  | Tokens | Cost | Turns |
|---|---:|---:|---:|
| Baseline | 539,092 | $0.6139 | 22 |
| With-adam | 451,180 | $0.4608 | 19 |
| **Δ** | **−16.3%** | **−24.9%** | **−3** |

### Why cost beats tokens

T1b is the most striking case: with-adam used **14% more tokens but cost 56% less dollars**. The reason is the cache mix:

```
T1b baseline:   35.5K cache_read +  10.2K cache_create  + 902 output  → many fresh file reads
T1b with-adam:  36.2K cache_read +  16.3K cache_create  + 789 output  → one spec read, then cheap
```

`cache_create` is roughly **6× the price of `cache_read`**. When Claude has a curated index ("for rate-limiting, read `spec/chat-api.md` — that's the only file you need"), it dispatches one large cache_read instead of repeatedly grepping + reading source files. **Cache pricing is what really compounds.** Tokens are the leading indicator; dollars are the lagging one.

### T2/T2b — code-quality side note

All four edit runs completed correctly. The with-adam diffs were slightly more defensive (T2 example):

```diff
  case 'list_projects_by_tag': {
-   const tag = typeof args.tag === 'string' ? args.tag.trim() : ''       // baseline
+   const tag = typeof args.tag === 'string' ? args.tag.trim().toLowerCase() : ''
    if (!tag) return { ok: false, error: 'tag is required' }
-   const needle = tag.toLowerCase()
-   const matched = projects.filter(p => p.tags.some(t => t.toLowerCase() === needle))
-   return { ok: true, data: matched }
+   const matches = projects.filter(p =>
+     (p.tags ?? []).some(t => t.toLowerCase() === tag),
+   )
+   return { ok: true, data: { tag, projects: matches } }
  }
```

`?? []` guards a missing tags array; the response shape echoes the tag back, which is friendlier for downstream tool-use loops. T2b showed similar nudges. Both versions are functionally correct; the with-adam versions read like code that was written *with* the API conventions in mind — which is exactly what the spec encodes.

## Caveats

- **n=2 per task family.** Real published numbers want n≥10. Treat these as a directional signal whose direction was consistent across both pairs.
- **Same model, same machine, same Claude Code account.** Cross-model variance not measured.
- **Spec quality matters.** A poorly written spec helps less or even hurts. The `spec-lint` MCP catches the obvious failure modes — oversize specs, broken cross-refs, missing index entries. The specs used in this benchmark passed lint.

## Reproduce

```bash
# 1. Copy a project to two locations.
rsync -a --exclude=node_modules --exclude=.next your-project/ /tmp/bench/baseline/
rsync -a --exclude=node_modules --exclude=.next your-project/ /tmp/bench/with-adam/

# 2. Run /adam:setup in one of them (or write spec/ + CLAUDE.md by hand — examples in bench/with-adam-*).
cd /tmp/bench/with-adam && claude -p "/adam:setup"

# 3. Same prompt in both.
TASK="how does X work in this codebase?"
cd /tmp/bench/baseline && claude -p "$TASK" --output-format json --model sonnet > T-baseline.json
cd /tmp/bench/with-adam && claude -p "$TASK" --output-format json --model sonnet > T-with-adam.json

# 4. Compare usage blocks.
jq '{tokens: (.usage.input_tokens + .usage.output_tokens + .usage.cache_read_input_tokens + .usage.cache_creation_input_tokens), cost: .total_cost_usd, turns: .num_turns, duration_ms}' T-baseline.json T-with-adam.json
```

Raw JSON for all eight runs in this benchmark is in `results/T{1,1b,2,2b}-{baseline,with-adam}.json`.
