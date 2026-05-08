#!/usr/bin/env node
// Aggregate bench/results/*.json into per-run, per-family, and aggregate stats.
// Usage: node bench/scripts/aggregate.mjs

import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const ROOT = join(here, '..', '..')
const RESULTS = join(ROOT, 'bench', 'results')
const TASKS = JSON.parse(readFileSync(join(here, 'tasks.json'), 'utf8'))

function readRun(id, cond) {
  const p = join(RESULTS, `${id}-${cond}.json`)
  let raw
  try {
    raw = readFileSync(p, 'utf8')
  } catch {
    return null
  }
  let data
  try {
    data = JSON.parse(raw)
  } catch {
    return { error: 'bad-json' }
  }
  const u = data.usage ?? {}
  const tokens =
    (u.input_tokens ?? 0) +
    (u.output_tokens ?? 0) +
    (u.cache_read_input_tokens ?? 0) +
    (u.cache_creation_input_tokens ?? 0)
  return {
    turns: data.num_turns ?? null,
    tokens,
    cost: data.total_cost_usd ?? null,
    duration_ms: data.duration_ms ?? null,
    cache_read: u.cache_read_input_tokens ?? 0,
    cache_create: u.cache_creation_input_tokens ?? 0,
    output: u.output_tokens ?? 0,
    input: u.input_tokens ?? 0,
  }
}

function fmtPct(d) {
  if (d == null || !isFinite(d)) return ''
  const sign = d > 0 ? '+' : ''
  return `${sign}${(d * 100).toFixed(1)}%`
}
function fmtDelta(b, w) {
  if (!b || !w) return ''
  return fmtPct((w - b) / b)
}
const f = (n, d = 0) =>
  n == null
    ? ''
    : Number(n).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d })
const dollars = (n) => (n == null ? '' : `$${Number(n).toFixed(4)}`)

const runs = []
for (const t of TASKS) {
  const b = readRun(t.id, 'baseline')
  const w = readRun(t.id, 'with-adam')
  runs.push({ ...t, baseline: b, withAdam: w })
}

// Per-run table
const perRun = ['| Run | Cond | Turns | Tokens | Cost | Δ tokens | Δ cost |', '|---|---|---:|---:|---:|---:|---:|']
let baseTotals = { tokens: 0, cost: 0, turns: 0, n: 0 }
let withTotals = { tokens: 0, cost: 0, turns: 0, n: 0 }
const familyTotals = {}
for (const r of runs) {
  const b = r.baseline,
    w = r.withAdam
  if (b && !b.error) {
    baseTotals.tokens += b.tokens
    baseTotals.cost += b.cost
    baseTotals.turns += b.turns ?? 0
    baseTotals.n++
    familyTotals[r.family] ??= {
      base: { tokens: 0, cost: 0, turns: 0, n: 0 },
      with: { tokens: 0, cost: 0, turns: 0, n: 0 },
    }
    familyTotals[r.family].base.tokens += b.tokens
    familyTotals[r.family].base.cost += b.cost
    familyTotals[r.family].base.turns += b.turns ?? 0
    familyTotals[r.family].base.n++
  }
  if (w && !w.error) {
    withTotals.tokens += w.tokens
    withTotals.cost += w.cost
    withTotals.turns += w.turns ?? 0
    withTotals.n++
    familyTotals[r.family] ??= {
      base: { tokens: 0, cost: 0, turns: 0, n: 0 },
      with: { tokens: 0, cost: 0, turns: 0, n: 0 },
    }
    familyTotals[r.family].with.tokens += w.tokens
    familyTotals[r.family].with.cost += w.cost
    familyTotals[r.family].with.turns += w.turns ?? 0
    familyTotals[r.family].with.n++
  }
  perRun.push(
    `| ${r.id} | baseline | ${b?.turns ?? '—'} | ${f(b?.tokens)} | ${dollars(b?.cost)} | | |`,
  )
  perRun.push(
    `| | with-adam | ${w?.turns ?? '—'} | ${f(w?.tokens)} | ${dollars(w?.cost)} | ${fmtDelta(b?.tokens, w?.tokens)} | ${fmtDelta(b?.cost, w?.cost)} |`,
  )
}

// Per-family averages
const perFamily = ['| Family | Baseline avg | With-adam avg | Δ tokens | Δ cost |', '|---|---:|---:|---:|---:|']
for (const [fam, t] of Object.entries(familyTotals)) {
  const bAvgT = t.base.tokens / t.base.n
  const bAvgC = t.base.cost / t.base.n
  const wAvgT = t.with.tokens / t.with.n
  const wAvgC = t.with.cost / t.with.n
  perFamily.push(
    `| ${fam} (n=${t.base.n}) | ${f(bAvgT)} t / ${dollars(bAvgC)} | ${f(wAvgT)} t / ${dollars(wAvgC)} | **${fmtDelta(bAvgT, wAvgT)}** | **${fmtDelta(bAvgC, wAvgC)}** |`,
  )
}

// Aggregate
const aggRows = [
  '|  | Tokens | Cost | Turns |',
  '|---|---:|---:|---:|',
  `| Baseline (${baseTotals.n} runs) | ${f(baseTotals.tokens)} | ${dollars(baseTotals.cost)} | ${baseTotals.turns} |`,
  `| With-adam (${withTotals.n} runs) | ${f(withTotals.tokens)} | ${dollars(withTotals.cost)} | ${withTotals.turns} |`,
  `| **Δ** | **${fmtDelta(baseTotals.tokens, withTotals.tokens)}** | **${fmtDelta(baseTotals.cost, withTotals.cost)}** | **${withTotals.turns - baseTotals.turns}** |`,
]

// Cache mix breakdown — for the "why cost beats tokens" insight
const cacheMix = ['| Cond | cache_read | cache_create | input | output |', '|---|---:|---:|---:|---:|']
const sumCache = (rows, key) => rows.reduce((a, r) => a + (r?.[key] ?? 0), 0)
const baseRows = runs.map((r) => r.baseline).filter((x) => x && !x.error)
const withRows = runs.map((r) => r.withAdam).filter((x) => x && !x.error)
cacheMix.push(
  `| baseline | ${f(sumCache(baseRows, 'cache_read'))} | ${f(sumCache(baseRows, 'cache_create'))} | ${f(sumCache(baseRows, 'input'))} | ${f(sumCache(baseRows, 'output'))} |`,
)
cacheMix.push(
  `| with-adam | ${f(sumCache(withRows, 'cache_read'))} | ${f(sumCache(withRows, 'cache_create'))} | ${f(sumCache(withRows, 'input'))} | ${f(sumCache(withRows, 'output'))} |`,
)

const out = [
  '# Per-run',
  '',
  perRun.join('\n'),
  '',
  '# Per-family averages',
  '',
  perFamily.join('\n'),
  '',
  '# Aggregate',
  '',
  aggRows.join('\n'),
  '',
  '# Cache mix totals',
  '',
  cacheMix.join('\n'),
  '',
].join('\n')

writeFileSync(join(here, 'summary.md'), out)
console.log(out)

// Also dump the raw JSON for downstream use
writeFileSync(
  join(here, 'summary.json'),
  JSON.stringify(
    {
      runs,
      familyTotals,
      baseTotals,
      withTotals,
    },
    null,
    2,
  ),
)
