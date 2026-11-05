/**
 * Site configuration: read and normalise the site JSON files the
 * ModbusPollChecker desktop tool already uses, so both tools can share one
 * format instead of inventing a second one.
 *
 * A site file looks like `{ schema_version, site_name, devices: [...] }`; every
 * field is optional here except `name` and `ip`, because field sites evolve and
 * a missing timeout should mean "use the default", not "refuse to load".
 */
import { readFile, readdir, unlink, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

export const CHECK_PROFILES = ['ping', 'ping_tcp', 'full_stack']
export const FUNCTIONS = ['01', '02', '03', '04']

/** PLC-style address bases, matching the desktop tool's display convention. */
const PLC_BASES = { '01': 1, '02': 10001, '03': 40001, '04': 30001 }

const DEFAULTS = {
  port: 502,
  unit_id: 1,
  address: 0,
  quantity: 1,
  function: '03',
  check_profile: 'full_stack',
  connect_timeout_ms: 3000,
  response_timeout_ms: 1000,
  ping_attempts: 4,
  ping_timeout_ms: 1000,
  ping_interval_ms: 200,
  tcp_timeout_ms: 2000,
  enabled: true,
}

export class SiteError extends Error {
  constructor(message, code, details) {
    super(message)
    this.name = 'SiteError'
    this.code = code
    if (details !== undefined) this.details = details
  }
}

function toInt(value, fallback) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.trunc(number) : fallback
}

function toBool(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback
  if (typeof value === 'boolean') return value
  const text = String(value).trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(text)) return true
  if (['0', 'false', 'no', 'off'].includes(text)) return false
  return fallback
}

function normalizeFunction(value) {
  const text = String(value ?? DEFAULTS.function).trim().padStart(2, '0')
  if (FUNCTIONS.includes(text)) return text
  throw new SiteError(`unsupported Modbus function ${JSON.stringify(value)}`, 'invalid-device', {
    field: 'function',
  })
}

function normalizeProfile(value) {
  const text = String(value ?? DEFAULTS.check_profile).trim()
  if (CHECK_PROFILES.includes(text)) return text
  throw new SiteError(`check_profile must be one of ${CHECK_PROFILES.join(', ')}`, 'invalid-device', {
    field: 'check_profile',
  })
}

/** Turn one raw JSON object into a device with every field resolved. */
export function normalizeDevice(raw, index = 0) {
  if (!raw || typeof raw !== 'object') {
    throw new SiteError(`device #${index} is not an object`, 'invalid-device', { index })
  }
  const name = String(raw.name ?? '').trim()
  if (name === '') {
    throw new SiteError(`device #${index} has no name`, 'invalid-device', { index })
  }
  const ip = String(raw.ip ?? '').trim()
  if (ip === '') {
    throw new SiteError(`device ${name} has no ip`, 'invalid-device', { device: name })
  }

  const functionCode = normalizeFunction(raw.function)
  const profile = normalizeProfile(raw.check_profile)
  const address = toInt(raw.address, DEFAULTS.address)
  const tcpPort = raw.tcp_port === undefined || raw.tcp_port === null || raw.tcp_port === ''
    ? null
    : toInt(raw.tcp_port, null)

  return {
    name,
    ip,
    port: toInt(raw.port, DEFAULTS.port),
    unit_id: toInt(raw.unit_id, DEFAULTS.unit_id),
    address,
    quantity: toInt(raw.quantity, DEFAULTS.quantity),
    function: functionCode,
    expected: raw.expected === undefined || raw.expected === null || String(raw.expected).trim() === ''
      ? null
      : String(raw.expected).trim(),
    address_mode: raw.address_mode === 'hex' ? 'hex' : 'dec',
    check_profile: profile,
    enabled: toBool(raw.enabled, DEFAULTS.enabled),
    connect_timeout_ms: toInt(raw.connect_timeout_ms, DEFAULTS.connect_timeout_ms),
    response_timeout_ms: toInt(raw.response_timeout_ms, DEFAULTS.response_timeout_ms),
    scan_rate_ms: toInt(raw.scan_rate_ms, 0),
    delay_between_polls_ms: toInt(raw.delay_between_polls_ms, 0),
    ping_enabled: toBool(raw.ping_enabled, true),
    ping_attempts: toInt(raw.ping_attempts, DEFAULTS.ping_attempts),
    ping_timeout_ms: toInt(raw.ping_timeout_ms, DEFAULTS.ping_timeout_ms),
    ping_interval_ms: toInt(raw.ping_interval_ms, DEFAULTS.ping_interval_ms),
    tcp_check_enabled: toBool(raw.tcp_check_enabled, profile !== 'ping'),
    tcp_port: tcpPort ?? (profile === 'ping_tcp' ? toInt(raw.port, DEFAULTS.port) : null),
    tcp_timeout_ms: toInt(raw.tcp_timeout_ms, DEFAULTS.tcp_timeout_ms),
    skip_when_ping_failed: toBool(raw.skip_when_ping_failed, false),
    max_latency_ms: raw.max_latency_ms === undefined || raw.max_latency_ms === null ? null : toInt(raw.max_latency_ms, null),
    max_loss_percent:
      raw.max_loss_percent === undefined || raw.max_loss_percent === null ? null : Number(raw.max_loss_percent),
    plc_address: (PLC_BASES[functionCode] ?? 40001) + address,
  }
}

export function normalizeSite(raw, { fileName = null } = {}) {
  if (!raw || typeof raw !== 'object') {
    throw new SiteError('site file is not an object', 'invalid-site')
  }
  const devices = Array.isArray(raw.devices) ? raw.devices : []
  const seen = new Set()
  const normalized = devices.map((device, index) => {
    const result = normalizeDevice(device, index)
    if (seen.has(result.name)) {
      throw new SiteError(`duplicate device name ${result.name}`, 'invalid-site', { device: result.name })
    }
    seen.add(result.name)
    return result
  })
  const siteName = String(raw.site_name ?? (fileName ? fileName.replace(/\.json$/i, '') : '')).trim()
  return {
    schema_version: toInt(raw.schema_version, 1),
    site_name: siteName,
    source_file: fileName,
    devices: normalized,
  }
}

export function assertSiteName(name) {
  const text = String(name ?? '').trim()
  if (text === '') {
    throw new SiteError('site is required', 'invalid-parameter', { field: 'site' })
  }
  if (text.includes('/') || text.includes('\\') || text.includes('..')) {
    throw new SiteError(`invalid site name ${JSON.stringify(text)}`, 'invalid-parameter', { field: 'site' })
  }
  return text
}

function siteFile(dir, name) {
  return path.join(dir, `${assertSiteName(name)}.json`)
}

export async function listSites(dir) {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch (error) {
    if (error.code === 'ENOENT') return []
    throw new SiteError(`cannot read ${dir}: ${error.message}`, 'site-dir-unreadable')
  }
  const sites = []
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.json')) continue
    try {
      const raw = JSON.parse(await readFile(path.join(dir, entry.name), 'utf8'))
      const site = normalizeSite(raw, { fileName: entry.name })
      sites.push({
        site: site.site_name,
        file: entry.name,
        devices: site.devices.length,
        enabled: site.devices.filter((device) => device.enabled).length,
      })
    } catch (error) {
      sites.push({ site: entry.name.replace(/\.json$/i, ''), file: entry.name, error: error.message })
    }
  }
  return sites.sort((left, right) => left.site.localeCompare(right.site))
}

export async function loadSite(dir, name) {
  const file = siteFile(dir, name)
  let text
  try {
    text = await readFile(file, 'utf8')
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new SiteError(`site ${JSON.stringify(name)} not found in ${dir}`, 'site-not-found', { dir })
    }
    throw new SiteError(`cannot read ${file}: ${error.message}`, 'site-unreadable')
  }
  let raw
  try {
    raw = JSON.parse(text)
  } catch (error) {
    throw new SiteError(`${file} is not valid JSON: ${error.message}`, 'invalid-site', { file })
  }
  return normalizeSite(raw, { fileName: path.basename(file) })
}

/** True when `<site>.json` already exists, so a save can refuse to clobber it. */
export async function siteExists(dir, name) {
  try {
    await stat(siteFile(dir, name))
    return true
  } catch (error) {
    if (error.code === 'ENOENT') return false
    throw new SiteError(`cannot inspect ${path.join(dir, `${name}.json`)}: ${error.message}`, 'site-unreadable')
  }
}

/** Remove one site file. A missing file is an error, not a silent success. */
export async function deleteSite(dir, name) {
  const file = siteFile(dir, name)
  try {
    await unlink(file)
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new SiteError(`site ${JSON.stringify(name)} not found in ${dir}`, 'site-not-found', { dir })
    }
    throw new SiteError(`cannot delete ${file}: ${error.message}`, 'site-unreadable')
  }
  return file
}

/** Write a site back in the same shape, so the desktop tool keeps reading it. */
export async function saveSite(dir, site) {
  const file = siteFile(dir, site.site_name)
  const payload = {
    schema_version: site.schema_version ?? 1,
    site_name: site.site_name,
    devices: site.devices,
  }
  await writeFile(file, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  return file
}

/**
 * Select devices by name list or by filter.
 *
 * Name selection reports unknown names instead of silently checking fewer
 * devices than the caller asked for.
 */
export function selectDevices(site, { devices, filter } = {}) {
  let selected = site.devices
  const missing = []

  if (Array.isArray(devices) && devices.length > 0) {
    const wanted = new Set(devices.map((name) => String(name)))
    const byName = new Map(site.devices.map((device) => [device.name, device]))
    for (const name of wanted) {
      if (!byName.has(name)) missing.push(name)
    }
    selected = [...wanted].filter((name) => byName.has(name)).map((name) => byName.get(name))
  }

  if (filter && typeof filter === 'object') {
    if (filter.profile !== undefined) {
      const profiles = Array.isArray(filter.profile) ? filter.profile : [filter.profile]
      selected = selected.filter((device) => profiles.includes(device.check_profile))
    }
    if (filter.function !== undefined) {
      const functions = Array.isArray(filter.function) ? filter.function.map(String) : [String(filter.function)]
      selected = selected.filter((device) => functions.includes(device.function))
    }
    if (filter.ipPrefix !== undefined) {
      const prefix = String(filter.ipPrefix)
      selected = selected.filter((device) => device.ip.startsWith(prefix))
    }
    if (filter.enabled !== undefined) {
      const enabled = toBool(filter.enabled, true)
      selected = selected.filter((device) => device.enabled === enabled)
    }
    if (filter.nameContains !== undefined) {
      const needle = String(filter.nameContains)
      selected = selected.filter((device) => device.name.includes(needle))
    }
  }

  if (devices === undefined && filter === undefined) {
    selected = site.devices.filter((device) => device.enabled)
  }

  return { devices: selected, missing }
}

function histogram(values) {
  const counts = new Map()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((left, right) => right.count - left.count || String(left.value).localeCompare(String(right.value)))
}

/** Aggregates an agent can reason about without listing 673 devices. */
export function summarizeSite(site) {
  const devices = site.devices
  const subnets = devices.map((device) => device.ip.split('.').slice(0, 3).join('.'))
  const duplicateIps = histogram(devices.map((device) => device.ip)).filter((entry) => entry.count > 1)
  return {
    site: site.site_name,
    file: site.source_file,
    devices: devices.length,
    enabled: devices.filter((device) => device.enabled).length,
    disabled: devices.filter((device) => !device.enabled).length,
    byProfile: histogram(devices.map((device) => device.check_profile)),
    byFunction: histogram(devices.map((device) => device.function)),
    byPort: histogram(devices.map((device) => String(device.port))),
    byUnitId: histogram(devices.map((device) => String(device.unit_id))),
    subnets: histogram(subnets),
    withExpected: devices.filter((device) => device.expected !== null).length,
    distinctIps: new Set(devices.map((device) => device.ip)).size,
    duplicateIps: duplicateIps.slice(0, 10),
  }
}
