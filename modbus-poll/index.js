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
import {
  REGISTER_TYPES,
  WORD_ORDERS,
  decodeRegisters,
  encodeValue,
  normalizeScaling,
  normalizeType,
  normalizeWordOrder,
  typeWidth,
} from './types.js'

const ROUTE_PATH = '/modbus-poll/api'
const TOOL_NAME = 'modbus_poll'
const MAX_BODY_BYTES = 64 * 1024
const REQUEST_TIMEOUT_MS = 3000

const KINDS = ['holding', 'input', 'coil', 'discrete']

const TOOL_PARAMETERS = {
  type: 'object',
  additionalProperties: false,
  required: ['action'],
  properties: {
    action: {
      type: 'string',
      enum: ['status', 'connect', 'disconnect', 'read', 'write', 'write-bit', 'watch'],
      description:
        'status returns the live connection; connect opens or reuses one; disconnect closes it; read reads registers or bits; write writes registers or coils; write-bit toggles one bit of a holding register; watch polls one value until it equals expect, or times out.',
    },
    host: { type: 'string', description: 'Server host name or IP. Required for connect.' },
    port: { type: 'integer', description: 'TCP port, default 502.' },
    unitId: { type: 'integer', description: 'Modbus unit (slave) id 0-255, default 1.' },
    kind: {
      type: 'string',
      enum: KINDS,
      description:
        'holding (FC03, default) or input (FC04) registers, coil (FC01) or discrete (FC02) bits.',
    },
    start: { type: 'integer', description: 'First address to read, 0-65535.' },
    count: {
      type: 'integer',
      description: 'Registers to read (1-125) for holding/input, or bits (1-2000) for coil/discrete.',
    },
    type: {
      type: 'string',
      enum: REGISTER_TYPES,
      description: 'Register data type: u16 (default), i16, u32, i32 or f32 (IEEE-754).',
    },
    wordOrder: {
      type: 'string',
      enum: WORD_ORDERS,
      description: '32-bit word order: ABCD (default), CDAB, BADC or DCBA.',
    },
    scale: { type: 'number', description: 'Engineering scale multiplied after reading (default 1).' },
    offset: { type: 'number', description: 'Engineering offset added after reading (default 0).' },
    address: { type: 'integer', description: 'First address to write, 0-65535.' },
    value: {
      type: 'number',
      description:
        'Value to write: register value (decimal or 0x hex via the panel), coil state 0/1, or bit state 0/1 for write-bit.',
    },
    values: {
      type: 'array',
      items: { type: 'integer' },
      description: 'Batch write: register words or coil states, starting at address.',
    },
    bit: { type: 'integer', description: 'Bit index 0-15 for action write-bit.' },
    expect: {
      type: 'number',
      description:
        'Value action watch waits for, after type/scale/offset are applied (0 or 1 for coil/discrete).',
    },
    tolerance: {
      type: 'number',
      description: 'Absolute tolerance for watch (default 0; f32 defaults to a small relative epsilon).',
    },
    timeoutMs: { type: 'integer', description: 'watch deadline in ms, 100-60000 (default 5000).' },
    intervalMs: { type: 'integer', description: 'watch poll interval in ms, 50-5000 (default 200).' },
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
    kind: { type: 'string' },
    type: { type: 'string' },
    wordOrder: { type: 'string' },
    scale: { type: 'number' },
    offset: { type: 'number' },
    start: { type: 'integer' },
    count: { type: 'integer' },
    values: { type: 'array', items: { type: 'integer' } },
    bits: { type: 'array', items: { type: 'boolean' } },
    rows: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: true,
        properties: {
          address: { type: 'integer' },
          raw: { type: 'array', items: { type: 'integer' } },
          value: { type: 'number' },
          text: { type: 'string' },
        },
      },
    },
    address: { type: 'integer' },
    value: { type: 'number' },
    bit: { type: 'integer' },
    before: { type: 'integer' },
    after: { type: 'integer' },
    expect: { type: 'number' },
    matched: { type: 'boolean' },
    attempts: { type: 'integer' },
    elapsedMs: { type: 'integer' },
    reconnected: { type: 'boolean' },
    latencyMs: { type: 'integer' },
  },
}

const TOOL_DESCRIPTION =
  'Read and write Modbus TCP registers and coils on a server, using the same connection as the Modbus Poll panel. ' +
  'Call action "connect" first (host, port, unitId), then action "read" (kind, start, count, type, wordOrder, scale, offset) ' +
  'or action "write" (address, value or values) or action "write-bit" (address, bit, value), ' +
  'or action "watch" (start, expect, timeoutMs) to wait until a value settles. ' +
  'Writes change the server immediately. A dead socket is reopened automatically on the next action. ' +
  'action "status" reports the live connection without touching the wire; action "disconnect" closes it.'

function hex4(value) {
  return '0x' + value.toString(16).toUpperCase().padStart(4, '0')
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Does one read result satisfy `expect`? Registers compare the decoded value. */
function matches(result, expect, tolerance) {
  if (Array.isArray(result.bits)) {
    return (result.bits[0] ? 1 : 0) === expect
  }
  const row = result.rows && result.rows[0]
  if (!row) {
    throw new ModbusError('watch needs at least one decoded value', 'invalid-parameter', {
      field: 'count',
    })
  }
  return Math.abs(row.value - expect) <= tolerance
}

function normalizeKind(value) {
  const kind =
    value === undefined || value === null || value === ''
      ? 'holding'
      : String(value).toLowerCase()
  if (KINDS.includes(kind)) return kind
  throw new ModbusError(`kind must be one of ${KINDS.join(', ')}`, 'invalid-parameter', {
    field: 'kind',
  })
}

function toBit(value, field = 'value') {
  if (value === true || value === 1 || value === '1' || value === 'on' || value === 'true') return true
  if (value === false || value === 0 || value === '0' || value === 'off' || value === 'false') {
    return false
  }
  throw new ModbusError(`${field} must be 0/1 or true/false`, 'invalid-parameter', { field })
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
  const state = { client: null, target: null, lastError: null, reopening: null }

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
      state.target = { host, port, unitId }
      state.lastError = null
      return
    }
    if (current) current.close()
    state.client = null

    const client = new ModbusTcpClient({ host, port, unitId, timeoutMs: REQUEST_TIMEOUT_MS })
    await client.open()
    state.client = client
    state.target = { host, port, unitId }
    state.lastError = null
  }

  /**
   * Return a usable client, reopening the last target if the socket died.
   *
   * A polling console lives through short network blips; failing the read is
   * less useful than reconnecting to the same server. The caller learns a
   * reopen happened through `reconnected`, so it can say so instead of
   * pretending nothing changed.
   */
  async function ensureClient(body) {
    const unitId = body.unitId === undefined ? undefined : Number(body.unitId)
    if (unitId !== undefined && (!Number.isInteger(unitId) || unitId < 0 || unitId > 255)) {
      throw new ModbusError('unitId must be an integer in 0..255', 'invalid-parameter', { field: 'unitId' })
    }

    const current = state.client
    if (current && !current.closed) {
      if (unitId !== undefined) current.unitId = unitId
      return { client: current, reconnected: false }
    }

    const target = state.target
    if (!target) {
      throw new ModbusError('not connected to a Modbus server', 'not-connected')
    }

    if (!state.reopening) {
      state.reopening = (async () => {
        const next = new ModbusTcpClient({
          host: target.host,
          port: target.port,
          unitId: unitId ?? target.unitId,
          timeoutMs: REQUEST_TIMEOUT_MS,
        })
        await next.open()
        state.client = next
        state.lastError = null
        return next
      })().finally(() => {
        state.reopening = null
      })
    }

    const client = await state.reopening
    if (unitId !== undefined) client.unitId = unitId
    return { client, reconnected: true }
  }

  async function readRegistersOrBits(client, body) {
    const kind = normalizeKind(body.kind)
    const start = Number(body.start)
    const count = Number(body.count)
    const began = Date.now()

    if (kind === 'coil' || kind === 'discrete') {
      const bits =
        kind === 'coil' ? await client.readCoils(start, count) : await client.readDiscreteInputs(start, count)
      return { kind, start, count, bits, latencyMs: Date.now() - began }
    }

    const values =
      kind === 'input'
        ? await client.readInputRegisters(start, count)
        : await client.readHoldingRegisters(start, count)
    const decoded = decodeRegisters(values, {
      type: body.type,
      wordOrder: body.wordOrder,
      scale: body.scale,
      offset: body.offset,
      start,
    })
    return { kind, start, count, values, ...decoded, latencyMs: Date.now() - began }
  }

  async function writeValue(client, body) {
    const kind = normalizeKind(body.kind)
    if (kind === 'discrete') {
      throw new ModbusError('discrete inputs are read-only', 'invalid-parameter', { field: 'kind' })
    }

    if (kind === 'coil') {
      const address = Number(body.address ?? body.start)
      if (Array.isArray(body.values)) {
        const bits = body.values.map((value) => toBit(value, 'values'))
        const written = await client.writeMultipleCoils(address, bits)
        return {
          kind,
          address: written.address,
          count: written.count,
          values: bits.map((on) => (on ? 1 : 0)),
        }
      }
      const written = await client.writeSingleCoil(address, toBit(body.value))
      return { kind, address: written.address, value: written.value, values: [written.value] }
    }

    const address = Number(body.address ?? body.start)
    if (Array.isArray(body.values)) {
      const words = body.values.map((value) => Number(value))
      const written = await client.writeMultipleRegisters(address, words)
      return { kind, address: written.address, count: written.count, values: words }
    }

    const type = normalizeType(body.type)
    const wordOrder = normalizeWordOrder(body.wordOrder)
    const { scale, offset } = normalizeScaling(body)
    const words = encodeValue(Number(body.value), { type, wordOrder, scale, offset })
    if (words.length === 1) {
      const written = await client.writeSingleRegister(address, words[0])
      return {
        kind,
        address: written.address,
        value: written.value,
        values: [written.value],
        type,
        wordOrder,
        scale,
        offset,
      }
    }
    const written = await client.writeMultipleRegisters(address, words)
    return {
      kind,
      address: written.address,
      count: written.count,
      values: words,
      type,
      wordOrder,
      scale,
      offset,
    }
  }

  async function writeBit(client, body) {
    const address = Number(body.address)
    const bit = Number(body.bit)
    if (!Number.isInteger(bit) || bit < 0 || bit > 15) {
      throw new ModbusError('bit must be an integer in 0..15', 'invalid-parameter', { field: 'bit' })
    }
    const enabled =
      body.value === undefined && body.enabled !== undefined
        ? toBit(body.enabled, 'enabled')
        : toBit(body.value)

    const [before] = await client.readHoldingRegisters(address, 1)
    const mask = 1 << bit
    const after = enabled ? (before | mask) & 0xffff : before & ~mask & 0xffff
    await client.writeSingleRegister(address, after)
    return { address, bit, value: enabled ? 1 : 0, before, after }
  }

  /**
   * Poll one value until it matches `expect`, or the deadline passes.
   *
   * `watch` is what lets an agent prove a write took effect instead of
   * reporting success as soon as the frame left.
   */
  async function watchValue(body) {
    const expect = Number(body.expect)
    if (!Number.isFinite(expect)) {
      throw new ModbusError('expect must be a finite number', 'invalid-parameter', { field: 'expect' })
    }
    const type = normalizeType(body.type)
    const timeoutMs = clamp(Number(body.timeoutMs ?? 5000), 100, 60000)
    const intervalMs = clamp(Number(body.intervalMs ?? 200), 50, 5000)
    const tolerance =
      body.tolerance === undefined ? (type === 'f32' ? 1e-6 * Math.max(1, Math.abs(expect)) : 0) : Number(body.tolerance)
    if (!Number.isFinite(tolerance) || tolerance < 0) {
      throw new ModbusError('tolerance must be a non-negative number', 'invalid-parameter', { field: 'tolerance' })
    }

    const began = Date.now()
    let attempts = 0
    let last = null
    for (;;) {
      attempts += 1
      last = await dispatch({
        op: 'read',
        kind: body.kind,
        start: body.start,
        count: body.count ?? typeWidth(type),
        unitId: body.unitId,
        type: body.type,
        wordOrder: body.wordOrder,
        scale: body.scale,
        offset: body.offset,
      })
      if (matches(last, expect, tolerance)) {
        return { ...last, expect, matched: true, attempts, elapsedMs: Date.now() - began }
      }
      const remaining = timeoutMs - (Date.now() - began)
      if (remaining <= 0) {
        return { ...last, expect, matched: false, attempts, elapsedMs: Date.now() - began }
      }
      await sleep(Math.min(intervalMs, remaining))
    }
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
        state.target = null
        state.lastError = null
        return describe()
      case 'read': {
        const { client, reconnected } = await ensureClient(body)
        const result = await readRegistersOrBits(client, body)
        return reconnected ? { ...result, reconnected: true } : result
      }
      case 'write': {
        const { client, reconnected } = await ensureClient(body)
        const result = await writeValue(client, body)
        return reconnected ? { ...result, reconnected: true } : result
      }
      case 'write-bit': {
        const { client, reconnected } = await ensureClient(body)
        const result = await writeBit(client, body)
        return reconnected ? { ...result, reconnected: true } : result
      }
      case 'watch':
        return watchValue(body)
      default:
        throw new ModbusError(
          `unknown operation ${JSON.stringify(op)}; use status, connect, disconnect, read, write, write-bit or watch`,
          'invalid-parameter',
          { field: 'op' },
        )
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

  function bitSummary(result) {
    const first = result.start
    const last = result.start + result.bits.length - 1
    const on = []
    result.bits.forEach((value, index) => {
      if (value) on.push(first + index)
    })
    return (
      `${result.kind} ${first}..${last}: ${result.bits.length} bit(s) in ${result.latencyMs} ms; ` +
      `on: ${on.length === 0 ? 'none' : on.join(', ')}`
    )
  }

  function registerSummary(result) {
    const first = result.start
    const last = result.start + result.values.length - 1
    const lines = result.rows.map((row) => {
      return `${row.address}\t${row.raw.map((word) => hex4(word)).join(' ')}\t${row.text}`
    })
    return (
      `${result.kind} registers ${first}..${last} (${result.type} ${result.wordOrder}): ` +
      `${result.rows.length} value(s) in ${result.latencyMs} ms\n` +
      `address\traw\tvalue\n${lines.join('\n')}`
    )
  }

  /** Say so when a request had to reopen the socket, instead of hiding it. */
  function noteReconnect(summary, result) {
    return result && result.reconnected ? `(reconnected) ${summary}` : summary
  }

  function writeSummary(written) {    if (written.kind === 'coil') {
      return written.count === undefined
        ? `wrote coil ${written.address} = ${written.value}`
        : `wrote ${written.count} coil(s) from ${written.address}`
    }
    if (written.count !== undefined) {
      const words = written.values.map((value) => hex4(value)).join(' ')
      const type = written.type ? ` (${written.type} ${written.wordOrder})` : ''
      return `wrote ${written.count} register(s)${type} from ${written.address}: ${words}`
    }
    return `wrote ${written.value} (${hex4(written.value)}) to holding register ${written.address}`
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
          type: args.type,
          wordOrder: args.wordOrder,
          scale: args.scale,
          offset: args.offset,
        })
        if (result.bits) {
          return {
            action,
            summary: noteReconnect(bitSummary(result), result),
            connected: true,
            ...connectionFields(),
            kind: result.kind,
            start: result.start,
            count: result.count,
            bits: result.bits,
            reconnected: result.reconnected === true,
            latencyMs: result.latencyMs,
          }
        }
        return {
          action,
          summary: noteReconnect(registerSummary(result), result),
          connected: true,
          ...connectionFields(),
          kind: result.kind,
          start: result.start,
          count: result.count,
          type: result.type,
          wordOrder: result.wordOrder,
          scale: result.scale,
          offset: result.offset,
          values: result.values,
          rows: result.rows,
          reconnected: result.reconnected === true,
          latencyMs: result.latencyMs,
        }
      }
      case 'write': {
        const written = await dispatch({
          op: 'write',
          kind: args.kind,
          address: args.address,
          value: args.value,
          values: args.values,
          type: args.type,
          wordOrder: args.wordOrder,
          scale: args.scale,
          offset: args.offset,
        })
        return {
          action,
          summary: noteReconnect(writeSummary(written), written),
          connected: true,
          ...connectionFields(),
          ...written,
        }
      }
      case 'write-bit': {
        const written = await dispatch({
          op: 'write-bit',
          address: args.address,
          bit: args.bit,
          value: args.value,
          unitId: args.unitId,
        })
        const verb = written.value ? 'set' : 'cleared'
        return {
          action,
          summary:
            `${verb} bit ${written.bit} of holding register ${written.address} ` +
            `(${hex4(written.before)} -> ${hex4(written.after)})`,
          connected: true,
          ...connectionFields(),
          ...written,
        }
      }
      case 'watch': {
        const result = await dispatch({
          op: 'watch',
          kind: args.kind,
          start: args.start,
          count: args.count,
          unitId: args.unitId,
          type: args.type,
          wordOrder: args.wordOrder,
          scale: args.scale,
          offset: args.offset,
          expect: args.expect,
          tolerance: args.tolerance,
          timeoutMs: args.timeoutMs,
          intervalMs: args.intervalMs,
        })
        const where = Array.isArray(result.bits)
          ? `${result.kind} ${result.start}`
          : `${result.kind} register ${result.start}`
        const current = Array.isArray(result.bits)
          ? String(result.bits[0] ? 1 : 0)
          : String(result.rows && result.rows[0] ? result.rows[0].text : '?')
        const summary = result.matched
          ? `watch ${where}: matched ${String(result.expect)} as ${current} after ${result.attempts} attempt(s) in ${result.elapsedMs} ms`
          : `watch ${where}: still ${current} after ${result.elapsedMs} ms (${result.attempts} attempt(s)), expected ${String(result.expect)}`
        return { action, summary: noteReconnect(summary, result), connected: true, ...connectionFields(), ...result }
      }
      default:
        throw new ModbusError(
          `unknown action ${JSON.stringify(action)}; use status, connect, disconnect, read, write, write-bit or watch`,
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
