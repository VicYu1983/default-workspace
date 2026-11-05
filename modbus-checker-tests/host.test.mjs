/**
 * Host-half test: mounts the plugin the way the Loader would and drives the
 * four agent tools end to end — list, check, save a baseline, break a device,
 * check again and compare against the baseline; then edit a site through
 * site_edit and the same ops over the panel's HTTP route.
 *
 * Run with: node modbus-checker-tests/host.test.mjs
 */
import assert from 'node:assert/strict'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { createFakeServer } from '../modbus-poll-tests/fake-server.mjs'

// The history store must be isolated per test run: point the plugin at a temp
// directory BEFORE its module loads (the defaults are read at import time).
const root = path.join(import.meta.dirname ?? '.', '.tmp-host')
process.env.DSH_MODBUS_CHECKER_DATA = path.join(root, 'data')
process.env.DSH_MODBUS_CHECKER_SITES = path.join(root, 'sites')

const { apply } = await import('../modbus-checker/index.js')
const sitesDir = path.join(root, 'sites')

function device(name, overrides = {}) {
  return {
    name,
    ip: '127.0.0.1',
    port: 502,
    unit_id: 1,
    address: 0,
    quantity: 2,
    function: '03',
    check_profile: 'full_stack',
    enabled: true,
    connect_timeout_ms: 800,
    response_timeout_ms: 500,
    ping_enabled: true,
    ping_attempts: 1,
    ping_timeout_ms: 300,
    ping_interval_ms: 200,
    tcp_check_enabled: true,
    tcp_timeout_ms: 500,
    skip_when_ping_failed: false,
    ...overrides,
  }
}

async function writeSite(fileName, siteName, devices) {
  await writeFile(
    path.join(sitesDir, fileName),
    JSON.stringify({ schema_version: 1, site_name: siteName, devices }, null, 2),
    'utf8',
  )
}

// --- minimal loader context -------------------------------------------------
import { Readable } from 'node:stream'

const routes = []
const tools = []
const effects = []
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
assert.equal(tools.length, 4, 'four agent tools registered')
const byName = new Map(tools.map((tool) => [tool.name, tool]))
assert.deepEqual([...byName.keys()].sort(), ['site_baseline', 'site_check', 'site_devices', 'site_edit'])

// The DSH runner requires output { schema, render }: a missing render fails
// the whole plugin at activation, so pin the contract here.
for (const tool of tools) {
  assert.ok(tool.output, `${tool.name} declares output`)
  assert.ok(tool.output.schema, `${tool.name} declares output.schema`)
  assert.equal(typeof tool.output.render, 'function', `${tool.name} declares output.render`)
}

// Mirror the runner's JSON-schema subset so a schema that activation would
// reject fails here first. Allowed keywords and the required/properties rule
// come from the runner's checkSchemaNode/checkObjectSchemaTail.
const ALLOWED_KEYWORDS = new Set([
  'type', 'oneOf', 'properties', 'required', 'additionalProperties', 'items', 'enum', 'const',
  'description', 'title', 'default', 'examples',
])
function assertSupportedSchema(schema, pathName = 'schema') {
  assert.ok(schema !== null && typeof schema === 'object' && !Array.isArray(schema), `${pathName} must be a schema object`)
  for (const key of Object.keys(schema)) {
    assert.ok(ALLOWED_KEYWORDS.has(key), `${pathName}.${key} is not a supported keyword`)
  }
  const hasType = Object.hasOwn(schema, 'type')
  const hasOneOf = Object.hasOwn(schema, 'oneOf')
  assert.ok(hasType || hasOneOf, `${pathName} requires type or oneOf`)
  assert.ok(!(hasType && hasOneOf), `${pathName} cannot declare both type and oneOf`)
  if (hasType) {
    assert.equal(typeof schema.type, 'string', `${pathName}.type must be a single type string`)
  }
  if (schema.type === 'object') {
    for (const key of schema.required ?? []) {
      assert.ok(schema.properties && key in schema.properties, `${pathName}.required names "${key}" which is not in properties`)
    }
    if (Object.hasOwn(schema, 'additionalProperties')) {
      assert.equal(typeof schema.additionalProperties, 'boolean', `${pathName}.additionalProperties must be a boolean`)
    }
    for (const [key, sub] of Object.entries(schema.properties ?? {})) {
      assertSupportedSchema(sub, `${pathName}.properties.${key}`)
    }
  }
  if (schema.type === 'array') {
    assert.ok(schema.items, `${pathName}.items is required by convention`)
    assertSupportedSchema(schema.items, `${pathName}.items`)
  }
  if (Object.hasOwn(schema, 'enum')) {
    assert.ok(!['object', 'array'].includes(schema.type), `${pathName}.enum is only supported on scalars`)
  }
}

for (const tool of tools) {
  assertSupportedSchema(tool.parameters, `${tool.name}.parameters`)
  assertSupportedSchema(tool.output.schema, `${tool.name}.output.schema`)
}

/** The runner rejects undeclared output fields, so pin the schemas here. */
function assertSchema(schema, value, pathName = 'result') {
  if (value === undefined) return
  const type = schema.type
  if (type === 'object') {
    assert.ok(value !== null && typeof value === 'object', `${pathName} must be an object`)
    for (const key of schema.required || []) assert.ok(key in value, `${pathName}.${key} is required`)
    for (const [key, item] of Object.entries(value)) {
      if (item === undefined) continue
      const sub = schema.properties && schema.properties[key]
      if (!sub) {
        assert.equal(schema.additionalProperties, true, `${pathName}.${key} is not declared in the output schema`)
        continue
      }
      assertSchema(sub, item, `${pathName}.${key}`)
    }
    return
  }
  if (type === 'array') {
    assert.ok(Array.isArray(value), `${pathName} must be an array`)
    value.forEach((item, index) => assertSchema(schema.items || {}, item, `${pathName}[${index}]`))
    return
  }
  if (type === 'string') return assert.equal(typeof value, 'string', `${pathName} must be a string`)
  if (type === 'boolean') return assert.equal(typeof value, 'boolean', `${pathName} must be a boolean`)
  if (type === 'integer') return assert.ok(Number.isInteger(value), `${pathName} must be an integer`)
  if (type === 'number') return assert.ok(Number.isFinite(value), `${pathName} must be a number`)
}

async function run(toolName, args) {
  const tool = byName.get(toolName)
  const result = await tool.execute(args ?? {}, {})
  assertSchema(tool.output.schema, result)
  assert.ok(typeof result.summary === 'string' && result.summary.length > 0, `${toolName} must quote a summary`)
  return result
}

const fake = createFakeServer({ size: 1024 })
const fakePort = await fake.listen()

try {
  await mkdir(sitesDir, { recursive: true })
  await writeSite('測試場.json', '測試場', [
    device('plc-1', { port: fakePort, expected: '100,107' }),
    device('cam-1', { port: fakePort, check_profile: 'ping_tcp', tcp_port: fakePort }),
    device('broken', { port: fakePort, expected: '999' }),
  ])
  await writeSite('第二案場.json', '第二案場', [device('s2-1', { port: fakePort })])

  // --- site_devices ---------------------------------------------------------
  const sites = await run('site_devices', { action: 'sites', sitesDir })
  assert.equal(sites.sites.length, 2)
  assert.match(sites.summary, /2 個案場/)

  const summary = await run('site_devices', { action: 'summary', site: '測試場', sitesDir })
  assert.equal(summary.stats.devices, 3)
  assert.equal(summary.stats.enabled, 3)
  assert.match(summary.summary, /測試場：3 台/)

  const listed = await run('site_devices', {
    action: 'list',
    site: '測試場',
    sitesDir,
    filter: { profile: 'ping_tcp' },
  })
  assert.deepEqual(listed.rows.map((row) => row.name), ['cam-1'])
  assert.equal(listed.rows[0].plc_address, 40001)

  const missing = await run('site_devices', { action: 'list', site: '測試場', sitesDir, devices: ['ghost'] })
  assert.deepEqual(missing.missing, ['ghost'])
  assert.equal(missing.total, 0)

  await assert.rejects(
    () => byName.get('site_devices').execute({ action: 'list', site: '鬼案場', sitesDir }, {}),
    (error) => error.message.includes('site-not-found'),
  )

  // --- site_check: wait for a small site ------------------------------------
  const first = await run('site_check', {
    action: 'run',
    site: '測試場',
    sitesDir,
    concurrency: 3,
    note: '第一次基準',
  })
  assert.equal(first.status, 'finished')
  assert.equal(first.progress.total, 3)
  assert.equal(first.saved, true)
  assert.ok(first.batchId)
  const firstSummary = first.stats
  assert.equal(firstSummary.pass, 2, `expected 2 passing, got ${JSON.stringify(firstSummary)}`)
  assert.equal(firstSummary.fail, 1, 'broken must fail on its expected value')
  assert.match(first.summary, /通過率 66\.7%/)

  // --- baseline: save, show, compare ---------------------------------------
  await run('site_baseline', { action: 'save', site: '測試場', batchId: first.batchId })
  const shown = await run('site_baseline', { action: 'show', site: '測試場' })
  assert.equal(shown.baseline.id, first.batchId)

  // The story changes: broken becomes good, plc-1 goes bad.
  await writeSite('測試場.json', '測試場', [
    device('plc-1', { port: fakePort, expected: '999' }),
    device('cam-1', { port: fakePort, check_profile: 'ping_tcp', tcp_port: fakePort }),
    device('broken', { port: fakePort, expected: '100,107' }),
  ])

  const second = await run('site_check', { action: 'run', site: '測試場', sitesDir, concurrency: 3 })
  assert.equal(second.status, 'finished')
  assert.equal(second.stats.pass, 2)
  assert.equal(second.stats.fail, 1)

  const comparison = await run('site_baseline', { action: 'compare', site: '測試場' })
  assert.equal(comparison.comparison.counts.newIssues, 1)
  assert.equal(comparison.comparison.newIssues[0].device, 'plc-1')
  assert.equal(comparison.comparison.counts.recovered, 1)
  assert.equal(comparison.comparison.recovered[0].device, 'broken')
  assert.match(comparison.summary, /新增異常 1 台/)
  assert.match(comparison.summary, /已恢復 1 台/)

  // --- auto-background for larger selections -------------------------------
  const crowd = Array.from({ length: 30 }, (_, index) => device(`crowd-${String(index).padStart(2, '0')}`, { port: fakePort }))
  await writeSite('大批次.json', '大批次', crowd)
  const background = await run('site_check', { action: 'run', site: '大批次', sitesDir, concurrency: 8 })
  assert.equal(background.status, 'running', 'runs over 25 devices must not block the call')
  assert.ok(background.jobId)

  let job = null
  for (let attempt = 0; attempt < 100; attempt += 1) {
    job = await run('site_check', { action: 'status', jobId: background.jobId })
    if (job.status !== 'running') break
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  assert.equal(job.status, 'finished')
  assert.equal(job.progress.done, 30)
  assert.equal(job.progress.total, 30)
  assert.equal(job.stats.checked, 30)
  assert.ok(job.batchId, 'the background batch is saved too')

  await assert.rejects(
    () => byName.get('site_check').execute({ action: 'status', jobId: 'nope' }, {}),
    (error) => error.message.includes('job-not-found'),
  )

  await assert.rejects(
    () => byName.get('site_check').execute({ action: 'run', site: '測試場', sitesDir, devices: ['ghost'] }, {}),
    (error) => error.message.includes('no-devices'),
  )

  // --- baseline bookkeeping ------------------------------------------------
  const batches = await run('site_baseline', { action: 'batches', site: '測試場' })
  assert.equal(batches.batches.length, 2)
  assert.equal(batches.batches.find((batch) => batch.id === first.batchId).baseline, true)

  const cleared = await run('site_baseline', { action: 'clear', site: '測試場' })
  assert.match(cleared.summary, /已清除/)
  await assert.rejects(
    () => byName.get('site_baseline').execute({ action: 'compare', site: '測試場' }, {}),
    (error) => error.message.includes('no-baseline'),
  )

  const reSaved = await run('site_baseline', { action: 'save', site: '測試場' })
  assert.ok(reSaved.batchId, 'saving without a batch id takes the newest one')

  // Deleting the baseline batch is refused; the newest non-baseline one is not.
  const refuse = await byName.get('site_baseline').execute({ action: 'batches', site: '測試場' }, {})
  assert.ok(refuse.batches.some((batch) => batch.baseline))

  // --- site JSON stays desktop-compatible ----------------------------------
  const written = JSON.parse(await readFile(path.join(sitesDir, '測試場.json'), 'utf8'))
  assert.equal(written.schema_version, 1)
  assert.equal(written.site_name, '測試場')
  assert.equal(written.devices.length, 3)
  assert.equal(written.devices[0].name, 'plc-1')

  // --- no site argument with several sites is a clear error ----------------
  await assert.rejects(
    () => byName.get('site_devices').execute({ action: 'summary', sitesDir }, {}),
    (error) => error.message.includes('site-required'),
  )
  const single = path.join(root, 'single')
  await mkdir(single, { recursive: true })
  await writeSite(path.join('..', 'single', '唯一.json').replace(/\\/g, '/'), '唯一', [device('only', { port: fakePort })])
  const auto = await run('site_devices', { action: 'summary', sitesDir: single })
  assert.equal(auto.stats.site, '唯一', 'a directory with exactly one site needs no site argument')

  // --- the same ops over HTTP, the way the panel calls them -----------------
  assert.equal(routes.length, 1, 'one HTTP route registered')
  const route = routes[0]
  assert.equal(route.path, '/modbus-checker/api')
  assert.equal(typeof route.handler, 'function')

  function makeResponse() {
    return {
      statusCode: 0,
      headers: {},
      body: '',
      setHeader(name, value) {
        this.headers[name.toLowerCase()] = value
      },
      end(payload) {
        this.body = payload ?? ''
      },
    }
  }

  async function callRoute(op, extra = {}, { method = 'POST', connection } = {}) {
    const payload = Buffer.from(JSON.stringify({ op, ...extra }), 'utf8')
    const request = Readable.from([payload])
    request.method = method
    request.url = '/modbus-checker/api'
    request.headers = { 'content-type': 'application/json' }
    const response = makeResponse()
    const originalGet = ctx.get
    ctx.get = () => connection
    try {
      await route.handler(request, response)
    } finally {
      ctx.get = originalGet
    }
    return {
      status: response.statusCode,
      body: JSON.parse(response.body),
      contentType: response.headers['content-type'] ?? '',
    }
  }

  const sitesOverHttp = await callRoute('sites', { sitesDir })
  assert.equal(sitesOverHttp.status, 200)
  assert.ok(sitesOverHttp.body.ok, 'panel responses wrap in ok')
  assert.equal(sitesOverHttp.body.sites.length, 3, '測試場 + 第二案場 + 大批次')
  assert.match(sitesOverHttp.body.summary, /3 個案場/)
  assert.ok(sitesOverHttp.body.sites.some((entry) => entry.site === '測試場'))

  const runOverHttp = await callRoute('run', { site: '測試場', sitesDir, concurrency: 3 })
  assert.equal(runOverHttp.status, 200)
  assert.equal(runOverHttp.body.status, 'finished')
  assert.equal(runOverHttp.body.stats.pass, 2)

  const compareOverHttp = await callRoute('compare', { site: '測試場' })
  assert.equal(compareOverHttp.status, 200)
  assert.ok(compareOverHttp.body.comparison)

  const badOp = await callRoute('ghost', {})
  assert.equal(badOp.status, 400)
  assert.equal(badOp.body.ok, false)
  assert.equal(badOp.body.error.code, 'invalid-op')

  const noBaselineAfterResave = await callRoute('batches', { site: '測試場' })
  assert.equal(noBaselineAfterResave.status, 200)
  assert.ok(noBaselineAfterResave.body.batches.length >= 3)

  const wrongMethod = await callRoute('sites', { sitesDir }, { method: 'GET' })
  assert.equal(wrongMethod.status, 405)

  const rejected = await callRoute('sites', { sitesDir }, { connection: { requestRejection: () => 403 } })
  assert.equal(rejected.status, 403)
  assert.equal(rejected.body.error.code, 'unauthorized')

  // --- site_edit: the editor ops through the tool and through the route -----
  const edited = await run('site_edit', { action: 'read', site: '測試場', sitesDir })
  assert.equal(edited.devices.length, 3)
  assert.equal(edited.devices[0].name, 'plc-1')
  assert.equal(edited.devices[0].plc_address, 40001, 'read returns normalized rows for the editor')

  const created = await run('site_edit', {
    action: 'save',
    site: '編輯場',
    sitesDir,
    devices: [{ name: 'ed-1', ip: '127.0.0.1', port: fakePort, function: '03', expected: '100,107' }],
  })
  assert.equal(created.devices, 1)
  const createdSummary = await run('site_devices', { action: 'summary', site: '編輯場', sitesDir })
  assert.equal(createdSummary.stats.devices, 1)
  const createdFile = JSON.parse(await readFile(path.join(sitesDir, '編輯場.json'), 'utf8'))
  assert.ok(!('plc_address' in createdFile.devices[0]), 'the derived plc_address is not written back')

  await assert.rejects(
    () => byName.get('site_edit').execute({ action: 'save', site: '編輯場', sitesDir, devices: [{ name: 'x', ip: '127.0.0.1' }] }, {}),
    (error) => error.message.includes('site-exists'),
  )

  const overwritten = await run('site_edit', {
    action: 'save',
    site: '編輯場',
    sitesDir,
    overwrite: true,
    devices: [
      { name: 'ed-1', ip: '127.0.0.1', port: fakePort, expected: '100,107' },
      { name: 'ed-off', ip: '127.0.0.1', port: fakePort, enabled: false },
    ],
  })
  assert.equal(overwritten.devices, 2)
  const enabledNow = await run('site_devices', { action: 'summary', site: '編輯場', sitesDir })
  assert.equal(enabledNow.stats.enabled, 1, 'a disabled row is kept and skipped by checks')

  const deleted = await run('site_edit', { action: 'delete', site: '編輯場', sitesDir })
  assert.equal(deleted.file, '編輯場.json')
  const afterDelete = await run('site_devices', { action: 'sites', sitesDir })
  assert.ok(!afterDelete.sites.some((entry) => entry.site === '編輯場'))
  await assert.rejects(
    () => byName.get('site_edit').execute({ action: 'delete', site: '編輯場', sitesDir }, {}),
    (error) => error.message.includes('site-not-found'),
  )

  const editorHttp = await callRoute('siteSave', {
    site: '面板場',
    sitesDir,
    devices: [{ name: 'p-1', ip: '127.0.0.1', port: fakePort }],
  })
  assert.equal(editorHttp.status, 200)
  assert.ok(editorHttp.body.ok)
  const conflictHttp = await callRoute('siteSave', { site: '面板場', sitesDir, devices: [{ name: 'p-2', ip: '127.0.0.1' }] })
  assert.equal(conflictHttp.status, 409)
  assert.equal(conflictHttp.body.error.code, 'site-exists')
  const readHttp = await callRoute('siteRead', { site: '面板場', sitesDir })
  assert.equal(readHttp.status, 200)
  assert.equal(readHttp.body.devices.length, 1)
  const deleteHttp = await callRoute('siteDelete', { site: '面板場', sitesDir })
  assert.equal(deleteHttp.status, 200)
  assert.match(deleteHttp.body.summary, /已刪除/)

} finally {
  for (const dispose of effects) dispose()
  await fake.close()
  await rm(root, { recursive: true, force: true })
}

console.log('host: all assertions passed')
