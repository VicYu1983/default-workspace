/**
 * Host-half test: mounts the plugin against a minimal Cordis-like context and
 * drives its route handler and agent tool. Run with:
 *   node netscanner-tests/host.test.mjs
 */
import assert from 'node:assert/strict'
import net from 'node:net'
import { Readable } from 'node:stream'
import { apply } from '../netscanner/index.js'

const server = net.createServer((socket) => socket.end())
const port = await new Promise((resolve, reject) => {
  server.once('error', reject)
  server.listen(0, '127.0.0.1', () => {
    server.removeListener('error', reject)
    resolve(server.address().port)
  })
})

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
assert.equal(routes[0].path, '/netscanner/api')
assert.equal(routes[0].kind, 'exact')
assert.equal(tools.length, 1, 'one tool registered')
assert.equal(tools[0].name, 'net_scan')
assert.deepEqual(tools[0].parameters.required, ['action'])
assert.ok(tools[0].parameters.properties.action.enum.includes('scan'))

function response() {
  const reply = {
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
  return reply
}

async function call(payload, method = 'POST') {
  const request = Readable.from([Buffer.from(JSON.stringify(payload), 'utf8')])
  request.method = method
  request.headers = { 'content-type': 'application/json' }
  const reply = response()
  await routes[0].handler(request, reply)
  return { status: reply.statusCode, json: JSON.parse(reply.body) }
}

async function waitForScan() {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const status = await call({ op: 'status' })
    if (!status.json.running) return status.json
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  throw new Error('scan did not finish in time')
}

try {
  const idle = await call({ op: 'status' })
  assert.equal(idle.status, 200)
  assert.equal(idle.json.running, false)
  assert.equal(idle.json.phase, 'idle')

  const interfaces = await call({ op: 'interfaces' })
  assert.equal(interfaces.status, 200)
  assert.ok(Array.isArray(interfaces.json.interfaces))

  const started = await call({
    op: 'start',
    cidr: '127.0.0.1/32',
    ports: [port],
    timeoutMs: 800,
    concurrency: 1,
    resolveNames: false,
  })
  assert.equal(started.status, 200)
  assert.equal(started.json.cidr, '127.0.0.1/32')
  assert.equal(started.json.total, 1)

  const finished = await waitForScan()
  assert.equal(finished.phase, 'complete')
  assert.equal(finished.aliveCount, 1)
  assert.deepEqual(finished.results[0].ports, [port])

  const bad = await call({ op: 'start', cidr: 'not-a-network' })
  assert.equal(bad.status, 400)
  assert.equal(bad.json.error.code, 'invalid-target')

  const badPort = await call({ op: 'start', cidr: '127.0.0.1/32', ports: [0] })
  assert.equal(badPort.status, 400)
  assert.equal(badPort.json.error.code, 'invalid-parameter')

  const getReply = response()
  const getRequest = Readable.from([])
  getRequest.method = 'GET'
  getRequest.headers = {}
  await routes[0].handler(getRequest, getReply)
  assert.equal(getReply.statusCode, 405)

  const tool = tools[0]
  const toolScan = await tool.execute(
    { action: 'scan', cidr: '127.0.0.1/32', ports: [port], resolveNames: false },
    {},
  )
  assert.equal(toolScan.running, false)
  assert.equal(toolScan.aliveCount, 1)
  assert.deepEqual(toolScan.hosts[0].ports, [port])
  assert.match(toolScan.summary, /scanned 127\.0\.0\.1\/32: 1\/1 host/)
  assert.deepEqual(tool.output.render({}, toolScan), [{ type: 'text', text: toolScan.summary }])

  const toolStatus = await tool.execute({ action: 'status' }, {})
  assert.equal(toolStatus.phase, 'complete')

  const toolInterfaces = await tool.execute({ action: 'interfaces' }, {})
  assert.ok(Array.isArray(toolInterfaces.interfaces))
  assert.match(toolInterfaces.summary, /127\.0\.0\.1|10\.|172\.|192\.168\./)

  const toolStop = await tool.execute({ action: 'stop' }, {})
  assert.equal(toolStop.running, false)
  assert.equal(toolStop.summary, 'no scan is running')

  await assert.rejects(() => tool.execute({ action: 'bogus' }, {}), /unknown action/)
  await assert.rejects(
    () => tool.execute({ action: 'scan', cidr: '192.168.1.0/16' }, {}),
    /too-many-hosts/,
  )

  for (const dispose of effects) dispose()
  console.log('host: all assertions passed')
} finally {
  for (const dispose of effects) dispose()
  await new Promise((resolve) => server.close(() => resolve()))
}
