/**
 * Demonstrates `watch` and auto-reconnect against the fake server, printing the
 * exact summaries an agent sees.
 *
 * Usage: node modbus-poll-tools/demo-watch.mjs
 */
import { apply } from '../modbus-poll/index.js'
import { createFakeServer } from '../modbus-poll-tests/fake-server.mjs'

const fake = createFakeServer()
const port = await fake.listen()

const tools = []
const disposers = []
const ctx = {
  webServer: { register: () => () => {} },
  tools: { register: (definition) => (tools.push(definition), () => {}) },
  get: () => undefined,
  effect: (callback) => (disposers.push(callback()), () => {}),
}

apply(ctx)
const tool = tools[0]
const show = (label, result) => {
  console.log(`\n== ${label}`)
  console.log(result.summary)
  for (const key of ['matched', 'attempts', 'elapsedMs', 'reconnected', 'connected']) {
    if (result[key] !== undefined) console.log(`   ${key}: ${result[key]}`)
  }
}

try {
  show('connect', await tool.execute({ action: 'connect', host: '127.0.0.1', port, unitId: 1 }, {}))

  await tool.execute({ action: 'write', address: 10, value: 1 }, {})
  show(
    'watch the bit we just set',
    await tool.execute({ action: 'watch', start: 10, expect: 1, timeoutMs: 2000 }, {}),
  )

  setTimeout(() => {
    fake.holding[11] = 42
  }, 250)
  show(
    'watch a value that arrives late',
    await tool.execute({ action: 'watch', start: 11, expect: 42, timeoutMs: 2000, intervalMs: 50 }, {}),
  )

  show(
    'watch a value that never arrives',
    await tool.execute({ action: 'watch', start: 11, expect: 999, timeoutMs: 400, intervalMs: 50 }, {}),
  )

  fake.dropConnections()
  await new Promise((resolve) => setTimeout(resolve, 100))
  show('status after the socket dropped', await tool.execute({ action: 'status' }, {}))
  show(
    'read after the drop reconnects by itself',
    await tool.execute({ action: 'read', start: 0, count: 2 }, {}),
  )

  await tool.execute({ action: 'disconnect' }, {})
} finally {
  for (const dispose of disposers) dispose()
  await fake.close()
}
