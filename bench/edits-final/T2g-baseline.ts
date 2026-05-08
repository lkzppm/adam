// MCP-style tool definitions + executors.
// Tool schemas follow OpenAI's function-calling spec (Groq is wire-compatible).

import { skillCategories, projects, experiences, personalInfo } from '@/data/portfolio'

// ─── Tool schemas (exposed to the LLM) ──────────────────────────────────────

export const TOOL_SCHEMAS = [
  {
    type: 'function',
    function: {
      name: 'compute_fit_score',
      description:
        "Compare a job description (or a list of role requirements) against Lucas's actual skills, projects, and experience. Returns a structured fit assessment with matched/missing skill keywords and a 0-10 score. Call this whenever the visitor mentions a specific role, pastes a JD, asks 'is Lucas a fit for X?', or compares Lucas to a stack.",
      parameters: {
        type: 'object',
        properties: {
          job_description: {
            type: 'string',
            description:
              "The role description or requirements. Can be a full JD or just a list of skills/keywords the visitor mentioned.",
          },
        },
        required: ['job_description'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'fetch_contributions',
      description:
        "Fetch Lucas's recent GitHub activity from github.com/lkzppm: a 30-day commit chart, his last commit (message + repo, forks included), and his latest open and latest merged pull requests across any repo. Use this when the visitor asks what Lucas has been working on lately, his recent commits, his contribution activity, his open-source work, or any time-sensitive 'what's he up to?' question. Do NOT call for static portfolio projects.",
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'schedule_callback',
      description:
        "Capture a visitor's contact info and intent so Lucas can reach back out. Use when the visitor expresses interest in scheduling a call, wants Lucas to contact them, shares a role/opportunity they want to discuss, or asks how to reach Lucas to set something up. Always confirm the email and ask for brief context before calling. Sends an email to Lucas.",
      parameters: {
        type: 'object',
        properties: {
          email: {
            type: 'string',
            description: "The visitor's email address. Must be a valid email.",
          },
          role_context: {
            type: 'string',
            description:
              'Brief context: company name, role/seniority, why they are reaching out. 1-3 sentences.',
          },
        },
        required: ['email', 'role_context'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_projects',
      description:
        "Search Lucas's portfolio projects by keyword. Returns all projects whose title or description matches the query. Use when the visitor asks about a specific type of project, technology area, or wants to find relevant work examples.",
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search term to match against project titles and descriptions.',
          },
        },
        required: ['query'],
      },
    },
  },
] as const

// ─── Tool executors ─────────────────────────────────────────────────────────

export type ToolName = 'compute_fit_score' | 'fetch_contributions' | 'schedule_callback' | 'search_projects'

export interface ToolResultEnvelope {
  ok: boolean
  data?: unknown
  error?: string
}

// ── compute_fit_score ──

const FIT_KEYWORDS = [
  // Languages
  'python', 'java', 'javascript', 'typescript', 'go', 'rust', 'c++', 'c#', 'ruby', 'kotlin', 'swift', 'scala',
  // Frameworks / web
  'react', 'next.js', 'nextjs', 'vue', 'angular', 'svelte', 'node', 'node.js', 'fastapi', 'flask', 'django', 'express', 'spring', 'rails',
  // Data
  'postgresql', 'postgres', 'mysql', 'mongodb', 'redis', 'elasticsearch', 'snowflake', 'bigquery', 'kafka',
  // Cloud / infra
  'docker', 'kubernetes', 'k8s', 'aws', 'gcp', 'azure', 'terraform', 'ansible', 'jenkins', 'github actions', 'ci/cd',
  // AI / ML
  'machine learning', 'ml', 'deep learning', 'llm', 'llms', 'rag', 'agents', 'agent', 'mcp', 'langchain', 'llamaindex',
  'openai', 'anthropic', 'claude', 'gpt', 'gemini', 'mistral', 'pinecone', 'faiss', 'chroma', 'embeddings', 'vector',
  'tensorflow', 'pytorch', 'transformers', 'huggingface', 'hugging face',
  'pandas', 'numpy', 'scikit-learn', 'sklearn', 'spark', 'pyspark', 'mlops', 'llmops',
  // Practices
  'agile', 'scrum', 'tdd', 'microservices', 'rest', 'graphql', 'grpc',
  // OS
  'linux', 'unix',
] as const

interface FitScore {
  score: number
  matched: string[]
  missing: string[]
  total_keywords: number
  evidence: string[]
  summary: string
}

function computeFitScore({ job_description }: { job_description: string }): FitScore {
  const jd = job_description.toLowerCase()

  // Aggregate everything Lucas knows: skills + project tech stacks + experience text
  const lucasKnows = new Set<string>()
  skillCategories.forEach(c => c.skills.forEach(s => lucasKnows.add(s.toLowerCase())))
  projects.forEach(p => p.techStack.forEach(t => lucasKnows.add(t.toLowerCase())))
  const experienceCorpus = experiences.map(e => e.description.toLowerCase()).join(' ')

  // Find which tracked keywords appear in the JD
  const jdMentions: string[] = []
  for (const kw of FIT_KEYWORDS) {
    const escaped = kw.replace(/[.+]/g, '\\$&')
    const re = new RegExp(`\\b${escaped}\\b`, 'i')
    if (re.test(jd)) jdMentions.push(kw)
  }

  // Equivalence groups — match either form
  const EQUIVALENTS: Record<string, string[]> = {
    'k8s': ['kubernetes'],
    'kubernetes': ['k8s'],
    'ml': ['machine learning'],
    'machine learning': ['ml'],
    'llms': ['llm'],
    'llm': ['llms'],
    'agents': ['agent'],
    'agent': ['agents'],
    'nextjs': ['next.js'],
    'next.js': ['nextjs'],
    'node.js': ['node'],
    'node': ['node.js'],
    'sklearn': ['scikit-learn'],
    'scikit-learn': ['sklearn'],
    'huggingface': ['hugging face'],
    'hugging face': ['huggingface'],
  }

  function lucasHas(kw: string): boolean {
    if (lucasKnows.has(kw)) return true
    for (const alias of EQUIVALENTS[kw] ?? []) {
      if (lucasKnows.has(alias)) return true
    }
    if (experienceCorpus.includes(kw)) return true
    return false
  }

  const matched: string[] = []
  const missing: string[] = []
  for (const kw of jdMentions) {
    if (lucasHas(kw)) matched.push(kw)
    else missing.push(kw)
  }

  // Dedupe
  const matchedSet = Array.from(new Set(matched))
  const missingSet = Array.from(new Set(missing))

  const total = jdMentions.length || 1
  const score = Math.round((matchedSet.length / total) * 100) / 10

  // Evidence: which projects / experiences back the matched skills
  const evidence: string[] = []
  for (const skill of matchedSet) {
    for (const p of projects) {
      if (p.techStack.some(t => t.toLowerCase() === skill || (EQUIVALENTS[skill] ?? []).includes(t.toLowerCase()))) {
        evidence.push(`${skill} → ${p.title}`)
      }
    }
  }

  return {
    score,
    matched: matchedSet,
    missing: missingSet,
    total_keywords: total,
    evidence: Array.from(new Set(evidence)).slice(0, 6),
    summary:
      matchedSet.length === 0
        ? 'No direct keyword matches. The role may emphasize a stack outside of Lucas\'s core focus.'
        : `Matched ${matchedSet.length}/${total} JD keywords against Lucas's skills, projects, and experience.`,
  }
}

// ── fetch_contributions ──
//
// GitHub's public REST endpoints don't give us anything close to the real
// contribution counts visible on a profile page (events/public is redacted,
// search/commits misses unlinked emails, compare/A...B over-counts branch
// divergence). The contribution calendar at github.com/users/:u/contributions
// is the actual source of truth GitHub uses for the profile graph, and it's
// served as plain HTML with one <td data-date data-level> per day plus a
// matching <tool-tip> carrying the count. We scrape that.
//
//   • github.com/users/:u/contributions  — daily contribution counts (HTML)
//   • /users/:u/events/public            — recent PushEvents → last commit SHA
//   • /repos/:o/:r/commits/:sha          — last commit's message + author date
//   • /search/issues?q=...is:pr...       — latest open + latest merged PR
//
// Window is fixed at 30 days. All fetches run concurrently and the final
// result is cached for 5 minutes.

interface ContribDay {
  day: string // YYYY-MM-DD (UTC)
  count: number // real contribution count from the GH calendar
}

interface RecentPR {
  title: string
  number: number
  repo: string
  state: string // open | closed
  merged: boolean
  url: string
  at: string
}

interface LastCommit {
  repo: string
  url: string
  message: string
  at: string
  is_fork_or_external: boolean
}

interface ContributionsResult {
  chart: ContribDay[]
  total_contributions: number // total in the 30-day window
  active_days: number
  year_total: number // total in the last 365 days, from GH header
  recent_commits: LastCommit[] // up to 4 most recent unique commits
  pull_requests: RecentPR[]
  fetched_at: string
  source: string
}

let contribCache: { at: number; data: ContributionsResult } | null = null
const CONTRIB_TTL_MS = 5 * 60 * 1000

const GH_HEADERS = { Accept: 'application/vnd.github.v3+json' } as const

async function ghJson<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url, { headers: GH_HEADERS })
    if (!r.ok) return null
    return (await r.json()) as T
  } catch {
    return null
  }
}

interface RawEvent {
  type?: string
  created_at?: string
  repo?: { name?: string }
  payload?: { before?: string; head?: string }
}

interface CommitDetail {
  html_url?: string
  commit?: { message?: string; author?: { date?: string } }
}

interface SearchIssuesResp {
  items?: Array<{
    title?: string
    number?: number
    state?: string
    html_url?: string
    repository_url?: string
    updated_at?: string
    pull_request?: { merged_at?: string | null }
  }>
}

// ── Contribution-graph scraper ────────────────────────────────────────────────
//
// Each day cell in github.com/users/:u/contributions looks roughly like:
//
//   <td ... data-date="2026-04-26"
//          id="contribution-day-component-1-52"
//          data-level="4" ...></td>
//   <tool-tip ... for="contribution-day-component-1-52" ...>
//     28 contributions on April 26th.
//   </tool-tip>
//
// We pair them by component id and parse "N contributions" / "No contributions"
// out of the tooltip text.

interface ScrapedContributions {
  countsByDay: Record<string, number>
  yearTotal: number
}

async function scrapeGithubContributions(handle: string): Promise<ScrapedContributions | null> {
  let html: string
  try {
    const r = await fetch(`https://github.com/users/${handle}/contributions`, {
      headers: { 'User-Agent': 'lppm-portfolio/1.0' },
    })
    if (!r.ok) return null
    html = await r.text()
  } catch {
    return null
  }

  // Map td id → date
  const idToDate = new Map<string, string>()
  const tdRe = /data-date="(\d{4}-\d{2}-\d{2})"\s+id="(contribution-day-component-\d+-\d+)"/g
  let m: RegExpExecArray | null
  while ((m = tdRe.exec(html))) idToDate.set(m[2], m[1])

  // Map td id → count from tooltip text
  const countsByDay: Record<string, number> = {}
  const tipRe =
    /<tool-tip[^>]+\bfor="(contribution-day-component-\d+-\d+)"[^>]*>([^<]*)<\/tool-tip>/g
  while ((m = tipRe.exec(html))) {
    const id = m[1]
    const text = m[2]
    const day = idToDate.get(id)
    if (!day) continue
    if (/^No contributions/i.test(text)) {
      countsByDay[day] = 0
    } else {
      const num = text.match(/^([\d,]+)\s+contribution/)
      countsByDay[day] = num ? parseInt(num[1].replace(/,/g, ''), 10) : 0
    }
  }

  // Year total (e.g. "195 contributions in the last year")
  const yearMatch = html.match(/([\d,]+)\s+contributions in the last year/i)
  const yearTotal = yearMatch ? parseInt(yearMatch[1].replace(/,/g, ''), 10) : 0

  return { countsByDay, yearTotal }
}

function mapSearchPR(
  item: NonNullable<SearchIssuesResp['items']>[number],
  asMerged: boolean,
): RecentPR {
  const repo = item.repository_url
    ? item.repository_url.replace('https://api.github.com/repos/', '')
    : ''
  return {
    title: item.title ?? '',
    number: item.number ?? 0,
    repo,
    state: item.state ?? 'open',
    merged: asMerged,
    url: item.html_url ?? '',
    at: item.updated_at ?? '',
  }
}

async function fetchContributions(): Promise<ContributionsResult> {
  if (contribCache && Date.now() - contribCache.at < CONTRIB_TTL_MS) {
    return contribCache.data
  }

  const handle = personalInfo.githubHandle.replace('github.com/', '')

  // Fan out: contribution graph scrape + events (for last commit SHA) + PR searches
  const [scraped, events, openPRSearch, mergedPRSearch] = await Promise.all([
    scrapeGithubContributions(handle),
    ghJson<RawEvent[]>(`https://api.github.com/users/${handle}/events/public?per_page=30`),
    ghJson<SearchIssuesResp>(
      `https://api.github.com/search/issues?q=author:${handle}+is:pr+is:open&sort=updated&order=desc&per_page=1`,
    ),
    ghJson<SearchIssuesResp>(
      `https://api.github.com/search/issues?q=author:${handle}+is:pr+is:merged&sort=updated&order=desc&per_page=1`,
    ),
  ])

  // 90-day window built from the scraped year (oldest → newest)
  const WINDOW_DAYS = 90
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  const dayBuckets: Record<string, number> = {}
  for (let i = WINDOW_DAYS - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setUTCDate(d.getUTCDate() - i)
    const key = d.toISOString().slice(0, 10)
    dayBuckets[key] = scraped?.countsByDay[key] ?? 0
  }

  const chart: ContribDay[] = Object.keys(dayBuckets)
    .sort()
    .map(day => ({ day, count: dayBuckets[day] }))
  const total_contributions = chart.reduce((s, d) => s + d.count, 0)
  const active_days = chart.filter(d => d.count > 0).length
  const year_total = scraped?.yearTotal ?? 0

  // Recent commits — up to 4 most recent unique PushEvent heads, each enriched
  // with the real commit message via /repos/:o/:r/commits/:sha.
  const pushEvents = (events ?? []).filter(
    (e): e is Required<Pick<RawEvent, 'type' | 'created_at'>> & RawEvent =>
      e.type === 'PushEvent' && !!e.created_at && !!e.repo?.name && !!e.payload?.head,
  )
  const seenSha = new Set<string>()
  const uniquePushes: typeof pushEvents = []
  for (const p of pushEvents) {
    const head = p.payload!.head!
    if (seenSha.has(head)) continue
    seenSha.add(head)
    uniquePushes.push(p)
    if (uniquePushes.length === 4) break
  }
  const commitDetails = await Promise.all(
    uniquePushes.map(p =>
      ghJson<CommitDetail>(`https://api.github.com/repos/${p.repo!.name}/commits/${p.payload!.head}`),
    ),
  )
  const recent_commits: LastCommit[] = uniquePushes.map((p, i) => {
    const repoName = p.repo!.name!
    const head = p.payload!.head!
    const detail = commitDetails[i]
    return {
      repo: repoName,
      url: detail?.html_url ?? `https://github.com/${repoName}/commit/${head}`,
      message: (detail?.commit?.message ?? '').split('\n')[0].slice(0, 140),
      at: detail?.commit?.author?.date ?? p.created_at!,
      is_fork_or_external: !repoName.startsWith(`${handle}/`),
    }
  })

  // PRs: latest merged first, then latest open
  const pull_requests: RecentPR[] = []
  if (mergedPRSearch?.items?.[0]) pull_requests.push(mapSearchPR(mergedPRSearch.items[0], true))
  if (openPRSearch?.items?.[0]) pull_requests.push(mapSearchPR(openPRSearch.items[0], false))

  const result: ContributionsResult = {
    chart,
    total_contributions,
    active_days,
    year_total,
    recent_commits,
    pull_requests,
    fetched_at: new Date().toISOString(),
    source: `github.com/${handle}`,
  }
  contribCache = { at: Date.now(), data: result }
  return result
}

// ── search_projects ──

function searchProjects({ query }: { query: string }) {
  const q = query.toLowerCase()
  return projects.filter(
    p => p.title.toLowerCase().includes(q) || p.description.toLowerCase().includes(q),
  )
}

// ── schedule_callback ──

interface ScheduleResult {
  ok: boolean
  message: string
  captured_email?: string
  error?: string
}

async function scheduleCallback({
  email,
  role_context,
}: {
  email: string
  role_context: string
}): Promise<ScheduleResult> {
  if (!/^[\w.+-]+@[\w-]+\.[\w.-]+$/.test(email.trim())) {
    return { ok: false, message: 'Invalid email format', error: 'invalid_email' }
  }

  const cleanEmail = email.trim()
  const cleanContext = role_context.trim().slice(0, 2000)

  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) {
    return {
      ok: false,
      message: 'Email delivery is not configured. Reach Lucas directly at lucasppmc@gmail.com.',
      error: 'not_configured',
      captured_email: cleanEmail,
    }
  }

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Portfolio AI <onboarding@resend.dev>',
      to: 'lucasppmc@gmail.com',
      reply_to: cleanEmail,
      subject: `[Portfolio AI] Callback request from ${cleanEmail}`,
      text: `Email: ${cleanEmail}\n\nRole / context:\n${cleanContext}\n\n— Captured by the AI assistant on lppm.vercel.app`,
    }),
  })

  if (!resp.ok) {
    return {
      ok: false,
      message: 'Email service rejected the request. Lucas can be reached directly at lucasppmc@gmail.com.',
      error: 'delivery_failed',
      captured_email: cleanEmail,
    }
  }

  return {
    ok: true,
    message: `Got it — forwarded to Lucas (lucasppmc@gmail.com). He typically replies within 24h.`,
    captured_email: cleanEmail,
  }
}

// ─── Dispatcher ─────────────────────────────────────────────────────────────

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResultEnvelope> {
  try {
    switch (name) {
      case 'compute_fit_score': {
        const jd = typeof args.job_description === 'string' ? args.job_description : ''
        if (!jd.trim()) return { ok: false, error: 'job_description is required' }
        return { ok: true, data: computeFitScore({ job_description: jd }) }
      }
      case 'fetch_contributions': {
        const data = await fetchContributions()
        return { ok: true, data }
      }
      case 'schedule_callback': {
        const safeArgs = (args ?? {}) as Record<string, unknown>
        const email = typeof safeArgs.email === 'string' ? safeArgs.email : ''
        const role_context = typeof safeArgs.role_context === 'string' ? safeArgs.role_context : ''
        const data = await scheduleCallback({ email, role_context })
        return { ok: data.ok, data }
      }
      case 'search_projects': {
        const query = typeof args.query === 'string' ? args.query : ''
        if (!query.trim()) return { ok: false, error: 'query is required' }
        return { ok: true, data: searchProjects({ query }) }
      }
      default:
        return { ok: false, error: `Unknown tool: ${name}` }
    }
  } catch (err) {
    console.error(`[tool ${name}]`, err)
    return { ok: false, error: (err as Error).message ?? 'Tool execution failed' }
  }
}
