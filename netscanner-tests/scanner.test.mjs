/**
 * Scanner-core test: parsing, ARP normalization, and a real loopback scan
 * against a temporary TCP listener. Run with:
 *   node netscanner-tests/scanner.test.mjs
 */
import assert from 'node:assert/strict'
import net from 'node:net'
import {
  MAX_HOSTS,
  NetworkScanner,
  ScanError,
  listInterfaces,
  parseArpTable,
  parsePorts,
  parseTargets,
} from '../netscanner/scanner.js'

function closeServer(server) {
  return new Promise((resolve) => server.close(() => resolve()))
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject)
      resolve(server.address().port)
    })
  })
}

async function closedPort() {
  const server = net.createServer()
  const port = await listen(server)
  await closeServer(server)
  return port
}

const cidr30 = parseTargets('192.168.1.0/30')
assert.equal(cidr30.count, 2)
assert.equal(cidr30.label, '192.168.1.0/30')
assert.deepEqual(cidr30.hosts, ['192.168.1.1', '192.168.1.2'])

const normalized = parseTargets('192.168.1.5/24')
assert.equal(normalized.label, '192.168.1.0/24')
assert.equal(normalized.count, 254)
assert.equal(normalized.hosts[0], '192.168.1.1')
assert.equal(normalized.hosts.at(-1), '192.168.1.254')

const shorthand = parseTargets('10.0.0.10-13')
assert.equal(shorthand.count, 4)
assert.deepEqual(shorthand.hosts, ['10.0.0.10', '10.0.0.11', '10.0.0.12', '10.0.0.13'])

const fullRange = parseTargets('10.0.0.254-10.0.1.1')
assert.equal(fullRange.count, 4)
assert.equal(fullRange.hosts.at(-1), '10.0.1.1')

assert.equal(parseTargets('10.0.0.*').count, 254)
assert.equal(parseTargets('127.0.0.1').count, 1)
assert.equal(parseTargets('192.168.0.0/31').count, 2)
assert.equal(parseTargets('192.168.0.7/32').count, 1)

for (const bad of ['', 'not-an-ip', '192.168.1.0/33', '192.168.1.0/7', '192.168.1.9-3', '1.2.3.256']) {
  assert.throws(() => parseTargets(bad), ScanError, `rejects ${JSON.stringify(bad)}`)
}
assert.throws(() => parseTargets('10.0.0.0/16'), (error) => error.code === 'too-many-hosts')

assert.deepEqual(parsePorts([443, 80, 443]), [80, 443])
assert.deepEqual(parsePorts('80,443 8000-8002'), [80, 443, 8000, 8001, 8002])
assert.deepEqual(parsePorts(undefined).length, 10)
assert.throws(() => parsePorts('0'), ScanError)
assert.throws(() => parsePorts('80-90,100-120,200-220,300-310'), /at most 32 ports/)

const arp = parseArpTable(`
Interface: 192.168.1.5 --- 0x4
  192.168.1.1           aa-bb-cc-dd-ee-ff     dynamic
  192.168.1.20          00-11-22-33-44-55     dynamic
  192.168.1.255         ff-ff-ff-ff-ff-ff     static
192.168.1.20             00:11:22:33:44:55     dynamic
? (10.0.0.5) at 11:22:33:44:55:66 [ether] on eth0
`)
assert.equal(arp.get('192.168.1.1'), 'AA:BB:CC:DD:EE:FF')
assert.equal(arp.get('192.168.1.20'), '00:11:22:33:44:55')
assert.equal(arp.get('10.0.0.5'), '11:22:33:44:55:66')
assert.equal(arp.has('192.168.1.255'), false)

const interfaces = listInterfaces()
assert.ok(Array.isArray(interfaces))
for (const entry of interfaces) {
  assert.match(entry.cidr, /^\d+\.\d+\.\d+\.\d+\/\d{1,2}$/)
}

const server = net.createServer((socket) => socket.end())
const openPort = await listen(server)
const shutPort = await closedPort()

try {
  const scanner = new NetworkScanner()
  const started = await scanner.start({
    cidr: '127.0.0.1/32',
    ports: [openPort, shutPort],
    timeoutMs: 800,
    concurrency: 2,
    resolveNames: false,
  })
  assert.equal(started.running, true)
  assert.equal(started.total, 1)

  const done = await scanner.waitForIdle(10000)
  assert.equal(done.running, false)
  assert.equal(done.phase, 'complete')
  assert.equal(done.aliveCount, 1)
  assert.equal(done.scanned, 1)
  assert.equal(done.results[0].ip, '127.0.0.1')
  assert.deepEqual(done.results[0].ports, [openPort])
  assert.ok(Number.isInteger(done.results[0].latencyMs))
  assert.equal(done.results[0].via, 'tcp')

  // A live neighbour whose firewall drops every TCP probe still leaves an ARP
  // entry; the scan must report it as `via: 'arp'` instead of dropping it.
  const arpScanner = new NetworkScanner({
    readArpTable: async () => new Map([['192.0.2.1', 'AA:BB:CC:DD:EE:01']]),
  })
  await arpScanner.start({
    cidr: '192.0.2.0/30',
    ports: [81],
    timeoutMs: 100,
    concurrency: 2,
    resolveNames: false,
  })
  const arpDone = await arpScanner.waitForIdle(10000)
  assert.equal(arpDone.running, false)
  assert.equal(arpDone.aliveCount, 1)
  assert.equal(arpDone.results[0].ip, '192.0.2.1')
  assert.equal(arpDone.results[0].via, 'arp')
  assert.deepEqual(arpDone.results[0].ports, [])
  assert.equal(arpDone.results[0].mac, 'AA:BB:CC:DD:EE:01')
  arpScanner.dispose()

  // A loopback address that is not running: 127.0.0.2/32 still resolves to the
  // loopback interface and is refused, which this scanner treats as reachable.
  const aborted = await scanner.start({
    cidr: '10.255.255.0/28',
    ports: [81, 82],
    timeoutMs: 5000,
    concurrency: 4,
    resolveNames: false,
  })
  assert.equal(aborted.running, true)
  const stopStarted = Date.now()
  const stopped = await scanner.stop()
  assert.equal(stopped.running, false)
  assert.equal(stopped.phase, 'stopped')
  assert.ok(Date.now() - stopStarted < 2500, 'stop aborts pending connects quickly')

  await assert.rejects(
    () => scanner.start({ cidr: '192.168.1.0/30', ports: [80], concurrency: 9999 }),
    (error) => error.code === 'invalid-parameter',
  )
  await assert.rejects(() => scanner.start({ cidr: 'bogus' }), (error) => error.code === 'invalid-target')

  // Parsing a /16 is refused before a single socket opens.
  await assert.rejects(
    () => scanner.start({ cidr: '10.0.0.0/16' }),
    (error) => error.code === 'too-many-hosts' && error.details.max === MAX_HOSTS,
  )

  scanner.dispose()
  console.log('scanner: all assertions passed')
} finally {
  await closeServer(server)
}
