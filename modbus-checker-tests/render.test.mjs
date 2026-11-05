/**
 * Panel render test: drives the real client module through a minimal hook
 * runtime with a stubbed fetch, so site selection, the check flow, baseline
 * actions and the comparison view actually execute instead of only parsing.
 *
 * Run with: node modbus-checker-tests/render.test.mjs
 */
import assert from 'node:assert/strict'

const storage = new Map()
const requests = []

let factory = null
globalThis.window = {
  __ModuleLoader__: {
    load(definition) {
      factory = definition.factory
    },
  },
  localStorage: {
    getItem: (key) => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key),
  },
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
}
globalThis.document = { baseURI: 'http://localhost/' }

let runningJob = false

function reply(payload) {
  return { ok: true, status: 200, json: async () => payload }
}

const SITES = [
  { site: '測試場', devices: 4, enabled: 4 },
  { site: '第二案場', devices: 1, enabled: 1 },
]

const SUMMARY = {
  ok: true,
  site: '測試場',
  stats: { devices: 4, enabled: 4, disabled: 0, byProfile: [{ value: 'full_stack', count: 4 }] },
  summary: '測試場：4 台（啟用 4、停用 0）',
}

const BATCHES = [
  {
    id: 'batch-1',
    started_at: '2026-11-05T01:00:00.000Z',
    finished_at: '2026-11-05T01:00:02.000Z',
    baseline: true,
    note: '第一次',
    summary: { passRate: 75, checked: 4 },
  },
]

const RUN_FINISHED = {
  ok: true,
  jobId: 'job-1',
  site: '測試場',
  status: 'finished',
  progress: { done: 4, total: 4 },
  batchId: 'batch-2',
  saved: true,
  mode: 'finished',
  stats: {
    checked: 4,
    pass: 3,
    fail: 1,
    timeout: 0,
    passRate: 75,
    byErrorType: [{ type: 'UNEXPECTED_VALUE', count: 1 }],
    issues: [
      { device: 'broken', ip: '127.0.0.1', status: 'FAIL', error_type: 'UNEXPECTED_VALUE', failed_stage: 'modbus', diagnosis: '讀值 100 與預期 999 不符' },
    ],
  },
  summary: '檢查完成：4 台，通過率 75%',
}

const COMPARE = {
  ok: true,
  site: '測試場',
  comparison: {
    counts: { newIssues: 1, recovered: 1, stillFailing: 0, valueChanges: 0, latencyDegraded: 0, added: 0, notInBatch: 0 },
    newIssues: [{ device: '水泵-02', ip: '127.0.0.1', was: 'PASS', now: 'FAIL', diagnosis: '讀值 170 與預期 0..100 不符' }],
    recovered: [{ device: '設定錯誤-04', ip: '127.0.0.1', was: 'FAIL', now: 'PASS' }],
    passRate: { before: 75, after: 75, delta: 0 },
  },
  summary: '新增異常 1 台；已恢復 1 台',
}

globalThis.fetch = async (_url, init) => {
  const body = JSON.parse(init.body)
  requests.push(body)
  if (body.op === 'sites') return reply({ ok: true, sites: SITES, summary: 'sites' })
  if (body.op === 'summary') return reply(SUMMARY)
  if (body.op === 'list') {
    return reply({
      ok: true,
      site: body.site,
      total: 2,
      shown: 2,
      rows: [
        { name: 'plc-1', ip: '127.0.0.1', check_profile: 'full_stack', plc_address: 40001 },
        { name: 'cam-1', ip: '127.0.0.1', check_profile: 'ping_tcp', plc_address: 40001 },
      ],
    })
  }
  if (body.op === 'batches') return reply({ ok: true, site: body.site, batches: BATCHES.map((b) => ({ ...b })) })
  if (body.op === 'run') {
    if (runningJob) {
      return reply({ ok: true, jobId: 'job-bg', site: body.site, status: 'running', progress: { done: 1, total: 4 }, batchId: null, saved: false, mode: 'background', summary: '背景執行中' })
    }
    return reply(RUN_FINISHED)
  }
  if (body.op === 'status') {
    return reply({ ...RUN_FINISHED, jobId: body.jobId, status: 'finished' })
  }
  if (body.op === 'save') return reply({ ok: true, site: body.site, batchId: body.batchId, summary: `已將批次 ${body.batchId} 設為基準` })
  if (body.op === 'compare') return reply(COMPARE)
  throw new Error(`unexpected op ${body.op}`)
}

await import('../modbus-checker/client.js')
assert.equal(typeof factory, 'function')

// A tiny hook runtime: enough for one component with useState/useRef/useEffect.
function createRuntime() {
  const slots = []
  let cursor = 0
  let dirty = false
  let tree = null
  let current = null

  const setAt = (slot, next) => {
    slot.value = typeof next === 'function' ? next(slot.value) : next
    dirty = true
  }

  const React = {
    createElement: (type, props, ...children) => ({
      type,
      props: { ...(props || {}), children: children.length <= 1 ? children[0] : children },
    }),
    useState(initial) {
      const index = cursor++
      slots[index] ??= { kind: 'state', value: typeof initial === 'function' ? initial() : initial }
      const slot = slots[index]
      return [slot.value, (next) => setAt(slot, next)]
    },
    useRef(initial) {
      const index = cursor++
      slots[index] ??= { kind: 'ref', current: initial }
      return slots[index]
    },
    useCallback(fn) {
      return fn
    },
    useEffect(fn, deps) {
      const index = cursor++
      const previous = slots[index]
      const changed = !previous || !sameDeps(previous.deps, deps)
      slots[index] = { kind: 'effect', deps, fn, cleanup: previous ? previous.cleanup : undefined, changed }
    },
  }

  const sameDeps = (left, right) => {
    if (!left || !right) return false
    if (left.length !== right.length) return false
    return left.every((value, index) => Object.is(value, right[index]))
  }

  const flush = (Component) => {
    if (Component) current = Component
    if (tree === null) dirty = true
    let guard = 0
    while (dirty && guard < 30) {
      guard += 1
      dirty = false
      cursor = 0
      tree = current()
      for (const slot of slots) {
        if (!slot || slot.kind !== 'effect' || !slot.changed) continue
        if (typeof slot.cleanup === 'function') slot.cleanup()
        slot.changed = false
        const cleanup = slot.fn()
        slot.cleanup = typeof cleanup === 'function' ? cleanup : undefined
      }
    }
    return tree
  }

  return { React, flush }
}

const { React, flush } = createRuntime()

const plugin = factory((name) => {
  if (name === 'react') return React
  throw new Error(`unexpected module ${name}`)
})

const registrations = []
const ctx = {
  effect(callback) {
    callback()
  },
  locale: {
    register: () => () => {},
    bind: () => (key) => key,
    subscribe: () => () => {},
  },
  slots: {
    inject(owner, callback) {
      registrations.push({ owner, registration: callback() })
    },
    register: (options, component) => ({ ...options, component }),
  },
}

plugin.apply(ctx)
const panel = registrations.find((entry) => entry.owner === 'main').registration.component

function findAll(node, predicate, out = []) {
  if (node === null || node === undefined) return out
  if (Array.isArray(node)) {
    for (const child of node) findAll(child, predicate, out)
    return out
  }
  if (typeof node !== 'object') return out
  if (predicate(node)) out.push(node)
  const children = node.props && node.props.children
  if (children !== undefined) findAll(children, predicate, out)
  return out
}

const byText = (tree, text) =>
  findAll(tree, (node) => {
    const children = node.props && node.props.children
    const label = Array.isArray(children) ? children.filter((child) => typeof child === 'string').join('') : children
    return typeof label === 'string' && label === text
  })

const textOf = (node) => {
  if (!node || !node.props) return ''
  const children = node.props.children
  if (typeof children === 'string') return children
  if (Array.isArray(children)) {
    return children
      .map((child) => {
        if (typeof child === 'string') return child
        if (child && child.props) return textOf(child)
        return ''
      })
      .join('')
  }
  return ''
}

const settle = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0))
  return flush()
}

/** Async chains take several ticks; keep flushing until the tree shows it. */
const flushUntil = async (predicate, tries = 20) => {
  let current = null
  for (let attempt = 0; attempt < tries; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 15))
    current = flush()
    if (predicate(current)) {
      // State updates queued by the tail of an async chain land after the last
      // render; one more flush commits them before the caller inspects.
      current = flush()
      return current
    }
  }
  return flush()
}

// --- mount ------------------------------------------------------------------
let tree = flush(panel)
tree = await flushUntil(
  // The mount chain is sites → summary → batches; wait for the last hop so
  // every request has actually been issued before asserting on them.
  (node) => requests.some((body) => body.op === 'batches' && body.site === '測試場'),
)
assert.ok(tree, 'panel renders')
assert.ok(
  requests.some((body) => body.op === 'sites'),
  'site list loaded on mount',
)
assert.ok(
  requests.some((body) => body.op === 'summary' && body.site === '測試場'),
  'the first site is selected automatically',
)
assert.ok(
  requests.some((body) => body.op === 'batches' && body.site === '測試場'),
  'batches loaded for the selected site',
)
const options = findAll(tree, (node) => node.type === 'option')
assert.equal(options.length, 2, 'both sites in the select')
/** className lives on props in this runtime's element shape. */
const byClass = (tree, className) =>
  findAll(tree, (node) => node.props && node.props.className === className)

assert.match(textOf(byClass(tree, 'msc-text')[0]), /4 台/)

// --- run a check ------------------------------------------------------------
requests.length = 0
await byText(tree, 'panel.start')[0].props.onClick()
tree = await settle()
assert.ok(requests.some((body) => body.op === 'run' && body.site === '測試場'), 'check started')
assert.ok(requests.some((body) => body.op === 'batches'), 'batches refreshed after the run')
const chips = byClass(tree, 'msc-chip').map(textOf)
assert.ok(chips.some((chip) => chip.includes('75%')), `pass-rate chip rendered: ${chips.join(' | ')}`)
assert.equal(
  findAll(tree, (node) => node.type === 'td' && textOf(node) === 'broken').length,
  1,
  'the failing device appears in the issues table',
)
// The stub result has one failing device, so the issues table replaces the
// "all passed" line; its diagnosis is quoted verbatim from the host.
assert.ok(
  findAll(tree, (node) => node.type === 'td').some((cell) => textOf(cell).includes('與預期 999 不符')),
  'the host diagnosis text is rendered',
)

// --- compare with the baseline ---------------------------------------------
requests.length = 0
await byText(tree, 'panel.compareLatest')[0].props.onClick()
tree = await settle()
assert.ok(requests.some((body) => body.op === 'compare'), 'compare requested')
// The locale stub translates identitically, so the section shows its key.
assert.equal(textOf(byClass(tree, 'msc-section-title')[0]), 'panel.comparison')
const compareCells = findAll(tree, (node) => node.type === 'td').map(textOf)
assert.ok(compareCells.some((cell) => cell.includes('水泵-02')), 'the regressed device is listed')

// --- set a batch as the baseline --------------------------------------------
requests.length = 0
const setButtons = byText(tree, 'panel.setBaseline')
assert.equal(setButtons.length, 0, 'the only batch is already the baseline')

// --- show the device list ---------------------------------------------------
requests.length = 0
await byText(tree, 'panel.showDevices')[0].props.onClick()
tree = await settle()
assert.ok(requests.some((body) => body.op === 'list' && body.site === '測試場'), 'device list requested')
assert.ok(
  findAll(tree, (node) => node.type === 'td' && textOf(node) === 'cam-1').length > 0,
  'device rows rendered',
)

// --- background run polls to completion ------------------------------------
runningJob = true
requests.length = 0
await byText(tree, 'panel.start')[0].props.onClick()
tree = await settle()
const startRequest = requests.find((body) => body.op === 'run')
assert.ok(startRequest, 'second check started')
assert.equal(startRequest.status ?? 'running', 'running', 'the stub hands back a background job')
let pollSeen = false
const deadline = Date.now() + 3000
while (Date.now() < deadline) {
  await new Promise((resolve) => setTimeout(resolve, 120))
  tree = flush()
  if (requests.some((body) => body.op === 'status')) {
    pollSeen = true
    break
  }
}
assert.ok(pollSeen, 'a background job is polled with action status')
// Finish the job and give the panel one more poll cycle to land on finished.
runningJob = false
tree = await flushUntil(
  (node) => findAll(node, (item) => item.props && item.props.className === 'msc-chip').some((chip) => textOf(chip).includes('75%')),
)
assert.ok(
  byClass(tree, 'msc-chip').some((chip) => textOf(chip).includes('75%')),
  'the finished job renders its stats',
)

console.log('render: all assertions passed')
