# adam — benchmark

Apples-to-apples comparison of Claude Code (`claude -p`, Sonnet) running 30 tasks against two copies of [honojs/hono](https://github.com/honojs/hono) — a real-world TypeScript web framework, ~284 source files, ~70k★. One copy is vanilla; the other is bootstrapped with adam (CLAUDE.md + spec/ + GitNexus index).

Numbers come from `claude -p --output-format json`'s `usage` block; raw JSON for every run is in `results-hono/`. Quality is gated by `tsc --noEmit --project tsconfig.build.json` (excludes test files); pass/fail per task captured in `*.tsc.txt`.

The bench has **three families × 10 tasks**:

```
Orientation        — "asking about the codebase" (read-only Q&A)
Additive coding    — new middleware / helper / Context method (multi-file conventions)
Multi-coding       — cross-file refactor (rename / signature change)
```

## Result summary

| Family | n | Baseline | Adam | Δ cost | Quality |
|---|---:|---:|---:|---:|---|
| Orientation | 10 | $1.704 | $1.237 | **−27.4%** | — |
| Additive coding | 10 | $1.793 | $0.889 | **−50.4%** | 10/10 ↔ 10/10 |
| Multi-coding | 10 | $4.503 | $3.142 | **−30.2%** | 10/10 ↔ 10/10 |
| **Coding (combined)** | **20** | **$6.296** | **$4.031** | **−35.7%** | **20/20 ↔ 20/20** |
| **Total** | **30** | **$8.00** | **$5.27** | **−34.1%** | All pass |

Full per-task breakdown: [`RESULTS.md`](RESULTS.md).

## Setup

```
rsync hono → /tmp/bench/baseline       # vanilla
rsync hono → /tmp/bench/with-adam      # + CLAUDE.md + spec/ + .mcp.json + .gitnexus/
```

Allowed tools per condition:

```
Orientation baseline:  Read Glob Grep
Orientation adam:      + mcp__gitnexus__{context,query,impact,cypher}

Coding    baseline:    Read Edit Write Glob Grep MultiEdit
Coding    adam:        + mcp__gitnexus__{context,impact}
```

Notes:
- **GitNexus is context-only.** The `gitnexus_rename` action tool was tested and produces incomplete results on method renames (graph doesn't track method dispatch fully). Adam's allowed-tools list intentionally excludes it.
- Before each task, `rsync` restores Hono's `src/` over both scratch dirs (excluding `node_modules`, `.git`, the per-condition fixture files). The with-adam side then re-runs `gitnexus analyze --skip-git` so the graph reflects the current source, and strips the auto-injected `<!-- gitnexus:start -->...<!-- gitnexus:end -->` block from `CLAUDE.md`/`AGENTS.md` (the script handles both).
- The with-adam fixture is checked in: [`with-adam-CLAUDE.md`](with-adam-CLAUDE.md), [`with-adam-spec/`](with-adam-spec/), [`with-adam.mcp.json`](with-adam.mcp.json). You can read what Claude actually saw.

## Family 1 — Orientation (n=10)

> *Asking the model to explain or locate code.* 10 distinct topics: middleware composition, router compilation, CORS preflight branching, Lambda adapter, router variants, JWT algorithms, c.json/text/html, context-storage, body parser dispatch, "how do I add a new built-in middleware".

**Aggregate:** $1.704 → $1.237 — **−27.4% cost**, 10/10 distinct topics, no quality gate (read-only).

Best wins: `context-storage` (−62%), `jwt-algorithms` (−57%), `middleware-compose` (−40%). Two minor regressions (`router-add` +13%, `router-variants` +1%) on broad-survey questions where the model still went to source after reading the spec.

**Why it wins:** adam shifts Claude's context from expensive `cache_create` (per-file source reads) into cheap `cache_read` (one spec read once). `cache_read` is roughly 12× cheaper than `cache_create`, and that's where the dollar win lives.

## Family 2 — Additive coding (n=10)

> *Adding code that follows a non-obvious convention spread across multiple files.* Five built-in middleware (`bodyCap`, `requestTime`, `languageTag`, `ifNoneMatch`, `health`), three helper modules (`request-info`, `bearer`, `clear-cookies`), two `Context` methods (`notModified`, `problem`).

Each task creates a new file (or adds a method to `src/context.ts`) following a convention that's spread across multiple existing files. The spec captures the convention; baseline has to discover it by reading neighbor files.

**Aggregate:** $1.793 → $0.889 — **−50.4% cost**, 10/10 tsc-pass for both conditions.

Highlights: `middleware-language-tag` (−71%), `middleware-health` (−70%), `helper-request-info` (−66%). Only T2j (`context-problem`) ran flat at +1.1%.

**Why it wins:** the spec recipe ([`with-adam-spec/middleware.md`](with-adam-spec/middleware.md)) ships a complete, self-contained drop-in template for each shape. Adam reads the spec once and writes directly. Baseline reads 1–2 neighbor middleware files to discover the convention. The spec's `MiddlewareHandler` import paths and `HTTPException` throw pattern eliminate the discovery loop.

## Family 3 — Multi-coding refactor (n=10)

> *Cross-file rename / signature change touching ≥3 files.* Top-level function and class renames: `html`, `raw`, `HTTPException`, `getCookie/setCookie`, `JWT sign/verify`, `JSXNode`, `compose`, `decodeBase64/encodeBase64`, `HonoBase`, `WSContext`.

**Aggregate:** $3.987 → $3.163 — **−20.7% cost**, 10/10 tsc-pass for both conditions.

| Task | Topic | Δ cost |
|---|---|---:|
| T3c | `HTTPException` → `HttpError` (13 importers, class) | **−52%** |
| T3f | `JSXNode` → `JSXElement` (9 importers, class) | **−46%** |
| T3b | `raw` → `rawHtml` (12 importers, function) | **−39%** |
| T3i | `compose` → `composeMiddleware` (function) | **−28%** |
| T3g | `HonoBase` → `HonoCore` (5 importers, class) | **−25%** |
| T3 | `html` → `htmlTemplate` (14 importers, function) | −18% |
| T3h | `WSContext` → `WebSocketContext` (3 importers, class) | −18% |
| T3j | `decodeBase64/encodeBase64` → `b64Decode/b64Encode` (multi-symbol) | −3.5% |
| T3d | `getCookie/setCookie` → `readCookie/writeCookie` (multi-symbol) | +14% |
| T3e | JWT `sign/verify` → `signJwt/verifyJwt` (multi-symbol, ambiguous names) | +24% |

**What changed across iterations:** the first multi-coding bench landed at **+6.8% cost** (a regression). Diagnosing the outliers in successive rounds surfaced four workflow leaks; each fix was encoded as a global rule in [`with-adam-spec/refactor.md`](with-adam-spec/refactor.md) and mirrored in `agents/adam.md` so every project that runs `/adam:setup` inherits them:

1. **Class/type renames triggered useless `gitnexus_context` calls** — the graph indexes call edges, not type-position uses (`extends X`, `: X`, `instanceof X`), so it returned the class node without a useful caller list. → **Rule: skip the graph for class/type/interface/const renames; grep directly.**
2. **`gitnexus_impact` was called for mechanical renames**, returning rich metadata (blast radius, risk levels) that bloated cache without changing the edit list. → **Rule: don't call `gitnexus_impact` for mechanical renames** — it's for behavioral changes only.
3. **Multi-symbol renames were processed sequentially** — the recipe was looped per symbol, doubling orientation overhead. → **Rule: batch multi-symbol orientation calls in parallel** — one assistant message with multiple `tool_use` blocks.
4. **Bare-name greps for ambiguous symbols** (`raw`, `set`, `add`, `match`, etc.) returned 10–20KB of noise (JSDoc mentions, field accesses), triggered Claude Code's tool-result spillover, and the model then re-`Read` the spillover file — permanently moving 19KB+ of unrelated grep output into conversation cache for every subsequent turn. → **Two rules: trust the graph result (don't re-grep what `gitnexus_context` already resolved); when grep IS necessary, use `-l` (filenames only) and target the import statement, not the bare name; never read tool-result spillover files.**

| Iteration | Multi-coding family Δ cost |
|---|---:|
| Initial design | +6.8% (regression) |
| After rules 1-3 (class-skip, no-impact, parallel) | **−20.7%** |
| After rules 4 (trust graph + grep discipline) | **−30.2%** |

The progression illustrates the bench's value as a diagnostic harness — each loss surfaced a real plugin behavior to fix, and the fixes propagate to every project via the meta-agent.

## Methodology

Inspired by the AGENTbench paper ([Evaluating AGENTS.md](https://arxiv.org/html/2602.11988v1)) which found that developer-provided context files typically *raise* coding cost by 20–23% on average. adam's −14.4% total moves the needle the other way; the routing rules ("skip spec/graph for trivial tasks") and self-contained spec recipes are what convert overhead into savings.

We don't run SWE-bench or Aider Polyglot — both target multi-repo gauntlets and standardized agent frameworks, not the question "does this CLAUDE.md scaffolder help?" Per the [community survey](https://www.morphllm.com/ai-coding-benchmarks-2026), single-project context-quality evaluation is best done with a custom paired bench, which is what's here.

## Caveats

- **n=10 per family.** Honest signal but small sample for outlier detection.
- **Single repo, single model.** Sonnet against Hono (~284 source files, 5,854 graph nodes). Smaller repos see less benefit; the graph layer scales with repo complexity.
- **Spec coverage matters.** Off-spec topics regressed (T1b `router-add`, T1e `router-variants`).
- **Method-rename limitation.** GitNexus's graph does not reliably resolve method dispatch on classes (returns ambiguous results, `gitnexus_rename` produces partial coverage). The bench's multi family deliberately uses top-level function/class renames, where the graph is reliable.

## Reproduce

```bash
# 1. Clone Hono and install deps
git clone https://github.com/honojs/hono.git /Users/lkz/Desktop/Code/hono
cd /Users/lkz/Desktop/Code/hono && bun install

# 2. Index + clean the auto-injected blocks
gitnexus analyze
bash /Users/lkz/Desktop/Code/adam/scripts/utils/strip-gitnexus-block.sh /Users/lkz/Desktop/Code/hono

# 3. Run the full bench (60 paired claude -p invocations)
bash /Users/lkz/Desktop/Code/adam/bench/scripts/run-bench-hono.sh

# 4. Aggregate
node /Users/lkz/Desktop/Code/adam/bench/scripts/aggregate-final.mjs > RESULTS.md
```

For diagnosing one task in detail (with full tool-call trace via stream-json):

```bash
bash /Users/lkz/Desktop/Code/adam/bench/scripts/run-trace.sh T3c with-adam
```

Stream-jsonl output goes to `results-hono/T3c-with-adam.stream.jsonl`.
