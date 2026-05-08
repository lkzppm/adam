#!/usr/bin/env node
// Aggregate final benchmark numbers — single-version (adam = specs + GitNexus
// graph + hooks). Compares vs the existing baseline runs in bench/results/.
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const ROOT = join(here, '..', '..')
const TASKS = JSON.parse(readFileSync(join(here, 'tasks-final.json'), 'utf8'))
const ADDITIVE = TASKS.filter((t) => t.family === 'edit').map((t) => t.id)
const GRAPH = TASKS.filter((t) => t.family === 'graph-edit').map((t) => t.id)

const RESULTS = join(ROOT, 'bench', 'results')
const FINAL = join(ROOT, 'bench', 'edits-final')

function readRun(dir, id, cond) {
  const p = join(dir, `${id}-${cond}.json`)
  let data
  try {
    data = JSON.parse(readFileSync(p, 'utf8'))
  } catch {
    return null
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
    cache_read: u.cache_read_input_tokens ?? 0,
    cache_create: u.cache_creation_input_tokens ?? 0,
    output: u.output_tokens ?? 0,
  }
}

const fmt = (n) =>
  n == null ? '' : Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })
const dollars = (n) => (n == null ? '' : `$${Number(n).toFixed(4)}`)
const fmtPct = (d) => {
  if (d == null || !isFinite(d)) return ''
  const sign = d > 0 ? '+' : ''
  return `${sign}${(d * 100).toFixed(1)}%`
}
const delta = (b, w) => (!b || !w ? '' : fmtPct((w - b) / b))
const sums = (rows) =>
  rows.reduce(
    (a, r) => ({
      tokens: a.tokens + (r?.tokens ?? 0),
      cost: a.cost + (r?.cost ?? 0),
      turns: a.turns + (r?.turns ?? 0),
      cache_read: a.cache_read + (r?.cache_read ?? 0),
      cache_create: a.cache_create + (r?.cache_create ?? 0),
      output: a.output + (r?.output ?? 0),
      n: a.n + (r ? 1 : 0),
    }),
    { tokens: 0, cost: 0, turns: 0, cache_read: 0, cache_create: 0, output: 0, n: 0 },
  )

console.log('# Final benchmark — adam (specs + GitNexus graph + hooks) vs vanilla')
console.log()
console.log('## Additive edits (T2..T2j) — n=10, baseline vs adam')
console.log()
console.log('| Task | Baseline tokens / cost | adam tokens / cost | Δ tokens | Δ cost |')
console.log('|---|---:|---:|---:|---:|')
const rowsAdd = []
for (const id of ADDITIVE) {
  const b = readRun(RESULTS, id, 'baseline')
  const w = readRun(FINAL, id, 'with-adam')
  rowsAdd.push({ id, b, w })
  console.log(
    `| ${id} | ${fmt(b?.tokens)} / ${dollars(b?.cost)} | ${fmt(w?.tokens)} / ${dollars(w?.cost)} | ${delta(b?.tokens, w?.tokens)} | ${delta(b?.cost, w?.cost)} |`,
  )
}

const sB = sums(rowsAdd.map((r) => r.b))
const sW = sums(rowsAdd.map((r) => r.w))

console.log()
console.log('### Aggregate (sum across the 10 additive tasks)')
console.log()
console.log('|  | n | Tokens | Cost | Turns | cache_read | cache_create | output |')
console.log('|---|---:|---:|---:|---:|---:|---:|---:|')
console.log(
  `| baseline | ${sB.n} | ${fmt(sB.tokens)} | ${dollars(sB.cost)} | ${sB.turns} | ${fmt(sB.cache_read)} | ${fmt(sB.cache_create)} | ${fmt(sB.output)} |`,
)
console.log(
  `| adam | ${sW.n} | ${fmt(sW.tokens)} | ${dollars(sW.cost)} | ${sW.turns} | ${fmt(sW.cache_read)} | ${fmt(sW.cache_create)} | ${fmt(sW.output)} |`,
)
console.log(
  `| **Δ** | | **${delta(sB.tokens, sW.tokens)}** | **${delta(sB.cost, sW.cost)}** | **${sW.turns - sB.turns}** | **${delta(sB.cache_read, sW.cache_read)}** | **${delta(sB.cache_create, sW.cache_create)}** | **${delta(sB.output, sW.output)}** |`,
)

console.log()
console.log('## Graph-favoring edits (T3, T3b) — paired baseline + adam')
console.log()
console.log('| Task | Baseline turns / cost | adam turns / cost | Δ tokens | Δ cost |')
console.log('|---|---:|---:|---:|---:|')
for (const id of GRAPH) {
  const b = readRun(FINAL, id, 'baseline')
  const w = readRun(FINAL, id, 'with-adam')
  console.log(
    `| ${id} | ${b?.turns ?? '?'} / ${dollars(b?.cost)} | ${w?.turns ?? '?'} / ${dollars(w?.cost)} | ${delta(b?.tokens, w?.tokens)} | ${delta(b?.cost, w?.cost)} |`,
  )
}

// Orientation comparison — the orientation runs aren't re-executed; we reuse
// the existing baseline + with-adam orientation runs from bench/results.
console.log()
console.log('## Orientation (T1..T1j) — n=10 (re-used from `bench/results/`, not re-run)')
console.log()
console.log('Adam (specs only at the time these were captured) vs baseline. Hooks were not active for those runs; the orientation prompts have no backticked symbols, so the hook would inject nothing — re-running with hooks would not change the numbers materially.')
console.log()
const orientationIds = TASKS.length // not in tasks-final.json — reuse hand-known list
const ORIENT = ['T1', 'T1b', 'T1c', 'T1d', 'T1e', 'T1f', 'T1g', 'T1h', 'T1i', 'T1j']
const oB = sums(ORIENT.map((id) => readRun(RESULTS, id, 'baseline')))
const oW = sums(ORIENT.map((id) => readRun(RESULTS, id, 'with-adam')))
console.log('|  | Tokens | Cost | Turns |')
console.log('|---|---:|---:|---:|')
console.log(`| baseline | ${fmt(oB.tokens)} | ${dollars(oB.cost)} | ${oB.turns} |`)
console.log(`| adam | ${fmt(oW.tokens)} | ${dollars(oW.cost)} | ${oW.turns} |`)
console.log(`| **Δ** | **${delta(oB.tokens, oW.tokens)}** | **${delta(oB.cost, oW.cost)}** | **${oW.turns - oB.turns}** |`)
