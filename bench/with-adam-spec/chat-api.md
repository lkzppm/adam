---
name: chat-api
description: The /api/chat endpoint — RAG retriever, MCP-style tool calling, Groq inference, two-tier rate limiting, visitor-id cookie.
tags: [api, rag, llm, mcp, ratelimit, groq, edge]
updated: 2026-05-04
---

# Chat API (`POST /api/chat`)

Edge-runtime Next.js route at `app/api/chat/route.ts`. Answers visitor questions about Lucas using:

1. **TF-IDF RAG** over `data/portfolio.ts` (`lib/rag.ts`).
2. **Groq** `llama-3.3-70b-versatile` for inference.
3. **OpenAI-style function calling** via `lib/mcp.ts` — tools include `compute_fit_score`.
4. **Two-tier rate limiter** (`lib/ratelimit.ts`) — Upstash sliding-window with in-memory fallback.

## Pipeline (per request)

```
incoming POST
    │
    ├─ readVisitorCookie  → visitor_id (or generate new, set Set-Cookie)
    ├─ checkChatRateLimit(ip + visitor_id)
    │      → 429 if over short(5/min) or long(30/day)
    ├─ truncate user message to MAX_USER_CHARS = 600
    ├─ truncate history to MAX_HISTORY_TURNS = 8
    ├─ buildContext(query, k=TOP_K=5) from lib/rag.ts
    │      → top-5 relevant chunks from portfolio corpus
    ├─ call Groq with system prompt + history + retrieved context + TOOL_SCHEMAS
    │      → may emit a tool_call
    ├─ executeTool(name, args) if tool_call
    │      → loop: feed result back into Groq
    └─ stream/return assistant message + sources (toClientSource)
```

## Constants (top of `route.ts`)

```ts
const MODEL = 'llama-3.3-70b-versatile'   // 70B picked over 8b-instant for reliable function-calling
const MAX_USER_CHARS = 600
const MAX_HISTORY_TURNS = 8
const TOP_K = 5
const VISITOR_COOKIE = 'visitor_id'
const VISITOR_COOKIE_MAX_AGE = 60 * 60 * 24 * 30  // 30 days
```

If you change `MODEL`, verify function-calling still works — small Groq models occasionally emit malformed tool names (`f fetch_contributions`).

## RAG — `lib/rag.ts`

- TF-IDF cosine similarity (no external embeddings).
- Corpus = chunks built from `personalInfo`, `projects`, `skillCategories`, `experiences`, `education`, `certifications`.
- `Chunk` types: `'about' | 'project' | 'experience' | 'education' | 'skills' | 'cert'`.
- `RetrievedChunk` = `Chunk` + `score`.
- `SourceClient` is the trimmed-down version sent to the client (snippet, not full text).
- `buildContext(query, k)` returns top-k chunks formatted for the system prompt.
- `toClientSource(chunk)` strips full text, keeps id/kind/title/snippet.

When you add new fields to `data/portfolio.ts`, extend the chunk builder in `rag.ts` so the retriever picks them up.

## Tool calling — `lib/mcp.ts`

Tool schemas follow OpenAI's function spec (Groq is wire-compatible). Currently:

- `compute_fit_score(job_description: string)` — compares a JD or skills list against Lucas's actual skills/projects/experience. Returns matched/missing keywords + 0–10 score. Called whenever the visitor mentions a specific role or pastes a JD.
- `fetch_contributions()` — pulls Lucas's recent GitHub activity (commit graph, latest commit, latest open/merged PRs).
- `schedule_callback({ email, role_context })` — captures visitor contact info; sends an email to Lucas.

`executeTool(name, args)` dispatches by name and runs the implementation against `data/portfolio.ts`.

### Anchors — `lib/mcp.ts` (≈540 lines)

This file is large. Get the line numbers from the knowledge graph instead of reading top-to-bottom — the graph stays current with edits.

| Symbol | How to locate it |
|---|---|
| `TOOL_SCHEMAS` array | `gitnexus_context({name: "TOOL_SCHEMAS", repo: "portifolio"})` → file:line range of the export |
| `ToolName` union | `gitnexus_cypher({query: "MATCH (n) WHERE n.name = 'ToolName' RETURN n.file, n.startLine, n.endLine"})` |
| `ToolResultEnvelope` | same pattern, name = `ToolResultEnvelope` |
| Sample executor (`computeFitScore`) | `gitnexus_context({name: "computeFitScore", repo: "portifolio"})` |
| `executeTool` dispatcher | `gitnexus_context({name: "executeTool", repo: "portifolio"})` → callers + line range |

When you need to understand impact before editing an existing tool: `gitnexus_impact({target: "<symbolName>", repo: "portifolio", direction: "upstream"})`. When tracing the chat request flow: `gitnexus_query({query: "chat api request flow", repo: "portifolio"})`.

Read the slices the graph returns, not the whole file. The middle of the file is per-tool implementation logic that you only need to look at if you're modifying an existing tool.

### How to add a new MCP-style tool

1. **Append the schema** to the `TOOL_SCHEMAS` array — copy an existing entry, change `name`, `description`, `parameters`. Required-args go in `parameters.required`.
2. **Extend the `ToolName` union** with `| 'new_tool_name'`.
3. **Add a case to `executeTool`** (the `switch (name)` block). Validate `args`, call your executor, return `{ ok: true, data: ... }` or `{ ok: false, error: '...' }`.
4. **Optionally extract a helper function** above the dispatcher for any non-trivial logic. Keep the function pure; let the dispatcher handle the envelope.

**Data shape rule for `ok: true` returns:** `data` MUST be the **literal value** the prompt asks for — no wrapper object, no echoed args. If the prompt says "returns the projects matching X", `data` is the array of projects, not `{ tech: "...", count: N, projects: [...] }`. If it says "returns `{ count }`", `data` is `{ count: N }` — exactly. Wrapping in metadata makes the consumer parse a layer it didn't ask for. Match the prompt verbatim.

Use `gitnexus_context` on each of the symbols above to get the current line range before editing.

Data is in `data/portfolio.ts`: `personalInfo`, `projects` (`{ id, title, description, techStack, github, image, featured }`), `skillCategories` (`{ title, skills }`), `experiences`. Use the actual field names — `techStack` not `tags`.

## Rate limit — `lib/ratelimit.ts`

Two tiers, both keyed by `${ip}:${visitorId}`:

- **short**: 5 messages per minute → blocks burst spam.
- **long**: 30 messages per day → blocks sustained abuse.

Implementation:

- If `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` env vars are set, both tiers use `@upstash/ratelimit`'s sliding-window — globally consistent across Vercel edge regions, persistent across deploys.
- Otherwise, a per-instance in-memory limiter — works for dev and pre-Upstash deploys but doesn't share state.

Returns `{ ok, remaining, retryAfterMs }`.

## Visitor cookie

The `visitor_id` cookie is `HttpOnly; SameSite=Lax; Secure; Max-Age=30 days; Path=/`. Generated on first request (UUID), echoed back via `Set-Cookie`. Used in rate-limit keys so visitors behind shared NATs (offices, mobile carriers) aren't throttled collectively.

## Deploying

Set in Vercel project env:

- `GROQ_API_KEY` — required.
- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` — recommended for production rate-limit persistence. Without them you fall back to in-memory.

## Common edits

- **New tool**: extend `TOOL_SCHEMAS` and `executeTool`. Test locally via the terminal UI.
- **Bigger context window**: bump `TOP_K` or `MAX_USER_CHARS`. Watch token use.
- **Different model**: change `MODEL`. Re-verify tool calling.
- **Tune rate limits**: thresholds are at the top of `ratelimit.ts`.
