/**
 * Modbus Poll — host half.
 *
 * Owns one Modbus TCP connection and exposes it through two callers that share
 * one implementation:
 *   - the panel, over an authenticated same-origin JSON route;
 *   - the agent, through the `modbus_poll` tool.
 * The browser cannot open raw TCP sockets, so every read/write happens here.
 */
import { ModbusError, ModbusTcpClient } from './modbus.js'

const ROUTE_PATH = '/modbus-poll/api'
const TOOL_NAME = 'modbus_poll'
const MAX_BODY_BYTES = 64 * 1024
const REQUEST_TIMEOUT_MS = 3000

const TOOL_PARAMETERS = {
  type: 'object',
  additionalProperties: false,
  required: ['action'],
  properties: {
    action: {
      type: 'string',
      enum: ['status', 'connect', 'disconnect', 'read', 'write'],
      description: 'status returns the live connection; connect opens or reuses one; disconnect closes it; read reads registers; write writes one holding register.',
    },
    host: { type: 'string', description: 'Server host name or IP. Required for connect.' },
    port: { type: 'integer', description: 'TCP port, default 502.' },
    unitId: { type: 'integer', description: 'Modbus unit (slave) id 0-255, default 1.' },
    kind: { type: 'string', enum: ['holding', 'input'], description: 'Register table for read: holding (FC03, default) or input (FC04).' },
    start: { type: 'integer', description: 'First register address to read, 0-65535.' },
    count: { type: 'integer', description: 'How many registers to read, 1-125.' },
    address: { type: 'integer', description: 'Holding register address to write, 0-65535.' },
    value: { type: 'integer', description: '16-bit value to write, 0-65535.' },
  },
}

const TOOL_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['action', 'summary', 'connected'],
  properties: {
    action: { type: 'string' },
    summary: { type: 'string' },
    connected: { type: 'boolean' },
    host: { type: 'string' },
    port: { type: 'integer' },
    unitId: { type: 'integer' },
    start: { type: 'integer' },
    values: { type: 'array', items: { type: 'integer' } },
    address: { type: 'integer' },
    value: { type: 'integer' },
    latencyMs: { type: 'integer' },
  },
}

const TOOL_DESCRIPTION =
  'Read and write Modbus TCP registers on a Modbus server, using the same connection as the Modbus Poll panel. ' +
  'Call action "connect" first (host, port, unitId), then action "read" (kind, start, count) or action "write" (address, value). ' +
  'Writes change the server immediately. action "status" reports the live connection without touching the wire; action "disconnect" closes it.'

function hex4(value) {
  return '0x' + value.toString(16).toUpperCase().padStart(4, '0')
}

const HTTP_STATUS = {
  'invalid-parameter': 400,
  'invalid-json': 400,
  'body-too-large': 413,
  'not-connected': 409,
  disconnected: 409,
  'connection-closed': 409,
  'connect-failed': 502,
  'socket-error': 502,
  'write-failed': 502,
  'modbus-exception': 502,
  'protocol-error': 502,
  'connect-timeout': 504,
  timeout: 504,
}

export const inject = ['webServer', 'tools']

export function apply(ctx) {
  const state = { client: null, lastError: null }

  function describe() {
    const client = state.client
    if (!client || client.closed) {
      return { connected: false, host: null, port: null, unitId: null, lastError: state.lastError }
    }
    return {
      connected: true,
      host: client.host,
      port: client.port,
      unitId: client.unitId,
      lastError: state.lastError,
    }
  }

  async function connect(body) {
    const host = String(body.host ?? '').trim()
    if (host === '') {
      throw new ModbusError('host is required', 'invalid-parameter', { field: 'host' })
    }
    const port = Number(body.port ?? 502)
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new ModbusError('port must be an integer in 1..65535', 'invalid-parameter', { field: 'port' })
    }
    const unitId = Number(body.unitId ?? 1)
    if (!Number.isInteger(unitId) || unitId < 0 || unitId > 255) {
      throw new ModbusError('unitId must be an integer in 0..255', 'invalid-parameter', { field: 'unitId' })
    }

    const current = state.client
    if (current && !current.closed && current.host === host && current.port === port) {
      current.unitId = unitId
      state.lastError = null
      return
    }
    if (current) current.close()
    state.client = null

    const client = new ModbusTcpClient({ host, port, unitId, timeoutMs: REQUEST_TIMEOUT_MS })
    await client.open()
    state.client = client
    state.lastError = null
  }

  function requireClient(body) {
    const client = state.client
    if (!client || client.closed) {
      throw new ModbusError('not connected to a Modbus server', 'not-connected')
    }
    const unitId = body.unitId === undefined ? undefined : Number(body.unitId)
    if (unitId !== undefined) {
      if (!Number.isInteger(unitId) || unitId < 0 || unitId > 255) {
        throw new ModbusError('unitId must be an integer in 0..255', 'invalid-parameter', { field: 'unitId' })
      }
      client.unitId = unitId
    }
    return client
  }

  async function dispatch(body) {
    const op = String(body.op ?? '')
    switch (op) {
      case 'status':
        return describe()
      case 'connect':
        await connect(body)
        return describe()
      case 'disconnect':
        if (state.client) state.client.close()
        state.client = null
        state.lastError = null
        return describe()
      case 'read': {
        const client = requireClient(body)
        const kind = body.kind === 'input' ? 'input' : 'holding'
        const start = Number(body.start)
        const count = Number(body.count)
        const began = Date.now()
        const values =
          kind === 'input'
            ? await client.readInputRegisters(start, count)
            : await client.readHoldingRegisters(start, count)
        return { kind, start, count, values, latencyMs: Date.now() - began }
      }
      case 'write': {
        const client = requireClient(body)
        return client.writeSingleRegister(Number(body.address), Number(body.value))
      }
      default:
        throw new ModbusError(`unknown operation ${JSON.stringify(op)}`, 'invalid-parameter', { field: 'op' })
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
          reject(new ModbusError('request body too large', 'body-too-large'))
          request.destroy()
          return
        }
        chunks.push(chunk)
      })
      request.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'))
        } catch {
          reject(new ModbusError('request body is not valid JSON', 'invalid-json'))
        }
      })
      request.on('error', (error) => {
        reject(new ModbusError(`request failed: ${error.message}`, 'request-error'))
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
      const failure = toModbusError(error)
      send(response, HTTP_STATUS[failure.code] ?? 400, {
        ok: false,
        error: { code: failure.code, message: failure.message },
      })
      return
    }

    try {
      const result = await dispatch(body)
      state.lastError = null
      send(response, 200, { ok: true, ...result })
    } catch (error) {
      const failure = toModbusError(error)
      state.lastError = failure.message
      send(response, HTTP_STATUS[failure.code] ?? 500, {
        ok: false,
        error: { code: failure.code, message: failure.message, details: failure.details },
      })
    }
  }

  function connectionFields() {
    const snapshot = describe()
    if (!snapshot.connected) return {}
    return { host: snapshot.host, port: snapshot.port, unitId: snapshot.unitId }
  }

  async function runTool(args) {
    const action = String(args.action ?? '')
    switch (action) {
      case 'status': {
        const snapshot = describe()
        const summary = snapshot.connected
          ? `connected to ${snapshot.host}:${snapshot.port} unit ${snapshot.unitId}`
          : `not connected${snapshot.lastError ? ` (last error: ${snapshot.lastError})` : ''}`
        return { action, summary, connected: snapshot.connected, ...connectionFields() }
      }
      case 'connect': {
        await dispatch({ op: 'connect', host: args.host, port: args.port, unitId: args.unitId })
        const snapshot = describe()
        return {
          action,
          summary: `connected to ${snapshot.host}:${snapshot.port} unit ${snapshot.unitId}`,
          connected: true,
          ...connectionFields(),
        }
      }
      case 'disconnect':
        await dispatch({ op: 'disconnect' })
        return { action, summary: 'disconnected', connected: false }
      case 'read': {
        const result = await dispatch({
          op: 'read',
          kind: args.kind,
          start: args.start,
          count: args.count,
          unitId: args.unitId,
        })
        const lines = result.values.map(
          (value, index) => `${result.start + index}\t${value}\t${hex4(value)}`,
        )
        return {
          action,
          summary:
            `${result.kind} registers ${result.start}..${result.start + result.values.length - 1}: ` +
            `${result.values.length} value(s) in ${result.latencyMs} ms\n` +
            `address\tdecimal\thex\n${lines.join('\n')}`,
          connected: true,
          ...connectionFields(),
          start: result.start,
          values: result.values,
          latencyMs: result.latencyMs,
        }
      }
      case 'write': {
        const written = await dispatch({ op: 'write', address: args.address, value: args.value })
        return {
          action,
          summary: `wrote ${written.value} (${hex4(written.value)}) to holding register ${written.address}`,
          connected: true,
          ...connectionFields(),
          address: written.address,
          value: written.value,
        }
      }
      default:
        throw new ModbusError(
          `unknown action ${JSON.stringify(action)}; use status, connect, disconnect, read or write`,
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
        const failure = toModbusError(error)
        const wrapped = new Error(`${failure.code}: ${failure.message}`)
        wrapped.info = { name: 'ModbusError', code: failure.code, reason: failure.message }
        throw wrapped
      }
    },
  }

  ctx.effect(() => ctx.tools.register(tool))
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: ROUTE_PATH, handler }))
  ctx.effect(() => () => {
    if (state.client) {
      state.client.close()
      state.client = null
    }
  })
}

function toModbusError(error) {
  if (error instanceof ModbusError) return error
  return new ModbusError(error && error.message ? error.message : String(error), 'internal')
}
