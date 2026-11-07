// Consistency check: client dictionary keys vs t() usage, seed style sanity.
import { readFileSync } from 'node:fs'
import { SEED_STYLES } from '../css-style-library/seed.js'

let failures = 0
function check(name, condition, extra = '') {
  if (condition) console.log('OK  ', name)
  else { failures++; console.log('FAIL', name, extra) }
}

const client = readFileSync('../css-style-library/client.js', 'utf8')

// 1. collect t('...') usages
const used = new Set()
for (const match of client.matchAll(/\bt\('([^']+)'\)/g)) used.add(match[1])
check('t() usages found', used.size > 10, String(used.size))

// 2. collect dictionary keys per locale block
function dictKeys(locale) {
  const start = client.indexOf(`${locale}: {`)
  const next = client.indexOf(`${locale}:`, start + 5)
  const end = next === -1 ? client.length : next
  const block = client.slice(start, end)
  const keys = new Set()
  for (const match of block.matchAll(/'([a-z][\w.]+)':/g)) keys.add(match[1])
  return keys
}
const en = dictKeys('en')
const zh = dictKeys('zh')
check('en dict size', en.size >= used.size, `en=${en.size} used=${used.size}`)
check('en/zh same keys', en.size === zh.size && [...en].every((k) => zh.has(k)),
  `only-en=${[...en].filter((k) => !zh.has(k)).join(',')} only-zh=${[...zh].filter((k) => !en.has(k)).join(',')}`)

const missingEn = [...used].filter((k) => !en.has(k))
const missingZh = [...used].filter((k) => !zh.has(k))
check('all used keys in en', missingEn.length === 0, missingEn.join(','))
check('all used keys in zh', missingZh.length === 0, missingZh.join(','))

// 3. seed sanity
check('seed count is 20', SEED_STYLES.length === 20, String(SEED_STYLES.length))
const names = new Set()
for (const seed of SEED_STYLES) {
  names.add(seed.name)
  const open = (seed.css.match(/\{/g) || []).length
  const close = (seed.css.match(/\}/g) || []).length
  check(`braces balanced: ${seed.name}`, open > 0 && open === close, `open=${open} close=${close}`)
  check(`has class selector: ${seed.name}`, /\.[-A-Za-z_]/.test(seed.css))
  check(`previewHtml present: ${seed.name}`, typeof seed.previewHtml === 'string' && seed.previewHtml.length > 4)
  check(`meta complete: ${seed.name}`, seed.category && seed.tags?.length > 0 && seed.description)
}
check('seed names unique', names.size === SEED_STYLES.length)

console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
