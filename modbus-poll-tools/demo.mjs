/**
 * Demonstrates the agent-facing tools against the fake server: write + watch,
 * a chunked dump, the read-only guard (set from the panel route), and
 * auto-reconnect. Prints the exact summaries an agent sees.
 *
 * Usage: node modbus-poll-tools/demo.mjs
 */
import { Readable } from 'node:stream'
import { apply } from '../modbus-poll/index.js'
import { createFakeServer } from '../modbus-poll-tests/fake-server.mjs'

const fake = createFakeServer({ size: 1024 })
const port = await fake.listen()

const tools = []
const routes = []
const disposers = []
const ctx = {
  webServer: { register: (route) => (routes.push(route), () => {}) },
  tools: { register: (definition) => (tools.push(definition), () => {}) },
  get: () => undefined,
  effect: (callback) => (disposers.push(callback()), () => {}),
}

apply(ctx)
const tool = tools[0]

async function callHost(payload) {
  const request = Readable.from([Buffer.from(JSON.stringify(payload), 'utf8')])
  request.method = 'POST'
  request.headers = { 'content-type': 'application/json' }
  const response = {
    statusCode: 0,
    headers: {},
    body: '',
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = value
    },
    end(body) {
      this.body = body ?? ''
    },
  }
  await routes[0].handler(request, response)
  return { status: response.statusCode, json: JSON.parse(response.body) }
}

const show = (label, result) => {
  console.log(`\n== ${label}`)
  console.log(result.summary)
  for (const key of ['matched', 'attempts', 'elapsedMs', 'reconnected', 'connected', 'chunks', 'readOnly']) {
    if (result[key] !== undefined) console.log(`   ${key}: ${result[key]}`)
  }
}

try {
  show('connect', await tool.execute({ action: 'connect', host: '127.0.0.1', port, unitId: 1 }, {}))

  await tool.execute({ action: 'write', address: 10, value: 1 }, {})
  show('watch the value we just wrote', await tool.execute({ action: 'watch', start: 10, expect: 1, timeoutMs: 2000 }, {}))

  show('dump 300 registers', await tool.execute({ action: 'dump', start: 0, count: 300 }, {}))

  // The panel owns the lock, so the demo sets it through the panel's route.
  await callHost({ op: 'set-guard', readOnly: true })
  console.log('\n== guard turned on from the panel')
  try {
    await tool.execute({ action: 'write', address: 11, value: 1 }, {})
    console.log('BUG: write was allowed while locked')
  } catch (error) {
    console.log(`agent write refused: ${error.message}`)
  }
  const refused = await callHost({ op: 'write', address: 11, value: 1 })
  console.log(`panel write refused: HTTP ${refused.status} ${refused.json.error.code}`)

  await callHost({ op: 'set-guard', readOnly: false })
  show('guard after unlocking', await tool.execute({ action: 'guard' }, {}))

  fake.dropConnections()
  await new Promise((resolve) => setTimeout(resolve, 100))
  show('status after a dropped socket', await tool.execute({ action: 'status' }, {}))
  show('read after the drop', await tool.execute({ action: 'read', start: 0, count: 2 }, {}))

  await tool.execute({ action: 'disconnect' }, {})
} finally {
  for (const dispose of disposers) dispose()
  await fake.close()
}
