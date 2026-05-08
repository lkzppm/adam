import { NextResponse } from 'next/server'
import { personalInfo } from '@/data/portfolio'
import { buildContext, toClientSource } from '@/lib/rag'
import { TOOL_SCHEMAS, dispatchTool } from '@/lib/mcp'
import { checkChatRateLimit } from '@/lib/ratelimit'

export const runtime = 'edge'

// 70B is more reliable for function calling than 8b-instant, which sometimes
// emits malformed tool names (e.g. "f fetch_contributions"). Still fast on
// Groq's hardware and on the free tier.
const MODEL = 'llama-3.3-70b-versatile'
const MAX_USER_CHARS = 600
const MAX_HISTORY_TURNS = 8
const TOP_K = 5

const VISITOR_COOKIE = 'visitor_id'
const VISITOR_COOKIE_MAX_AGE = 60 * 60 * 24 * 30 // 30 days

function readVisitorCookie(req: Request): string | null {
  const header = req.headers.get('cookie') ?? ''
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=')
    if (name === VISITOR_COOKIE) return decodeURIComponent(rest.join('='))
  }
  return null
}

function buildSetCookie(value: string): string {
  return [
    `${VISITOR_COOKIE}=${value}`,
    'Path=/',
    `Max-Age=${VISITOR_COOKIE_MAX_AGE}`,
    'HttpOnly',
    'SameSite=Lax',
    'Secure',
  ].join('; ')
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

function buildSystemPrompt(retrievedText: string): string {
  return `You are an AI guide on Lucas Pacheco's portfolio website. Visitors are usually recruiters, hiring managers, or fellow engineers asking about Lucas.

Rules:
- Answer ONLY from the retrieved context below or from tool results. If something isn't there, say: "I don't have that info — email Lucas at ${personalInfo.email} or check ${personalInfo.linkedinHandle}."
- Be concise: 2–4 sentences max. Plain text, no markdown headers.
- Speak about Lucas in third person ("Lucas built...", not "I built...").
- Never invent metrics, dates, employers, or technologies.
- If asked about salary, availability dates, or anything sensitive (other than capturing a callback), defer to email.

Tool use:
- You have three tools: compute_fit_score, fetch_contributions, schedule_callback.
- Call compute_fit_score whenever the user pastes/describes a job and asks about fit, or compares Lucas to a stack.
- Call fetch_contributions when the user asks about Lucas's recent GitHub activity, latest commits/PRs, contribution history, or what he's been working on lately.
- Call schedule_callback when the user wants Lucas to contact them — but ONLY after they have provided both an email AND a brief context. If either is missing, ask them in plain text first instead of calling the tool.
- After a tool returns, write a 1-2 sentence interpretation. Do not repeat the structured fields verbatim — the UI already renders them.

RETRIEVED CONTEXT (top ${TOP_K} chunks for this query):
${retrievedText}`
}

interface GroqToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

interface GroqMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: GroqToolCall[]
  tool_call_id?: string
}

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

// Recover from Groq's `tool_use_failed` validation error. Llama models
// occasionally emit a tool call with a malformed name (e.g. "f fetch_contributions")
// or stray whitespace. Groq rejects with 400 + the raw `failed_generation` string.
// We parse it out, normalize the name against our schema, and continue.
function recoverToolCallFromError(rawErrorBody: string): GroqToolCall | null {
  let parsed: { error?: { code?: string; failed_generation?: string } }
  try {
    parsed = JSON.parse(rawErrorBody)
  } catch {
    return null
  }
  if (parsed.error?.code !== 'tool_use_failed') return null
  const gen = parsed.error.failed_generation
  if (!gen) return null

  const m = gen.match(/<function=([^>]+)>([\s\S]*?)<\/function>/)
  if (!m) return null

  const rawName = m[1].trim()
  const argsStr = (m[2] ?? '').trim() || '{}'

  const validNames = TOOL_SCHEMAS.map(t => t.function.name)
  // Try exact, then suffix match (handles "f fetch_x" → "fetch_x"),
  // then word-stripping match (drop any leading single token + space).
  const matched =
    validNames.find(n => n === rawName) ??
    validNames.find(n => rawName.endsWith(n)) ??
    validNames.find(n => rawName.replace(/^\S+\s+/, '') === n) ??
    null

  if (!matched) return null

  return {
    id: `recovered_${Date.now()}`,
    type: 'function',
    function: { name: matched, arguments: argsStr },
  }
}

export async function POST(req: Request) {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Chat is not configured. Set GROQ_API_KEY.' },
      { status: 503 },
    )
  }

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'

  // Per-visitor identity: existing cookie or a freshly minted UUID. Combined
  // with IP this avoids over-throttling visitors behind shared NATs while
  // still limiting individual abuse.
  let visitorId = readVisitorCookie(req)
  let mintedVisitorId = false
  if (!visitorId) {
    visitorId = crypto.randomUUID()
    mintedVisitorId = true
  }

  const decision = await checkChatRateLimit(`${ip}:${visitorId}`)
  if (!decision.ok) {
    const retryAfterSec = Math.max(1, Math.ceil(decision.retryAfterMs / 1000))
    const headers: Record<string, string> = {
      'Retry-After': String(retryAfterSec),
      'X-RateLimit-Limit': String(decision.limit),
      'X-RateLimit-Remaining': '0',
      'X-RateLimit-Reset': String(decision.reset),
    }
    if (mintedVisitorId) headers['Set-Cookie'] = buildSetCookie(visitorId)
    return NextResponse.json(
      {
        error: 'Rate limit reached.',
        retryAfter: retryAfterSec,
        limit: decision.limit,
        remaining: 0,
        reset: decision.reset,
      },
      { status: 429, headers },
    )
  }

  let body: { messages?: ChatMessage[] }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 })
  }

  const incoming = Array.isArray(body.messages) ? body.messages : []
  const messages = incoming
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-MAX_HISTORY_TURNS)
    .map(m => ({ role: m.role, content: m.content.slice(0, MAX_USER_CHARS) }))

  if (messages.length === 0 || messages[messages.length - 1].role !== 'user') {
    return NextResponse.json({ error: 'Last message must be from user.' }, { status: 400 })
  }

  // ─── Retrieval ──────────────────────────────────────────────────────────
  const userQuery = messages[messages.length - 1].content
  const retrieved = buildContext(userQuery, TOP_K)
  const retrievedText = retrieved
    .map(c => `[${c.kind}] ${c.title}\n${c.text}`)
    .join('\n\n')
  const sources = retrieved.map(c => toClientSource(c))

  // ─── First Groq pass: detect tool calls (non-streaming) ────────────────
  const initialMessages: GroqMessage[] = [
    { role: 'system', content: buildSystemPrompt(retrievedText) },
    ...messages.map(m => ({ role: m.role, content: m.content }) as GroqMessage),
  ]

  const firstResp = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: initialMessages,
      tools: TOOL_SCHEMAS,
      tool_choice: 'auto',
      temperature: 0.4,
      max_tokens: 400,
      stream: false,
    }),
  })

  let choice: GroqMessage | undefined
  let toolCalls: GroqToolCall[] = []

  if (firstResp.ok) {
    const firstData: {
      choices?: Array<{ message?: GroqMessage; finish_reason?: string }>
    } = await firstResp.json()
    choice = firstData.choices?.[0]?.message
    toolCalls = choice?.tool_calls ?? []
  } else {
    const text = await firstResp.text().catch(() => '')
    const recovered = recoverToolCallFromError(text)
    if (recovered) {
      console.warn('[Groq first-pass recovered]', recovered.function.name)
      toolCalls = [recovered]
    } else {
      console.error('[Groq first-pass error]', firstResp.status, text)
      return NextResponse.json({ error: 'Chat backend error.' }, { status: 502 })
    }
  }

  // ─── Tool execution + second Groq pass (if any tools were called) ──────
  type ToolEvent = {
    type: 'tool'
    name: string
    args: Record<string, unknown>
    result: { ok: boolean; data?: unknown; error?: string }
  }
  const toolEvents: ToolEvent[] = []
  let secondStreamBody: ReadableStream<Uint8Array> | null = null
  let directText: string | null = null

  if (toolCalls.length > 0) {
    const toolMessages: GroqMessage[] = []

    for (const tc of toolCalls) {
      let parsedArgs: Record<string, unknown> = {}
      try {
        const raw = JSON.parse(tc.function.arguments) as unknown
        if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
          parsedArgs = raw as Record<string, unknown>
        }
      } catch {
        // bad args from the model — treat as empty
      }

      const result = await dispatchTool(tc.function.name, parsedArgs)

      toolEvents.push({
        type: 'tool',
        name: tc.function.name,
        args: parsedArgs,
        result,
      })

      toolMessages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: JSON.stringify(result),
      })
    }

    // Second pass: streaming, with tool outputs in the conversation
    const secondMessages: GroqMessage[] = [
      ...initialMessages,
      {
        role: 'assistant',
        content: choice?.content ?? '',
        tool_calls: toolCalls,
      },
      ...toolMessages,
    ]

    const secondResp = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: secondMessages,
        temperature: 0.4,
        max_tokens: 350,
        stream: true,
      }),
    })

    if (!secondResp.ok || !secondResp.body) {
      const text = await secondResp.text().catch(() => '')
      console.error('[Groq second-pass error]', secondResp.status, text)
      directText =
        'I called a tool but had trouble interpreting the result. The result is shown above.'
    } else {
      secondStreamBody = secondResp.body
    }
  } else {
    directText = choice?.content ?? ''
  }

  // ─── Build the response stream ─────────────────────────────────────────
  // Wire format:
  //   {"type":"sources","data":[...]}\x00
  //   {"type":"tool", ...}\x00          (zero or more)
  //   {"type":"text"}\x00                (signals end of envelopes)
  //   <streamed plain-text bytes follow>
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder()

      controller.enqueue(enc.encode(JSON.stringify({ type: 'sources', data: sources }) + '\x00'))
      for (const ev of toolEvents) {
        controller.enqueue(enc.encode(JSON.stringify(ev) + '\x00'))
      }
      controller.enqueue(enc.encode(JSON.stringify({ type: 'text' }) + '\x00'))

      if (directText !== null) {
        if (directText.length > 0) controller.enqueue(enc.encode(directText))
        controller.close()
        return
      }

      if (secondStreamBody !== null) {
        const reader = secondStreamBody.getReader()
        const dec = new TextDecoder()
        let buf = ''
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            buf += dec.decode(value, { stream: true })

            const lines = buf.split('\n')
            buf = lines.pop() ?? ''

            for (const raw of lines) {
              const line = raw.trim()
              if (!line.startsWith('data:')) continue
              const data = line.slice(5).trim()
              if (data === '[DONE]') {
                controller.close()
                return
              }
              try {
                const json = JSON.parse(data)
                const delta: string | undefined = json.choices?.[0]?.delta?.content
                if (delta) controller.enqueue(enc.encode(delta))
              } catch {
                /* skip malformed chunk */
              }
            }
          }
        } catch (err) {
          console.error('[stream pipe error]', err)
        } finally {
          controller.close()
        }
      } else {
        controller.close()
      }
    },
  })

  const responseHeaders: Record<string, string> = {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-RateLimit-Remaining': String(decision.remaining),
  }
  if (mintedVisitorId) responseHeaders['Set-Cookie'] = buildSetCookie(visitorId)

  return new Response(stream, { headers: responseHeaders })
}
