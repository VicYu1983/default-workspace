/**
 * Baseline comparison: what changed since the batch we treat as good?
 *
 * The point of a baseline is not "another report" but a shorter one — an
 * engineer wants the handful of devices that regressed, not 673 rows again.
 * Everything here is a pure function over two result lists.
 */

export const DEFAULT_LATENCY_FACTOR = 1.5
export const DEFAULT_LATENCY_ABSOLUTE_MS = 20

const MAX_LISTED_VALUES = 8

function valuesText(values) {
  if (!Array.isArray(values) || values.length === 0) return ''
  const head = values.slice(0, MAX_LISTED_VALUES)
  const suffix = values.length > MAX_LISTED_VALUES ? `, …(+${values.length - MAX_LISTED_VALUES})` : ''
  return head.map((value) => (typeof value === 'boolean' ? (value ? '1' : '0') : String(value))).join(',') + suffix
}

function keyOf(result) {
  return result.device_name ?? result.device ?? result.ip
}

function isRegression(before, after) {
  return before.status === 'PASS' && after.status !== 'PASS'
}

function isRecovery(before, after) {
  return before.status !== 'PASS' && after.status === 'PASS'
}

function valuesDiffer(before, after) {
  const left = Array.isArray(before.values) ? before.values : []
  const right = Array.isArray(after.values) ? after.values : []
  if (left.length !== right.length) return true
  return left.some((value, index) => value !== right[index])
}

function latencyOf(result) {
  if (result.modbus && result.modbus.ok) return result.modbus.elapsedMs
  if (Number.isFinite(result.elapsed_ms)) return result.elapsed_ms
  return null
}

/**
 * Compare `batch` against `baseline`.
 *
 * Latency only counts as degradation when it is both relatively and absolutely
 * worse: a 3 ms device going to 6 ms is noise, not a regression.
 */
export function compareBatches(baseline, batch, options = {}) {
  const factor = Number(options.latencyFactor) > 1 ? Number(options.latencyFactor) : DEFAULT_LATENCY_FACTOR
  const absoluteMs = Number(options.latencyAbsoluteMs) >= 0
    ? Number(options.latencyAbsoluteMs)
    : DEFAULT_LATENCY_ABSOLUTE_MS

  const before = new Map((baseline?.results ?? []).map((result) => [keyOf(result), result]))
  const after = new Map((batch?.results ?? []).map((result) => [keyOf(result), result]))

  const newIssues = []
  const recovered = []
  const stillFailing = []
  const valueChanges = []
  const latencyDegraded = []
  const notInBatch = []
  const added = []

  for (const [name, previous] of before) {
    const current = after.get(name)
    if (!current) {
      notInBatch.push({ device: name, baseline_status: previous.status })
      continue
    }

    if (isRegression(previous, current)) {
      newIssues.push({
        device: name,
        ip: current.ip,
        was: previous.status,
        now: current.status,
        error_type: current.error_type ?? null,
        failed_stage: current.failed_stage ?? null,
        diagnosis: current.diagnosis ?? '',
      })
      continue
    }

    if (isRecovery(previous, current)) {
      recovered.push({ device: name, ip: current.ip, was: previous.status, now: current.status })
      continue
    }

    if (previous.status !== 'PASS' && current.status !== 'PASS') {
      stillFailing.push({
        device: name,
        ip: current.ip,
        status: current.status,
        error_type: current.error_type ?? null,
        diagnosis: current.diagnosis ?? '',
      })
      continue
    }

    if (previous.status === 'PASS' && current.status === 'PASS' && valuesDiffer(previous, current)) {
      valueChanges.push({
        device: name,
        ip: current.ip,
        before: valuesText(previous.values),
        after: valuesText(current.values),
      })
    }

    const beforeMs = latencyOf(previous)
    const afterMs = latencyOf(current)
    if (beforeMs !== null && afterMs !== null && afterMs > beforeMs * factor && afterMs - beforeMs >= absoluteMs) {
      latencyDegraded.push({ device: name, ip: current.ip, before_ms: beforeMs, after_ms: afterMs })
    }
  }

  for (const [name, current] of after) {
    if (!before.has(name)) {
      added.push({ device: name, ip: current.ip, status: current.status })
    }
  }

  const bySeverity = (left, right) => left.device.localeCompare(right.device)
  newIssues.sort(bySeverity)
  recovered.sort(bySeverity)
  stillFailing.sort(bySeverity)
  valueChanges.sort(bySeverity)
  latencyDegraded.sort((left, right) => (right.after_ms - right.before_ms) - (left.after_ms - left.before_ms))

  const baselineRate = baseline?.summary?.passRate ?? null
  const currentRate = batch?.summary?.passRate ?? null

  return {
    baseline: baseline ? { id: baseline.id, at: baseline.finished_at ?? baseline.started_at, site: baseline.site } : null,
    batch: batch ? { id: batch.id, at: batch.finished_at ?? batch.started_at, site: batch.site } : null,
    passRate: {
      before: baselineRate,
      after: currentRate,
      delta: baselineRate === null || currentRate === null ? null : Math.round((currentRate - baselineRate) * 10) / 10,
    },
    newIssues,
    recovered,
    stillFailing,
    valueChanges,
    latencyDegraded,
    added,
    notInBatch,
    counts: {
      newIssues: newIssues.length,
      recovered: recovered.length,
      stillFailing: stillFailing.length,
      valueChanges: valueChanges.length,
      latencyDegraded: latencyDegraded.length,
      added: added.length,
      notInBatch: notInBatch.length,
    },
  }
}

/** A short "what changed" text an agent can quote without re-reading the JSON. */
export function describeComparison(comparison, limit = 15) {
  const lines = []
  const { counts } = comparison
  if (comparison.passRate.delta !== null) {
    const sign = comparison.passRate.delta >= 0 ? '+' : ''
    lines.push(`通過率 ${comparison.passRate.before}% → ${comparison.passRate.after}% (${sign}${comparison.passRate.delta}%)`)
  }
  if (counts.newIssues > 0) {
    lines.push(`新增異常 ${counts.newIssues} 台：`)
    for (const issue of comparison.newIssues.slice(0, limit)) {
      lines.push(`  ${issue.device} (${issue.ip}) ${issue.was} → ${issue.now}${issue.diagnosis ? ` — ${issue.diagnosis}` : ''}`)
    }
  }
  if (counts.recovered > 0) {
    lines.push(`已恢復 ${counts.recovered} 台：${comparison.recovered.slice(0, limit).map((item) => item.device).join('、')}`)
  }
  if (counts.stillFailing > 0) {
    lines.push(`持續異常 ${counts.stillFailing} 台：${comparison.stillFailing.slice(0, limit).map((item) => item.device).join('、')}`)
  }
  if (counts.valueChanges > 0) {
    lines.push(`讀值變更 ${counts.valueChanges} 台：`)
    for (const change of comparison.valueChanges.slice(0, limit)) {
      lines.push(`  ${change.device} ${change.before} → ${change.after}`)
    }
  }
  if (counts.latencyDegraded > 0) {
    lines.push(`延遲劣化 ${counts.latencyDegraded} 台：`)
    for (const item of comparison.latencyDegraded.slice(0, limit)) {
      lines.push(`  ${item.device} ${item.before_ms} ms → ${item.after_ms} ms`)
    }
  }
  if (counts.added > 0) lines.push(`基準沒有的設備 ${counts.added} 台`)
  if (counts.notInBatch > 0) lines.push(`本次未檢查的基準設備 ${counts.notInBatch} 台`)
  if (lines.length === 0) lines.push('與基準完全相同')
  return lines.join('\n')
}
