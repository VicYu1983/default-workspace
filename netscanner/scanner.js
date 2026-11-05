/**
 * Network scanner core (host side).
 *
 * Discovers IPv4 hosts on a subnetwork without raw sockets or administrator
 * privileges: a TCP connect that either completes (open port) or is refused
 * (the host answered with RST) proves the address is reachable. Open ports are
 * collected from the same probes, reverse DNS supplies names, and the operating
 * system's ARP table supplies MAC addresses plus live neighbours that never
 * answered a TCP probe (phones, TVs and IoT devices with a silent firewall).
 *
 * One scan runs at a time. Every socket is tracked so a stop request can abort
 * pending connects immediately instead of waiting out their timeouts.
 */
import net from 'node:net'
import dns from 'node:dns/promises'
import os from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export const MAX_HOSTS = 4096
export const MAX_PORTS = 32
export const MAX_CONCURRENCY = 128
export const DEFAULT_TIMEOUT_MS = 700
export const DEFAULT_CONCURRENCY = 48
export const DEFAULT_PORTS = Object.freeze([21, 22, 23, 80, 135, 139, 443, 445, 3389, 8080])

const MIN_TIMEOUT_MS = 50
const MAX_TIMEOUT_MS = 10000
const HOSTNAME_TIMEOUT_MS = 800
const HOSTNAME_CONCURRENCY = 8
const ARP_TIMEOUT_MS = 4000

export class ScanError extends Error {
  constructor(message, code, details) {
    super(message)
    this.name = 'ScanError'
    this.code = code
    if (details !== undefined) this.details = details
  }
}

export function parseIpv4(text) {
  const parts = String(text ?? '').trim().split('.')
  if (parts.length !== 4) return null
  const octets = []
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null
    const value = Number.parseInt(part, 10)
    if (!Number.isInteger(value) || value < 0 || value > 255) return null
    octets.push(value)
  }
  return octets
}

export function ipv4ToInt(text) {
  const octets = parseIpv4(text)
  if (!octets) return null
  return ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0
}

export function intToIpv4(value) {
  const n = Number(value) >>> 0
  return `${(n >>> 24) & 255}.${(n >>> 16) & 255}.${(n >>> 8) & 255}.${n & 255}`
}

export function maskToPrefix(mask) {
  const octets = parseIpv4(mask)
  if (!octets) return null
  let prefix = 0
  let seenZero = false
  for (const octet of octets) {
    for (let bit = 7; bit >= 0; bit -= 1) {
      if ((octet >> bit) & 1) {
        if (seenZero) return null
        prefix += 1
      } else {
        seenZero = true
      }
    }
  }
  return prefix
}

function prefixToMask(prefix) {
  if (prefix === 0) return 0
  return (0xffffffff << (32 - prefix)) >>> 0
}

function countHosts(prefix) {
  const size = 2 ** (32 - prefix)
  return prefix >= 31 ? size : Math.max(0, size - 2)
}

/**
 * Turn user input into an explicit list of IPv4 addresses.
 * Accepts CIDR, a full or shorthand range, a last-octet wildcard, or one IP.
 */
export function parseTargets(input) {
  const raw = String(input ?? '').trim()
  if (raw === '') {
    throw new ScanError('a scan target is required', 'invalid-target', { field: 'cidr' })
  }

  let hosts = []
  let label = raw

  if (raw.includes('/')) {
    const slash = raw.indexOf('/')
    const networkIp = raw.slice(0, slash).trim()
    const prefixText = raw.slice(slash + 1).trim()
    const octets = parseIpv4(networkIp)
    if (!octets || !/^\d{1,2}$/.test(prefixText)) {
      throw new ScanError(`invalid CIDR target ${JSON.stringify(raw)}`, 'invalid-target', { field: 'cidr' })
    }
    const prefix = Number.parseInt(prefixText, 10)
    if (prefix < 8 || prefix > 32) {
      throw new ScanError('the prefix length must be between 8 and 32', 'invalid-target', {
        field: 'cidr',
        prefix,
      })
    }
    const count = countHosts(prefix)
    if (count > MAX_HOSTS) {
      throw new ScanError(
        `${label} contains ${count} addresses; the limit is ${MAX_HOSTS}`,
        'too-many-hosts',
        { field: 'cidr', count, max: MAX_HOSTS },
      )
    }
    const address = ipv4ToInt(networkIp)
    const mask = prefixToMask(prefix)
    const network = (address & mask) >>> 0
    const broadcast = (network | (~mask >>> 0)) >>> 0
    const first = prefix >= 31 ? network : network + 1
    const last = prefix >= 31 ? broadcast : broadcast - 1
    for (let value = first; value <= last; value += 1) hosts.push(intToIpv4(value))
    label = `${intToIpv4(network)}/${prefix}`
  } else if (/^(\d{1,3}\.){3}\d{1,3}\s*-\s*(\d{1,3}\.){3}\d{1,3}$/.test(raw)) {
    const [startText, endText] = raw.split('-').map((part) => part.trim())
    const start = ipv4ToInt(startText)
    const end = ipv4ToInt(endText)
    if (start === null || end === null || start > end) {
      throw new ScanError(`invalid address range ${JSON.stringify(raw)}`, 'invalid-target', { field: 'cidr' })
    }
    const count = end - start + 1
    if (count > MAX_HOSTS) {
      throw new ScanError(
        `${label} contains ${count} addresses; the limit is ${MAX_HOSTS}`,
        'too-many-hosts',
        { field: 'cidr', count, max: MAX_HOSTS },
      )
    }
    for (let value = start; value <= end; value += 1) hosts.push(intToIpv4(value))
    label = `${intToIpv4(start)}-${intToIpv4(end)}`
  } else if (/^(\d{1,3}\.){3}\d{1,3}\s*-\s*\d{1,3}$/.test(raw)) {
    const [startText, endText] = raw.split('-').map((part) => part.trim())
    const octets = parseIpv4(startText)
    const lastOctet = Number.parseInt(endText, 10)
    if (!octets || !/^\d{1,3}$/.test(endText) || lastOctet < 0 || lastOctet > 255) {
      throw new ScanError(`invalid address range ${JSON.stringify(raw)}`, 'invalid-target', { field: 'cidr' })
    }
    const start = octets[3]
    if (lastOctet < start) {
      throw new ScanError(`invalid address range ${JSON.stringify(raw)}`, 'invalid-target', { field: 'cidr' })
    }
    const base = `${octets[0]}.${octets[1]}.${octets[2]}`
    for (let value = start; value <= lastOctet; value += 1) hosts.push(`${base}.${value}`)
    label = `${base}.${start}-${lastOctet}`
  } else if (/^(\d{1,3}\.){3}\*$/.test(raw)) {
    const octets = parseIpv4(raw.slice(0, -1) + '0')
    if (!octets) {
      throw new ScanError(`invalid wildcard target ${JSON.stringify(raw)}`, 'invalid-target', { field: 'cidr' })
    }
    const base = `${octets[0]}.${octets[1]}.${octets[2]}`
    for (let value = 1; value <= 254; value += 1) hosts.push(`${base}.${value}`)
    label = `${base}.1-254`
  } else {
    if (!parseIpv4(raw)) {
      throw new ScanError(`invalid IPv4 target ${JSON.stringify(raw)}`, 'invalid-target', { field: 'cidr' })
    }
    hosts.push(raw)
    label = raw
  }

  if (hosts.length === 0) {
    throw new ScanError('the target contains no usable addresses', 'invalid-target', { field: 'cidr' })
  }
  if (hosts.length > MAX_HOSTS) {
    throw new ScanError(`the target exceeds the ${MAX_HOSTS}-address limit`, 'too-many-hosts', {
      field: 'cidr',
      count: hosts.length,
      max: MAX_HOSTS,
    })
  }
  return { input: raw, label, hosts, count: hosts.length }
}

/**
 * Parse an inclusive start/end IPv4 pair into an explicit address list.
 * This is the form the panel's two input fields produce; a single address
 * passes the same end for both bounds.
 */
export function parseRange(startInput, endInput) {
  const startText = String(startInput ?? '').trim()
  const endText = String(endInput ?? '').trim()
  const start = ipv4ToInt(startText)
  if (start === null) {
    throw new ScanError(`invalid start IP ${JSON.stringify(startText)}`, 'invalid-target', {
      field: 'startIp',
    })
  }
  const end = ipv4ToInt(endText)
  if (end === null) {
    throw new ScanError(`invalid end IP ${JSON.stringify(endText)}`, 'invalid-target', {
      field: 'endIp',
    })
  }
  if (start > end) {
    throw new ScanError(`start IP ${startText} is after end IP ${endText}`, 'invalid-target', {
      field: 'endIp',
    })
  }
  const count = end - start + 1
  if (count > MAX_HOSTS) {
    throw new ScanError(
      `${startText}-${endText} contains ${count} addresses; the limit is ${MAX_HOSTS}`,
      'too-many-hosts',
      { field: 'endIp', count, max: MAX_HOSTS },
    )
  }
  const hosts = []
  for (let value = start; value <= end; value += 1) hosts.push(intToIpv4(value))
  return { input: `${startText} - ${endText}`, label: `${startText}-${endText}`, hosts, count }
}

/** Parse comma/space separated ports and inclusive ranges such as 80,443,8000-8010. */
export function parsePorts(value) {
  if (value === undefined || value === null) return [...DEFAULT_PORTS]
  const tokens = (Array.isArray(value) ? value : [value])
    .flatMap((item) => String(item ?? '').split(/[\s,;]+/))
    .filter((token) => token !== '')
  if (tokens.length === 0) {
    throw new ScanError('at least one port is required', 'invalid-parameter', { field: 'ports' })
  }

  const ports = new Set()
  for (const token of tokens) {
    const match = /^(\d{1,5})(?:\s*-\s*(\d{1,5}))?$/.exec(token)
    if (!match) {
      throw new ScanError(`invalid port ${JSON.stringify(token)}`, 'invalid-parameter', {
        field: 'ports',
        token,
      })
    }
    const low = Number.parseInt(match[1], 10)
    const high = match[2] === undefined ? low : Number.parseInt(match[2], 10)
    if (low < 1 || low > 65535 || high < 1 || high > 65535 || low > high) {
      throw new ScanError(`port ${JSON.stringify(token)} must be within 1..65535`, 'invalid-parameter', {
        field: 'ports',
        token,
      })
    }
    for (let port = low; port <= high; port += 1) {
      ports.add(port)
      if (ports.size > MAX_PORTS) {
        throw new ScanError(`a scan may use at most ${MAX_PORTS} ports`, 'invalid-parameter', {
          field: 'ports',
          max: MAX_PORTS,
        })
      }
    }
  }
  return [...ports].sort((left, right) => left - right)
}

function boundedInteger(name, value, fallback, min, max) {
  if (value === undefined || value === null || value === '') return fallback
  const number = Number(value)
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new ScanError(`${name} must be an integer in ${min}..${max}`, 'invalid-parameter', {
      field: name,
      min,
      max,
    })
  }
  return number
}

/** Normalize the OS ARP table: one IP -> MAC mapping per line. */
export function parseArpTable(text) {
  const table = new Map()
  const pattern =
    /\b(\d{1,3}(?:\.\d{1,3}){3})\)?\s+(?:at\s+)?([0-9a-f]{2}(?:[-:][0-9a-f]{2}){5})\b/gi
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const match = pattern.exec(line)
    pattern.lastIndex = 0
    if (!match) continue
    if (ipv4ToInt(match[1]) === null) continue
    const mac = match[2].replace(/-/g, ':').toUpperCase()
    if (mac === 'FF:FF:FF:FF:FF:FF' || mac === '00:00:00:00:00:00') continue
    if (!table.has(match[1])) table.set(match[1], mac)
  }
  return table
}

async function readArpTable() {
  const args = process.platform === 'win32' ? ['-a'] : ['-an']
  try {
    const { stdout } = await execFileAsync('arp', args, {
      timeout: ARP_TIMEOUT_MS,
      windowsHide: true,
      maxBuffer: 2 * 1024 * 1024,
    })
    return parseArpTable(stdout)
  } catch {
    return new Map()
  }
}

/** IPv4 subnets owned by this host, so the panel can offer one-click targets. */
export function listInterfaces() {
  const found = []
  const seen = new Set()
  for (const [name, addresses] of Object.entries(os.networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family !== 'IPv4' || address.internal) continue
      const prefix = maskToPrefix(address.netmask)
      if (prefix === null) continue
      const mask = prefixToMask(prefix)
      const network = (ipv4ToInt(address.address) & mask) >>> 0
      const cidr = `${intToIpv4(network)}/${prefix}`
      const key = `${cidr}|${name}`
      if (seen.has(key)) continue
      seen.add(key)
      found.push({ name, address: address.address, netmask: address.netmask, cidr })
    }
  }
  found.sort((left, right) => {
    const leftLinkLocal = left.address.startsWith('169.254.') ? 1 : 0
    const rightLinkLocal = right.address.startsWith('169.254.') ? 1 : 0
    return leftLinkLocal - rightLinkLocal || left.name.localeCompare(right.name)
  })
  return found
}

async function reverseLookup(ip, timeoutMs) {
  let timer
  try {
    const pending = dns
      .reverse(ip)
      .then((names) => {
        if (!Array.isArray(names) || names.length === 0) return null
        const name = String(names[0]).replace(/\.$/, '')
        return name === ip ? null : name
      })
      .catch(() => null)
    const timeout = new Promise((resolve) => {
      timer = setTimeout(() => resolve(null), timeoutMs)
      if (typeof timer.unref === 'function') timer.unref()
    })
    return await Promise.race([pending, timeout])
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export class NetworkScanner {
  constructor(options = {}) {
    this.current = null
    this.activeSockets = new Set()
    this.sequence = 0
    this.maxHosts = options.maxHosts ?? MAX_HOSTS
    this.readArpTable = options.readArpTable ?? readArpTable
  }

  get running() {
    return Boolean(this.current && this.current.running)
  }

  async start(options = {}) {
    if (this.running) {
      throw new ScanError('a scan is already running', 'scan-running', { scanId: this.current.id })
    }
    const target =
      options.startIp !== undefined || options.endIp !== undefined
        ? parseRange(options.startIp ?? options.endIp, options.endIp ?? options.startIp)
        : parseTargets(options.cidr ?? options.target)
    if (target.count > this.maxHosts) {
      throw new ScanError(
        `${target.label} contains ${target.count} addresses; the limit is ${this.maxHosts}`,
        'too-many-hosts',
        { field: 'cidr', count: target.count, max: this.maxHosts },
      )
    }
    const ports = parsePorts(options.ports)
    const timeoutMs = boundedInteger(
      'timeoutMs',
      options.timeoutMs,
      DEFAULT_TIMEOUT_MS,
      MIN_TIMEOUT_MS,
      MAX_TIMEOUT_MS,
    )
    const concurrency = boundedInteger(
      'concurrency',
      options.concurrency,
      DEFAULT_CONCURRENCY,
      1,
      MAX_CONCURRENCY,
    )
    this.sequence += 1
    const scan = {
      id: `scan-${this.sequence}`,
      running: true,
      phase: 'scanning',
      target,
      hosts: target.hosts,
      ports,
      timeoutMs,
      concurrency,
      resolveNames: options.resolveNames !== false,
      scanned: 0,
      results: new Map(),
      startedAt: Date.now(),
      finishedAt: null,
      error: null,
      aborted: false,
      resolveDone: () => {},
    }
    scan.done = new Promise((resolve) => {
      scan.resolveDone = resolve
    })
    this.current = scan
    this.run(scan).catch(() => {})
    return this.snapshot()
  }

  snapshot() {
    const scan = this.current
    if (!scan) {
      return {
        running: false,
        phase: 'idle',
        scanId: null,
        cidr: null,
        ports: [],
        total: 0,
        scanned: 0,
        aliveCount: 0,
        startedAt: null,
        finishedAt: null,
        elapsedMs: 0,
        error: null,
        results: [],
      }
    }
    const results = [...scan.results.values()]
      .sort((left, right) => (ipv4ToInt(left.ip) ?? 0) - (ipv4ToInt(right.ip) ?? 0))
      .map((row) => ({
        ip: row.ip,
        hostname: row.hostname,
        mac: row.mac,
        ports: [...row.ports],
        latencyMs: row.latencyMs,
        via: row.via,
      }))
    return {
      running: scan.running,
      phase: scan.phase,
      scanId: scan.id,
      cidr: scan.target.label,
      ports: [...scan.ports],
      total: scan.hosts.length,
      scanned: scan.scanned,
      aliveCount: results.length,
      startedAt: scan.startedAt,
      finishedAt: scan.finishedAt,
      elapsedMs: Math.max(0, (scan.finishedAt ?? Date.now()) - scan.startedAt),
      error: scan.error,
      results,
    }
  }

  async run(scan) {
    try {
      await this.scanHosts(scan)
      if (scan.aborted) {
        scan.phase = 'stopped'
        return
      }
      scan.phase = 'arp'
      await this.attachArp(scan)
      if (scan.aborted) {
        scan.phase = 'stopped'
        return
      }
      if (scan.resolveNames && scan.results.size > 0) {
        scan.phase = 'resolving'
        await this.resolveHostnames(scan)
      }
      scan.phase = scan.aborted ? 'stopped' : 'complete'
    } catch (error) {
      scan.error = error && error.message ? error.message : String(error)
      scan.phase = 'failed'
    } finally {
      scan.running = false
      scan.finishedAt = Date.now()
      scan.resolveDone()
    }
  }

  async scanHosts(scan) {
    scan.phase = 'scanning'
    let cursor = 0
    const worker = async () => {
      while (!scan.aborted) {
        const index = cursor
        cursor += 1
        if (index >= scan.hosts.length) return
        const ip = scan.hosts[index]
        const result = await this.probeHost(scan, ip)
        if (scan.aborted) return
        scan.scanned += 1
        if (result) scan.results.set(ip, result)
      }
    }
    const workers = Math.min(scan.concurrency, scan.hosts.length)
    await Promise.all(Array.from({ length: workers }, () => worker()))
  }

  async probeHost(scan, ip) {
    const outcomes = await Promise.all(scan.ports.map((port) => this.probePort(scan, ip, port)))
    if (scan.aborted) return null
    const openPorts = outcomes
      .filter((outcome) => outcome.open)
      .map((outcome) => outcome.port)
      .sort((left, right) => left - right)
    const responses = outcomes.filter((outcome) => outcome.responded)
    if (responses.length === 0) return null
    return {
      ip,
      hostname: null,
      mac: null,
      ports: openPorts,
      latencyMs: Math.max(0, Math.min(...responses.map((outcome) => outcome.latencyMs))),
      via: 'tcp',
    }
  }

  probePort(scan, ip, port) {
    return new Promise((resolve) => {
      const started = Date.now()
      if (scan.aborted) {
        resolve({ port, open: false, responded: false, latencyMs: 0 })
        return
      }
      const socket = new net.Socket()
      let settled = false
      const finish = (open, responded) => {
        if (settled) return
        settled = true
        this.activeSockets.delete(socket)
        socket.destroy()
        resolve({ port, open, responded, latencyMs: Date.now() - started })
      }
      this.activeSockets.add(socket)
      socket.setTimeout(scan.timeoutMs)
      socket.once('connect', () => finish(true, true))
      socket.once('timeout', () => finish(false, false))
      socket.once('close', () => finish(false, false))
      socket.once('error', (error) => {
        const code = error && error.code
        finish(false, code === 'ECONNREFUSED' || code === 'ECONNRESET' || code === 'EPIPE')
      })
      try {
        socket.connect({ port, host: ip })
      } catch {
        finish(false, false)
      }
    })
  }

  /**
   * Merge the OS ARP table into the scan.
   *
   * Every TCP attempt first resolves the target's MAC through ARP, so a live
   * device on the same L2 segment leaves a cache entry even when its firewall
   * silently drops every TCP probe. Adding those entries is what finds phones,
   * TVs and IoT devices that expose none of the selected ports. The entries are
   * marked `via: 'arp'` because they are a weaker signal than a TCP response.
   */
  async attachArp(scan) {
    let table
    try {
      table = await this.readArpTable()
    } catch {
      return
    }
    if (!table || table.size === 0) return
    for (const [ip, row] of scan.results) {
      const mac = table.get(ip)
      if (mac) row.mac = mac
    }
    const targets = new Set(scan.hosts)
    for (const [ip, mac] of table) {
      if (scan.results.has(ip) || !targets.has(ip)) continue
      scan.results.set(ip, {
        ip,
        hostname: null,
        mac,
        ports: [],
        latencyMs: 0,
        via: 'arp',
      })
    }
  }

  async resolveHostnames(scan) {
    const rows = [...scan.results.values()]
    let cursor = 0
    const worker = async () => {
      while (!scan.aborted) {
        const index = cursor
        cursor += 1
        if (index >= rows.length) return
        const row = rows[index]
        const name = await reverseLookup(row.ip, HOSTNAME_TIMEOUT_MS)
        if (name) row.hostname = name
      }
    }
    const workers = Math.min(HOSTNAME_CONCURRENCY, rows.length)
    await Promise.all(Array.from({ length: workers }, () => worker()))
  }

  async waitForIdle(timeoutMs = 120000) {
    const scan = this.current
    if (!scan || !scan.running) return this.snapshot()
    let timer
    const limit = new Promise((resolve) => {
      timer = setTimeout(resolve, timeoutMs)
      if (typeof timer.unref === 'function') timer.unref()
    })
    await Promise.race([scan.done, limit])
    clearTimeout(timer)
    return this.snapshot()
  }

  async stop() {
    const scan = this.current
    if (!scan || !scan.running) return this.snapshot()
    scan.aborted = true
    scan.phase = 'stopping'
    for (const socket of this.activeSockets) socket.destroy()
    await this.waitForIdle(3000)
    return this.snapshot()
  }

  dispose() {
    const scan = this.current
    if (scan && scan.running) {
      scan.aborted = true
      for (const socket of this.activeSockets) socket.destroy()
    }
    this.activeSockets.clear()
  }
}
