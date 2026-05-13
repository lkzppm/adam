---
name: orient
description: Workflow rules for orientation — answering "where does X live?", "how does X reach Y?", "what does this subsystem do?" without modifying code.
tags:
  - rules
  - orient
  - workflow
---

# Orientation — workflow rules

Use when the user is **asking about the codebase** without (yet) asking for an edit: "how does X work", "where does Y live", "trace the path from A to B", "what's the difference between X and Y".

## Workflow

### 1. Check `spec/concepts/` first

Most "how does X work" questions are covered by an existing concept spec. Search `spec/concepts/` and `spec/INDEX.md` — read the one matching spec, not the source code.

A concept spec should answer the question fully. If it doesn't, the spec is incomplete — flag it and supplement with one targeted source read, then suggest `/adam:spec-update` for next time.

### 2. For "where does X live?" use the graph

If the spec doesn't cover X, use `gitnexus_context({name: "X", repo: "<repo>"})` — returns file:line, callers, callees in one call. Cheaper than grepping multiple file types.

### 3. For "how does X reach Y?" use `gitnexus_query`

Natural-language ranked execution flows: `gitnexus_query({query: "how request reaches database", repo: "<repo>"})`. Returns process-grouped results in relevance order.

### 4. For exotic queries use `gitnexus_cypher`

Direct Cypher against the graph — find classes with >5 methods, find call chains of depth N, find files importing from multiple subsystems. Reach for this only when `context` and `query` don't fit.

### 5. Cite sources

When answering, include `file:line` references so the user can verify. Citations come for free from the graph response — don't re-read files just to confirm the line numbers.

## Don'ts

- **Don't read full files top-to-bottom** for orientation. Read the slice the graph returns ± 20 lines.
- **Don't `gitnexus_impact`** unless the question is specifically about blast radius / what would break.
- **Don't `gitnexus_detect_changes`** — that's for diff analysis, not codebase Q&A.
- **Don't paraphrase the spec** when answering — quote/cite the relevant section directly.
