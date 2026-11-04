/**
 * Register data types, word order and engineering-unit scaling.
 *
 * Shared by the panel route and the agent tool, so both show exactly the same
 * number for the same raw registers. No socket code lives here: encoding turns
 * an engineering value into 16-bit words, decoding turns words back into one.
 */
import { ModbusError } from './modbus.js'

export const REGISTER_TYPES = ['u16', 'i16', 'u32', 'i32', 'f32']
export const WORD_ORDERS = ['ABCD', 'CDAB', 'BADC', 'DCBA']

const TYPE_WIDTH = { u16: 1, i16: 1, u32: 2, i32: 2, f32: 2 }

export function normalizeType(value) {
  const type =
    value === undefined || value === null || value === '' ? 'u16' : String(value).toLowerCase()
  if (!Object.hasOwn(TYPE_WIDTH, type)) {
    throw new ModbusError(`type must be one of ${REGISTER_TYPES.join(', ')}`, 'invalid-parameter', {
      field: 'type',
    })
  }
  return type
}

export function normalizeWordOrder(value) {
  const order =
    value === undefined || value === null || value === '' ? 'ABCD' : String(value).toUpperCase()
  if (!WORD_ORDERS.includes(order)) {
    throw new ModbusError(
      `wordOrder must be one of ${WORD_ORDERS.join(', ')}`,
      'invalid-parameter',
      { field: 'wordOrder' },
    )
  }
  return order
}

/** Registers one value of this type occupies. */
export function typeWidth(type) {
  return TYPE_WIDTH[normalizeType(type)]
}

export function normalizeScaling(options = {}) {
  const scale = finite('scale', options.scale, 1)
  if (scale === 0) {
    throw new ModbusError('scale must not be 0', 'invalid-parameter', { field: 'scale' })
  }
  return { scale, offset: finite('offset', options.offset, 0) }
}

function finite(name, value, fallback) {
  if (value === undefined || value === null || value === '') return fallback
  const number = Number(value)
  if (!Number.isFinite(number)) {
    throw new ModbusError(`${name} must be a finite number`, 'invalid-parameter', { field: name })
  }
  return number
}

/**
 * Split four bytes into two registers for the requested word order.
 *
 * `ABCD` is the natural big-endian layout (the high word first), the other
 * three are the swapped variants devices actually ship with.
 */
function bufferToWords(buffer, order) {
  const [a, b, c, d] = buffer
  switch (order) {
    case 'CDAB':
      return [((c << 8) | d) & 0xffff, ((a << 8) | b) & 0xffff]
    case 'BADC':
      return [((b << 8) | a) & 0xffff, ((d << 8) | c) & 0xffff]
    case 'DCBA':
      return [((d << 8) | c) & 0xffff, ((b << 8) | a) & 0xffff]
    case 'ABCD':
    default:
      return [((a << 8) | b) & 0xffff, ((c << 8) | d) & 0xffff]
  }
}

function wordsToBuffer(words, order) {
  const first = words[0] & 0xffff
  const second = words[1] & 0xffff
  const hi = (word) => (word >> 8) & 0xff
  const lo = (word) => word & 0xff
  switch (order) {
    case 'CDAB':
      return Buffer.from([hi(second), lo(second), hi(first), lo(first)])
    case 'BADC':
      return Buffer.from([lo(first), hi(first), lo(second), hi(second)])
    case 'DCBA':
      return Buffer.from([lo(second), hi(second), lo(first), hi(first)])
    case 'ABCD':
    default:
      return Buffer.from([hi(first), lo(first), hi(second), lo(second)])
  }
}

function decodeOne(words, type, order) {
  if (type === 'u16') return words[0] & 0xffff
  if (type === 'i16') {
    const raw = words[0] & 0xffff
    return raw & 0x8000 ? raw - 0x10000 : raw
  }
  const buffer = wordsToBuffer(words, order)
  if (type === 'u32') return buffer.readUInt32BE(0)
  if (type === 'i32') return buffer.readInt32BE(0)
  return buffer.readFloatBE(0)
}

/** Format a value for display without float noise (`23.500000000000004` → `23.5`). */
export function formatNumber(value) {
  if (!Number.isFinite(value)) return String(value)
  if (Number.isInteger(value)) return String(value)
  return String(Number(value.toFixed(6)))
}

/**
 * Decode a block of raw registers into typed rows.
 *
 * A trailing register that cannot complete a 32-bit value is reported in
 * `trailing` instead of being silently dropped.
 */
export function decodeRegisters(registers, options = {}) {
  if (!Array.isArray(registers)) {
    throw new ModbusError('registers must be an array', 'invalid-parameter', { field: 'registers' })
  }
  const type = normalizeType(options.type)
  const wordOrder = normalizeWordOrder(options.wordOrder)
  const width = TYPE_WIDTH[type]
  const { scale, offset } = normalizeScaling(options)
  const start = Number.isInteger(options.start) ? options.start : null

  const complete = Math.floor(registers.length / width)
  const rows = []
  for (let index = 0; index < complete; index += 1) {
    const slice = registers.slice(index * width, index * width + width)
    const numeric = decodeOne(slice, type, wordOrder)
    const value = numeric * scale + offset
    rows.push({
      index,
      address: start === null ? index * width : start + index * width,
      raw: slice,
      numeric,
      value,
      text: formatNumber(value),
    })
  }

  return {
    type,
    wordOrder,
    width,
    scale,
    offset,
    rows,
    trailing: registers.length - complete * width,
  }
}

/**
 * Encode one engineering value into the registers a write should send.
 *
 * `scale`/`offset` are applied in reverse, so a value read as `23.5` with
 * `scale: 0.1` is written back as `235`.
 */
export function encodeValue(value, options = {}) {
  const type = normalizeType(options.type)
  const wordOrder = normalizeWordOrder(options.wordOrder)
  const { scale, offset } = normalizeScaling(options)

  const engineering = Number(value)
  if (!Number.isFinite(engineering)) {
    throw new ModbusError('value must be a finite number', 'invalid-parameter', { field: 'value' })
  }
  const raw = (engineering - offset) / scale

  if (type === 'f32') {
    const buffer = Buffer.alloc(4)
    buffer.writeFloatBE(raw, 0)
    return bufferToWords(buffer, wordOrder)
  }

  if (!Number.isInteger(raw)) {
    throw new ModbusError(
      `value ${formatNumber(engineering)} is not a whole register value after scaling`,
      'invalid-parameter',
      { field: 'value' },
    )
  }

  if (type === 'u16') {
    if (raw < 0 || raw > 0xffff) {
      throw new ModbusError('value must be in 0..65535', 'invalid-parameter', { field: 'value' })
    }
    return [raw & 0xffff]
  }
  if (type === 'i16') {
    if (raw < -0x8000 || raw > 0x7fff) {
      throw new ModbusError('value must be in -32768..32767', 'invalid-parameter', {
        field: 'value',
      })
    }
    return [raw & 0xffff]
  }

  const buffer = Buffer.alloc(4)
  if (type === 'u32') {
    if (raw < 0 || raw > 0xffffffff) {
      throw new ModbusError('value must be in 0..4294967295', 'invalid-parameter', { field: 'value' })
    }
    buffer.writeUInt32BE(raw, 0)
  } else {
    if (raw < -0x80000000 || raw > 0x7fffffff) {
      throw new ModbusError('value must be in -2147483648..2147483647', 'invalid-parameter', {
        field: 'value',
      })
    }
    buffer.writeInt32BE(raw, 0)
  }
  return bufferToWords(buffer, wordOrder)
}
