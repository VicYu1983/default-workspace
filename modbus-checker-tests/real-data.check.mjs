/**
 * Read-only compatibility check against the real ModbusPollChecker site files.
 * Loads every site, normalises it and prints the summary the tool would give.
 *
 * Usage: node modbus-checker-tests/real-data.check.mjs [sitesDir]
 */
import { listSites, loadSite, summarizeSite, selectDevices } from '../modbus-checker/sites.js'

const dir = process.argv[2] ?? 'C:/Users/user/Desktop/baoqi/開發/modbusPollChecker/data'

const sites = await listSites(dir)
console.log(`dir: ${dir}`)
console.log(`sites: ${sites.length}`)
for (const site of sites) {
  if (site.error) {
    console.log(`  ${site.site} - unreadable: ${site.error}`)
    continue
  }
  const loaded = await loadSite(dir, site.site)
  const stats = summarizeSite(loaded)
  const enabled = selectDevices(loaded).devices
  console.log(
    [
      `  ${stats.site}`,
      `${stats.devices} 台 (啟用 ${stats.enabled})`,
      `profiles: ${stats.byProfile.map((entry) => `${entry.value}×${entry.count}`).join(' ')}`,
      `functions: ${stats.byFunction.map((entry) => `${entry.value}×${entry.count}`).join(' ')}`,
      `subnets: ${stats.subnets.length}`,
      `distinct IPs: ${stats.distinctIps}`,
      `duplicates: ${stats.duplicateIps.length}`,
      `selectable(enabled): ${enabled.length}`,
    ].join(' | '),
  )
}
