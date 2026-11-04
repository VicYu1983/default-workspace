/**
 * Type conversion tests: decode/encode, word order and engineering scaling.
 * These touch no socket, so they pin the numbers the panel and the agent see.
 *
 * Run with: node modbus-poll-tests/types.test.mjs
 */
import assert from 'node:assert/strict'
import {
  decodeRegisters,
  encodeValue,
  formatNumber,
  normalizeScaling,
  normalizeType,
  normalizeWordOrder,
  typeWidth,
} from '../modbus-poll/types.js'

// A float 23.5 is 0x41BC0000: two registers 0x41BC and 0x0000 in ABCD order.
const FLOAT_23_5 = [0x41bc, 0x0000]
assert.equal(decodeRegisters(FLOAT_23_5, { type: 'f32' }).rows[0].value, 23.5)
assert.deepEqual(decodeRegisters(FLOAT_23_5, { type: 'f32' }).rows[0].raw, FLOAT_23_5)

// CDAB takes the low word first, so the same number arrives as [0x0000, 0x41BC].
assert.equal(decodeRegisters([0x0000, 0x41bc], { type: 'f32', wordOrder: 'CDAB' }).rows[0].value, 23.5)
// BADC swaps bytes inside each word.
assert.equal(decodeRegisters([0xbc41, 0x0000], { type: 'f32', wordOrder: 'BADC' }).rows[0].value, 23.5)
// DCBA reverses both words and bytes.
assert.equal(decodeRegisters([0x0000, 0xbc41], { type: 'f32', wordOrder: 'DCBA' }).rows[0].value, 23.5)

// 16-bit types stay single-register regardless of word order.
assert.equal(decodeRegisters([0xffff], { type: 'u16' }).rows[0].value, 65535)
assert.equal(decodeRegisters([0xffff], { type: 'i16' }).rows[0].value, -1)
assert.equal(decodeRegisters([0x8000], { type: 'i16' }).rows[0].value, -32768)

// 32-bit integer types.
assert.equal(decodeRegisters([0x1234, 0x5678], { type: 'u32' }).rows[0].value, 0x12345678)
assert.equal(decodeRegisters([0x5678, 0x1234], { type: 'u32', wordOrder: 'CDAB' }).rows[0].value, 0x12345678)
assert.equal(decodeRegisters([0xffff, 0xfffe], { type: 'i32' }).rows[0].value, -2)
assert.equal(decodeRegisters([0xffff, 0xffff], { type: 'u32' }).rows[0].value, 4294967295)

// Rows carry the address each value starts at, and report an incomplete tail.
const rows = decodeRegisters([1, 2, 3, 4, 5], { type: 'u32', start: 10 })
assert.deepEqual(rows.rows.map((row) => row.address), [10, 12])
assert.deepEqual(rows.rows.map((row) => row.value), [65538, 196612])
assert.equal(rows.trailing, 1, 'one register cannot complete a u32')

// Engineering scaling applies after decoding, and in reverse before encoding.
const scaled = decodeRegisters([235], { type: 'u16', scale: 0.1, offset: 0 }).rows[0]
assert.equal(scaled.numeric, 235)
assert.equal(scaled.value, 23.5)
assert.equal(scaled.text, '23.5')
assert.deepEqual(encodeValue(23.5, { type: 'u16', scale: 0.1 }), [235])
assert.deepEqual(encodeValue(23.5, { type: 'u16', scale: 0.1, offset: 0 }), [235])

// Negative i16 values survive the round trip.
assert.deepEqual(encodeValue(-5, { type: 'i16' }), [0xfffb])
assert.equal(decodeRegisters(encodeValue(-5, { type: 'i16' }), { type: 'i16' }).rows[0].value, -5)

// f32 round trips through every word order.
for (const order of ['ABCD', 'CDAB', 'BADC', 'DCBA']) {
  const words = encodeValue(-1.25, { type: 'f32', wordOrder: order })
  assert.equal(words.length, 2, `f32 ${order} occupies two registers`)
  const back = decodeRegisters(words, { type: 'f32', wordOrder: order }).rows[0].value
  assert.equal(back, -1.25, `f32 ${order} round trip`)
}

assert.deepEqual(encodeValue(23.5, { type: 'f32' }), FLOAT_23_5)
assert.deepEqual(encodeValue(0x12345678, { type: 'u32' }), [0x1234, 0x5678])
assert.deepEqual(encodeValue(0x12345678, { type: 'u32', wordOrder: 'CDAB' }), [0x5678, 0x1234])
assert.deepEqual(encodeValue(-2, { type: 'i32' }), [0xffff, 0xfffe])

// Type metadata.
assert.deepEqual(['u16', 'i16', 'u32', 'i32', 'f32'].map(typeWidth), [1, 1, 2, 2, 2])
assert.equal(normalizeType(undefined), 'u16')
assert.equal(normalizeType('F32'), 'f32')
assert.equal(normalizeWordOrder(undefined), 'ABCD')
assert.equal(normalizeWordOrder('cdab'), 'CDAB')
assert.deepEqual(normalizeScaling({}), { scale: 1, offset: 0 })
assert.deepEqual(normalizeScaling({ scale: '0.5', offset: '10' }), { scale: 0.5, offset: 10 })

// Display formatting drops float noise.
assert.equal(formatNumber(23.5), '23.5')
assert.equal(formatNumber(0.30000000000000004), '0.3')
assert.equal(formatNumber(100), '100')
assert.equal(formatNumber(-1.25), '-1.25')

// Invalid input is rejected with a stable code the routes map to HTTP 400.
const bad = (fn, pattern) => assert.throws(fn, (error) => error.code === 'invalid-parameter' && (!pattern || pattern.test(error.message)))
bad(() => normalizeType('f64'), /type must be one of/)
bad(() => normalizeWordOrder('XYZW'), /wordOrder must be one of/)
bad(() => normalizeScaling({ scale: 0 }), /scale must not be 0/)
bad(() => normalizeScaling({ scale: 'abc' }), /scale must be a finite number/)
bad(() => decodeRegisters('nope'), /registers must be an array/)
bad(() => encodeValue(1.5, { type: 'u16' }), /not a whole register value/)
bad(() => encodeValue(70000, { type: 'u16' }), /0\.\.65535/)
bad(() => encodeValue(-1, { type: 'u16' }), /0\.\.65535/)
bad(() => encodeValue(40000, { type: 'i16' }), /-32768\.\.32767/)
bad(() => encodeValue(-1, { type: 'u32' }), /0\.\.4294967295/)
bad(() => encodeValue(Number.NaN, { type: 'f32' }), /finite number/)

console.log('types: all assertions passed')
