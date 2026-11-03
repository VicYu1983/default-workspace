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
