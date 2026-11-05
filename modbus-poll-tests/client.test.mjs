/**
 * Client-half registration test: loads the browser module against a minimal
 * module loader and slot/locale context. It checks the module id, dictionary
 * coverage and the two slot registrations; it does not render React.
 *
 * Run with: node modbus-poll-tests/client.test.mjs
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

await import('../modbus-poll/client.js')

assert.equal(moduleId, '@local/dsh-plugin-modbus-poll')
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

const en = dictionaries.get('modbusPoll:en')
const zh = dictionaries.get('modbusPoll:zh')
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

// The new controls must have text in both languages, not fall back to a key.
for (const key of ['poll.type', 'poll.wordOrder', 'poll.scale', 'poll.offset', 'poll.bits', 'poll.toggle', 'poll.preset', 'poll.presetName']) {
  assert.ok(key in en, `en has ${key}`)
  assert.ok(key in zh, `zh has ${key}`)
}

const sidebar = registrations.find((entry) => entry.owner === 'sidebar.panellist')
const main = registrations.find((entry) => entry.owner === 'main')
assert.ok(sidebar, 'sidebar entry registered')
assert.equal(sidebar.registration.name, 'sidebar.panellist')
assert.equal(sidebar.registration.id, 'modbus-poll')
assert.equal(sidebar.registration.label(), 'poll.title')
assert.equal(typeof sidebar.registration.component, 'function')
assert.ok(main, 'main panel registered')
assert.equal(main.registration.name, 'main')
assert.equal(main.registration.key, 'modbus-poll')
assert.equal(typeof main.registration.component, 'function')

for (const dispose of effects) dispose()
console.log('client: all assertions passed')
