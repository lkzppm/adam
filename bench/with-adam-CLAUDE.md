# Hono — fast, lightweight web framework

Multi-runtime web framework (Cloudflare Workers, Bun, Deno, AWS Lambda, Vercel, Node). Pure TypeScript, zero deps. Public surface: `Hono` app + per-request `Context` (`c.req`, `c.json/text/html`, `c.var`). Source in `src/`, tests in `src/**/*.test.ts`. tsc gate: `npx tsc --noEmit --project tsconfig.build.json` (excludes tests).

## When to use the spec + graph

The spec and the GitNexus graph cost ~3K cached tokens. Only spend that when the savings exceed it.

**Use them for:**
- Cross-file refactors (rename, signature change, type widen) that touch >2 files.
- New code that follows a non-obvious convention spread across multiple files (new built-in middleware, new helper module, new `Context` method).
- "Where does X live?" / "How does X reach Y?" questions.

**Skip them for:**
- Single-file additive edits to an existing file (one new export to a util, a one-line fix).
- Tasks completely scoped within one file you can already locate.
- Reformatting / trivial typo fixes.

If skipping: don't read `spec/`, don't call `gitnexus_*`. Just `Read` the file you need and `Edit`.

## Spec index

| Spec | Read when… |
|---|---|
| [spec/overview.md](./spec/overview.md) | You need a map of where things live |
| [spec/middleware.md](./spec/middleware.md) | Adding a built-in middleware, helper module, or `Context` method |
| [spec/refactor.md](./spec/refactor.md) | Cross-file rename / type widening / signature change |

## Editing rules (when spec/graph is in scope)

- For **function or method renames**, locate via `gitnexus_context({name, repo: "hono"})` — the `incoming` list IS your edit list. **Trust it; do not re-grep.** Re-grepping a symbol the graph already resolved is the #1 source of cache pollution in refactors.
- For **class / type / interface / exported const renames**, skip the graph and grep directly. Target the import statement, not the bare name: `grep -rn "import.*\\bX\\b.*from.*<path-fragment>" src -l`. Use `-l` (filenames only) — line-by-line grep on common names triggers tool-result spillover.
- For **multi-symbol renames in one prompt**, issue all orientation calls in PARALLEL (one message, multiple `tool_use` blocks). Never loop the workflow per symbol.
- Don't call `gitnexus_impact` for mechanical renames — its metadata bloats cache without changing the edit list. Save it for behavioral changes.
- **Never read a tool-results spillover file.** If a tool says *"Output too large. Full output saved to: …"*, re-run the tool with narrower flags (add `-l`, narrow `--include`, narrow path). Reading the spillover permanently pollutes cache with noise.
- For files >300 lines, read only the slice the graph returns ± 20 lines.

## Response style

- **Code requests** (implement, fix, refactor, add): reply with a 1–3 line briefing. No diff summaries, no restating the task.
- **Explanations** (why / how / explain): reply normally.
- Default to brief.
