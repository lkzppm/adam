# Lucas Pacheco — Portfolio

Personal AI-engineer portfolio site. Single-page Next.js 14 App Router app deployed on Vercel. Includes a RAG-powered chat (`/api/chat`) that answers visitor questions about Lucas's projects/experience using a TF-IDF retriever and Groq's `llama-3.3-70b-versatile` for generation, plus tool-calling for fit-scoring against pasted JDs.

## Stack

- **Next.js 14** App Router (`app/`) on **Vercel**
- **TypeScript 5**, **Tailwind CSS** (config in `tailwind.config.ts`)
- **Groq** for LLM inference (chat API), **Upstash Redis** for rate limiting (with in-memory fallback)
- **Three.js** / WebGL playground components
- **JetBrains Mono** as the body font

## Runtime shape

```
app/page.tsx
   │
   ├─ components/layout/{Hero, About, Projects, Skills, Experience, Contact, Navigation}
   ├─ components/playground/{Playground3D, PlaygroundLiquids, PlaygroundText}
   └─ components/terminal/* (the AI chat UI)
            │
            └─ POST /api/chat (route.ts, edge runtime)
                    │
                    ├─ lib/ratelimit.ts (Upstash sliding-window or in-memory)
                    ├─ lib/rag.ts       (TF-IDF over data/portfolio.ts → Top-K chunks)
                    ├─ lib/mcp.ts       (TOOL_SCHEMAS: compute_fit_score, …)
                    └─ Groq llama-3.3-70b-versatile
```

`data/portfolio.ts` is the **single source of truth** for content (personal info, projects, skills, experience, education, certifications). Components and the RAG corpus both read from it.

## Spec index

| Spec | Read when… | Tokens |
|------|-----------|--------|
| [spec/overview.md](./spec/overview.md) | Onboarding — what the site does, deploy target, repo layout | 749 |
| [spec/frontend.md](./spec/frontend.md) | Touching layout/playground/terminal components, fonts, styling conventions | 799 |
| [spec/chat-api.md](./spec/chat-api.md) | Editing `/api/chat`, the RAG retriever, MCP-style tools, or the rate limiter | 1500 |

## Response style
- **Code requests** (implement, fix, refactor, add, change, write): reply with a 1–3 line briefing — what was done and which files changed. No diff summaries, no restating the task, no next-step suggestions unless asked.
- **Explanations / chat questions** ("why", "how does", "explain"): reply normally, verbose as needed.
- Default to brief. Don't waste output tokens.

## Editing code
- Before editing a symbol, locate it via the **GitNexus knowledge graph** — `gitnexus_context({name, repo: "portifolio"})` for callers/callees + file:line, `gitnexus_impact` before risky changes, `gitnexus_query` to trace flows. The graph is the up-to-date anchor source; static spec line numbers drift.
- For files over ~300 lines, read only the slice the graph returns and its direct callers — never read top-to-bottom.
- If the spec contains a recipe for the kind of change being requested, follow it.

Run `/adam:spec-update` after substantive code changes.
