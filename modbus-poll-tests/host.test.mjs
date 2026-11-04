/**
 * Host-half test: mounts the plugin against a minimal Cordis-like context and
 * drives its route handler the way the panel's fetch would.
 *
 * Run with: node modbus-poll-tests/host.test.mjs
 */
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { apply } from '../modbus-poll/index.js'
import { createFakeServer } from './fake-server.mjs'

const fake = createFakeServer()
const port = await fake.listen()

const routes = []
const effects = []
const tools = []
const ctx = {
  webServer: {
    register(route) {
      routes.push(route)
      return () => {}
    },
  },
  tools: {
    register(definition) {
      tools.push(definition)
      return () => {}
    },
  },
  get() {
    return undefined
  },
  effect(callback) {
    effects.push(callback())
    return () => {}
  },
}

apply(ctx)
assert.equal(routes.length, 1, 'one route registered')
assert.equal(routes[0].path, '/modbus-poll/api')
assert.equal(routes[0].kind, 'exact')
assert.equal(tools.length, 1, 'one tool registered')
assert.equal(tools[0].name, 'modbus_poll')
assert.equal(tools[0].parameters.type, 'object', 'tool parameters are a JSON schema object')
assert.deepEqual(tools[0].parameters.required, ['action'])
assert.ok(tools[0].parameters.properties.action.enum.includes('write'))

async function call(payload) {
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

try {
  const status = await call({ op: 'status' })
  assert.equal(status.status, 200)
  assert.equal(status.json.connected, false)

  const beforeConnect = await call({ op: 'read', kind: 'holding', start: 0, count: 2 })
  assert.equal(beforeConnect.status, 409)
  assert.equal(beforeConnect.json.error.code, 'not-connected')

  const connected = await call({ op: 'connect', host: '127.0.0.1', port, unitId: 1 })
  assert.equal(connected.status, 200)
  assert.equal(connected.json.connected, true)
  assert.equal(connected.json.host, '127.0.0.1')
  assert.equal(connected.json.port, port)

  const read = await call({ op: 'read', kind: 'holding', start: 2, count: 4 })
  assert.equal(read.status, 200)
  assert.deepEqual(read.json.values, fake.holding.slice(2, 6))
  assert.ok(Number.isInteger(read.json.latencyMs))

  const write = await call({ op: 'write', address: 9, value: 4242 })
  assert.equal(write.status, 200)
  assert.deepEqual({ address: write.json.address, value: write.json.value }, { address: 9, value: 4242 })
  assert.equal(fake.holding[9], 4242)

  const reread = await call({ op: 'read', kind: 'holding', start: 9, count: 1 })
  assert.deepEqual(reread.json.values, [4242])

  const inputs = await call({ op: 'read', kind: 'input', start: 0, count: 3 })
  assert.deepEqual(inputs.json.values, fake.input.slice(0, 3))

  // Typed reads: a float stored in two registers decodes to one row.
  fake.holding[20] = 0x41bc
  fake.holding[21] = 0x0000
  const typed = await call({ op: 'read', kind: 'holding', start: 20, count: 2, type: 'f32' })
  assert.equal(typed.status, 200)
  assert.equal(typed.json.rows.length, 1)
  assert.equal(typed.json.rows[0].text, '23.5')
  assert.equal(typed.json.rows[0].address, 20)
  assert.equal(typed.json.type, 'f32')
  assert.equal(typed.json.wordOrder, 'ABCD')

  // Scaling and word order are applied host-side, so panel and agent agree.
  const scaled = await call({
    op: 'read',
    kind: 'holding',
    start: 20,
    count: 2,
    type: 'f32',
    scale: 2,
    offset: -1,
  })
  assert.equal(scaled.json.rows[0].text, '46')
  const cdab = await call({ op: 'read', kind: 'holding', start: 20, count: 2, type: 'f32', wordOrder: 'CDAB' })
  assert.notEqual(cdab.json.rows[0].text, '23.5', 'the wrong word order must not decode to the same number')

  // A 32-bit read with an odd register count reports the leftover register.
  const trailing = await call({ op: 'read', kind: 'holding', start: 20, count: 3, type: 'u32' })
  assert.equal(trailing.json.trailing, 1)

  // Coils and discrete inputs read as booleans.
  const coils = await call({ op: 'read', kind: 'coil', start: 0, count: 10 })
  assert.deepEqual(coils.json.bits, fake.coils.slice(0, 10))
  const discrete = await call({ op: 'read', kind: 'discrete', start: 0, count: 10 })
  assert.deepEqual(discrete.json.bits, fake.discrete.slice(0, 10))

  // Bit toggling is a read-modify-write of a single holding register.
  fake.holding[30] = 0x0000
  const bitSet = await call({ op: 'write-bit', address: 30, bit: 4, value: 1 })
  assert.equal(bitSet.status, 200)
  assert.equal(bitSet.json.after, 0x0010)
  assert.equal(fake.holding[30], 0x0010)
  const bitClear = await call({ op: 'write-bit', address: 30, bit: 4, value: 0 })
  assert.equal(bitClear.json.after, 0x0000)
  assert.equal(fake.holding[30], 0x0000)

  // A value spanning two registers is written with FC16.
  const floatWrite = await call({ op: 'write', address: 32, value: 1.5, type: 'f32' })
  assert.equal(floatWrite.status, 200)
  assert.equal(floatWrite.json.count, 2)
  assert.deepEqual(fake.holding.slice(32, 34), [0x3fc0, 0x0000])

  // Coil writes and batch writes go through the same route.
  const coilWrite = await call({ op: 'write', kind: 'coil', address: 5, value: 1 })
  assert.equal(coilWrite.json.value, 1)
  assert.equal(fake.coils[5], true)
  const batch = await call({ op: 'write', address: 70, values: [11, 22, 33] })
  assert.equal(batch.json.count, 3)
  assert.deepEqual(fake.holding.slice(70, 73), [11, 22, 33])

  // Discrete inputs are read-only.
  const discreteWrite = await call({ op: 'write', kind: 'discrete', address: 1, value: 1 })
  assert.equal(discreteWrite.status, 400)
  assert.equal(discreteWrite.json.error.code, 'invalid-parameter')

  const badValue = await call({ op: 'write', address: 1, value: 70000 })
  assert.equal(badValue.status, 400)
  assert.equal(badValue.json.error.code, 'invalid-parameter')

  const exception = await call({ op: 'read', kind: 'holding', start: 250, count: 20 })
  assert.equal(exception.status, 502)
  assert.equal(exception.json.error.code, 'modbus-exception')

  const unknown = await call({ op: 'nope' })
  assert.equal(unknown.status, 400)

  const wrongMethod = (() => {
    const request = Readable.from([Buffer.from('{}')])
    request.method = 'GET'
    request.headers = {}
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
    return routes[0].handler(request, response).then(() => response)
  })()
  const methodResponse = await wrongMethod
  assert.equal(methodResponse.statusCode, 405)

  // The agent tool drives the same connection and core as the route.
  const tool = tools[0]
  const statusTool = await tool.execute({ action: 'status' }, {})
  assert.equal(statusTool.connected, true)
  assert.equal(statusTool.host, '127.0.0.1')

  const toolRead = await tool.execute({ action: 'read', kind: 'holding', start: 0, count: 3 }, {})
  assert.deepEqual(toolRead.values, fake.holding.slice(0, 3))
  assert.match(toolRead.summary, /holding registers 0\.\.2/)
  assert.deepEqual(tool.output.render({}, toolRead), [{ type: 'text', text: toolRead.summary }])

  const toolWrite = await tool.execute({ action: 'write', address: 12, value: 777 }, {})
  assert.equal(toolWrite.value, 777)
  assert.equal(fake.holding[12], 777)

  // The agent can read bits and typed registers, and toggle one bit.
  const toolBits = await tool.execute({ action: 'read', kind: 'coil', start: 0, count: 10 }, {})
  assert.deepEqual(toolBits.bits, fake.coils.slice(0, 10))
  assert.match(toolBits.summary, /coil 0\.\.9: 10 bit\(s\)/)
  assert.match(toolBits.summary, /on: /)

  const toolTyped = await tool.execute({ action: 'read', start: 20, count: 2, type: 'f32' }, {})
  assert.equal(toolTyped.rows[0].text, '23.5')
  assert.match(toolTyped.summary, /\(f32 ABCD\)/)
  assert.match(toolTyped.summary, /address\traw\tvalue/)

  const toolBit = await tool.execute({ action: 'write-bit', address: 30, bit: 0, value: 1 }, {})
  assert.equal(toolBit.after, 1)
  assert.match(toolBit.summary, /set bit 0 of holding register 30/)

  const toolBatch = await tool.execute({ action: 'write', address: 80, values: [7, 8] }, {})
  assert.match(toolBatch.summary, /wrote 2 register\(s\) from 80/)

  const toolFloat = await tool.execute({ action: 'write', address: 90, value: -0.5, type: 'f32' }, {})
  assert.match(toolFloat.summary, /\(f32 ABCD\)/)
  assert.deepEqual(fake.holding.slice(90, 92), [0xbf00, 0x0000])

  // Discrete inputs cannot be written, and a bad bit index is refused.
  await assert.rejects(() => tool.execute({ action: 'write', kind: 'discrete', address: 1, value: 1 }, {}), /invalid-parameter/)
  await assert.rejects(() => tool.execute({ action: 'write-bit', address: 1, bit: 16, value: 1 }, {}), /invalid-parameter/)

  // watch returns as soon as the value matches.
  fake.holding[41] = 7
  const watchNow = await tool.execute({ action: 'watch', start: 41, expect: 7, timeoutMs: 1000 }, {})
  assert.equal(watchNow.matched, true)
  assert.equal(watchNow.attempts, 1)
  assert.match(watchNow.summary, /matched 7/)

  // watch keeps polling when the value arrives late.
  globalThis.setTimeout(() => {
    fake.holding[42] = 9
  }, 120)
  const watchLater = await tool.execute(
    { action: 'watch', start: 42, expect: 9, timeoutMs: 2000, intervalMs: 50 },
    {},
  )
  assert.equal(watchLater.matched, true)
  assert.ok(watchLater.attempts >= 2, `expected repeated polls, got ${watchLater.attempts}`)
  assert.ok(watchLater.elapsedMs >= 100)

  // watch compares the scaled engineering value, not the raw register.
  fake.holding[43] = 235
  const watchScaled = await tool.execute({ action: 'watch', start: 43, expect: 23.5, scale: 0.1 }, {})
  assert.equal(watchScaled.matched, true)

  // watch on a coil compares 0/1.
  fake.coils[10] = true
  const watchCoil = await tool.execute({ action: 'watch', kind: 'coil', start: 10, expect: 1 }, {})
  assert.equal(watchCoil.matched, true)

  // A value that never arrives reports a timeout instead of hanging.
  const watchTimeout = await tool.execute(
    { action: 'watch', start: 41, expect: 999, timeoutMs: 400, intervalMs: 50 },
    {},
  )
  assert.equal(watchTimeout.matched, false)
  assert.ok(watchTimeout.attempts >= 2)
  assert.ok(watchTimeout.elapsedMs >= 400)
  assert.match(watchTimeout.summary, /expected 999/)
  await assert.rejects(() => tool.execute({ action: 'watch', start: 41 }, {}), /expect/)

  // A dropped socket is reported honestly, then reopened on the next action.
  fake.dropConnections()
  await new Promise((resolve) => setTimeout(resolve, 100))
  const dropped = await call({ op: 'status' })
  assert.equal(dropped.json.connected, false, 'a dead socket must not look connected')
  const resumed = await call({ op: 'read', kind: 'holding', start: 0, count: 2 })
  assert.equal(resumed.status, 200)
  assert.equal(resumed.json.reconnected, true)
  assert.deepEqual(resumed.json.values, fake.holding.slice(0, 2))

  // The agent sees the same reopen, in the summary as well as the field.
  fake.dropConnections()
  await new Promise((resolve) => setTimeout(resolve, 100))
  const toolResumed = await tool.execute({ action: 'read', start: 0, count: 1 }, {})
  assert.equal(toolResumed.reconnected, true)
  assert.match(toolResumed.summary, /^\(reconnected\)/)

  // After an explicit disconnect the target is forgotten: no silent reopen.
  const afterDisconnect = await tool.execute({ action: 'disconnect' }, {})
  assert.equal(afterDisconnect.connected, false)
  const refused = await call({ op: 'read', kind: 'holding', start: 0, count: 1 })
  assert.equal(refused.status, 409)
  assert.equal(refused.json.error.code, 'not-connected')
  const reconnected = await call({ op: 'connect', host: '127.0.0.1', port, unitId: 1 })
  assert.equal(reconnected.json.connected, true)

  await assert.rejects(() => tool.execute({ action: 'read', start: 1, count: 0 }, {}), /invalid-parameter/)
  await assert.rejects(() => tool.execute({ action: 'bogus' }, {}), /unknown action/)

  const toolDisconnect = await tool.execute({ action: 'disconnect' }, {})
  assert.equal(toolDisconnect.connected, false)
  await assert.rejects(() => tool.execute({ action: 'read', start: 0, count: 1 }, {}), /not-connected/)

  const disconnected = await call({ op: 'disconnect' })
  assert.equal(disconnected.status, 200)
  assert.equal(disconnected.json.connected, false)
  assert.deepEqual(await call({ op: 'read', kind: 'holding', start: 0, count: 1 }).then((r) => r.status), 409)

  // Disposing the plugin closes the socket with no pending work.
  for (const dispose of effects) dispose()
  console.log('host: all assertions passed')
} finally {
  for (const dispose of effects) dispose()
  await fake.close()
}
