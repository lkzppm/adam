#!/usr/bin/env node
// Aggregate final benchmark — Orientation + Coding (cost) + Coding (quality).
// Reads:
//   - bench/results/T1*.json          orientation runs (paired baseline + with-adam)
//   - bench/edits-final/T2*-*.json    additive edits (paired)
//   - bench/edits-final/T3*-*.json    graph-favoring edits (paired)
//
// Quality numbers are emitted by bench/scripts/quality.sh (read its REPORT
// from quality.md if present); this aggregator stays cost-only.
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const ROOT = join(here, '..', '..')
const TASKS = JSON.parse(readFileSync(join(here, 'tasks-final.json'), 'utf8'))
const ADDITIVE = TASKS.filter((t) => t.family === 'edit').map((t) => t.id)
const GRAPH = TASKS.filter((t) => t.family === 'graph-edit').map((t) => t.id)
const ORIENT = ['T1', 'T1b', 'T1c', 'T1d', 'T1e', 'T1f', 'T1g', 'T1h', 'T1i', 'T1j']

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
  return {
    turns: data.num_turns ?? 0,
    tokens:
      (u.input_tokens ?? 0) +
      (u.output_tokens ?? 0) +
      (u.cache_read_input_tokens ?? 0) +
      (u.cache_creation_input_tokens ?? 0),
    cost: data.total_cost_usd ?? 0,
  }
}

const fmt = (n) => Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })
const dollars = (n) => `$${Number(n).toFixed(4)}`
const fmtPct = (d) => {
  if (!isFinite(d)) return ''
  const s = d > 0 ? '+' : ''
  return `${s}${(d * 100).toFixed(1)}%`
}
const delta = (b, w) => (!b || !w ? '' : fmtPct((w - b) / b))
const sums = (rows) =>
  rows.reduce(
    (a, r) => ({
      tokens: a.tokens + (r?.tokens ?? 0),
      cost: a.cost + (r?.cost ?? 0),
      turns: a.turns + (r?.turns ?? 0),
      n: a.n + (r ? 1 : 0),
    }),
    { tokens: 0, cost: 0, turns: 0, n: 0 },
  )

function familyBlock(name, ids, dir) {
  const rows = ids.map((id) => ({
    id,
    b: readRun(dir, id, 'baseline'),
    w: readRun(dir, id, 'with-adam'),
  }))
  const sb = sums(rows.map((r) => r.b))
  const sw = sums(rows.map((r) => r.w))
  return { name, rows, sb, sw }
}

const orient = familyBlock('Orientation', ORIENT, RESULTS)
const additive = familyBlock('Additive edits', ADDITIVE, FINAL)
const graph = familyBlock('Graph-favoring edits', GRAPH, FINAL)

console.log('# Final benchmark — Orientation / Coding (cost) / Coding (quality)')
console.log()

// ── Orientation ──
console.log('## Orientation — "Asking about the codebase" (n=10)')
console.log()
console.log('| Task | Baseline cost | Adam cost | Δ cost |')
console.log('|---|---:|---:|---:|')
for (const r of orient.rows) {
  console.log(`| ${r.id} | ${dollars(r.b?.cost)} | ${dollars(r.w?.cost)} | ${delta(r.b?.cost, r.w?.cost)} |`)
}
console.log()
console.log(`**Aggregate:** ${dollars(orient.sb.cost)} → ${dollars(orient.sw.cost)} (${delta(orient.sb.cost, orient.sw.cost)} cost, ${delta(orient.sb.tokens, orient.sw.tokens)} tokens, ${orient.sw.turns - orient.sb.turns} turns).`)
console.log()

// ── Coding cost ──
console.log('## Coding — token cost')
console.log()
console.log('### Additive edits (T2..T2j) — n=10')
console.log()
console.log('| Task | Baseline turns / cost | Adam turns / cost | Δ cost |')
console.log('|---|---:|---:|---:|')
for (const r of additive.rows) {
  console.log(`| ${r.id} | ${r.b?.turns ?? '?'} / ${dollars(r.b?.cost)} | ${r.w?.turns ?? '?'} / ${dollars(r.w?.cost)} | ${delta(r.b?.cost, r.w?.cost)} |`)
}
console.log()
console.log(`**Additive aggregate:** ${dollars(additive.sb.cost)} → ${dollars(additive.sw.cost)} (${delta(additive.sb.cost, additive.sw.cost)} cost, ${delta(additive.sb.tokens, additive.sw.tokens)} tokens, ${additive.sw.turns - additive.sb.turns} turns).`)
console.log()
console.log('### Graph-favoring edits (T3, T3b) — n=2')
console.log()
console.log('| Task | Baseline turns / cost | Adam turns / cost | Δ cost |')
console.log('|---|---:|---:|---:|')
for (const r of graph.rows) {
  console.log(`| ${r.id} | ${r.b?.turns ?? '?'} / ${dollars(r.b?.cost)} | ${r.w?.turns ?? '?'} / ${dollars(r.w?.cost)} | ${delta(r.b?.cost, r.w?.cost)} |`)
}
console.log()
console.log(`**Graph aggregate:** ${dollars(graph.sb.cost)} → ${dollars(graph.sw.cost)} (${delta(graph.sb.cost, graph.sw.cost)} cost).`)
console.log()

// ── Total ──
const tb = { cost: orient.sb.cost + additive.sb.cost + graph.sb.cost, tokens: orient.sb.tokens + additive.sb.tokens + graph.sb.tokens, turns: orient.sb.turns + additive.sb.turns + graph.sb.turns }
const tw = { cost: orient.sw.cost + additive.sw.cost + graph.sw.cost, tokens: orient.sw.tokens + additive.sw.tokens + graph.sw.tokens, turns: orient.sw.turns + additive.sw.turns + graph.sw.turns }
console.log('## Total (all 22 tasks)')
console.log()
console.log('| | Tokens | Cost | Turns |')
console.log('|---|---:|---:|---:|')
console.log(`| baseline | ${fmt(tb.tokens)} | ${dollars(tb.cost)} | ${tb.turns} |`)
console.log(`| **adam** | **${fmt(tw.tokens)}** | **${dollars(tw.cost)}** | **${tw.turns}** |`)
console.log(`| **Δ** | **${delta(tb.tokens, tw.tokens)}** | **${delta(tb.cost, tw.cost)}** | **${tw.turns - tb.turns}** |`)
console.log()
console.log('Coding output quality is reported separately by `bench/scripts/quality.sh` (compile + runtime invocation). See `quality.md`.')
