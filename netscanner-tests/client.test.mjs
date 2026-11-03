/**
 * Client-half registration test: loads the browser module against a minimal
 * module loader and slot/locale context. It checks the module id, dictionary
 * coverage and the two slot registrations; it does not render React.
 *
 * Run with: node netscanner-tests/client.test.mjs
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
assert.equal(typeof factory, 'function')

const React = {
  createElement: () => ({}),
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  useEffect: () => {},
  useRef: (value) => ({ current: value }),
  useCallback: (callback) => callback,
}

const plugin = factory((name) => {
  if (name === 'react') return React
  throw new Error(`unexpected module ${name}`)
})

assert.deepEqual(plugin.inject, ['slots', 'locale'])
assert.equal(typeof plugin.apply, 'function')

const registrations = []
const dictionaries = new Map()
const effects = []
const ctx = {
  effect(callback) {
    const dispose = callback()
    effects.push(typeof dispose === 'function' ? dispose : () => {})
  },
  locale: {
    register(namespace, language, dictionary) {
      dictionaries.set(`${namespace}:${language}`, dictionary)
      return () => {}
    },
    bind(namespace) {
      return (key) => key
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

const en = dictionaries.get('netscanner:en')
const zh = dictionaries.get('netscanner:zh')
assert.ok(en && zh, 'both dictionaries registered')
assert.deepEqual(Object.keys(en).sort(), Object.keys(zh).sort(), 'dictionaries share keys')
for (const [key, value] of Object.entries(en)) {
  assert.equal(typeof value, 'string', `en ${key} is text`)
  assert.notEqual(value.trim(), '', `en ${key} is not empty`)
}
for (const [key, value] of Object.entries(zh)) {
  assert.equal(typeof value, 'string', `zh ${key} is text`)
  assert.notEqual(value.trim(), '', `zh ${key} is not empty`)
}

const sidebar = registrations.find((entry) => entry.owner === 'sidebar.panellist')
const main = registrations.find((entry) => entry.owner === 'main')
assert.ok(sidebar, 'sidebar entry registered')
assert.equal(sidebar.registration.name, 'sidebar.panellist')
assert.equal(sidebar.registration.id, 'netscanner')
assert.equal(sidebar.registration.label(), 'nsc.title')
assert.equal(typeof sidebar.registration.component, 'function')
assert.ok(main, 'main panel registered')
assert.equal(main.registration.name, 'main')
assert.equal(main.registration.key, 'netscanner')
assert.equal(typeof main.registration.component, 'function')

for (const dispose of effects) dispose()
console.log('client: all assertions passed')
