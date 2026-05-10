---
name: <TOPIC>
description: <one-line summary>
tags: [nextjs, <area>]
updated: <YYYY-MM-DD>
anchors:
  - <file>:<symbol>
  - <Kind>:<file>:<symbol>
---

# <TOPIC>

<One paragraph of what this subsystem does in the app and why it exists.>

## Layout

<Where the relevant code lives. Examples:>
- `app/<route>/page.tsx` — server component for `/<route>`
- `app/api/<endpoint>/route.ts` — Route Handler
- `app/<route>/layout.tsx` — segment layout
- `lib/<helper>.ts` — shared helpers
- `middleware.ts` — root-level matcher

## Anchors — `<key file>` (≈<n> lines)

| Symbol | How to locate it |
|---|---|
| `<exportedName>` | `gitnexus_context({name: "<exportedName>", repo: "<repo>"})` |
| `<TypeName>` | `gitnexus_cypher({query: "MATCH (n) WHERE n.name = '<TypeName>' RETURN n.filePath, n.startLine, n.endLine"})` |

Before editing an existing symbol: `gitnexus_impact({target: "<symbol>", repo: "<repo>", direction: "upstream"})`.

## How to add a new <thing>

<Numbered, copy-paste-ready steps. Each step references a real file.>

1. Create `app/<route>/page.tsx` exporting a default `async function Page(...)`. Use `searchParams`/`params` typed as `Promise<...>` (Next.js 15+ async params).
2. If the route needs data fetching, do it inline with `await fetch(...)` (Next.js auto-caches by default; pass `{ cache: 'no-store' }` for dynamic).
3. For client-only behaviour, add a leaf `'use client'` component imported from the page.
4. If state is shared across routes, prefer `cookies()`/`headers()` for read paths and Server Actions (`'use server'`) for write paths.

```tsx
// app/<route>/page.tsx — drop-in template
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const params = await searchParams
  // ...
  return <main>...</main>
}
```

## Conventions

- Server Components by default; opt into client with `'use client'` at the leaf.
- Co-locate route-specific UI under `app/<route>/`; shared UI lives in `components/`.
- Data fetching: server-side with `fetch` or DB client; never expose secrets to client components.
- Forms: prefer Server Actions over API routes for mutations.

## Related

- `<spec/concepts/<related>.md>` — <one-line context>
