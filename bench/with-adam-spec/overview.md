---
name: overview
description: Onboarding spec — what the portfolio is, deploy target, repo layout.
tags: [overview, onboarding]
updated: 2026-05-04
---

# Overview

Lucas Pacheco's personal AI-engineer portfolio. Single Next.js 14 App Router page that scrolls through Hero → About → Projects → Skills → Experience → Contact, plus a 3D/text "playground" and a terminal-style AI chat that answers questions about Lucas using RAG + tool calling.

## Repo layout

```
portifolio/
├── app/                          ← Next.js App Router
│   ├── layout.tsx                  # JetBrains Mono font, metadata, OG
│   ├── page.tsx                    # composes layout/* components
│   ├── globals.css                 # Tailwind entry
│   ├── opengraph-image.tsx         # generated OG image
│   └── api/
│       ├── chat/route.ts           # RAG + tool-calling chat (edge runtime)
│       └── send-email/route.ts     # contact form handler
├── components/
│   ├── layout/                   ← page sections
│   │   ├── Hero.tsx
│   │   ├── About.tsx
│   │   ├── Projects.tsx
│   │   ├── Skills.tsx
│   │   ├── Experience.tsx
│   │   ├── Contact.tsx
│   │   └── Navigation.tsx
│   ├── playground/               ← 3D / WebGL demo blocks
│   │   ├── Playground3D.tsx
│   │   ├── PlaygroundLiquids.tsx
│   │   └── PlaygroundText.tsx
│   ├── terminal/                 ← the AI chat UI (CLI-themed)
│   └── ui/                       ← reusable primitives
├── data/
│   └── portfolio.ts              # SINGLE SOURCE OF TRUTH for content
├── hooks/
│   └── useScrollProgress.ts
├── lib/
│   ├── rag.ts                    # TF-IDF retriever over portfolio chunks
│   ├── mcp.ts                    # OpenAI-style function-calling tool schemas
│   ├── ratelimit.ts              # Upstash + in-memory two-tier limiter
│   └── utils.ts
├── types/
├── public/
├── package.json
├── next.config.js
├── tailwind.config.ts
└── tsconfig.json
```

## Stack

- **Next.js 14** (App Router) + **React 18** + **TypeScript 5**
- **Tailwind CSS** + JetBrains Mono
- **Groq** (`llama-3.3-70b-versatile`) for chat — chosen over 8b-instant because 70B is more reliable for function-calling
- **Upstash Redis** (`@upstash/ratelimit` + `@upstash/redis`) for rate-limit persistence; in-memory fallback when env vars are absent
- **Vercel Analytics** + **SpeedInsights** in `app/layout.tsx`

## Deploy

Vercel — `lppm.vercel.app` per the `metadataBase`. `npm run dev` for local; `npm run build` to verify; deploys on push to GitHub.

## State of play

Repo is a working portfolio. The chat API is wired and uses Groq for inference + Upstash for rate-limit. No tests. `data/portfolio.ts` is hand-edited when content changes.
