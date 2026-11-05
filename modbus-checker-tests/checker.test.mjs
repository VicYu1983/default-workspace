/**
 * Device check tests: the three profiles, diagnosis text, expected-value forms,
 * batching and cancellation. Ping and TCP run against localhost, Modbus against
 * the fake server, so the whole path is real.
 *
 * Run with: node modbus-checker-tests/checker.test.mjs
 */
import assert from 'node:assert/strict'
import net from 'node:net'

import { checkDevice, checkDevices, diagnoseStages, matchesExpected, summarizeResults } from '../modbus-checker/checker.js'
import { parsePingOutput, pingHost, tcpProbe } from '../modbus-checker/net.js'
import { createFakeServer } from '../modbus-poll-tests/fake-server.mjs'

// ------------------------------------------------------------------ helpers

function device(overrides) {
  return {
    name: 'device',
    ip: '127.0.0.1',
    port: 502,
    unit_id: 1,
    address: 0,
    quantity: 2,
    function: '03',
    expected: null,
    check_profile: 'full_stack',
    enabled: true,
    connect_timeout_ms: 800,
    response_timeout_ms: 500,
    ping_enabled: true,
    ping_attempts: 1,
    ping_timeout_ms: 800,
    ping_interval_ms: 200,
    tcp_check_enabled: true,
    tcp_port: null,
    tcp_timeout_ms: 500,
    skip_when_ping_failed: false,
    max_latency_ms: null,
    max_loss_percent: null,
    ...overrides,
  }
}

function closedPort() {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port
      server.close(() => resolve(port))
    })
  })
}

// --- expected-value forms ---------------------------------------------------
assert.equal(matchesExpected([100, 107], null), true)
assert.equal(matchesExpected([100, 107], '100,107'), true)
assert.equal(matchesExpected([100, 107], '100, 107'), true, 'spaces are tolerated')
assert.equal(matchesExpected([100, 107], '100,108'), false)
assert.equal(matchesExpected([100, 107], '100'), false, 'length must match')
assert.equal(matchesExpected([50, 60], '0..100'), true)
assert.equal(matchesExpected([50, 160], '0..100'), false)
assert.equal(matchesExpected([true, false, true], '1,0,1'), true)
assert.equal(matchesExpected([true, false, true], '1,0,0'), false)
assert.equal(matchesExpected([true, false], 'true,false'), true)
assert.equal(matchesExpected([100], 'abc'), false)

// --- diagnosis combinations -------------------------------------------------
const blocked = diagnoseStages({
  profile: 'full_stack',
  ping: { ok: false, received: 0, attempts: 4, lossPercent: 100 },
  tcp: { ok: true, port: 502 },
  modbus: { ok: true, elapsedMs: 12 },
})
assert.match(blocked, /ICMP 完全沒有回應/)
assert.match(blocked, /TCP 可連線/)

const dead = diagnoseStages({
  profile: 'full_stack',
  ping: { ok: false, received: 0, attempts: 4, lossPercent: 100 },
  tcp: { ok: false, port: 502 },
})
assert.match(dead, /TCP 也無法連線/)

const silent = diagnoseStages({
  profile: 'full_stack',
  ping: { ok: true, received: 4, attempts: 4, lossPercent: 0 },
  tcp: { ok: true, port: 502 },
  modbus: { ok: false, errorType: 'TIMEOUT' },
})
assert.match(silent, /Unit ID/)

const exception = diagnoseStages({
  profile: 'full_stack',
  tcp: { ok: true, port: 502 },
  modbus: { ok: false, errorType: 'MODBUS_EXCEPTION', exceptionCode: 2 },
})
assert.match(exception, /例外 2/)

const mismatch = diagnoseStages({
  profile: 'full_stack',
  tcp: { ok: true, port: 502 },
  modbus: { ok: true, elapsedMs: 10 },
  values: [1, 2],
  expected: '9,9',
})
assert.match(mismatch, /與預期 9,9 不符/)

assert.equal(diagnoseStages({ profile: 'ping', ping: { ok: true, lossPercent: 0 } }), 'ICMP 正常')
assert.equal(
  diagnoseStages({ profile: 'full_stack', tcp: { ok: true, port: 502 }, modbus: { ok: true, elapsedMs: 5 } }),
  '檢查通過',
)

// --- network primitives -----------------------------------------------------
const ping = await pingHost('127.0.0.1', { attempts: 2, timeoutMs: 800 })
const pingWorks = ping.unavailable !== true

if (pingWorks) {
  assert.equal(ping.ok, true, 'localhost answers ping')
  assert.equal(ping.received >= 1, true)
  assert.equal(ping.lossPercent < 100, true)
  assert.ok(Number.isFinite(ping.avgMs))
} else {
  // A confined environment can forbid spawning ping; the checker must say so
  // instead of blaming the device, but there is no ICMP behaviour to assert.
  assert.equal(ping.ok, false)
  assert.ok(typeof ping.spawnError === 'string' && ping.spawnError !== '')
  console.log(`  note: ping unavailable here (${ping.spawnError}); live ICMP assertions skipped`)
}

// The parser must not depend on the network: localised outputs are pinned here.
const zhTwSuccess = parsePingOutput(
  [
    '回覆自 127.0.0.1: 位元組=32 時間=2ms TTL=128',
    '回覆自 127.0.0.1: 位元組=32 時間=3ms TTL=128',
    '回覆自 127.0.0.1: 位元組=32 時間=2ms TTL=128',
    '回覆自 127.0.0.1: 位元組=32 時間=3ms TTL=128',
    '',
    '127.0.0.1 的 Ping 統計資料:',
    '    封包: 已傳送 = 4，已接收 = 4，已遺失 = 0 (0% 遺失)',
  ].join('\n'),
  4,
)
assert.equal(zhTwSuccess.ok, true)
assert.equal(zhTwSuccess.received, 4)
assert.equal(zhTwSuccess.lossPercent, 0)
assert.equal(zhTwSuccess.avgMs, 2.5)

const enUsTimeout = parsePingOutput(
  [
    'Pinging 192.0.2.1 with 32 bytes of data:',
    'Request timed out.',
    'Request timed out.',
    'Request timed out.',
    'Request timed out.',
    '',
    'Ping statistics for 192.0.2.1:',
    '    Packets: Sent = 4, Received = 0, Lost = 4 (100% loss)',
  ].join('\n'),
  4,
)
assert.equal(enUsTimeout.ok, false)
assert.equal(enUsTimeout.received, 0)
assert.equal(enUsTimeout.lossPercent, 100)
assert.equal(enUsTimeout.avgMs, null)

const enUsPartial = parsePingOutput(
  [
    'Reply from 10.0.0.5: bytes=32 time=12ms TTL=64',
    'Reply from 10.0.0.5: bytes=32 time=13ms TTL=64',
    'Request timed out.',
    'Request timed out.',
    '',
    'Packets: Sent = 4, Received = 2, Lost = 2 (50% loss)',
    'Minimum = 12ms, Maximum = 13ms, Average = 12ms',
  ].join('\n'),
  4,
)
assert.equal(enUsPartial.ok, true)
assert.equal(enUsPartial.received, 2)
assert.equal(enUsPartial.lossPercent, 50)
assert.equal(enUsPartial.avgMs, 12.5)

const zhTwLoss = parsePingOutput(
  [
    '回覆自 10.0.0.5: 位元組=32 時間=8ms TTL=64',
    '要求逾時。',
    '要求逾時。',
    '要求逾時。',
    '',
    '    封包: 已傳送 = 4，已接收 = 1，已遺失 = 3 (75% 遺漏)',
  ].join('\n'),
  4,
)
assert.equal(zhTwLoss.ok, true)
assert.equal(zhTwLoss.received, 1)
assert.equal(zhTwLoss.lossPercent, 75)

const probe = await tcpProbe('127.0.0.1', await closedPort(), 500)
assert.equal(probe.ok, false, 'a closed port must not report a connection')

// --- full checks against the fake server ------------------------------------
const fake = createFakeServer({ size: 1024 })
const fakePort = await fake.listen()
const silentServer = createFakeServer({ units: [9] })
const silentPort = await silentServer.listen()

try {
  const good = await checkDevice(device({ name: 'full-ok', port: fakePort, expected: '100,107' }))
  assert.equal(good.status, 'PASS', `expected PASS, got ${good.status}: ${good.error_message ?? ''} (${good.diagnosis})`)
  assert.deepEqual(good.values, [100, 107])
  assert.equal(good.failed_stage, null)
  assert.equal(good.tcp.ok, true)
  assert.equal(good.modbus.ok, true)
  if (pingWorks) {
    assert.equal(good.ping.ok, true)
  } else {
    assert.equal(good.ping.unavailable, true, 'a skipped ICMP stage is marked, not reported as a failure')
    assert.match(good.diagnosis, /略過 ICMP/)
  }

  const ranged = await checkDevice(
    device({ name: 'full-range', port: fakePort, function: '04', expected: '0..100' }),
  )
  assert.equal(ranged.status, 'PASS', ranged.diagnosis)
  assert.deepEqual(ranged.values, [1, 14], 'FC04 input registers come from the input bank')

  const coils = await checkDevice(
    device({ name: 'coil-ok', port: fakePort, function: '01', quantity: 4, expected: '1,0,0,1' }),
  )
  assert.equal(coils.status, 'PASS', coils.diagnosis)
  assert.deepEqual(coils.values, [true, false, false, true])

  const mismatched = await checkDevice(device({ name: 'full-mismatch', port: fakePort, expected: '999' }))
  assert.equal(mismatched.status, 'FAIL')
  assert.equal(mismatched.error_type, 'UNEXPECTED_VALUE')
  assert.match(mismatched.diagnosis, /與預期 999 不符/)

  const badAddress = await checkDevice(
    device({ name: 'exception', port: fakePort, address: 1100, quantity: 20 }),
  )
  assert.equal(badAddress.status, 'FAIL')
  assert.equal(badAddress.error_type, 'MODBUS_EXCEPTION')
  assert.equal(badAddress.modbus.exceptionCode, 2)

  const silentDevice = await checkDevice(
    device({ name: 'silent', port: silentPort, unit_id: 7, response_timeout_ms: 300 }),
  )
  assert.equal(silentDevice.status, 'TIMEOUT')
  assert.equal(silentDevice.error_type, 'TIMEOUT')
  assert.match(silentDevice.diagnosis, /Unit ID/)

  const tcpFailure = await checkDevice(
    device({ name: 'tcp-fail', port: fakePort, tcp_port: await closedPort(), tcp_timeout_ms: 500 }),
  )
  assert.equal(tcpFailure.status, 'FAIL')
  assert.equal(tcpFailure.error_type, 'TCP_FAILED')
  assert.equal(tcpFailure.failed_stage, 'tcp')
  assert.equal(tcpFailure.modbus, null, 'stages after the failure are not attempted')
  assert.match(tcpFailure.diagnosis, /無法連線/)

  const pingOnly = await checkDevice(
    device({ name: 'ping-only', check_profile: 'ping', ping_attempts: 2 }),
  )
  assert.equal(pingOnly.status, 'PASS', pingOnly.diagnosis)
  assert.equal(pingOnly.tcp, null, 'ping profile does not open TCP')
  assert.equal(pingOnly.modbus, null, 'ping profile does not read Modbus')
  if (pingWorks) {
    assert.equal(pingOnly.diagnosis, 'ICMP 正常')
  }

  const tcpOnly = await checkDevice(
    device({ name: 'tcp-only', check_profile: 'ping_tcp', port: fakePort, ping_attempts: 2 }),
  )
  assert.equal(tcpOnly.status, 'PASS', tcpOnly.diagnosis)
  assert.equal(tcpOnly.modbus, null, 'ping_tcp stops before Modbus')
  assert.equal(tcpOnly.tcp.ok, true)

  // The "ping fails, stop here" path is made deterministic with a fake ping:
  // no real network can be trusted to keep an address unreachable.
  const failedPing = async () => ({
    ok: false,
    attempts: 4,
    received: 0,
    lossPercent: 100,
    avgMs: null,
    minMs: null,
    maxMs: null,
  })

  const skipDevice = await checkDevice(
    device({ name: 'skip', port: fakePort, skip_when_ping_failed: true }),
    { pingFn: failedPing },
  )
  assert.equal(skipDevice.status, 'FAIL')
  assert.equal(skipDevice.error_type, 'PING_FAILED')
  assert.equal(skipDevice.failed_stage, 'ping')
  assert.equal(skipDevice.tcp, null, 'skip_when_ping_failed stops before TCP')
  assert.match(skipDevice.diagnosis, /ICMP 完全沒有回應/)
  assert.match(skipDevice.diagnosis, /略過後續檢查/, 'the operator must see that TCP and Modbus were never tried')

  // Without skip, a blocked ICMP does not fail the device when TCP answers.
  const icmpBlocked = await checkDevice(device({ name: 'blocked', port: fakePort, expected: '100,107' }), {
    pingFn: failedPing,
  })
  assert.equal(icmpBlocked.status, 'PASS', icmpBlocked.diagnosis)
  assert.equal(icmpBlocked.ping.ok, false)
  assert.match(icmpBlocked.diagnosis, /ICMP 完全沒有回應/)
  assert.match(icmpBlocked.diagnosis, /TCP 可連線/)

  const deadDevice = await checkDevice(
    device({ name: 'dead', port: fakePort, tcp_port: await closedPort() }),
    { pingFn: failedPing },
  )
  assert.equal(deadDevice.status, 'FAIL')
  assert.equal(deadDevice.failed_stage, 'tcp')
  assert.match(deadDevice.diagnosis, /TCP 也無法連線/)

  // --- batching -------------------------------------------------------------
  const many = [
    device({ name: 'b-good-1', port: fakePort, expected: '100,107' }),
    device({ name: 'b-good-2', port: fakePort, expected: '100,107' }),
    device({ name: 'b-bad', port: fakePort, expected: '999' }),
    device({ name: 'b-tcp', port: fakePort, tcp_port: await closedPort() }),
  ]
  const progress = []
  const results = await checkDevices(many, {
    concurrency: 2,
    onResult: (result, done, total) => progress.push(`${done}/${total}`),
  })
  assert.equal(results.length, 4)
  assert.equal(progress.length, 4, 'every device reports progress')
  assert.equal(progress.at(-1), '4/4')

  const summary = summarizeResults(results)
  assert.equal(summary.checked, 4)
  assert.equal(summary.pass, 2)
  assert.equal(summary.fail, 2)
  assert.equal(summary.passRate, 50)
  assert.equal(summary.issues.length, 2)
  assert.ok(summary.byErrorType.some((entry) => entry.type === 'UNEXPECTED_VALUE'))
  assert.ok(summary.slowest.length > 0)

  // --- cancellation ---------------------------------------------------------
  const controller = new AbortController()
  const cancelDevices = Array.from({ length: 8 }, (_, index) =>
    device({ name: `cancel-${index}`, port: fakePort, ping_attempts: 2 }),
  )
  const cancelled = await checkDevices(cancelDevices, {
    concurrency: 1,
    signal: controller.signal,
    onResult: (result, done) => {
      if (done === 1) controller.abort()
    },
  })
  assert.ok(cancelled.length < cancelDevices.length, 'cancelling stops the remaining devices')
} finally {
  await fake.close()
  await silentServer.close()
}

console.log('checker: all assertions passed')
