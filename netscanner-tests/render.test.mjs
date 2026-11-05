/**
 * Client render test: mounts the panel with a functional React shim, runs the
 * mount effects against stubbed fetch/localStorage, and asserts the form
 * renders. This catches render-time crashes that a plain registration test
 * cannot see — e.g. reading a renamed form field inside an effect.
 *
 * Run with: node netscanner-tests/render.test.mjs
 */
import assert from 'node:assert/strict'

let factory = null
let moduleId = null

globalThis.window = {
  __ModuleLoader__: {
    load(definition) {
      moduleId = definition.id
      factory = definition.factory
    },
  },
}

await import('../netscanner/client.js')

assert.equal(moduleId, '@local/dsh-plugin-netscanner')

/* ------------------------------------------------------------------ React shim */

let hookIndex = 0
let stateStore = []
let dirty = false
const effects = []
const runEffects = []

function createElement(type, props, ...children) {
  return {
    type,
    props: props ?? {},
    children: children
      .flat(Infinity)
      .filter((child) => child !== null && child !== undefined && child !== false),
  }
}

const React = {
  createElement,
  useState(initial) {
    const index = hookIndex++
    if (index >= stateStore.length) {
      stateStore[index] = typeof initial === 'function' ? initial() : initial
    }
    const value = stateStore[index]
    const setState = (next) => {
      stateStore[index] = typeof next === 'function' ? next(stateStore[index]) : next
      dirty = true
    }
    return [value, setState]
  },
  useEffect(fn, deps) {
    const index = hookIndex++
    const prev = stateStore[index]
    const same =
      prev &&
      Array.isArray(prev.deps) &&
      Array.isArray(deps) &&
      prev.deps.length === deps.length &&
      deps.every((dep, i) => Object.is(dep, prev.deps[i]))
    if (same) return
    if (prev && typeof prev.cleanup === 'function') prev.cleanup()
    stateStore[index] = { deps: Array.isArray(deps) ? deps.slice() : undefined }
    effects.push(() => {
      const cleanup = fn()
      if (typeof cleanup === 'function') stateStore[index].cleanup = cleanup
    })
  },
  useRef(value) {
    const index = hookIndex++
    if (index >= stateStore.length) stateStore[index] = { current: value }
    return stateStore[index]
  },
  useCallback(callback) {
    const index = hookIndex++
    if (index >= stateStore.length) stateStore[index] = callback
    return stateStore[index]
  },
}

/* --------------------------------------------------------- browser environment */

const storage = new Map([
  [
    'dsh-netscanner-form',
    JSON.stringify({ cidr: '192.168.0.0/24', preset: 'standard', portsText: '', timeoutMs: '450' }),
  ],
])

const pendingTimers = new Set()
function trackedTimeout(fn, ms) {
  const timer = setTimeout(fn, ms)
  pendingTimers.add(timer)
  timer.unref?.()
  return timer
}

globalThis.window.localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
}
globalThis.window.setTimeout = trackedTimeout
globalThis.window.clearTimeout = (timer) => {
  pendingTimers.delete(timer)
  clearTimeout(timer)
}
globalThis.window.setInterval = (fn, ms) => {
  const timer = setInterval(fn, ms)
  timer.unref?.()
  return timer
}
globalThis.window.clearInterval = (timer) => clearInterval(timer)
globalThis.document = { baseURI: 'http://127.0.0.1:1/' }

function jsonResponse(payload) {
  return { ok: true, json: async () => ({ ok: true, ...payload }) }
}

let fetchCalls = []
globalThis.fetch = async (url, init) => {
  const body = JSON.parse(init.body)
  fetchCalls.push({ url: String(url), body })
  if (body.op === 'interfaces') {
    return jsonResponse({
      interfaces: [
        { name: '乙太網路', address: '192.168.0.119', netmask: '255.255.255.0', cidr: '192.168.0.0/24' },
      ],
    })
  }
  if (body.op === 'status') {
    return jsonResponse({ running: false, phase: 'idle', scanId: null, results: [] })
  }
  return jsonResponse({})
}

/* ------------------------------------------------------------------- mount */

const plugin = factory((name) => {
  if (name === 'react') return React
  throw new Error(`unexpected module ${name}`)
})

const dictionaries = new Map()
const registrations = []
const ctx = {
  effect(callback) {
    const dispose = callback()
    return typeof dispose === 'function' ? dispose : () => {}
  },
  locale: {
    register(namespace, language, dictionary) {
      dictionaries.set(`${namespace}:${language}`, dictionary)
      return () => {}
    },
    bind(namespace) {
      const dictionary = dictionaries.get(`${namespace}:zh`)
      return (key) => dictionary[key] ?? key
    },
    subscribe() {
      return () => {}
    },
  },
  slots: {
    inject(owner, callback) {
      registrations.push({ owner, registration: callback() })
    },
    register(options, component) {
      return { ...options, component }
    },
  },
}

plugin.apply(ctx)

const panel = registrations.find((entry) => entry.owner === 'main').registration.component
assert.equal(typeof panel, 'function')

function walk(node, visit) {
  visit(node)
  for (const child of node.children ?? []) {
    if (child && typeof child === 'object') walk(child, visit)
  }
}

async function settle() {
  for (let round = 0; round < 12; round += 1) {
    hookIndex = 0
    dirty = false
    const tree = panel()
    for (const effect of effects.splice(0)) runEffects.push(effect)
    for (const effect of runEffects) {
      if (!effect.done) {
        effect.done = true
        const cleanup = effect()
        if (typeof cleanup === 'function') effect.cleanup = cleanup
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 0))
    if (!dirty) return tree
  }
  throw new Error('the panel did not settle')
}

const tree = await settle()

/* --------------------------------------------------------------- assertions */

const inputs = []
walk(tree, (node) => {
  if (node.type === 'input') inputs.push(node)
})
const startInput = inputs.find((node) => node.props.id === 'nsc-target-start')
const endInput = inputs.find((node) => node.props.id === 'nsc-target-end')
assert.ok(startInput, 'start IP input rendered')
assert.ok(endInput, 'end IP input rendered')
assert.equal(startInput.props.value, '192.168.0.1', 'start IP migrated from the saved CIDR')
assert.equal(endInput.props.value, '192.168.0.254', 'end IP migrated from the saved CIDR')

const statusCalls = fetchCalls.filter((call) => call.body.op === 'status')
const interfaceCalls = fetchCalls.filter((call) => call.body.op === 'interfaces')
assert.equal(statusCalls.length, 1, 'the panel read the scan status once')
assert.equal(interfaceCalls.length, 1, 'the panel read the local interfaces once')

let chipButton = null
walk(tree, (node) => {
  if (node.type === 'button' && String(node.props.className ?? '').includes('nsc-chip')) {
    chipButton = chipButton ?? node
  }
})
assert.ok(chipButton, 'local subnet chip rendered after the interfaces read')
chipButton.props.onClick()

const chipTree = await settle()
let startAfterChip = null
walk(chipTree, (node) => {
  if (node.type === 'input' && node.props.id === 'nsc-target-start') startAfterChip = node
})
assert.equal(
  startAfterChip.props.value,
  '192.168.0.1',
  'clicking the local subnet chip fills the start IP',
)

const startCalls = fetchCalls.filter((call) => call.body.op === 'start')
assert.equal(startCalls.length, 0, 'no scan starts by itself')

console.log('render: all assertions passed')
