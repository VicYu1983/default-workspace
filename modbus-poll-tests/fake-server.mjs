/**
 * Fake Modbus TCP server used by the plugin tests
 * (FC01, FC02, FC03, FC04, FC05, FC06, FC15, FC16).
 */
import net from 'node:net'

function exceptionFrame(functionCode, code) {
  return Buffer.from([functionCode | 0x80, code])
}

export function createFakeServer(options = {}) {
  const size = options.size ?? 256
  const holding = new Array(size).fill(0)
  const input = new Array(size).fill(0)
  const coils = new Array(size).fill(false)
  const discrete = new Array(size).fill(false)
  for (let index = 0; index < size; index += 1) {
    holding[index] = (index * 7 + 100) & 0xffff
    input[index] = (index * 13 + 1) & 0xffff
    coils[index] = index % 3 === 0
    discrete[index] = index % 5 === 0
  }

  function packBits(bank, start, count) {
    const bytes = Buffer.alloc(Math.ceil(count / 8))
    for (let index = 0; index < count; index += 1) {
      if (bank[start + index]) bytes[index >> 3] |= 1 << (index & 7)
    }
    return bytes
  }

  const sockets = new Set()

  const server = net.createServer((socket) => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
    let buffer = Buffer.alloc(0)
    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk])
      while (buffer.length >= 7) {
        const length = buffer.readUInt16BE(4)
        const total = 6 + length
        if (buffer.length < total) return
        const frame = buffer.subarray(0, total)
        buffer = buffer.subarray(total)

        const transactionId = frame.readUInt16BE(0)
        const unitId = frame.readUInt8(6)
        const functionCode = frame.readUInt8(7)
        // With `units`, only those ids answer; the rest stay silent on purpose.
        if (options.units && !options.units.includes(unitId)) continue
        let pdu

        if (functionCode === 1 || functionCode === 2) {
          const start = frame.readUInt16BE(8)
          const count = frame.readUInt16BE(10)
          const bank = functionCode === 1 ? coils : discrete
          if (count < 1 || start + count > bank.length) {
            pdu = exceptionFrame(functionCode, 2)
          } else {
            const data = packBits(bank, start, count)
            pdu = Buffer.concat([Buffer.from([functionCode, data.length]), data])
          }
        } else if (functionCode === 3 || functionCode === 4) {
          const start = frame.readUInt16BE(8)
          const count = frame.readUInt16BE(10)
          const bank = functionCode === 3 ? holding : input
          if (start + count > bank.length) {
            pdu = exceptionFrame(functionCode, 2)
          } else {
            pdu = Buffer.alloc(2 + count * 2)
            pdu.writeUInt8(count * 2, 0)
            for (let index = 0; index < count; index += 1) {
              pdu.writeUInt16BE(bank[start + index], 1 + index * 2)
            }
            pdu = Buffer.concat([Buffer.from([functionCode]), pdu])
          }
        } else if (functionCode === 5) {
          const address = frame.readUInt16BE(8)
          const value = frame.readUInt16BE(10)
          if (address >= coils.length) {
            pdu = exceptionFrame(functionCode, 2)
          } else {
            coils[address] = value === 0xff00
            pdu = Buffer.from(frame.subarray(7, 12))
          }
        } else if (functionCode === 6) {
          const address = frame.readUInt16BE(8)
          const value = frame.readUInt16BE(10)
          if (address >= holding.length) {
            pdu = exceptionFrame(functionCode, 2)
          } else {
            holding[address] = value
            pdu = Buffer.from(frame.subarray(7, 12))
          }
        } else if (functionCode === 15) {
          const start = frame.readUInt16BE(8)
          const count = frame.readUInt16BE(10)
          const byteCount = frame.readUInt8(12)
          if (count < 1 || start + count > coils.length || byteCount !== Math.ceil(count / 8)) {
            pdu = exceptionFrame(functionCode, 2)
          } else {
            for (let index = 0; index < count; index += 1) {
              const byte = frame.readUInt8(13 + (index >> 3))
              coils[start + index] = ((byte >> (index & 7)) & 1) === 1
            }
            pdu = Buffer.from([functionCode, frame[8], frame[9], frame[10], frame[11]])
          }
        } else if (functionCode === 16) {
          const start = frame.readUInt16BE(8)
          const count = frame.readUInt16BE(10)
          const byteCount = frame.readUInt8(12)
          if (count < 1 || start + count > holding.length || byteCount !== count * 2) {
            pdu = exceptionFrame(functionCode, 2)
          } else {
            for (let index = 0; index < count; index += 1) {
              holding[start + index] = frame.readUInt16BE(13 + index * 2)
            }
            pdu = Buffer.from([functionCode, frame[8], frame[9], frame[10], frame[11]])
          }
        } else {
          pdu = exceptionFrame(functionCode, 1)
        }

        const header = Buffer.alloc(7)
        header.writeUInt16BE(transactionId, 0)
        header.writeUInt16BE(0, 2)
        header.writeUInt16BE(pdu.length + 1, 4)
        header.writeUInt8(unitId, 6)
        socket.write(Buffer.concat([header, pdu]))
      }
    })
    socket.on('error', () => {})
  })

  return {
    holding,
    input,
    coils,
    discrete,
    /** Drop every open connection, as a network blip would. */
    dropConnections() {
      for (const socket of sockets) socket.destroy()
      sockets.clear()
    },
    /** Live server-side connections; a leak shows up here. */
    connectionCount() {
      return sockets.size
    },
    listen() {
      return new Promise((resolve, reject) => {
        server.once('error', reject)
        server.listen(options.port ?? 0, '127.0.0.1', () => {
          server.removeListener('error', reject)
          resolve(server.address().port)
        })
      })
    },
    close() {
      // Drop live connections first: server.close() waits for them, and a test
      // that timed out would otherwise hang forever.
      for (const socket of sockets) socket.destroy()
      sockets.clear()
      return new Promise((resolve) => server.close(() => resolve()))
    },
  }
}
