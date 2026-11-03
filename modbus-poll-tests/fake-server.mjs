/**
 * Fake Modbus TCP server used by the plugin tests (FC03, FC04, FC06).
 */
import net from 'node:net'

function exceptionFrame(functionCode, code) {
  return Buffer.from([functionCode | 0x80, code])
}

export function createFakeServer(options = {}) {
  const size = options.size ?? 256
  const holding = new Array(size).fill(0)
  const input = new Array(size).fill(0)
  for (let index = 0; index < size; index += 1) {
    holding[index] = (index * 7 + 100) & 0xffff
    input[index] = (index * 13 + 1) & 0xffff
  }

  const server = net.createServer((socket) => {
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
        let pdu

        if (functionCode === 3 || functionCode === 4) {
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
        } else if (functionCode === 6) {
          const address = frame.readUInt16BE(8)
          const value = frame.readUInt16BE(10)
          if (address >= holding.length) {
            pdu = exceptionFrame(functionCode, 2)
          } else {
            holding[address] = value
            pdu = Buffer.from(frame.subarray(7, 12))
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
    listen() {
      return new Promise((resolve, reject) => {
        server.once('error', reject)
        server.listen(0, '127.0.0.1', () => {
          server.removeListener('error', reject)
          resolve(server.address().port)
        })
      })
    },
    close() {
      return new Promise((resolve) => server.close(() => resolve()))
    },
  }
}
