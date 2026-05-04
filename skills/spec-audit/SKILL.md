---
name: spec-audit
description: Lint the spec-driven Claude Code ecosystem in this project — checks spec/, CLAUDE.md, and .claude/ for integration issues without rewriting anything. Use when the user runs /adam:spec-audit, /spec-audit (in this plugin's namespace), or asks to "lint specs", "check spec ecosystem", "verify CLAUDE.md is wired up", "audit my claude code setup", or "is my spec-driven workflow healthy?". Read-only — reports issues but does not modify files. For drift fixing, point users at /adam:spec-update.
---

# spec-audit

Read-only health check of the spec-driven workflow. Distinct from `spec-update`: that one fixes; this one reports.

## Process

1. Invoke the `spec-lint` MCP tool (`lint`) with the project root as the path argument. The lint result already includes a token summary for every spec.
2. If you need raw counts for a specific file (e.g. to weigh whether to split it), use the `token-count` MCP tool (`count`).
3. Format the combined output as a readable report (issues grouped by severity, then a token-count summary table).

## Report format

```
Spec ecosystem audit — <repo name>

Errors (must fix):
  - <issue>

Warnings:
  - <issue>

Token counts:
  | Spec                    | Tokens |
  |-------------------------|--------|
  | spec/overview.md        |  N     |
  | …                       |  …     |
  | CLAUDE.md               |  N     |

Summary: <one-line health verdict>
```

## What the lint MCP checks

(See `mcps/spec-lint/server.js` for authoritative rules.)

- `spec/INDEX.md` exists.
- `CLAUDE.md` has a spec index table with one row per `spec/*.md`.
- No spec file is missing from the index (and no index row points to a missing file).
- Cross-references between specs (`[link](./other.md)` style) all resolve.
- Each spec has standard frontmatter (`name`, `description`, `updated` at minimum).
- No spec exceeds the configured token ceiling (default ~5000 tokens — flag at 4000, error at 6000).
- `.claude/` exists at project root if the spec table mentions tailored agents.
- `CLAUDE.md` itself is under ~2000 tokens (it's a brief, not a spec).

## When to recommend a follow-up

- Errors → tell the user to run `/adam:spec-update` (which uses the agent to actually rewrite).
- A spec over the token ceiling → tell them to run `/adam:spec-update <path>` (the agent will split it).
- Missing `.claude/` agents/hooks the user expects → tell them to run `/adam:setup --force` or add by hand.

## Guardrails

- This skill is read-only. Do not write or edit any file.
- Do not invoke the `adam` sub-agent — this is a quick health check, not a refactor.
