---
name: refactor
description: Workflow rules for cross-file refactors (rename, signature change, type widen). Read when a task spans multiple files.
tags:
  - rules
  - refactor
  - workflow
---

# Cross-file refactor — workflow rules

Use when renaming, widening, or signature-changing a symbol that lives in one file but is imported / called from many. Skip this recipe for single-file changes.

The graph is your **map**, not a renaming tool. It tells you which files to edit; you do the edits with `Edit` / `MultiEdit`.

## Workflow

### 1. Pick the right tool for what you're renaming

The graph indexes **call edges only** — function calls and method invocations. It does NOT track type-position uses (`extends X`, `: X`, `instanceof X`, generic args, `keyof X`, etc.).

| What you're renaming | Use | Why |
|---|---|---|
| Top-level **function** with explicit imports (`import { x } from '...'`) | `gitnexus_context` — **trust it; do not re-grep** | Caller list is exhaustive — call edges cover all consumers. |
| **Method** on a class | `gitnexus_context({name, kind: "Method"})` — **trust the `incoming` list** | Method dispatch is partially tracked but `incoming` already gives you the file:line set. Re-grepping wastes turns and risks cache pollution. |
| **Class / type / interface / exported `const`** | grep directly: `grep -rn "import.*\\bX\\b.*from.*<path-fragment>" <source-root> -l` | Type-position uses dominate; the graph won't list them. Target the import statement, NOT the bare name — see "Grep discipline" below. |

### 2. Trust the graph result

When `gitnexus_context` returns an `incoming` list with file paths and line numbers, **that is your edit list. Stop searching.** Skip straight to step 4 (apply edits).

The single biggest waste in refactor tasks is calling the graph, getting a useful answer, and then grepping for the same symbol "to be safe" — the bare-name grep returns hundreds of unrelated matches and bloats cache irreversibly. The graph already filtered to true callers; the grep does not.

If the graph returned an empty `incoming: {}` for a function/method (rare but possible), do ONE targeted grep (see discipline below) and stop. Don't loop.

### 3. Multi-symbol renames in a single prompt

If the task asks you to rename **N>1 symbols** at once (e.g. `getX + setX`, `sign + verify`, `decode + encode`):

- **Issue all orientation calls in PARALLEL** — one assistant message with multiple `tool_use` blocks. Never loop the recipe per symbol; that doubles the cache cost.
- For graph queries: include all symbol names in parallel `gitnexus_context` calls.
- For grep fallback: combine names into one regex (`grep -rn "import.*\\b\\(X\\|Y\\)\\b" <root> -l`).

Then walk the merged caller list once and apply all renames per file.

### 4. Don't call `gitnexus_impact` for mechanical renames

`gitnexus_impact` is for risk assessment of **behavioral** changes. For a pure rename, the caller list from `gitnexus_context` (or grep) is everything you need. Calling `gitnexus_impact` returns rich metadata (blast radius, risk level, affected processes) that bloats your cache without changing the edit list. Save it for actual semantic changes.

### 5. Apply edits in this order

1. Open the definition file (the `export class` / function / const). Apply the rename there.
2. For each caller from the graph or grep: `Read` (the harness requires it before `Edit`), then `Edit` with `replace_all: true` if the bare name is unambiguous in that file. Use targeted edits with surrounding context if the name overlaps with built-ins or unrelated identifiers.

Don't read files top-to-bottom. The graph gave you a line number — read ±20 lines.

### 6. Verify

Run the project's typecheck command (`npx tsc --noEmit`, `mypy`, `cargo check`, `go vet`, etc.) and fix anything it flags.

## Grep discipline

When the graph isn't appropriate (class/type/const renames) or returned empty, grep is the fallback — but ambiguous bare names (`raw`, `set`, `add`, `match`, `every`, `some`, `parse`, `serialize`, `compose`, `header`, `body`, `data`, `value`, `key`, etc.) appear all over a codebase and a naive `grep -rn "X"` returns kilobytes of noise.

**Two rules to keep grep cheap:**

1. **Always use `-l` (filenames only).** `grep -rn "X" --include="*.<ext>" -l` returns one line per matching file. Then read+edit each — never the line-by-line output. Filename-only grep stays under 1KB even for very common names; line-by-line grep on a common name routinely exceeds 10KB and triggers tool-result spillover (see below).
2. **Target the import statement, not the bare name.** `grep -rn "import.*\\bX\\b.*from.*<path-fragment>" src -l` returns only files that import the specific symbol from the specific module. Skips JSDoc mentions, field accesses (`obj.X`), unrelated identifiers, and other noise.

## NEVER read a tool-results spillover file

When a tool returns more output than fits inline, Claude Code writes the full content to a file like `~/.claude/projects/<proj>/tool-results/<id>.txt` and shows you a preview that says *"Output too large. Full output saved to: <path>"*.

**Do not read that file.** It permanently moves the entire spilled payload into your conversation cache, which then incurs `cache_read` cost on every subsequent turn — typically hundreds of thousands of tokens of unrelated noise.

If you see a spillover notice, the tool was called too broadly. **Re-run with narrower scope:** add `-l` to grep, add a path filter, or add a `--include` pattern. The preview alone usually tells you whether your query was on track; if it was, narrow it; if it wasn't, change strategy.

## Don'ts

- **Don't read tool-results spillover files** — they pollute cache irrecoverably. Re-run the tool with narrower flags instead.
- **Don't grep for bare common names** like `raw`, `set`, `add`, `match`, etc. Use `-l` and target the import path.
- **Don't re-grep after the graph already gave you the caller list.** Trust the graph result.
- **Don't update test files** unless the prompt explicitly asks them.
- **Don't rename source files** when only the symbol name changed. Keep the file path.
- **Don't loop the orientation cycle per symbol** when renaming multiple things — batch in parallel.
- **Don't call `gitnexus_impact` for mechanical renames** — it pollutes cache with metadata you won't use.
