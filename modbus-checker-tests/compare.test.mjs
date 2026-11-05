/**
 * Baseline comparison tests.
 *
 * Run with: node modbus-checker-tests/compare.test.mjs
 */
import assert from 'node:assert/strict'

import { compareBatches, describeComparison } from '../modbus-checker/compare.js'

function batch(id, results, passRate = null) {
  return {
    id,
    site: '測試案場',
    finished_at: '2026-11-05T02:00:00.000Z',
    results,
    summary: { passRate },
  }
}

function result(name, status, extra = {}) {
  return { device_name: name, ip: `10.0.0.${name.length}`, status, values: [], elapsed_ms: 10, ...extra }
}

// --- the four things a comparison must separate -----------------------------
const baseline = batch('base', [
  result('stable', 'PASS', { values: [100, 107], modbus: { ok: true, elapsedMs: 10 } }),
  result('regressed', 'PASS', { values: [1], modbus: { ok: true, elapsedMs: 10 } }),
  result('recovered', 'FAIL', { error_type: 'TCP_FAILED' }),
  result('still-broken', 'TIMEOUT', { error_type: 'TIMEOUT' }),
  result('changed', 'PASS', { values: [5], modbus: { ok: true, elapsedMs: 12 } }),
  result('slower', 'PASS', { values: [7], modbus: { ok: true, elapsedMs: 20 } }),
  result('gone', 'PASS', { values: [9], modbus: { ok: true, elapsedMs: 10 } }),
], 71.4)

const current = batch('now', [
  result('stable', 'PASS', { values: [100, 107], modbus: { ok: true, elapsedMs: 11 } }),
  result('regressed', 'FAIL', { error_type: 'TCP_FAILED', failed_stage: 'tcp', diagnosis: 'TCP 也無法連線' }),
  result('recovered', 'PASS', { values: [3] }),
  result('still-broken', 'TIMEOUT', { error_type: 'TIMEOUT' }),
  result('changed', 'PASS', { values: [6], modbus: { ok: true, elapsedMs: 12 } }),
  result('slower', 'PASS', { values: [7], modbus: { ok: true, elapsedMs: 90 } }),
  result('brand-new', 'PASS', { values: [1] }),
], 85.7)

const comparison = compareBatches(baseline, current)

assert.deepEqual(comparison.newIssues.map((entry) => entry.device), ['regressed'])
assert.equal(comparison.newIssues[0].was, 'PASS')
assert.equal(comparison.newIssues[0].now, 'FAIL')
assert.equal(comparison.newIssues[0].failed_stage, 'tcp')

assert.deepEqual(comparison.recovered.map((entry) => entry.device), ['recovered'])
assert.deepEqual(comparison.stillFailing.map((entry) => entry.device), ['still-broken'])
assert.deepEqual(comparison.valueChanges.map((entry) => entry.device), ['changed'])
assert.equal(comparison.valueChanges[0].before, '5')
assert.equal(comparison.valueChanges[0].after, '6')
assert.deepEqual(comparison.latencyDegraded.map((entry) => entry.device), ['slower'])
assert.equal(comparison.latencyDegraded[0].before_ms, 20)
assert.equal(comparison.latencyDegraded[0].after_ms, 90)
assert.deepEqual(comparison.added.map((entry) => entry.device), ['brand-new'])
assert.deepEqual(comparison.notInBatch.map((entry) => entry.device), ['gone'])
assert.equal(comparison.passRate.delta, 14.3)

// `stable` must not appear anywhere: identical results are not news.
const mentioned = [
  ...comparison.newIssues,
  ...comparison.recovered,
  ...comparison.stillFailing,
  ...comparison.valueChanges,
  ...comparison.latencyDegraded,
]
assert.ok(!mentioned.some((entry) => entry.device === 'stable'), 'unchanged devices stay out of the diff')

// --- latency noise is not a regression --------------------------------------
const noisy = compareBatches(
  batch('a', [result('fast', 'PASS', { modbus: { ok: true, elapsedMs: 3 } })]),
  batch('b', [result('fast', 'PASS', { modbus: { ok: true, elapsedMs: 6 } })]),
)
assert.equal(noisy.latencyDegraded.length, 0, '3 ms to 6 ms is noise, not degradation')

// A large absolute jump is reported even below the factor.
const jumped = compareBatches(
  batch('a', [result('slow', 'PASS', { modbus: { ok: true, elapsedMs: 500 } })]),
  batch('b', [result('slow', 'PASS', { modbus: { ok: true, elapsedMs: 700 } })]),
  { latencyFactor: 2 },
)
assert.equal(jumped.latencyDegraded.length, 0, 'factor and absolute threshold must both be exceeded')

// --- pass rate without summaries --------------------------------------------
const noRates = compareBatches(batch('a', [result('x', 'PASS')]), batch('b', [result('x', 'PASS')]))
assert.equal(noRates.passRate.delta, null)
assert.match(describeComparison(noRates), /與基準完全相同/)

// --- degenerate inputs ------------------------------------------------------
const empty = compareBatches(null, null)
assert.equal(empty.counts.newIssues, 0)
assert.equal(empty.passRate.delta, null)

// --- the text an agent quotes ----------------------------------------------
const text = describeComparison(comparison)
assert.match(text, /通過率 71\.4% → 85\.7% \(\+14\.3%\)/)
assert.match(text, /新增異常 1 台/)
assert.match(text, /已恢復 1 台/)
assert.match(text, /延遲劣化 1 台/)
assert.match(text, /基準沒有的設備 1 台/)
assert.match(text, /本次未檢查的基準設備 1 台/)

console.log('compare: all assertions passed')
