/**
 * Device checking: one device in, one result out.
 *
 * The three check profiles mirror the desktop tool so a report from either tool
 * means the same thing:
 *   ping        - ICMP only
 *   ping_tcp    - ICMP plus a TCP port
 *   full_stack  - ICMP, TCP port and a Modbus read
 *
 * A stage that is not part of the profile stays `null`, which keeps "not
 * checked" distinct from "checked and failed".
 */
import { ModbusError, readDevice } from './modbus.js'
import { pingHost, tcpProbe } from './net.js'

export const STATUSES = ['PASS', 'FAIL', 'TIMEOUT', 'SKIPPED']

const BOOL_TRUE = new Set(['true', '1', 'on', 'yes'])

/**
 * Match a device's values against its `expected` text.
 *
 * Three forms are accepted, matching the desktop tool: a comma list
 * (`1,2,3`), a range (`0..100`) and booleans (`1,0,1` for coils).
 */
export function matchesExpected(values, expected) {
  if (!expected) return true
  const text = String(expected).trim()
  if (text === '') return true

  if (values.length > 0 && values.every((value) => typeof value === 'boolean')) {
    const wanted = text.split(',').map((part) => BOOL_TRUE.has(part.trim().toLowerCase()))
    return wanted.length === values.length && values.every((value, index) => value === wanted[index])
  }

  if (text.includes('..')) {
    const [lower, upper] = text.split('..', 2).map((part) => Number(part.trim()))
    if (!Number.isFinite(lower) || !Number.isFinite(upper)) return false
    return values.every((value) => typeof value === 'number' && value >= lower && value <= upper)
  }

  const wanted = text.split(',').map((part) => Number(part.trim()))
  return wanted.length === values.length && values.every((value, index) => value === wanted[index])
}

function failedStage(ping, tcp, modbus) {
  if (ping && ping.ok === false) return 'ping'
  if (tcp && tcp.ok === false) return 'tcp'
  if (modbus && modbus.ok === false) return 'modbus'
  return null
}

/**
 * Turn the stage results into the sentence an engineer would say out loud.
 *
 * This is what makes the tool useful on site: "ping fails but TCP connects"
 * points at ICMP filtering, while "TCP connects but Modbus times out" points at
 * the unit id, the address or the device's Modbus service.
 */
export function diagnoseStages({ profile, ping, tcp, modbus, values = [], expected = null } = {}) {
  const notes = []
  // `ok: null` means the ICMP stage never ran; only an explicit false is a
  // failed ping, otherwise we would blame the device for our own outage.
  const pingFailed = ping?.ok === false
  const pingOk = ping?.ok === true

  if (ping && ping.unavailable) {
    notes.push(`無法執行 ping（${ping.spawnError}），已略過 ICMP 檢查`)
  } else if (pingFailed) {
    notes.push(
      ping.received > 0
        ? `ICMP 有 ${ping.lossPercent}% 封包遺失（${ping.received}/${ping.attempts} 回應）`
        : 'ICMP 完全沒有回應',
    )
  }

  if (pingFailed && tcp && tcp.ok) {
    notes.push('但 TCP 可連線，通常是設備或防火牆封鎖 ICMP，不代表設備離線')
  }
  if (tcp && !tcp.ok) {
    // The TCP hint stands on its own: it does not depend on whether ICMP ran.
    notes.push(
      pingFailed
        ? 'TCP 也無法連線，設備可能斷電、網路中斷或 IP 設定錯誤'
        : `TCP ${tcp.port ?? ''} 無法連線，可能是服務未啟動、埠號錯誤或設備不在線`,
    )
  }
  if (tcp && tcp.ok && modbus && !modbus.ok) {
    if (modbus.errorType === 'TIMEOUT') {
      notes.push('TCP 可連線但 Modbus 無回應，請確認 Unit ID、位址與設備的 Modbus 服務')
    } else if (modbus.errorType === 'MODBUS_EXCEPTION') {
      notes.push(`設備回應 Modbus 例外 ${modbus.exceptionCode ?? ''}，通常是位址或功能碼不支援`)
    } else {
      notes.push('TCP 可連線但 Modbus 讀取失敗')
    }
  }
  if (modbus && modbus.ok && expected && !matchesExpected(values, expected)) {
    notes.push(`讀值 ${values.join(', ')} 與預期 ${expected} 不符`)
  }
  if (pingOk && ping.lossPercent > 0) {
    notes.push(`封包遺失 ${ping.lossPercent}%`)
  }
  if (modbus && modbus.ok && modbus.elapsedMs > 1000) {
    notes.push(`Modbus 回應偏慢（${modbus.elapsedMs} ms）`)
  }
  if (notes.length === 0) {
    return profile === 'ping' ? 'ICMP 正常' : '檢查通過'
  }
  return notes.join('；')
}

/**
 * Run one device's configured check.
 *
 * `signal` is an AbortSignal so a batch can be cancelled between stages.
 */
export async function checkDevice(device, options = {}) {
  const started = Date.now()
  const signal = options.signal
  // Injectable for tests: a deterministic fake ping makes the "ICMP blocked"
  // and "skip the rest" paths reproducible on any network.
  const pingFn = options.pingFn ?? pingHost
  const tcpFn = options.tcpProbe ?? tcpProbe
  const profile = device.check_profile
  const result = {
    device_name: device.name,
    ip: device.ip,
    port: device.port,
    unit_id: device.unit_id,
    function: device.function,
    address: device.address,
    plc_address: device.plc_address,
    quantity: device.quantity,
    check_profile: profile,
    expected: device.expected,
    status: 'PASS',
    error_type: null,
    error_message: null,
    failed_stage: null,
    values: [],
    ping: null,
    tcp: null,
    modbus: null,
    elapsed_ms: 0,
    diagnosis: '',
    checked_at: new Date().toISOString(),
  }

  const wantsPing = device.ping_enabled
  const wantsTcp = device.tcp_check_enabled && profile !== 'ping'
  const wantsModbus = profile === 'full_stack'

  try {
    if (signal?.aborted) throw new ModbusError('cancelled', 'cancelled')

    if (wantsPing) {
      const ping = await pingFn(device.ip, {
        attempts: device.ping_attempts,
        timeoutMs: device.ping_timeout_ms,
      })
      if (ping.unavailable) {
        // The ICMP stage could not run at all. Continuing is the only honest
        // choice: failing the device would blame it for our missing binary.
        result.ping = { ok: null, unavailable: true, spawnError: ping.spawnError, error: ping.error }
      } else {
        result.ping = {
          ok: ping.ok,
          received: ping.received,
          attempts: ping.attempts,
          lossPercent: ping.lossPercent,
          avgMs: ping.avgMs,
          minMs: ping.minMs,
          maxMs: ping.maxMs,
        }
        if (!ping.ok && device.skip_when_ping_failed) {
          result.status = 'FAIL'
          result.error_type = 'PING_FAILED'
          result.error_message = 'no ICMP reply'
          result.failed_stage = 'ping'
          result.diagnosis =
            diagnoseStages({ profile, ping: result.ping, tcp: null, modbus: null }) +
            // Say the rest was skipped: "ping failed" alone hides that TCP and
            // Modbus were never tried.
            (profile === 'ping' ? '' : '；已依設定略過後續檢查')
          result.elapsed_ms = Date.now() - started
          return result
        }
      }
    }

    if (wantsTcp) {
      const port = device.tcp_port ?? device.port
      const tcp = await tcpFn(device.ip, port, device.tcp_timeout_ms)
      result.tcp = { ok: tcp.ok, port, elapsedMs: tcp.elapsedMs, error: tcp.error }
      if (!tcp.ok) {
        result.status = 'FAIL'
        result.error_type = 'TCP_FAILED'
        result.error_message = tcp.error ?? 'tcp connect failed'
        result.failed_stage = 'tcp'
        result.diagnosis = diagnoseStages({ profile, ping: result.ping, tcp: result.tcp, modbus: null })
        result.elapsed_ms = Date.now() - started
        return result
      }
    }

    if (wantsModbus) {
      const began = Date.now()
      try {
        const values = await readDevice(device)
        result.values = values
        result.modbus = { ok: true, elapsedMs: Date.now() - began }
        if (!matchesExpected(values, device.expected)) {
          result.status = 'FAIL'
          result.error_type = 'UNEXPECTED_VALUE'
          result.error_message = `expected ${device.expected}`
        }
      } catch (error) {
        const failure = error instanceof ModbusError ? error : null
        const code = failure?.code ?? 'MODBUS_ERROR'
        const errorType =
          code === 'timeout' || code === 'connect-timeout'
            ? 'TIMEOUT'
            : code === 'modbus-exception'
              ? 'MODBUS_EXCEPTION'
              : 'MODBUS_ERROR'
        result.modbus = {
          ok: false,
          elapsedMs: Date.now() - began,
          errorCode: code,
          errorType,
          exceptionCode: failure?.details?.exceptionCode ?? null,
        }
        result.status = errorType === 'TIMEOUT' ? 'TIMEOUT' : 'FAIL'
        result.error_type = errorType
        result.error_message = failure?.message ?? String(error)
      }
    }
  } catch (error) {
    if (error instanceof ModbusError && error.code === 'cancelled') throw error
    result.status = 'FAIL'
    result.error_type = 'CHECK_ERROR'
    result.error_message = error?.message ?? String(error)
  }

  // Configured thresholds turn an otherwise passing result into a failure.
  if (result.status === 'PASS' && device.max_latency_ms !== null && result.modbus?.ok) {
    if (result.modbus.elapsedMs > device.max_latency_ms) {
      result.status = 'FAIL'
      result.error_type = 'LATENCY_EXCEEDED'
      result.error_message = `${result.modbus.elapsedMs} ms > ${device.max_latency_ms} ms`
    }
  }
  if (result.status === 'PASS' && device.max_loss_percent !== null && result.ping) {
    if (result.ping.lossPercent > device.max_loss_percent) {
      result.status = 'FAIL'
      result.error_type = 'PACKET_LOSS'
      result.error_message = `${result.ping.lossPercent}% > ${device.max_loss_percent}%`
    }
  }

  result.failed_stage = failedStage(result.ping, result.tcp, result.modbus)
  result.diagnosis = diagnoseStages({
    profile,
    ping: result.ping,
    tcp: result.tcp,
    modbus: result.modbus,
    values: result.values,
    expected: device.expected,
  })
  result.elapsed_ms = Date.now() - started
  return result
}

/**
 * Run many devices with a bounded number of concurrent checks.
 *
 * `onResult` fires as each device finishes so a caller can stream progress
 * instead of waiting for the slowest device.
 */
export async function checkDevices(devices, options = {}) {
  const concurrency = Math.max(1, Math.min(32, Number(options.concurrency) || 8))
  const onResult = typeof options.onResult === 'function' ? options.onResult : () => {}
  const signal = options.signal
  const results = []
  let cursor = 0

  const workers = new Array(Math.min(concurrency, devices.length)).fill(0).map(async () => {
    for (;;) {
      if (signal?.aborted) return
      const index = cursor
      cursor += 1
      if (index >= devices.length) return
      const device = devices[index]
      let result
      try {
        result = await checkDevice(device, { signal, pingFn: options.pingFn, tcpFn: options.tcpProbe })
      } catch (error) {
        if (error instanceof ModbusError && error.code === 'cancelled') return
        result = {
          device_name: device.name,
          ip: device.ip,
          status: 'FAIL',
          error_type: 'CHECK_ERROR',
          error_message: error?.message ?? String(error),
          values: [],
          elapsed_ms: 0,
          diagnosis: '檢查器發生未預期錯誤',
        }
      }
      results.push(result)
      onResult(result, results.length, devices.length)
    }
  })

  await Promise.all(workers)
  results.sort((left, right) => left.device_name.localeCompare(right.device_name))
  return results
}

export function summarizeResults(results) {
  const counts = { PASS: 0, FAIL: 0, TIMEOUT: 0, SKIPPED: 0 }
  for (const result of results) counts[result.status] = (counts[result.status] ?? 0) + 1
  const checked = results.length
  const durations = results.map((result) => result.elapsed_ms).filter((value) => Number.isFinite(value))
  const modbusTimes = results
    .map((result) => (result.modbus?.ok ? result.modbus.elapsedMs : null))
    .filter((value) => value !== null)
  const issues = results.filter((result) => result.status !== 'PASS')
  const byErrorType = new Map()
  for (const issue of issues) {
    const key = issue.error_type ?? 'UNKNOWN'
    byErrorType.set(key, (byErrorType.get(key) ?? 0) + 1)
  }
  return {
    checked,
    pass: counts.PASS,
    fail: counts.FAIL,
    timeout: counts.TIMEOUT,
    passRate: checked === 0 ? 0 : Math.round((counts.PASS / checked) * 1000) / 10,
    totalMs: durations.reduce((sum, value) => sum + value, 0),
    slowest: results
      .slice()
      .sort((left, right) => right.elapsed_ms - left.elapsed_ms)
      .slice(0, 5)
      .map((result) => ({ device: result.device_name, elapsed_ms: result.elapsed_ms })),
    avgModbusMs:
      modbusTimes.length === 0
        ? null
        : Math.round(modbusTimes.reduce((sum, value) => sum + value, 0) / modbusTimes.length),
    byErrorType: [...byErrorType.entries()]
      .map(([type, count]) => ({ type, count }))
      .sort((left, right) => right.count - left.count),
    issues: issues.map((result) => ({
      device: result.device_name,
      ip: result.ip,
      status: result.status,
      error_type: result.error_type,
      failed_stage: result.failed_stage,
      diagnosis: result.diagnosis,
    })),
  }
}
