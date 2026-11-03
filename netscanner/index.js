/**
 * Network Scanner — host half.
 *
 * Owns one scanner and exposes it through two callers that share the same
 * implementation:
 *   - the sidebar panel, over an authenticated same-origin JSON route;
 *   - the agent, through the `net_scan` tool.
 * The browser cannot open TCP sockets, so discovery, ARP and reverse DNS all
 * happen here on the Harness host.
 */
import { ScanError, NetworkScanner, listInterfaces } from './scanner.js'

const ROUTE_PATH = '/netscanner/api'
const TOOL_NAME = 'net_scan'
const MAX_BODY_BYTES = 64 * 1024
const TOOL_WAIT_MS = 90000
const TOOL_TABLE_LIMIT = 100

const TOOL_PARAMETERS = {
  type: 'object',
  additionalProperties: false,
  required: ['action'],
  properties: {
    action: {
      type: 'string',
      enum: ['scan', 'status', 'stop', 'interfaces'],
      description:
        'scan starts a new scan and waits for it (unless wait is false); status reads the current or last scan; stop aborts it; interfaces lists the host\'s own IPv4 subnets.',
    },
    cidr: {
      type: 'string',
      description:
        'Target network: CIDR (192.168.1.0/24), range (192.168.1.10-192.168.1.50 or 192.168.1.10-50), wildcard (192.168.1.*), or one IPv4 address. Required for scan.',
    },
    ports: {
      type: 'array',
      items: { type: 'integer' },
      description:
        'TCP ports to probe, up to 32. Defaults to 21,22,23,80,135,139,443,445,3389,8080. A closed port still proves a host responded.',
    },
    timeoutMs: { type: 'integer', description: 'Per-connection timeout in milliseconds, 50-10000 (default 700).' },
    concurrency: { type: 'integer', description: 'Hosts probed in parallel, 1-128 (default 48).' },
    resolveNames: { type: 'boolean', description: 'Reverse-DNS responsive hosts (default true).' },
    wait: { type: 'boolean', description: 'For scan, wait for completion (default true) up to 90 seconds.' },
  },
}

const TOOL_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['action', 'summary', 'running'],
  properties: {
    action: { type: 'string' },
    summary: { type: 'string' },
    running: { type: 'boolean' },
    phase: { type: 'string' },
    scanId: { type: 'string' },
    cidr: { type: 'string' },
    total: { type: 'integer' },
    scanned: { type: 'integer' },
    aliveCount: { type: 'integer' },
    elapsedMs: { type: 'integer' },
    error: { type: 'string' },
    interfaces: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'address', 'cidr'],
        properties: {
          name: { type: 'string' },
          address: { type: 'string' },
          netmask: { type: 'string' },
          cidr: { type: 'string' },
        },
      },
    },
    hosts: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['ip', 'ports'],
        properties: {
          ip: { type: 'string' },
          hostname: { type: 'string' },
          mac: { type: 'string' },
          ports: { type: 'array', items: { type: 'integer' } },
          latencyMs: { type: 'integer' },
          via: { type: 'string', enum: ['tcp', 'arp'] },
        },
      },
    },
  },
}

const TOOL_DESCRIPTION =
  'Scan an IPv4 network segment from the Harness host. ' +
  'action "scan" takes a CIDR, range or single address (for example 192.168.1.0/24), probes the given TCP ports in parallel, ' +
  'and returns responsive hosts with reverse-DNS names, ARP MAC addresses and open ports. A refused connection still counts as a response, ' +
  'so hosts without open ports are discovered. Live neighbours with no TCP response are added from the host\'s ARP cache and marked via "arp". ' +
  'action "interfaces" lists the host\'s own subnets; "status" reports progress; "stop" aborts. ' +
  'Limits: 4096 addresses and 32 ports per scan. Only scan networks you are authorized to test.'

const HTTP_STATUS = {
  'invalid-parameter': 400,
  'invalid-target': 400,
  'too-many-hosts': 400,
  'invalid-json': 400,
  'body-too-large': 413,
  'scan-running': 409,
  'scan-failed': 500,
}

function seconds(milliseconds) {
  return `${(Math.max(0, Number(milliseconds) || 0) / 1000).toFixed(1)} s`
}

function formatHosts(hosts, limit = TOOL_TABLE_LIMIT) {
  const shown = hosts.slice(0, limit)
  const lines = ['IP\tHostname\tMAC\tOpen ports\tLatency\tVia']
  for (const host of shown) {
    lines.push(
      [
        host.ip,
        host.hostname || '-',
        host.mac || '-',
        host.ports.length > 0 ? host.ports.join(',') : '-',
        host.via === 'arp' ? '-' : `${host.latencyMs} ms`,
        host.via,
      ].join('\t'),
    )
  }
  if (hosts.length > shown.length) lines.push(`... ${hosts.length - shown.length} more host(s)`)
  return lines.join('\n')
}

function toolResult(action, snapshot) {
  const hosts = Array.isArray(snapshot.results)
    ? snapshot.results.map((row) => {
        const host = { ip: row.ip, ports: row.ports, latencyMs: row.latencyMs, via: row.via }
        if (row.hostname) host.hostname = row.hostname
        if (row.mac) host.mac = row.mac
        return host
      })
    : []

  let summary
  if (snapshot.running) {
    summary =
      `scanning ${snapshot.cidr}: ${snapshot.scanned}/${snapshot.total} addresses, ` +
      `${snapshot.aliveCount} host(s) responded, ${seconds(snapshot.elapsedMs)} elapsed`
  } else if (snapshot.phase === 'failed') {
    summary = `scan of ${snapshot.cidr ?? 'the target'} failed: ${snapshot.error ?? 'unknown error'}`
  } else if (snapshot.phase === 'stopped') {
    summary =
      `scan of ${snapshot.cidr} stopped after ${snapshot.scanned}/${snapshot.total} addresses: ` +
      `${snapshot.aliveCount} host(s) responded`
  } else if (snapshot.phase === 'complete') {
    summary =
      `scanned ${snapshot.cidr}: ${snapshot.aliveCount}/${snapshot.total} host(s) responded in ${seconds(snapshot.elapsedMs)}` +
      (hosts.length > 0 ? `\n${formatHosts(hosts)}` : '\nno responsive hosts found')
  } else {
    summary = 'no scan has run yet'
  }

  const result = {
    action,
    summary,
    running: Boolean(snapshot.running),
    phase: snapshot.phase,
    total: snapshot.total,
    scanned: snapshot.scanned,
    aliveCount: snapshot.aliveCount,
    elapsedMs: snapshot.elapsedMs,
  }
  if (snapshot.scanId) result.scanId = snapshot.scanId
  if (snapshot.cidr) result.cidr = snapshot.cidr
  if (snapshot.error) result.error = snapshot.error
  if (hosts.length > 0) result.hosts = hosts
  return result
}

export const inject = ['webServer', 'tools']

export function apply(ctx) {
  const scanner = new NetworkScanner()

  async function dispatch(body) {
    const op = String(body.op ?? '')
    switch (op) {
      case 'status':
        return scanner.snapshot()
      case 'start':
        return scanner.start({
          cidr: body.cidr ?? body.target,
          ports: body.ports,
          timeoutMs: body.timeoutMs,
          concurrency: body.concurrency,
          resolveNames: body.resolveNames,
        })
      case 'stop':
        return scanner.stop()
      case 'interfaces':
        return { interfaces: listInterfaces() }
      default:
        throw new ScanError(`unknown operation ${JSON.stringify(op)}`, 'invalid-parameter', { field: 'op' })
    }
  }

  function send(response, status, payload) {
    response.statusCode = status
    response.setHeader('content-type', 'application/json; charset=utf-8')
    response.setHeader('cache-control', 'no-store')
    response.end(JSON.stringify(payload))
  }

  async function readJsonBody(request) {
    return new Promise((resolve, reject) => {
      const chunks = []
      let size = 0
      request.on('data', (chunk) => {
        size += chunk.length
        if (size > MAX_BODY_BYTES) {
          reject(new ScanError('request body too large', 'body-too-large'))
          request.destroy()
          return
        }
        chunks.push(chunk)
      })
      request.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'))
        } catch {
          reject(new ScanError('request body is not valid JSON', 'invalid-json'))
        }
      })
      request.on('error', (error) => {
        reject(new ScanError(`request failed: ${error.message}`, 'request-error'))
      })
    })
  }

  const handler = async (request, response) => {
    const connection = ctx.get('connection')
    const rejection =
      connection && typeof connection.requestRejection === 'function'
        ? connection.requestRejection(request)
        : undefined
    if (rejection) {
      send(response, rejection, {
        ok: false,
        error: { code: 'unauthorized', message: 'request rejected by the browser trust boundary' },
      })
      return
    }
    if (request.method !== 'POST') {
      response.setHeader('allow', 'POST')
      send(response, 405, {
        ok: false,
        error: { code: 'method-not-allowed', message: 'use POST' },
      })
      return
    }

    let body
    try {
      body = await readJsonBody(request)
    } catch (error) {
      const failure = toScanError(error)
      send(response, HTTP_STATUS[failure.code] ?? 400, {
        ok: false,
        error: { code: failure.code, message: failure.message },
      })
      return
    }

    try {
      const result = await dispatch(body)
      send(response, 200, { ok: true, ...result })
    } catch (error) {
      const failure = toScanError(error)
      send(response, HTTP_STATUS[failure.code] ?? 500, {
        ok: false,
        error: { code: failure.code, message: failure.message, details: failure.details },
      })
    }
  }

  async function runTool(args) {
    const action = String(args.action ?? '')
    switch (action) {
      case 'interfaces': {
        const interfaces = listInterfaces()
        const summary =
          interfaces.length === 0
            ? 'no non-internal IPv4 interfaces found'
            : interfaces.map((entry) => `${entry.name}\t${entry.address}\t${entry.cidr}`).join('\n')
        return {
          action,
          summary,
          running: scanner.running,
          interfaces,
        }
      }
      case 'scan': {
        const started = await scanner.start({
          cidr: args.cidr,
          ports: args.ports,
          timeoutMs: args.timeoutMs,
          concurrency: args.concurrency,
          resolveNames: args.resolveNames,
        })
        const snapshot = args.wait === false ? started : await scanner.waitForIdle(TOOL_WAIT_MS)
        return toolResult(action, snapshot)
      }
      case 'status':
        return toolResult(action, scanner.snapshot())
      case 'stop': {
        const wasRunning = scanner.running
        const result = toolResult(action, await scanner.stop())
        if (!wasRunning) result.summary = 'no scan is running'
        return result
      }
      default:
        throw new ScanError(
          `unknown action ${JSON.stringify(action)}; use scan, status, stop or interfaces`,
          'invalid-parameter',
          { field: 'action' },
        )
    }
  }

  const tool = {
    name: TOOL_NAME,
    description: TOOL_DESCRIPTION,
    parameters: TOOL_PARAMETERS,
    output: {
      schema: TOOL_OUTPUT_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: value.summary }],
    },
    async execute(args) {
      try {
        return await runTool(args ?? {})
      } catch (error) {
        const failure = toScanError(error)
        const wrapped = new Error(`${failure.code}: ${failure.message}`)
        wrapped.info = { name: 'ScanError', code: failure.code, reason: failure.message }
        throw wrapped
      }
    },
  }

  ctx.effect(() => ctx.tools.register(tool))
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: ROUTE_PATH, handler }))
  ctx.effect(() => () => scanner.dispose())
}

function toScanError(error) {
  if (error instanceof ScanError) return error
  return new ScanError(error && error.message ? error.message : String(error), 'internal')
}
