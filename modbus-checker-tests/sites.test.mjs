/**
 * Site configuration tests: normalisation, defaults, selection and summary.
 *
 * Run with: node modbus-checker-tests/sites.test.mjs
 */
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import {
  listSites,
  loadSite,
  normalizeDevice,
  normalizeSite,
  saveSite,
  selectDevices,
  summarizeSite,
} from '../modbus-checker/sites.js'

// --- defaults ---------------------------------------------------------------
const minimal = normalizeDevice({ name: 'Pump-01', ip: '192.168.1.10' })
assert.equal(minimal.port, 502)
assert.equal(minimal.unit_id, 1)
assert.equal(minimal.address, 0)
assert.equal(minimal.quantity, 1)
assert.equal(minimal.function, '03')
assert.equal(minimal.check_profile, 'full_stack')
assert.equal(minimal.enabled, true)
assert.equal(minimal.connect_timeout_ms, 3000)
assert.equal(minimal.response_timeout_ms, 1000)
assert.equal(minimal.ping_attempts, 4)
assert.equal(minimal.ping_timeout_ms, 1000)
assert.equal(minimal.plc_address, 40001, 'FC03 addresses display as 40001+')

// --- PLC address bases per function -----------------------------------------
assert.equal(normalizeDevice({ name: 'a', ip: '1.1.1.1', function: '01', address: 5 }).plc_address, 6)
assert.equal(normalizeDevice({ name: 'b', ip: '1.1.1.1', function: '02', address: 5 }).plc_address, 10006)
assert.equal(normalizeDevice({ name: 'c', ip: '1.1.1.1', function: '04', address: 5 }).plc_address, 30006)

// --- profile driven defaults ------------------------------------------------
const tcpOnly = normalizeDevice({ name: 'cctv', ip: '192.168.1.20', check_profile: 'ping_tcp', port: 8000 })
assert.equal(tcpOnly.ping_enabled, true, 'ping_tcp still pings')
assert.equal(tcpOnly.tcp_check_enabled, true)
assert.equal(tcpOnly.tcp_port, 8000, 'ping_tcp falls back to port when tcp_port is absent')

const pingOnly = normalizeDevice({ name: 'ap', ip: '192.168.1.30', check_profile: 'ping' })
assert.equal(pingOnly.tcp_check_enabled, false, 'ping profile does not probe TCP')

// --- explicit values win ----------------------------------------------------
const explicit = normalizeDevice({
  name: 'plc',
  ip: '192.168.1.40',
  check_profile: 'ping_tcp',
  tcp_port: 1080,
  enabled: 'false',
  expected: '  1..2  ',
  max_loss_percent: 5,
})
assert.equal(explicit.tcp_port, 1080)
assert.equal(explicit.enabled, false, 'string booleans are honoured')
assert.equal(explicit.expected, '1..2', 'expected is trimmed')
assert.equal(explicit.max_loss_percent, 5)

// --- invalid input ----------------------------------------------------------
const rejects = (fn, code) =>
  assert.throws(fn, (error) => error.code === code, `expected ${code}`)
rejects(() => normalizeDevice({ ip: '1.1.1.1' }), 'invalid-device')
rejects(() => normalizeDevice({ name: 'x' }), 'invalid-device')
rejects(() => normalizeDevice({ name: 'x', ip: '1.1.1.1', function: '99' }), 'invalid-device')
rejects(() => normalizeDevice({ name: 'x', ip: '1.1.1.1', check_profile: 'nope' }), 'invalid-device')
rejects(() => normalizeSite(null), 'invalid-site')

// --- site level -------------------------------------------------------------
const site = normalizeSite(
  {
    schema_version: 1,
    site_name: '測試案場',
    devices: [
      { name: 'plc-1', ip: '192.168.1.10', function: '03' },
      { name: 'cam-1', ip: '192.168.1.11', check_profile: 'ping_tcp', tcp_port: 8000 },
      { name: 'cam-2', ip: '192.168.1.11', check_profile: 'ping_tcp', tcp_port: 8000 },
      { name: 'ap-1', ip: '192.168.2.11', check_profile: 'ping', enabled: false },
    ],
  },
  { fileName: '測試案場.json' },
)
assert.equal(site.site_name, '測試案場')
assert.equal(site.devices.length, 4)
assert.equal(site.source_file, '測試案場.json')

rejects(
  () =>
    normalizeSite({
      devices: [
        { name: 'dup', ip: '1.1.1.1' },
        { name: 'dup', ip: '1.1.1.2' },
      ],
    }),
  'invalid-site',
)

// --- selection --------------------------------------------------------------
const enabledOnly = selectDevices(site)
assert.deepEqual(
  enabledOnly.devices.map((device) => device.name),
  ['plc-1', 'cam-1', 'cam-2'],
  'no selector means enabled devices only',
)

const byName = selectDevices(site, { devices: ['cam-2', 'missing-one'] })
assert.deepEqual(byName.devices.map((device) => device.name), ['cam-2'])
assert.deepEqual(byName.missing, ['missing-one'], 'unknown names are reported, not ignored')

const byProfile = selectDevices(site, { filter: { profile: 'ping_tcp' } })
assert.deepEqual(byProfile.devices.map((device) => device.name), ['cam-1', 'cam-2'])

const byPrefix = selectDevices(site, { filter: { ipPrefix: '192.168.2.' } })
assert.deepEqual(byPrefix.devices.map((device) => device.name), ['ap-1'])

const disabledOnly = selectDevices(site, { filter: { enabled: false } })
assert.deepEqual(disabledOnly.devices.map((device) => device.name), ['ap-1'])

const combined = selectDevices(site, { devices: ['plc-1', 'cam-1'], filter: { profile: 'ping_tcp' } })
assert.deepEqual(combined.devices.map((device) => device.name), ['cam-1'], 'name list and filter intersect')

const byFunction = selectDevices(
  normalizeSite({
    devices: [
      { name: 'coil', ip: '10.0.0.1', function: '01' },
      { name: 'holding', ip: '10.0.0.2', function: '03' },
    ],
  }),
  { filter: { function: '01' } },
)
assert.deepEqual(byFunction.devices.map((device) => device.name), ['coil'])

// --- summary ----------------------------------------------------------------
const stats = summarizeSite(site)
assert.equal(stats.devices, 4)
assert.equal(stats.enabled, 3)
assert.equal(stats.disabled, 1)
assert.equal(stats.distinctIps, 3)
assert.deepEqual(stats.subnets[0], { value: '192.168.1', count: 3 })
assert.deepEqual(stats.duplicateIps, [{ value: '192.168.1.11', count: 2 }])
assert.equal(stats.withExpected, 0)

// --- files ------------------------------------------------------------------
const dir = await mkdtemp(path.join(os.tmpdir(), 'dsh-checker-sites-'))
try {
  await writeFile(
    path.join(dir, 'A場.json'),
    JSON.stringify({ schema_version: 1, site_name: 'A場', devices: [{ name: 'd1', ip: '10.0.0.1' }] }),
    'utf8',
  )
  await writeFile(path.join(dir, 'broken.json'), '{ not json', 'utf8')

  const sites = await listSites(dir)
  assert.equal(sites.length, 2)
  const good = sites.find((entry) => entry.site === 'A場')
  assert.equal(good.devices, 1)
  assert.equal(good.enabled, 1)
  const broken = sites.find((entry) => entry.file === 'broken.json')
  assert.ok(broken.error, 'an unreadable file is reported instead of breaking the listing')

  const loaded = await loadSite(dir, 'A場')
  assert.equal(loaded.devices[0].name, 'd1')

  await saveSite(dir, loaded)
  const reloaded = await loadSite(dir, 'A場')
  assert.equal(reloaded.site_name, 'A場')
  assert.equal(reloaded.devices[0].plc_address, 40001)

  await assert.rejects(() => loadSite(dir, 'Nope'), (error) => error.code === 'site-not-found')
  await assert.rejects(() => loadSite(dir, '../etc/passwd'), (error) => error.code === 'invalid-parameter')
} finally {
  await rm(dir, { recursive: true, force: true })
}

console.log('sites: all assertions passed')
