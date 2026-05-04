# adam — real benchmark

Apples-to-apples comparison: same Claude Code (`claude -p`, model `sonnet`) running the same tasks against two copies of [lkzppm/portifolio](https://github.com/lkzppm/portifolio) — one vanilla, one bootstrapped with `/adam:setup`. Numbers come straight from `claude -p --output-format json`'s `usage` block; raw JSON is in `results/`.

## Setup

```
rsync portifolio → /tmp/bench/baseline      # vanilla, no CLAUDE.md
rsync portifolio → /tmp/bench/with-adam     # + spec/{overview,frontend,chat-api}.md + CLAUDE.md (3 specs, 2744 tokens total)
```

Both directories are byte-identical except for the spec scaffolding. Each task ran once per directory with `--allowedTools "Read Edit Write Glob Grep"`.

## Tasks

| ID | Task | Edits files? |
|---|---|---|
| **T1** | "How does the chat API rate-limit visitors? Be concise — list the layers, the key files involved, and the key constants/thresholds." | No (pure orientation) |
| **T2** | "Add a new MCP-style tool `list_projects_by_tag` to `lib/mcp.ts`. Takes a `tag` string, returns matching projects from `data/portfolio.ts` (case-insensitive). Wire into `TOOL_SCHEMAS` and `executeTool`." | Yes (`lib/mcp.ts` + `data/portfolio.ts`) |

## Results

### Token usage

| Run | Turns | Total tokens | Cache read | Cache create | Output | Cost |
|---|---:|---:|---:|---:|---:|---:|
| T1 baseline | 4 | **75,498** | 57,511 | 17,236 | 746 | $0.0936 |
| T1 with-adam | 3 | **53,091** | 36,173 | 16,326 | 588 | $0.0814 |
| T2 baseline | 8 | **213,497** | 189,824 | 21,078 | 2,586 | $0.1753 |
| T2 with-adam | 7 | **188,210** | 165,865 | 20,019 | 2,318 | $0.1601 |
| **Total baseline** | | **288,995** | | | | **$0.2689** |
| **Total with-adam** | | **241,301** | | | | **$0.2415** |
| **Δ** | **−2 turns** | **−47,694 tokens (−16.5%)** | | | | **−$0.0274 (−10.2%)** |

### What "tokens" measures here

`total = input + output + cache_read + cache_create`. Cache reads dominate because the system prompt + tool definitions get loaded once and reused. The lift from adam comes from **less filesystem trawling** — Claude reads two well-curated specs instead of grepping the source.

### Per-task observations

**T1 (orientation).** With-adam read CLAUDE.md once, picked `spec/chat-api.md` from the index, and answered. Baseline had to globally Grep, then read `lib/ratelimit.ts`, then read `app/api/chat/route.ts`, then synthesize. Result: **−30% tokens, −1 turn.**

**T2 (code edit).** Both versions completed the task correctly. With-adam was slightly more efficient (−12% tokens, −1 turn) because it knew where `lib/mcp.ts` lived and what conventions to follow without searching. Both produced functioning code; with-adam's version was a touch more defensive (`p.tags ?? []`) and returned a richer response shape (`{tag, projects: matches}` instead of just the array). See `results/T2-*.json` for the actual `result` text and the produced diffs.

### Code-quality diff (T2)

```diff
  case 'list_projects_by_tag': {
-   const tag = typeof args.tag === 'string' ? args.tag.trim() : ''       // baseline
+   const tag = typeof args.tag === 'string' ? args.tag.trim().toLowerCase() : ''  // with-adam
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

Both are correct. With-adam's version is more robust (`?? []` guards a missing tags array) and gives the LLM consumer the search term back, which is friendlier for downstream tool-use loops.

## Caveats

- **n=1 per cell.** Real benchmarks need multiple runs to average out cache warmup and randomness. Treat these as a directional signal, not a published number. The trend held in both tasks.
- **Same model, same machine.** Cross-model or cross-account variance not measured.
- **Spec quality matters.** The with-adam tree had hand-curated specs (built by simulating what `/adam:setup` produces). A poorly written spec would help less or even hurt. The spec-lint MCP (`adam:spec-lint__lint`) catches the obvious failure modes (oversize specs, broken cross-refs, missing index entries).

## Reproduce

```bash
# 1. Copy a project to two locations.
rsync -a --exclude=node_modules --exclude=.next your-project/ /tmp/bench/baseline/
rsync -a --exclude=node_modules --exclude=.next your-project/ /tmp/bench/with-adam/

# 2. Run /adam:setup in one of them (or write spec/ + CLAUDE.md by hand).
cd /tmp/bench/with-adam && claude -p "/adam:setup"  # if plugin installed
# or copy bench/with-adam-{CLAUDE.md,spec/} as a starting point

# 3. Same prompt in both.
TASK="<your task>"
cd /tmp/bench/baseline && claude -p "$TASK" --output-format json --model sonnet > T-baseline.json
cd /tmp/bench/with-adam && claude -p "$TASK" --output-format json --model sonnet > T-with-adam.json

# 4. Compare usage blocks.
jq '.usage' T-baseline.json T-with-adam.json
```
