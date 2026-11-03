/**
 * One-shot Modbus TCP reader built on the plugin's host-side core.
 *
 * Usage: node modbus-poll-tools/query.mjs [host] [port] [start] [count] [unitId]
 * Prints holding registers (FC03) and input registers (FC04) side by side.
 */
import { ModbusTcpClient } from '../modbus-poll/modbus.js'

const host = process.argv[2] ?? '127.0.0.1'
const port = Number(process.argv[3] ?? 502)
const start = Number(process.argv[4] ?? 0)
const count = Number(process.argv[5] ?? 16)
const unitId = Number(process.argv[6] ?? 1)

const client = new ModbusTcpClient({ host, port, unitId, timeoutMs: 3000 })

function hex(value) {
  return '0x' + value.toString(16).toUpperCase().padStart(4, '0')
}

try {
  await client.open()
  console.log(`connected ${host}:${port} unit=${unitId}`)

  const holding = await client.readHoldingRegisters(start, count)
  const input = await client.readInputRegisters(start, count)

  console.log('')
  console.log('addr  holding        input')
  for (let index = 0; index < count; index += 1) {
    const address = String(start + index).padStart(4, ' ')
    const left = `${String(holding[index]).padStart(5, ' ')} ${hex(holding[index])}`
    const right = `${String(input[index]).padStart(5, ' ')} ${hex(input[index])}`
    console.log(`${address}  ${left}  ${right}`)
  }
} catch (error) {
  console.error(`failed: ${error.code ?? 'error'}: ${error.message}`)
  if (error.details) console.error(JSON.stringify(error.details))
  process.exitCode = 1
} finally {
  client.close()
}
