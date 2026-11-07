// End-to-end test for the css-style-library host half: tool + HTTP route over one dispatch.
import { apply, inject } from '../css-style-library/index.js'
import assert from 'node:assert'

const registeredTools = []
const registeredRoutes = []
const effects = []
const fakeCtx = {
  effect(fn) {
    const dispose = fn()
    effects.push(dispose)
    return dispose
  },
  tools: { register(def) { registeredTools.push(def) } },
  webServer: { register(route) { registeredRoutes.push(route) } },
  get(name) {
    if (name === 'connection') return undefined
    return undefined
  },
}

assert.deepEqual([...inject].sort(), ['tools', 'webServer'].sort())
apply(fakeCtx, {})
assert.equal(registeredTools.length, 1, 'one tool registered')
assert.equal(registeredRoutes.length, 1, 'one route registered')
const tool = registeredTools[0]
const handler = registeredRoutes[0].handler

let failures = 0
function check(name, condition, extra = '') {
  if (condition) console.log('OK  ', name)
  else { failures++; console.log('FAIL', name, extra) }
}

// 1. tool shape
check('tool name', tool.name === 'css_styles')
check('tool enum actions', JSON.stringify(tool.parameters.properties.action.enum) === '["list","get","create","update","delete"]')
check('tool render returns summary', (() => {
  const blocks = tool.output.render({}, { summary: 'x' })
  return blocks.length === 1 && blocks[0].type === 'text' && blocks[0].text === 'x'
})())

// 2. tool execute: list
const listed = await tool.execute({ action: 'list' })
check('list action works', listed.ok !== false && Array.isArray(listed.styles) && listed.styles.length > 0, JSON.stringify(listed).slice(0, 120))
check('list summary mentions count', listed.summary.includes('樣式庫共'))
check('list rows carry ids', listed.styles.every((s) => s.id.startsWith('st_')))
check('list hides css', listed.styles.every((s) => s.css === undefined))

// 3. tool execute: create → get → update → delete round trip
const made = await tool.execute({
  action: 'create',
  name: '測試卡片',
  css: '.test-card { background: teal; }',
  category: 'tests',
  tags: ['t1', 't2'],
  description: '測試用',
  previewHtml: '<div class="test-card">hi</div>',
})
check('create works', made.style && made.style.id.startsWith('st_'), JSON.stringify(made).slice(0, 200))
const got = await tool.execute({ action: 'get', id: made.style.id })
check('get returns css', got.style.css.includes('.test-card'))
check('get summary includes css', got.summary.includes('.test-card'))
const upd = await tool.execute({ action: 'update', id: made.style.id, description: '新的說明' })
check('update works', upd.style.description === '新的說明')
const del = await tool.execute({ action: 'delete', id: made.style.id })
check('delete works', del.deleted === made.style.id)

// 4. tool error surface carries the code
try {
  await tool.execute({ action: 'get', id: 'st_none' })
  check('get unknown surfaces code', false)
} catch (error) {
  check('get unknown surfaces code', String(error.message).startsWith('style-not-found:'))
}

// 5. invalid action/op
try {
  await tool.execute({ action: 'nope' })
  check('invalid action rejected', false)
} catch (error) {
  check('invalid action rejected', String(error.message).startsWith('invalid-action:'))
}

// 6. route: happy path POST
function fakeResponse() {
  return {
    statusCode: 0,
    headers: {},
    body: null,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v },
    end(payload) { this.body = payload },
  }
}
function fakeRequest(method, body) {
  const chunks = body === undefined ? [] : [Buffer.from(JSON.stringify(body), 'utf8')]
  return {
    method,
    on(event, cb) {
      if (event === 'data') for (const chunk of chunks) cb(chunk)
      if (event === 'end') cb()
    },
    destroy() {},
  }
}

const response = fakeResponse()
await handler(fakeRequest('POST', { op: 'list' }), response)
check('route POST list ok', response.statusCode === 200 && JSON.parse(response.body).ok === true)
check('route content type', response.headers['content-type'].includes('application/json'))

// 7. route: error mapping
const missResponse = fakeResponse()
await handler(fakeRequest('POST', { op: 'get', id: 'st_none' }), missResponse)
check('route 404 mapping', missResponse.statusCode === 404 && JSON.parse(missResponse.body).error.code === 'style-not-found')

// 8. route: bad json
const badResponse = fakeResponse()
await handler({ method: 'POST', on(event, cb) { if (event === 'data') cb(Buffer.from('{bad', 'utf8')); if (event === 'end') cb() }, destroy() {} }, badResponse)
check('route invalid json', badResponse.statusCode === 400)

// 9. route: method not allowed
const getResponse = fakeResponse()
await handler(fakeRequest('GET'), getResponse)
check('route rejects GET', getResponse.statusCode === 405)

// 10. route: unknown op
const opResponse = fakeResponse()
await handler(fakeRequest('POST', { op: 'nope' }), opResponse)
check('route unknown op', opResponse.statusCode === 400 && JSON.parse(opResponse.body).error.code === 'invalid-op')

// 11. trust boundary: connection.requestRejection present → rejected
const ctxWithGuard = {
  ...fakeCtx,
  get(name) {
    if (name === 'connection') return { requestRejection: () => 403 }
    return undefined
  },
}
const guardTools = []
const guardRoutes = []
ctxWithGuard.tools = { register(def) { guardTools.push(def) } }
ctxWithGuard.webServer = { register(route) { guardRoutes.push(route) } }
apply(ctxWithGuard, {})
const guardResponse = fakeResponse()
await guardRoutes[0].handler(fakeRequest('POST', { op: 'list' }), guardResponse)
check('route trust boundary', guardResponse.statusCode === 403 && JSON.parse(guardResponse.body).error.code === 'unauthorized')

// 12. disposers run without error
for (const dispose of effects) {
  if (typeof dispose === 'function') dispose()
}
check('disposers callable', true)

console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
