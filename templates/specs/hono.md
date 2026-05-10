---
name: <TOPIC>
description: <one-line summary>
tags: [hono, <area>]
updated: <YYYY-MM-DD>
anchors:
  - <file>:<symbol>
  - <Kind>:<file>:<symbol>
---

# <TOPIC>

<One paragraph of what this subsystem does in the service and why it exists.>

## Layout

<Where the relevant code lives. Examples:>
- `src/middleware/<kebab-name>/index.ts` — built-in middleware
- `src/helper/<kebab-name>/index.ts` — helper modules
- `src/context.ts` — `Context` class (host of `c.json`, `c.html`, `c.notFound`, etc.)
- `src/router/*.ts` — router variants

## Anchors — `<key file>` (≈<n> lines)

| Symbol | How to locate it |
|---|---|
| `<exportedFn>` | `gitnexus_context({name: "<exportedFn>", repo: "<repo>"})` |
| `<TypeName>` | `gitnexus_cypher({query: "MATCH (n) WHERE n.name = '<TypeName>' RETURN n.filePath, n.startLine, n.endLine"})` |

Before editing an existing symbol: `gitnexus_impact({target: "<symbol>", repo: "<repo>", direction: "upstream"})`.

## How to add a new <thing>

1. Create `src/middleware/<kebab-name>/index.ts` (one directory per middleware — keeps test fixtures co-located).
2. Export a factory function returning a `MiddlewareHandler`. Throw `HTTPException` for early-out errors so the 4xx body is consistent across the app.
3. Add the middleware to the public surface by re-exporting from `src/middleware/index.ts` (alphabetical).

```ts
// src/middleware/<kebab-name>/index.ts — drop-in template
import type { MiddlewareHandler } from '../../types'
import { HTTPException } from '../../http-exception'

interface Options { /* ... */ }

export const <kebab>Middleware = (opts: Options = {}): MiddlewareHandler => {
  return async (c, next) => {
    // pre-handler logic; throw HTTPException(400, { message: '...' }) if bad input
    await next()
    // post-handler logic; mutate response headers via c.res.headers.set(...)
  }
}
```

## Conventions

- Middleware factories return `MiddlewareHandler`; do not return `Response` directly.
- Errors → `HTTPException(status, { message })`; the framework's onError pipeline turns these into a clean response.
- Helper modules export individual functions, not classes.
- `Context` methods are added to the prototype in `src/context.ts` — match the surrounding style (TSDoc + overloaded signatures where applicable).

## Related

- `<spec/concepts/<related>.md>` — <one-line context>
