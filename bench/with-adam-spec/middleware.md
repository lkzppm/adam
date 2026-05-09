# Adding a middleware, helper module, or Context method

Use this recipe when adding **new functionality** that integrates with Hono's request lifecycle.

You should NOT need to read any existing middleware/helper file — the templates below are complete and runnable. Read this once, then write the new file directly.

## Built-in middleware (used as `app.use(myMiddleware())`)

**Where:** new directory `src/middleware/<kebab-name>/index.ts`.

**Drop-in template** (copy and adapt — change `myMiddleware`, `Options`, and the body):

```ts
import type { MiddlewareHandler } from '../../types'
import { HTTPException } from '../../http-exception'

type Options = {
  // user-facing options (optional or required)
}

export const myMiddleware = (options?: Options): MiddlewareHandler => {
  // validate / normalize options once at construction time
  return async (c, next) => {
    // pre-handler work: read c.req.*, set c.set('key', value), throw HTTPException for client errors
    await next()
    // post-handler work: mutate c.res headers via `c.res.headers.set(...)`
  }
}
```

**Key types/imports:**
- `MiddlewareHandler` from `'../../types'` — the return type. Don't widen to `Handler`.
- `HTTPException` from `'../../http-exception'` — for client-facing errors. `throw new HTTPException(status, { message: '...' })`.
- `c` is `Context`, `next` is `Next`. The closure captures `options`.
- For per-request state: `c.set('myKey', value)` / consumers read `c.get('myKey')`. Don't mutate the request itself.

**Don't:**
- Add to `package.json` `exports`.
- Add a test file.
- Update `src/index.ts` or `src/middleware.ts`.
- Construct `new Response()` directly inside the middleware — leave response shaping to `next()` or the handler.

## Helper module (used as `import { x } from 'hono/<name>'`)

**Where:** new directory `src/helper/<kebab-name>/index.ts`.

**Drop-in template:**

```ts
import type { Context } from '../../context'

export const myHelper = (c: Context): ReturnType => {
  // read from c.req / c.var, return a value
  // do NOT write to c.res from helpers
}
```

**Notes:**
- Read-only on `Context`. If your helper needs to send a response, it should be a method on Context, not a helper.
- One concept per file. Two unrelated functions = two helpers.

## Method on Context

**Where:** add to the `Context` class body in `src/context.ts`, near other response-shaping methods (`json`, `text`, `html`, `redirect`).

**Drop-in template:**

```ts
// inside class Context
myMethod(arg: ArgType): Response {
  // route through existing infrastructure to preserve header merging
  return this.body(JSON.stringify(payload), status, { 'Content-Type': 'application/json' })
  // OR: return this.json(payload, status)
  // OR: return this.newResponse(body, status, headers)
}
```

**Notes:**
- Mirror the closest existing method (`json`, `text`, `html`, `redirect`) for shape.
- Do NOT construct `new Response(...)` directly — that bypasses Hono's header merging.
- Routes that exist: `this.body()`, `this.json()`, `this.html()`, `this.text()`, `this.newResponse()`, `this.redirect()`.

## Verification

```
npx tsc --noEmit --project tsconfig.build.json
```

Tests are excluded.

## Common pitfalls

- **Don't add a `package.json` `exports` mapping.** The bench gate doesn't resolve subpath exports.
- **Don't write a test file** unless the prompt explicitly asks. The gate is tsc-only.
- **Don't update `src/index.ts` or `src/middleware.ts`.** Pre-bundled re-exports — risk breaking the build excludes.
- **Don't import from `dist/`.** Always import from sibling `src/` paths.
