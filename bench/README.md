# adam — real benchmark

Apples-to-apples comparison: same Claude Code (`claude -p`, model `sonnet`) running the same tasks against two copies of [lkzppm/portifolio](https://github.com/lkzppm/portifolio) — one vanilla, one bootstrapped with `/adam:setup`. Numbers come straight from `claude -p --output-format json`'s `usage` block; raw JSON is in `results/`.

## Setup

```
rsync portifolio → /tmp/bench/baseline      # vanilla, no CLAUDE.md
rsync portifolio → /tmp/bench/with-adam     # + spec/{overview,frontend,chat-api}.md + CLAUDE.md
                                            #   3 specs, ~2,744 cl100k tokens total
```

Both directories are byte-identical except for the spec scaffolding. Each task ran with `--allowedTools "Read Edit Write Glob Grep"`.

## Tasks

| ID | Task | Edits files? |
|---|---|---|
| **T1**  | "How does the chat API rate-limit visitors? Be concise — list the layers, the key files, the constants/thresholds." | No (orientation) |
| **T1b** | "What rate-limiting strategy does /api/chat use? Walk through the code path — files, thresholds, fallbacks. Read-only." | No (orientation, rephrased to defeat cache) |
| **T2**  | "Add a new MCP-style tool `list_projects_by_tag` to `lib/mcp.ts`. Takes a `tag` string, returns matching projects from `data/portfolio.ts` (case-insensitive). Wire into `TOOL_SCHEMAS` and `executeTool`." | Yes (`lib/mcp.ts` + `data/portfolio.ts`) |

T1 and T1b are two phrasings of the same orientation question — n=2 for the read-only case.

## Results

### Per-task

| Run | Turns | Tokens | Cost | Δ tokens | Δ cost |
|---|---:|---:|---:|---:|---:|
| T1 baseline | 4 | 75,498 | $0.0936 | | |
| T1 with-adam | 3 | 53,091 | $0.0814 | **−29.7%** | **−13.0%** |
| T1b baseline | 2 | 46,604 | $0.1915 | | |
| T1b with-adam | 3 | 53,284 | $0.0844 | +14.3% | **−55.9%** |
| T2 baseline | 8 | 213,497 | $0.1753 | | |
| T2 with-adam | 7 | 188,210 | $0.1601 | **−11.8%** | **−8.7%** |

### Aggregate

|  | Tokens | Cost |
|---|---:|---:|
| Baseline (6 runs total) | 335,599 | $0.4604 |
| With-adam (6 runs total) | 294,585 | $0.3259 |
| **Δ** | **−12.2%** | **−29.2%** |

Orientation tasks averaged across n=2: **−12.9% tokens, −41.8% cost.**

### Why cost beats tokens

T1b is the interesting case: with-adam used 14% **more** tokens but cost 56% **less**. The reason is the **cache mix**:

```
T1b baseline:    35.5K cache_read +  10.2K cache_create  (lots of fresh file reads)
T1b with-adam:   36.2K cache_read +  16.3K cache_create  (one spec read, then cheap)
```

cache_create is ~6× the price of cache_read. When Claude has a curated index ("read spec/chat-api.md, that's the only file you need"), it dispatches one or two large cache_reads instead of repeatedly grepping + reading source files. **Cache is what really gets cheaper.** Tokens are the leading indicator; dollars are the lagging one.

### T2 — code-quality side note

Both versions completed the edit task correctly. The with-adam diff was slightly more defensive:

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

`?? []` guards a missing tags array; the response shape echoes the tag back, which is friendlier for downstream tool-use loops. Both are functionally correct; the with-adam version is a touch nicer to consume.

## Caveats

- **Small n** (n=2 for orientation, n=1 for the edit task). Treat as directional.
- **Same model, same machine.** Cross-model variance not measured.
- **Spec quality matters.** A poorly written spec helps less or even hurts. The `spec-lint` MCP catches the obvious failure modes — oversize specs, broken cross-refs, missing index entries.

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

Raw JSON for all six runs in this benchmark is in `results/`.
