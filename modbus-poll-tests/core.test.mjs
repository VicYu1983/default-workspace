/**
 * Core protocol tests: real TCP against the fake Modbus server.
 *
 * Run with: node modbus-poll-tests/core.test.mjs
 */
import assert from 'node:assert/strict'
import { ModbusTcpClient } from '../modbus-poll/modbus.js'
import { createFakeServer } from './fake-server.mjs'

const fake = createFakeServer()
const port = await fake.listen()
const client = new ModbusTcpClient({ host: '127.0.0.1', port, unitId: 1, timeoutMs: 2000 })

try {
  // Reading before connecting fails with a clear code.
  await assert.rejects(() => client.readHoldingRegisters(0, 1), (error) => error.code === 'not-connected')

  await client.open()

  const holding = await client.readHoldingRegisters(0, 6)
  assert.deepEqual(holding, fake.holding.slice(0, 6), 'FC03 values')

  const input = await client.readInputRegisters(4, 4)
  assert.deepEqual(input, fake.input.slice(4, 8), 'FC04 values')

  const written = await client.writeSingleRegister(5, 0xbeef)
  assert.deepEqual(written, { address: 5, value: 0xbeef }, 'FC06 echo')
  assert.equal(fake.holding[5], 0xbeef, 'FC06 server state')
  assert.deepEqual(await client.readHoldingRegisters(5, 1), [0xbeef], 'read after write')

  // Concurrent callers are serialized, so each response reaches its own caller.
  const [left, right] = await Promise.all([
    client.readHoldingRegisters(0, 3),
    client.readHoldingRegisters(10, 3),
  ])
  assert.deepEqual(left, fake.holding.slice(0, 3), 'queued read A')
  assert.deepEqual(right, fake.holding.slice(10, 13), 'queued read B')

  // An out-of-range request surfaces the Modbus exception code.
  await assert.rejects(
    () => client.readHoldingRegisters(250, 20),
    (error) => error.code === 'modbus-exception' && error.details.exceptionCode === 2,
  )

  // Invalid parameters are rejected before hitting the wire.
  await assert.rejects(() => client.readHoldingRegisters(0, 200), (error) => error.code === 'invalid-parameter')

  // The client survives a Modbus exception and stays usable.
  assert.deepEqual(await client.readHoldingRegisters(1, 1), [fake.holding[1]], 'usable after exception')

  // Coils and discrete inputs (FC01/FC02) pack bits little-endian inside bytes.
  assert.deepEqual(await client.readCoils(0, 10), fake.coils.slice(0, 10), 'FC01 values')
  assert.deepEqual(await client.readDiscreteInputs(0, 10), fake.discrete.slice(0, 10), 'FC02 values')
  const wide = await client.readCoils(0, 20)
  assert.equal(wide.length, 20, 'twenty coils span three bytes')
  assert.deepEqual(wide, fake.coils.slice(0, 20))

  // FC05 writes one coil and echoes its state.
  assert.deepEqual(await client.writeSingleCoil(2, true), { address: 2, value: 1 })
  assert.equal(fake.coils[2], true, 'FC05 server state')
  assert.deepEqual(await client.writeSingleCoil(2, false), { address: 2, value: 0 })
  assert.equal(fake.coils[2], false)

  // FC15 writes a run of coils in one frame.
  const pattern = [true, false, true, true, false, false, true, false, true, true]
  assert.deepEqual(await client.writeMultipleCoils(40, pattern), { address: 40, count: 10 })
  assert.deepEqual(fake.coils.slice(40, 50), pattern, 'FC15 server state')

  // FC16 writes several registers in one frame.
  assert.deepEqual(await client.writeMultipleRegisters(60, [0x1234, 0xabcd, 0x0001]), {
    address: 60,
    count: 3,
  })
  assert.deepEqual(fake.holding.slice(60, 63), [0x1234, 0xabcd, 0x0001], 'FC16 server state')

  // Batch writes validate their bounds before hitting the wire.
  await assert.rejects(() => client.writeMultipleRegisters(0, []), (error) => error.code === 'invalid-parameter')
  await assert.rejects(() => client.writeMultipleRegisters(0, [70000]), (error) => error.code === 'invalid-parameter')
  await assert.rejects(() => client.writeMultipleCoils(0, []), (error) => error.code === 'invalid-parameter')

  client.close()
  await assert.rejects(() => client.readHoldingRegisters(0, 1), (error) => error.code === 'not-connected')
  await assert.rejects(() => client.readCoils(0, 1), (error) => error.code === 'not-connected')

  console.log('core: all assertions passed')
} finally {
  client.close()
  await fake.close()
}
