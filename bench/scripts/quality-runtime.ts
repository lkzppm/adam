/**
 * Runtime quality probe for captured edit outputs.
 *
 * Invoked once per captured `lib/mcp.ts` (and `app/api/chat/route.ts` for T3
 * rename). Imports the file's `executeTool` (or `dispatchTool` after rename)
 * and exercises the per-task tool, asserting that the resulting envelope has
 * the expected shape. Output: a single JSON line so the shell wrapper can
 * aggregate cleanly.
 *
 * Args: <task-id>
 * Reads the file from process.env.MCP_PATH (already swapped into portifolio).
 * Exits 0 on pass, 1 on fail. Always prints JSON.
 */
import { join } from 'node:path'

type Probe = {
  fnName: 'executeTool' | 'dispatchTool'
  toolName: string
  args: Record<string, unknown>
  expect: (env: { ok: boolean; data?: unknown; error?: string; version?: string }) => string | null
}

const PROBES: Record<string, Probe> = {
  T2: {
    fnName: 'executeTool',
    toolName: 'list_projects_by_tech',
    args: { tech: 'TypeScript' },
    expect: (e) => (e.ok && Array.isArray((e.data as { matches?: unknown[] })?.matches ?? e.data) ? null : `expected ok+array, got ${JSON.stringify(e).slice(0, 120)}`),
  },
  T2b: {
    fnName: 'executeTool',
    toolName: 'list_skills_in_category',
    args: { category: 'Backend' },
    expect: (e) => (e.ok && (Array.isArray(e.data) || Array.isArray((e.data as { skills?: unknown[] })?.skills)) ? null : `expected ok+skills array, got ${JSON.stringify(e).slice(0, 120)}`),
  },
  T2c: {
    fnName: 'executeTool',
    toolName: 'count_projects',
    args: {},
    expect: (e) => (e.ok && typeof (e.data as { count?: number })?.count === 'number' ? null : `expected ok+{count}, got ${JSON.stringify(e).slice(0, 120)}`),
  },
  T2d: {
    fnName: 'executeTool',
    toolName: 'list_featured_projects',
    args: {},
    expect: (e) => (e.ok && Array.isArray(e.data) ? null : `expected ok+array, got ${JSON.stringify(e).slice(0, 120)}`),
  },
  T2e: {
    fnName: 'executeTool',
    toolName: 'find_project_by_id',
    args: { id: 'oracly' },
    expect: (e) => (e.ok && (e.data as { id?: string })?.id === 'oracly' ? null : `expected ok+oracly, got ${JSON.stringify(e).slice(0, 120)}`),
  },
  T2f: {
    fnName: 'executeTool',
    toolName: 'list_experiences_at_company',
    args: { company: 'a' }, // permissive — any substring match should hit
    expect: (e) => (e.ok && Array.isArray(e.data) ? null : `expected ok+array, got ${JSON.stringify(e).slice(0, 120)}`),
  },
  T2g: {
    fnName: 'executeTool',
    toolName: 'search_projects',
    args: { query: 'AI' },
    expect: (e) => (e.ok && Array.isArray(e.data) ? null : `expected ok+array, got ${JSON.stringify(e).slice(0, 120)}`),
  },
  T2h: {
    fnName: 'executeTool',
    toolName: 'list_categories',
    args: {},
    expect: (e) => (e.ok && Array.isArray(e.data) && (e.data as string[]).length > 0 ? null : `expected ok+array, got ${JSON.stringify(e).slice(0, 120)}`),
  },
  T2i: {
    fnName: 'executeTool',
    toolName: 'list_techs',
    args: {},
    expect: (e) => {
      if (!e.ok || !Array.isArray(e.data)) return `expected ok+array, got ${JSON.stringify(e).slice(0, 120)}`
      const arr = e.data as string[]
      const sorted = [...arr].sort((a, b) => a.localeCompare(b))
      const isSorted = arr.every((v, i) => v === sorted[i])
      const isUnique = new Set(arr).size === arr.length
      return isSorted && isUnique ? null : `expected sorted+unique, got ${JSON.stringify(arr).slice(0, 120)}`
    },
  },
  T2j: {
    fnName: 'executeTool',
    toolName: 'count_skills_per_category',
    args: {},
    expect: (e) => {
      if (!e.ok || !Array.isArray(e.data)) return `expected ok+array, got ${JSON.stringify(e).slice(0, 120)}`
      const arr = e.data as { category: string; count: number }[]
      return arr.every((r) => typeof r.category === 'string' && typeof r.count === 'number') ? null : `expected [{category, count}], got ${JSON.stringify(arr).slice(0, 120)}`
    },
  },
  T3: {
    // After rename: dispatchTool replaces executeTool.
    fnName: 'dispatchTool',
    toolName: 'compute_fit_score',
    args: { job_description: 'TypeScript backend with FastAPI experience' },
    expect: (e) => (e.ok && (e.data as { score?: number })?.score !== undefined ? null : `expected ok+score, got ${JSON.stringify(e).slice(0, 120)}`),
  },
  T3b: {
    // Add version field — every successful return must include version: '1'.
    fnName: 'executeTool',
    toolName: 'compute_fit_score',
    args: { job_description: 'TypeScript backend' },
    expect: (e) => {
      if (!e.ok) return `expected ok=true, got ${JSON.stringify(e).slice(0, 120)}`
      if (e.version !== '1' && (e.data as { version?: string })?.version !== '1') {
        return `expected version:'1' on envelope, got ${JSON.stringify(e).slice(0, 120)}`
      }
      return null
    },
  },
}

async function main() {
  const id = process.argv[2]
  const mcpPath = process.env.MCP_PATH
  if (!id || !mcpPath) {
    console.log(JSON.stringify({ id, status: 'error', reason: 'missing args' }))
    process.exit(1)
  }
  const probe = PROBES[id]
  if (!probe) {
    console.log(JSON.stringify({ id, status: 'error', reason: 'no probe defined' }))
    process.exit(1)
  }

  let mod: Record<string, unknown>
  try {
    mod = await import(mcpPath)
  } catch (err) {
    console.log(JSON.stringify({ id, status: 'fail', reason: `import: ${(err as Error).message.slice(0, 200)}` }))
    process.exit(1)
  }

  const fn = mod[probe.fnName] as ((name: string, args: Record<string, unknown>) => Promise<unknown>) | undefined
  if (!fn) {
    console.log(JSON.stringify({ id, status: 'fail', reason: `${probe.fnName} not exported` }))
    process.exit(1)
  }

  let envelope: { ok: boolean; data?: unknown; error?: string; version?: string }
  try {
    envelope = (await fn(probe.toolName, probe.args)) as typeof envelope
  } catch (err) {
    console.log(JSON.stringify({ id, status: 'fail', reason: `invoke: ${(err as Error).message.slice(0, 200)}` }))
    process.exit(1)
  }

  const reason = probe.expect(envelope)
  if (reason) {
    console.log(JSON.stringify({ id, status: 'fail', reason }))
    process.exit(1)
  }
  console.log(JSON.stringify({ id, status: 'pass' }))
  process.exit(0)
}

main()
