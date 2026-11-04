/**
 * Panel render test: drives the real client module through a minimal hook
 * runtime with a stubbed fetch, so type/bit/coil/preset code paths actually
 * execute instead of only being parsed.
 *
 * Run with: node modbus-poll-tests/render.test.mjs
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

function reply(payload) {
  return { ok: true, status: 200, json: async () => payload }
}

globalThis.fetch = async (_url, init) => {
  const body = JSON.parse(init.body)
  requests.push(body)
  if (body.op === 'status') {
    return reply({ ok: true, connected: false })
  }
  if (body.op === 'connect') {
    return reply({ ok: true, connected: true, host: body.host, port: body.port, unitId: body.unitId })
  }
  if (body.op === 'disconnect') {
    return reply({ ok: true, connected: false })
  }
  if (body.op === 'write-bit') {
    return reply({ ok: true, address: body.address, bit: body.bit, before: 0, after: 1 << body.bit })
  }
  if (body.op === 'write') {
    return reply({ ok: true, address: body.address, value: body.value, values: [body.value] })
  }
  if (body.op === 'read') {
    const count = body.count
    if (body.kind === 'coil' || body.kind === 'discrete') {
      const bits = Array.from({ length: count }, (_, index) => index % 3 === 0)
      return reply({ ok: true, kind: body.kind, start: body.start, count, bits, latencyMs: 1 })
    }
    const rows = Array.from({ length: count }, (_, index) => ({
      index,
      address: body.start + index,
      raw: [100 + index],
      numeric: 100 + index,
      value: 100 + index,
      text: String(100 + index),
    }))
    return reply({ ok: true, kind: body.kind, start: body.start, count, values: rows.map((row) => row.numeric), rows, latencyMs: 1 })
  }
  throw new Error(`unexpected op ${body.op}`)
}

await import('../modbus-poll/client.js')
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
      // Effects run after render, exactly once per dependency change.
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

const settle = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0))
  return flush()
}

// Mount.
let tree = flush(panel)
assert.ok(tree, 'panel renders')
assert.ok(findAll(tree, (node) => node.type === 'table').length === 0, 'no table before data')
assert.ok(storage.get('dsh.modbus-poll/v1'), 'settings persisted on mount')

// Connect and read the default holding block.
const connectButton = byText(tree, 'poll.connect')[0]
assert.ok(connectButton, 'connect button rendered')
await connectButton.props.onClick()
tree = await settle()
assert.ok(requests.some((body) => body.op === 'connect'), 'connect request sent')
assert.ok(requests.some((body) => body.op === 'read' && body.kind === 'holding'), 'holding read sent')

// The default view asks for 16 registers: one header row plus 16 data rows.
let tableRows = findAll(tree, (node) => node.type === 'tr')
assert.equal(tableRows.length, 17, 'header + 16 rows')
assert.ok(
  findAll(tree, (node) => node.type === 'button' && node.props.title === 'bit 15').length === 16,
  '16 bit buttons per register row',
)

// Toggle bit 3 of the first register through the real handler.
const bitButton = findAll(tree, (node) => node.type === 'button' && node.props.title === 'bit 3')[0]
await bitButton.props.onClick()
tree = await settle()
const bitWrite = requests.filter((body) => body.op === 'write-bit').at(-1)
assert.ok(bitWrite, 'bit write sent')
assert.deepEqual({ address: bitWrite.address, bit: bitWrite.bit }, { address: 0, bit: 3 })

// Switch the table to coils and read again.
const kindSelect = findAll(tree, (node) => node.type === 'select' && node.props.value === 'holding')[0]
assert.ok(kindSelect, 'kind select rendered')
kindSelect.props.onChange({ target: { value: 'coil' } })
tree = await settle()
const readButton = byText(tree, 'poll.read')[0]
await readButton.props.onClick()
tree = await settle()
assert.ok(requests.some((body) => body.op === 'read' && body.kind === 'coil'), 'coil read sent')
tableRows = findAll(tree, (node) => node.type === 'tr')
assert.equal(tableRows.length, 17, 'coil header + 16 rows')
assert.ok(
  findAll(tree, (node) => node.type === 'button' && node.props.children === 'poll.toggle').length === 16,
  'one toggle button per coil',
)

// Switch to a float view: 16 registers become 8 rows, and the write box is enabled.
kindSelect.props.onChange({ target: { value: 'holding' } })
tree = await settle()
const typeSelect = findAll(tree, (node) => node.type === 'select' && node.props.value === 'u16')[0]
assert.ok(typeSelect, 'type select rendered')
typeSelect.props.onChange({ target: { value: 'f32' } })
tree = await settle()
await byText(tree, 'poll.read')[0].props.onClick()
tree = await settle()
const typedRead = requests.filter((body) => body.op === 'read' && body.kind === 'holding').at(-1)
assert.equal(typedRead.type, 'f32', 'type forwarded to the host')

// Saving a preset writes a named device entry.
const saveButton = byText(tree, 'poll.presetSave')[0]
saveButton.props.onClick()
tree = await settle()
const saved = JSON.parse(storage.get('dsh.modbus-poll/v1'))
assert.equal(saved.profiles.length, 1, 'one saved device')
assert.match(saved.profiles[0].name, /127\.0\.0\.1:502/)

// Disconnect clears the table.
await byText(tree, 'poll.disconnect')[0].props.onClick()
tree = await settle()
assert.equal(findAll(tree, (node) => node.type === 'tr').length, 0, 'table cleared on disconnect')

console.log('render: all assertions passed')
