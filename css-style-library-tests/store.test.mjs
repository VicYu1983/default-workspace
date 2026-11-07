// Functional test for the css-style-library store: seeding, CRUD, filters, error codes.
import { LibraryStore } from '../css-style-library/library.js'
import { SEED_STYLES } from '../css-style-library/seed.js'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'csl-test-'))
const file = path.join(dir, 'styles.json')
const store = new LibraryStore({ file, seeds: SEED_STYLES })

let failures = 0
function check(name, condition, extra = '') {
  if (condition) console.log('OK  ', name)
  else {
    failures++
    console.log('FAIL', name, extra)
  }
}
async function expectError(name, code, promise) {
  try {
    await promise
    failures++
    console.log('FAIL', name, '(no error thrown)')
  } catch (error) {
    check(name, error.code === code, `code=${error.code} message=${error.message}`)
  }
}

// 1. first init seeds the library
const seeded = await store.list({})
check('seed count', seeded.total === SEED_STYLES.length, `total=${seeded.total}`)
check('seed categories present', seeded.categories.length > 0)
check('seed file written', (await fs.readFile(file, 'utf8')).includes('"schema_version": 1'))

// 2. list compact rows hide css but carry previewHtml; includeCss shows css
check('list hides css by default', seeded.styles.every((style) => style.css === undefined))
check('list rows carry previewHtml', seeded.styles.every((style) => typeof style.previewHtml === 'string' && style.previewHtml.length > 0))
const withCss = await store.list({ includeCss: true })
check('list includeCss returns css', withCss.styles.every((style) => typeof style.css === 'string' && style.css.length > 0))
check('panel-shaped list is render-ready', (() => {
  // Exactly what the panel sends: every row must have css + previewHtml to feed the iframe.
  const panelList = withCss.styles
  return panelList.every((style) => style.css.length > 0 && style.previewHtml.length > 0)
})())

// 3. query search across name/tags/css
const neon = await store.list({ query: '霓虹' })
check('query by chinese name', neon.total >= 1)
const byCss = await store.list({ query: 'backdrop-filter' })
check('query by css body', byCss.total >= 1)
const multi = await store.list({ query: 'buttons hover' })
check('multi-word query (all words)', multi.total >= 1)
const none = await store.list({ query: 'zzzznotfound' })
check('query with no match', none.total === 0)

// 4. category filter (case-insensitive)
const cards = await store.list({ category: 'CARDS' })
check('category filter case-insensitive', cards.total > 0 && cards.styles.every((s) => s.category === 'cards'))

// 5. get + missing id error
const firstId = seeded.styles[0].id
const got = await store.get(firstId)
check('get by id', got.style.css.length > 0)
await expectError('get unknown id', 'style-not-found', store.get('st_missing'))

// 6. create with tags as string + validation errors
const created = await store.create({
  name: '測試樣式',
  css: '.test-style { color: red; }',
  category: 'tests',
  tags: 'a, b ,a',
  description: 'desc',
})
check('create returns id', created.style.id.startsWith('st_'))
check('create dedupes tags', JSON.stringify(created.style.tags) === '["a","b"]')
await expectError('create without name', 'field-required', store.create({ css: '.x{}' }))
await expectError('create without css', 'field-required', store.create({ name: 'x' }))
await expectError('create long name', 'field-too-long', store.create({ name: 'x'.repeat(90), css: '.x{}' }))
await expectError('create too many tags', 'invalid-field', store.create({ name: 'x', css: '.x{}', tags: 42 }))

// 7. update partial keeps other fields; empty string clears optional field
const updated = await store.update(created.style.id, { description: 'new desc' })
check('update partial keeps css', updated.style.css === '.test-style { color: red; }')
check('update bumps updatedAt', updated.style.updatedAt > created.style.updatedAt)
const cleared = await store.update(created.style.id, { description: '', tags: [] })
check('update clears optional fields', cleared.style.description === '' && cleared.style.tags.length === 0)
await expectError('update unknown id', 'style-not-found', store.update('st_missing', { name: 'y' }))
await expectError('update empty name rejected', 'field-required', store.update(created.style.id, { name: '  ' }))

// 8. list sorting: updated entry first
const afterUpdate = await store.list({})
check('updated entry sorted first', afterUpdate.styles[0].id === created.style.id)

// 9. delete + double delete error
const removed = await store.remove(created.style.id)
check('delete returns name', removed.name === '測試樣式')
await expectError('delete twice', 'style-not-found', store.remove(created.style.id))
const afterDelete = await store.list({})
check('delete persists', afterDelete.total === SEED_STYLES.length)

// 10. reload from disk keeps data (new store instance)
const store2 = new LibraryStore({ file, seeds: SEED_STYLES })
const reloaded = await store2.list({})
check('reload does not re-seed', reloaded.total === SEED_STYLES.length)
const reloadedGet = await store2.get(firstId)
check('reload keeps entries readable', reloadedGet.style.name.length > 0)

// 11. corrupt file surfaces a typed error, not a crash
await fs.writeFile(file, '{not json', 'utf8')
const store3 = new LibraryStore({ file, seeds: [] })
await expectError('corrupt file', 'library-corrupt', store3.list({}))

// 12. writes from another process become visible without a new store instance
const file2 = path.join(dir, 'external.json')
const storeA = new LibraryStore({ file: file2, seeds: [] })
await storeA.create({ name: 'A1', css: '.a1{}' })
const storeB = new LibraryStore({ file: file2, seeds: [] })
await storeB.create({ name: 'B1', css: '.b1{}' })
const seenByA = await storeA.list({})
check('external write visible to first store', seenByA.total === 2 && seenByA.styles.some((s) => s.name === 'B1'))
await storeA.create({ name: 'A2', css: '.a2{}' })
const seenByB = await storeB.list({})
check('external write visible both directions', seenByB.total === 3 && seenByB.styles.some((s) => s.name === 'A2'))

await fs.rm(dir, { recursive: true, force: true })
console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
