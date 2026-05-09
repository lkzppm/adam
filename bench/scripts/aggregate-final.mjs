#!/usr/bin/env node
// Hono benchmark aggregator — 30 tasks across 3 families (Orientation /
// Additive coding / Multi-coding). Reads paired baseline + with-adam JSON
// outputs from bench/results-hono/ and emits a markdown report.
//
// Quality (tsc pass/fail per coding task) is also folded in here.

import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const ROOT = join(here, '..', '..')
const TASKS = JSON.parse(readFileSync(join(here, 'tasks-final.json'), 'utf8'))
const RESULTS = join(ROOT, 'bench', 'results-hono')

const FAMILIES = ['orient', 'additive', 'multi']
const LABELS = { orient: 'Orientation', additive: 'Additive coding', multi: 'Multi-coding (refactor)' }
const LEGENDS = {
  orient: 'Asking the model to explain or locate code',
  additive: 'Adding a single utility helper to one file',
  multi: 'Cross-file refactor (rename / signature change)',
}

function readRun(id, cond) {
  const p = join(RESULTS, `${id}-${cond}.json`)
  if (!existsSync(p)) return null
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

function readTsc(id, cond) {
  const p = join(RESULTS, `${id}-${cond}.tsc.txt`)
  if (!existsSync(p)) return null
  const txt = readFileSync(p, 'utf8')
  const errors = (txt.match(/error TS\d+/g) || []).length
  return { pass: errors === 0, errors }
}

const fmt = (n) => Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })
const dollars = (n) => `$${Number(n ?? 0).toFixed(4)}`
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

function familyBlock(family) {
  const ids = TASKS.filter((t) => t.family === family).map((t) => t.id)
  const rows = ids.map((id) => ({
    id,
    topic: TASKS.find((t) => t.id === id)?.topic ?? '',
    b: readRun(id, 'baseline'),
    w: readRun(id, 'with-adam'),
    bTsc: readTsc(id, 'baseline'),
    wTsc: readTsc(id, 'with-adam'),
  }))
  return { family, rows, sb: sums(rows.map((r) => r.b)), sw: sums(rows.map((r) => r.w)) }
}

const blocks = FAMILIES.map(familyBlock)

console.log('# Hono benchmark — Orientation / Additive coding / Multi-coding (refactor)')
console.log()
console.log('All paired runs: same prompt to baseline (no spec, no graph) vs adam (CLAUDE.md + spec/ + gitnexus MCP).')
console.log()

for (const block of blocks) {
  const { family, rows, sb, sw } = block
  console.log(`## ${LABELS[family]} (n=${rows.length})`)
  console.log()
  console.log(`*${LEGENDS[family]}*`)
  console.log()
  if (family === 'orient') {
    console.log('| Task | Topic | Baseline cost | Adam cost | Δ cost |')
    console.log('|---|---|---:|---:|---:|')
    for (const r of rows) {
      console.log(`| ${r.id} | ${r.topic} | ${dollars(r.b?.cost)} | ${dollars(r.w?.cost)} | ${delta(r.b?.cost, r.w?.cost)} |`)
    }
  } else {
    console.log('| Task | Topic | Baseline turns / cost / tsc | Adam turns / cost / tsc | Δ cost |')
    console.log('|---|---|---:|---:|---:|')
    for (const r of rows) {
      const bTsc = r.bTsc ? (r.bTsc.pass ? '✓' : `✗(${r.bTsc.errors})`) : '–'
      const wTsc = r.wTsc ? (r.wTsc.pass ? '✓' : `✗(${r.wTsc.errors})`) : '–'
      console.log(
        `| ${r.id} | ${r.topic} | ${r.b?.turns ?? '?'} / ${dollars(r.b?.cost)} / ${bTsc} | ${r.w?.turns ?? '?'} / ${dollars(r.w?.cost)} / ${wTsc} | ${delta(r.b?.cost, r.w?.cost)} |`,
      )
    }
  }
  console.log()
  console.log(
    `**${LABELS[family]} aggregate:** ${dollars(sb.cost)} → ${dollars(sw.cost)} (${delta(sb.cost, sw.cost)} cost, ${delta(sb.tokens, sw.tokens)} tokens, ${sw.turns - sb.turns} turns).`,
  )
  if (family !== 'orient') {
    const bPass = rows.filter((r) => r.bTsc?.pass).length
    const wPass = rows.filter((r) => r.wTsc?.pass).length
    console.log(`Quality: baseline tsc-pass ${bPass}/${rows.length}, adam tsc-pass ${wPass}/${rows.length}.`)
  }
  console.log()
}

const tb = blocks.reduce((a, b) => ({ tokens: a.tokens + b.sb.tokens, cost: a.cost + b.sb.cost, turns: a.turns + b.sb.turns }), { tokens: 0, cost: 0, turns: 0 })
const tw = blocks.reduce((a, b) => ({ tokens: a.tokens + b.sw.tokens, cost: a.cost + b.sw.cost, turns: a.turns + b.sw.turns }), { tokens: 0, cost: 0, turns: 0 })
const totalN = blocks.reduce((a, b) => a + b.sw.n, 0)

console.log(`## Total (${totalN} tasks)`)
console.log()
console.log('| | Tokens | Cost | Turns |')
console.log('|---|---:|---:|---:|')
console.log(`| baseline | ${fmt(tb.tokens)} | ${dollars(tb.cost)} | ${tb.turns} |`)
console.log(`| **adam** | **${fmt(tw.tokens)}** | **${dollars(tw.cost)}** | **${tw.turns}** |`)
console.log(`| **Δ** | **${delta(tb.tokens, tw.tokens)}** | **${delta(tb.cost, tw.cost)}** | **${tw.turns - tb.turns}** |`)
