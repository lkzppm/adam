---
name: frontend
description: Component organization, layout/playground/terminal split, fonts, styling conventions, scroll behavior.
tags: [frontend, components, react, tailwind]
updated: 2026-05-04
---

# Frontend

## Three component buckets

| Folder | Purpose | Examples |
|--------|---------|----------|
| `components/layout/` | **Page sections** — one per scroll-region of the single page. Each renders a section of the portfolio. | `Hero`, `About`, `Projects`, `Skills`, `Experience`, `Contact`, `Navigation` |
| `components/playground/` | **WebGL / 3D demos** — embedded interactive blocks. Heavy, lazy-load if extending. | `Playground3D`, `PlaygroundLiquids`, `PlaygroundText` |
| `components/terminal/` | **The AI chat UI** — CLI-themed, talks to `/api/chat`. | terminal block, message list, input |
| `components/ui/` | **Reusable primitives** — no business logic. Imported anywhere. | small atoms (buttons, badges, icons) |

Rule of thumb: a new component goes in `ui/` only if it has zero business semantics. Layout sections go in `layout/`. Anything that talks to the chat API or holds chat state goes in `terminal/`.

## Page composition — `app/page.tsx`

`app/page.tsx` composes the layout sections in scroll order. Section IDs (`hero`, `about`, `projects`, `skills`, `experience`, `contact`) are used by `Navigation.tsx` for scroll-spy + smooth scroll.

`app/layout.tsx` does the wrapper job: loads JetBrains Mono via `next/font/google` and exposes it as `--font-mono`, sets metadata + OG, and mounts `<Analytics>` and `<SpeedInsights>` from `@vercel/*`.

## Content source — `data/portfolio.ts`

**All editable content lives here.** Components import named exports (`personalInfo`, `projects`, `skillCategories`, `experiences`, `education`, `certifications`) and never hardcode strings. The same exports are also the corpus for `lib/rag.ts` — so updating `data/portfolio.ts` simultaneously updates the visible site AND what the chat knows.

When adding a new project or skill: edit `data/portfolio.ts`, that's it. No component change needed unless a new field is introduced.

## Styling

- **Tailwind** via `tailwind.config.ts` (classic Tailwind 3 config, not v4 inline).
- Body font: JetBrains Mono everywhere. `--font-mono` CSS variable.
- Theme tokens (colors, spacing) live in the Tailwind config.
- Use `clsx` for conditional classes.

## Scroll behavior

`hooks/useScrollProgress.ts` is the single shared scroll hook. Returns scroll progress in `[0, 1]` for the document. Used for fade/transform effects in the layout sections. Don't add a second scroll observer — extend this one.

## Playground performance

The `playground/*` blocks use Three.js / WebGL. They're heavier than the rest of the page. If the portfolio grows, consider `dynamic(() => import('@/components/playground/Playground3D'), { ssr: false })` to keep them out of the initial bundle. For now they're loaded eagerly because the page is short.

## Adding a new section

1. Create `components/layout/<Name>.tsx` with a top-level `<section id="<lowercase>">` wrapper.
2. Import and place it in `app/page.tsx` between existing sections.
3. Add a corresponding entry to the `Navigation.tsx` scroll-spy list.
4. Pull any text from `data/portfolio.ts` (extend the data file with a new export if needed).
