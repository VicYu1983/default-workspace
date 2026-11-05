/**
 * Reachability probes: ICMP ping and TCP connect.
 *
 * Node has no ICMP API, so ping shells out to the platform `ping` binary. Its
 * output is localised (zh-TW prints 遺失/時間, en-US prints loss/time), so the
 * parser keys on the pieces Windows does not translate — `TTL=` for replies —
 * and falls back to the loss percentage for everything else.
 */
import { execFile } from 'node:child_process'
import net from 'node:net'

const IS_WINDOWS = process.platform === 'win32'

export class NetError extends Error {
  constructor(message, code, details) {
    super(message)
    this.name = 'NetError'
    this.code = code
    if (details !== undefined) this.details = details
  }
}

function run(command, args, timeoutMs) {
  return new Promise((resolve) => {
    try {
      execFile(command, args, { timeout: timeoutMs, windowsHide: true }, (error, stdout, stderr) => {
        resolve({ error, stdout: stdout ?? '', stderr: stderr ?? '' })
      })
    } catch (error) {
      // A missing binary or a confined environment throws here instead of
      // reporting through the callback; the caller must be able to tell that
      // apart from "the host did not answer".
      resolve({ error, stdout: '', stderr: '', spawnError: error?.code ?? 'spawn-failed' })
    }
  })
}

/** Round-trip times, in ms, found anywhere in the ping output. */
function extractRtts(output) {
  const rtts = []
  const pattern = /(?:[=<])\s*(\d+(?:\.\d+)?)\s*ms/gi
  let match
  while ((match = pattern.exec(output)) !== null) rtts.push(Number(match[1]))
  // Windows writes "<1ms" for sub-millisecond replies; keep them as 0.5 so an
  // average is not skewed by dropping the fastest samples.
  const subMilli = (output.match(/[=<]\s*1\s*ms/gi) ?? []).length
  return { rtts, subMilli }
}

function extractLossPercent(output) {
  const match = output.match(/\((\d+(?:\.\d+)?)%/)
  if (match) return Number(match[1])
  return null
}

/**
 * Parse ping output into a measurement.
 *
 * Keyed on `TTL=` (present in every Windows locale's reply line) and the loss
 * percentage, so zh-TW (遺失/時間) and en-US (loss/time) both parse. On
 * non-Windows the same fields appear with `ttl=` and `(x% packet loss)`.
 */
export function parsePingOutput(output, attempts) {
  const replies = (output.match(/TTL[=\s]/gi) ?? []).length
  const { rtts, subMilli } = extractRtts(output)
  const lossPercent = extractLossPercent(output)

  let received = replies
  if (received === 0 && rtts.length > 0) received = rtts.length
  if (received === 0 && lossPercent !== null) {
    received = Math.max(0, attempts - Math.round((attempts * lossPercent) / 100))
  }

  const measured = replies > 0 ? replies : rtts.length
  const samples = rtts.slice(0, measured > 0 ? measured : rtts.length)
  const effective = samples.length > 0 ? samples : new Array(Math.max(0, received)).fill(0.5)
  const avgMs =
    effective.length > 0
      ? Math.round((effective.reduce((sum, value) => sum + value, 0) / effective.length) * 10) / 10
      : null
  const resolvedLoss = lossPercent ?? Math.round(((attempts - received) / attempts) * 1000) / 10

  return {
    ok: received > 0,
    attempts,
    received,
    lossPercent: resolvedLoss,
    avgMs,
    minMs: effective.length > 0 ? Math.min(...effective) : null,
    maxMs: effective.length > 0 ? Math.max(...effective) : null,
    subMilli,
  }
}

/**
 * Ping a host.
 *
 * `ok` means "at least one reply arrived", and `lossPercent` is reported even
 * when nothing came back, so a caller can tell "no reply at all" from "partial
 * loss" — the desktop tool distinguishes those too.
 */
export async function pingHost(ip, options = {}) {
  const attempts = clampInt(options.attempts, 1, 20, 4)
  const timeoutMs = clampInt(options.timeoutMs, 100, 30000, 1000)
  const started = Date.now()

  const args = IS_WINDOWS
    ? ['-n', String(attempts), '-w', String(timeoutMs), ip]
    : ['-c', String(attempts), '-W', String(Math.max(1, Math.round(timeoutMs / 1000))), ip]

  const overall = timeoutMs * attempts + 2000
  const { error, stdout, stderr, spawnError } = await run('ping', args, overall)
  const output = `${stdout}\n${stderr}`
  const elapsedMs = Date.now() - started

  // Ping never ran: report that instead of pretending the host is silent.
  if (spawnError) {
    return {
      ok: false,
      unavailable: true,
      spawnError,
      attempts,
      received: 0,
      lossPercent: null,
      avgMs: null,
      minMs: null,
      maxMs: null,
      elapsedMs,
      error: `cannot run ping: ${spawnError}`,
      output: '',
    }
  }

  const measurement = parsePingOutput(output, attempts)

  // A non-zero exit with no parsed output usually means "unknown host" or a
  // missing binary; keep the reason so the caller can report it verbatim.
  if (error && measurement.received === 0 && output.trim() === '') {
    return {
      ok: false,
      attempts,
      received: 0,
      lossPercent: 100,
      avgMs: null,
      minMs: null,
      maxMs: null,
      elapsedMs,
      error: error.message,
      output: '',
    }
  }

  return {
    ...measurement,
    elapsedMs,
    output: output.trim().split(/\r?\n/).slice(0, 8).join('\n'),
  }
}

/** Open a TCP connection; resolves `ok: false` instead of throwing. */
export function tcpProbe(host, port, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const started = Date.now()
    const socket = new net.Socket()
    let settled = false

    const finish = (ok, error) => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve({ ok, elapsedMs: Date.now() - started, error: error ?? null })
    }

    socket.setTimeout(timeoutMs)
    socket.once('connect', () => finish(true, null))
    socket.once('timeout', () => finish(false, `timed out after ${timeoutMs}ms`))
    socket.once('error', (error) => finish(false, error.code ? `${error.code}` : error.message))
    socket.connect(port, host)
  })
}

function clampInt(value, min, max, fallback) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(number)))
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
