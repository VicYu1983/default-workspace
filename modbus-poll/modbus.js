/**
 * Minimal Modbus TCP client (host side).
 *
 * Implements the subset a monitoring/polling tool needs:
 *   FC03 read holding registers, FC04 read input registers, FC06 write single register.
 *
 * One request is in flight at a time; concurrent callers are queued in order so
 * responses can never be matched to the wrong request. A timeout destroys the
 * socket, because a late frame would otherwise desynchronize the stream.
 */
import net from 'node:net'

const EXCEPTION_NAMES = {
  1: 'illegal function',
  2: 'illegal data address',
  3: 'illegal data value',
  4: 'server device failure',
  5: 'acknowledge',
  6: 'server device busy',
  8: 'memory parity error',
  10: 'gateway path unavailable',
  11: 'gateway target failed to respond',
}

export class ModbusError extends Error {
  constructor(message, code, details) {
    super(message)
    this.name = 'ModbusError'
    this.code = code
    if (details !== undefined) this.details = details
  }
}

function integer(name, value, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new ModbusError(`${name} must be an integer in ${min}..${max}`, 'invalid-parameter', { field: name, min, max })
  }
  return value
}

export class ModbusTcpClient {
  constructor(options = {}) {
    this.host = options.host ?? '127.0.0.1'
    this.port = options.port ?? 502
    this.unitId = options.unitId ?? 1
    this.timeoutMs = options.timeoutMs ?? 3000
    this.socket = null
    this.buffer = Buffer.alloc(0)
    this.nextTransactionId = 1
    this.pending = new Map()
    this.tail = Promise.resolve()
    this.closed = true
    this.opening = null
  }

  get key() {
    return `${this.host}:${this.port}`
  }

  open() {
    if (!this.closed) return Promise.resolve(this)
    if (this.opening) return this.opening.then(() => this)

    const promise = new Promise((resolve, reject) => {
      const socket = net.createConnection({ host: this.host, port: this.port })
      socket.setNoDelay(true)
      let settled = false

      const timer = setTimeout(() => {
        fail(new ModbusError(`connect timeout after ${this.timeoutMs}ms`, 'connect-timeout'))
      }, this.timeoutMs)

      const fail = (error) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        socket.removeListener('connect', onConnect)
        socket.removeListener('error', onError)
        socket.destroy()
        reject(error)
      }

      const onConnect = () => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        socket.removeListener('connect', onConnect)
        socket.removeListener('error', onError)
        this.socket = socket
        this.closed = false
        this.buffer = Buffer.alloc(0)
        socket.on('data', (chunk) => this.onData(chunk))
        socket.on('error', (error) => {
          this.teardown(new ModbusError(`socket error: ${error.message}`, 'socket-error'))
        })
        socket.on('close', () => {
          this.teardown(new ModbusError('connection closed by peer', 'connection-closed'))
        })
        resolve(this)
      }

      const onError = (error) => {
        fail(new ModbusError(`connect failed: ${error.message}`, 'connect-failed'))
      }

      socket.once('connect', onConnect)
      socket.once('error', onError)
    })

    this.opening = promise
    return promise.finally(() => {
      this.opening = null
    })
  }

  close() {
    const socket = this.socket
    this.teardown(new ModbusError('disconnected', 'disconnected'))
    if (socket) socket.destroy()
  }

  teardown(error) {
    this.closed = true
    this.socket = null
    this.buffer = Buffer.alloc(0)
    if (this.pending.size === 0) return
    const pending = [...this.pending.values()]
    this.pending.clear()
    for (const entry of pending) {
      clearTimeout(entry.timer)
      entry.reject(error)
    }
  }

  onData(chunk) {
    this.buffer = this.buffer.length === 0 ? chunk : Buffer.concat([this.buffer, chunk])
    while (this.buffer.length >= 7) {
      const length = this.buffer.readUInt16BE(4)
      const total = 6 + length
      if (length < 2 || total > 260) {
        this.teardown(new ModbusError('invalid response frame', 'protocol-error'))
        return
      }
      if (this.buffer.length < total) return
      const frame = this.buffer.subarray(0, total)
      this.buffer = this.buffer.subarray(total)
      this.onFrame(frame)
    }
  }

  onFrame(frame) {
    const transactionId = frame.readUInt16BE(0)
    const entry = this.pending.get(transactionId)
    if (!entry) return
    this.pending.delete(transactionId)
    clearTimeout(entry.timer)

    const functionCode = frame.readUInt8(7)
    if (functionCode & 0x80) {
      const exceptionCode = frame.readUInt8(8)
      entry.reject(
        new ModbusError(
          `modbus exception ${exceptionCode}: ${EXCEPTION_NAMES[exceptionCode] ?? 'unknown'}`,
          'modbus-exception',
          { exceptionCode, functionCode: functionCode & 0x7f },
        ),
      )
      return
    }
    entry.resolve(frame.subarray(8))
  }

  request(pdu) {
    const run = () => this.transact(pdu)
    const result = this.tail.then(run, run)
    this.tail = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }

  transact(pdu) {
    const socket = this.socket
    if (!socket || this.closed) {
      return Promise.reject(new ModbusError('not connected', 'not-connected'))
    }

    const transactionId = this.nextTransactionId
    this.nextTransactionId = transactionId >= 0xffff ? 1 : transactionId + 1

    const frame = Buffer.allocUnsafe(7 + pdu.length)
    frame.writeUInt16BE(transactionId, 0)
    frame.writeUInt16BE(0, 2)
    frame.writeUInt16BE(pdu.length + 1, 4)
    frame.writeUInt8(this.unitId & 0xff, 6)
    pdu.copy(frame, 7)

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(transactionId)
        const error = new ModbusError(`no response within ${this.timeoutMs}ms`, 'timeout')
        this.teardown(error)
        const current = this.socket
        if (current) current.destroy()
        reject(error)
      }, this.timeoutMs)

      this.pending.set(transactionId, { resolve, reject, timer })

      socket.write(frame, (error) => {
        if (!error) return
        const entry = this.pending.get(transactionId)
        if (!entry) return
        this.pending.delete(transactionId)
        clearTimeout(entry.timer)
        entry.reject(new ModbusError(`write failed: ${error.message}`, 'write-failed'))
      })
    })
  }

  async readHoldingRegisters(start, count) {
    return this.readRegisters(3, start, count)
  }

  async readInputRegisters(start, count) {
    return this.readRegisters(4, start, count)
  }

  async readRegisters(functionCode, start, count) {
    integer('start', start, 0, 65535)
    integer('count', count, 1, 125)
    const pdu = Buffer.from([
      functionCode,
      (start >> 8) & 0xff,
      start & 0xff,
      (count >> 8) & 0xff,
      count & 0xff,
    ])
    const body = await this.request(pdu)
    const expected = count * 2
    if (body.length < 1 + expected || body[0] < expected) {
      throw new ModbusError('short register response', 'protocol-error', {
        expected,
        received: Math.max(0, body.length - 1),
      })
    }
    const values = new Array(count)
    for (let index = 0; index < count; index += 1) {
      values[index] = (body[1 + index * 2] << 8) | body[2 + index * 2]
    }
    return values
  }

  async writeSingleRegister(address, value) {
    integer('address', address, 0, 65535)
    integer('value', value, 0, 65535)
    const pdu = Buffer.from([
      6,
      (address >> 8) & 0xff,
      address & 0xff,
      (value >> 8) & 0xff,
      value & 0xff,
    ])
    const body = await this.request(pdu)
    if (body.length < 4) {
      throw new ModbusError('short write response', 'protocol-error', { received: body.length })
    }
    return {
      address: (body[0] << 8) | body[1],
      value: (body[2] << 8) | body[3],
    }
  }
}
