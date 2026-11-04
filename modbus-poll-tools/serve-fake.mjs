/**
 * Runs the fake Modbus TCP server so the panel and the `modbus_poll` tool can
 * be tried without hardware.
 *
 * Usage: node modbus-poll-tools/serve-fake.mjs [port] [unitId]
 * The server holds 256 registers/coils; FC01/02/03/04/05/06/15/16 are served.
 */
import { createFakeServer } from '../modbus-poll-tests/fake-server.mjs'

const port = Number(process.argv[2] ?? 15020)
const fake = createFakeServer({ port })

const actual = await fake.listen()
console.log(`fake Modbus TCP server listening on 127.0.0.1:${actual}`)
console.log('holding[0..7] =', fake.holding.slice(0, 8).join(', '))
console.log('coils[0..9]   =', fake.coils.slice(0, 10).map((on) => (on ? 1 : 0)).join(', '))
console.log('press Ctrl+C to stop')

const stop = async () => {
  await fake.close()
  process.exit(0)
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
