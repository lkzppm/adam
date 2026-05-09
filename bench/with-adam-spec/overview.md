# Hono — overview

Hono is a multi-runtime web framework. Public surface is the `Hono` class (an alias for `HonoBase`) with chainable `.get/.post/.put/.use(...)` and a per-request `Context` (`c.req.*`, `c.json/text/html/redirect`, `c.var`).

## Lifecycle of a request

1. Runtime adapter (cloudflare-workers, aws-lambda, bun, …) calls `app.fetch(req)`.
2. `HonoBase.fetch` (in `src/hono-base.ts`) finds the matched routes via the active `Router` (default = SmartRouter, which picks RegExpRouter or TrieRouter on first hit).
3. Matched middleware/handlers are composed by `compose()` (`src/compose.ts`) into a dispatch chain. The chain executes in order, each calling `await next()` to defer to the next handler.
4. Each handler receives a `Context` (`src/context.ts`) wrapping the request (`HonoRequest` in `src/request.ts`) and helpers for building responses.
5. Errors throw `HTTPException` (`src/http-exception.ts`) which `HonoBase` converts to a Response.

## Where things live

| Concern | Path |
|---|---|
| App class (public) | `src/hono.ts` (re-exports `src/hono-base.ts`'s `Hono`) |
| Routing dispatch | `src/router.ts` + `src/router/<variant>/router.ts` |
| Middleware chain | `src/compose.ts` |
| Request | `src/request.ts` (HonoRequest) |
| Response building | `src/context.ts` (Context) |
| Errors | `src/http-exception.ts` (HTTPException) |
| Built-in middleware | `src/middleware/<name>/index.ts` |
| Composable helpers | `src/helper/<name>/index.ts` |
| Pure utilities | `src/utils/<file>.ts` |
| Per-runtime entry | `src/adapter/<runtime>/handler.ts` (or `index.ts`) |
| JSX runtime | `src/jsx/` (server + DOM under `src/jsx/dom/`) |

## Routers

| Variant | When used | File |
|---|---|---|
| `RegExpRouter` | Fastest, regex tree | `src/router/reg-exp-router/router.ts` |
| `TrieRouter` | Trie-based, predictable | `src/router/trie-router/router.ts` |
| `LinearRouter` | Small, no regex (good for serverless cold start) | `src/router/linear-router/router.ts` |
| `PatternRouter` | URLPattern-based | `src/router/pattern-router/router.ts` |
| `SmartRouter` | Default — picks one of the above on first match | `src/router/smart-router/router.ts` |

## Public exports

`src/index.ts` re-exports `Hono` (from `hono.ts`) and `HTTPException`. Subpaths `hono/cookie`, `hono/jwt`, `hono/cors`, etc. are package.json `exports` mapped to `src/helper/<name>` or `src/middleware/<name>`.

## Tests / typecheck

- Tests next to source: `src/**/*.test.ts`
- Bench typecheck gate: `npx tsc --noEmit --project tsconfig.build.json` (excludes `*.test.ts`)
