/**
 * CSS Style Library — storage and normalization (host side).
 *
 * One JSON document holds every entry; writes go through a temp file plus a
 * rename, serialized in order, so a crash mid-write cannot corrupt the library.
 * All CRUD lives here so the agent tool and the panel route run the exact same
 * code and can never drift apart.
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'

export class LibraryError extends Error {
  constructor(message, code, details) {
    super(message)
    this.name = 'LibraryError'
    this.code = code
    this.details = details
  }
}

function fail(code, message, details) {
  return new LibraryError(message, code, details)
}

const MAX = {
  name: 80,
  category: 40,
  description: 600,
  css: 100_000,
  previewHtml: 30_000,
  tags: 8,
  tag: 30,
}

/**
 * Trim and length-check one text field. `required` fields must be non-empty
 * after trimming; optional fields default to ''.
 */
function cleanText(value, { field, max, required = false }) {
  if (value === undefined || value === null) {
    if (required) throw fail('field-required', `${field} is required`, { field })
    return ''
  }
  if (typeof value !== 'string') {
    throw fail('invalid-field', `${field} must be a string`, { field })
  }
  const text = value.replace(/\r\n/g, '\n').trim()
  if (required && text === '') {
    throw fail('field-required', `${field} must not be empty`, { field })
  }
  if (text.length > max) {
    throw fail('field-too-long', `${field} exceeds ${max} characters (got ${text.length})`, {
      field,
      max,
    })
  }
  return text
}

/** Tags arrive as an array or a comma-separated string; normalize to ≤ 8 unique strings. */
function normalizeTags(raw) {
  let list
  if (raw === undefined || raw === null) list = []
  else if (Array.isArray(raw)) list = raw
  else if (typeof raw === 'string') list = raw.split(/[,，、]+/u)
  else throw fail('invalid-field', 'tags must be an array or a comma-separated string', { field: 'tags' })

  const seen = new Set()
  const tags = []
  for (const item of list) {
    if (typeof item !== 'string') {
      throw fail('invalid-field', 'every tag must be a string', { field: 'tags' })
    }
    const tag = item.trim()
    if (tag === '') continue
    const key = tag.toLowerCase()
    if (seen.has(key)) continue
    if (tag.length > MAX.tag) {
      throw fail('field-too-long', `each tag must be at most ${MAX.tag} characters`, { field: 'tags' })
    }
    seen.add(key)
    tags.push(tag)
    if (tags.length >= MAX.tags) break
  }
  return tags
}

function makeId() {
  return `st_${Date.now().toString(36)}${crypto.randomBytes(4).toString('hex')}`
}

/**
 * Build a normalized entry. Without `existing` this creates a full entry and
 * requires name + css; with `existing` it applies only the provided fields on
 * top of it, so an update can never lose fields the caller did not send.
 */
function normalizeEntry(raw, existing = null) {
  const source = raw && typeof raw === 'object' ? raw : {}
  if (existing === null) {
    const now = new Date().toISOString()
    return {
      id: makeId(),
      name: cleanText(source.name, { field: 'name', max: MAX.name, required: true }),
      css: cleanText(source.css, { field: 'css', max: MAX.css, required: true }),
      category: cleanText(source.category, { field: 'category', max: MAX.category }),
      tags: normalizeTags(source.tags),
      description: cleanText(source.description, { field: 'description', max: MAX.description }),
      previewHtml: cleanText(source.previewHtml, { field: 'previewHtml', max: MAX.previewHtml }),
      createdAt: now,
      updatedAt: now,
    }
  }
  const next = { ...existing }
  if (source.name !== undefined) {
    next.name = cleanText(source.name, { field: 'name', max: MAX.name, required: true })
  }
  if (source.css !== undefined) {
    next.css = cleanText(source.css, { field: 'css', max: MAX.css, required: true })
  }
  if (source.category !== undefined) {
    next.category = cleanText(source.category, { field: 'category', max: MAX.category })
  }
  if (source.tags !== undefined) next.tags = normalizeTags(source.tags)
  if (source.description !== undefined) {
    next.description = cleanText(source.description, { field: 'description', max: MAX.description })
  }
  if (source.previewHtml !== undefined) {
    next.previewHtml = cleanText(source.previewHtml, { field: 'previewHtml', max: MAX.previewHtml })
  }
  next.updatedAt = new Date().toISOString()
  return next
}

/** Every whitespace-separated word must appear somewhere in the entry. */
function matchesQuery(entry, needle) {
  if (needle === '') return true
  const haystack = [
    entry.name,
    entry.category,
    entry.description,
    ...(entry.tags || []),
    entry.css,
  ]
    .join('\n')
    .toLowerCase()
  return needle.split(/\s+/u).every((word) => haystack.includes(word))
}

export class LibraryStore {
  constructor({ file, seeds = [] }) {
    this.file = file
    this.seeds = Array.isArray(seeds) ? seeds : []
    this.styles = []
    this.byId = new Map()
    this.loaded = false
    this.writing = null
  }

  setStyles(styles) {
    this.styles = styles
      .slice()
      .sort(
        (a, b) =>
          String(b.updatedAt).localeCompare(String(a.updatedAt)) ||
          a.name.localeCompare(b.name, 'zh-Hant'),
      )
    this.byId = new Map(this.styles.map((entry) => [entry.id, entry]))
  }

  /** Load the JSON document; seed it on first run when the file does not exist. */
  async init() {
    if (this.loaded) return
    const raw = await this.read()
    if (raw === null) {
      const now = new Date().toISOString()
      const styles = this.seeds.map((seed) => {
        const entry = normalizeEntry(seed)
        entry.createdAt = now
        entry.updatedAt = now
        return entry
      })
      await this.write(styles)
      this.setStyles(styles)
      this.loaded = true
      return
    }
    const styles = []
    if (Array.isArray(raw?.styles)) {
      for (const entry of raw.styles) {
        if (!entry || typeof entry !== 'object') continue
        if (typeof entry.id !== 'string' || entry.id === '') continue
        if (typeof entry.name !== 'string' || typeof entry.css !== 'string') continue
        styles.push({
          id: entry.id,
          name: entry.name,
          css: entry.css,
          category: typeof entry.category === 'string' ? entry.category : '',
          tags: Array.isArray(entry.tags) ? entry.tags.filter((tag) => typeof tag === 'string') : [],
          description: typeof entry.description === 'string' ? entry.description : '',
          previewHtml: typeof entry.previewHtml === 'string' ? entry.previewHtml : '',
          createdAt: typeof entry.createdAt === 'string' ? entry.createdAt : '',
          updatedAt: typeof entry.updatedAt === 'string' ? entry.updatedAt : '',
        })
      }
    }
    this.setStyles(styles)
    this.loaded = true
  }

  async read() {
    let text
    try {
      text = await readFile(this.file, 'utf8')
    } catch (error) {
      if (error && error.code === 'ENOENT') return null
      throw fail('library-unreadable', `cannot read ${this.file}: ${error.message}`, {
        file: this.file,
      })
    }
    try {
      return JSON.parse(text)
    } catch {
      throw fail('library-corrupt', `${this.file} is not valid JSON; repair or delete the file to re-seed`, {
        file: this.file,
      })
    }
  }

  async write(styles) {
    if (this.writing) await this.writing
    this.writing = (async () => {
      await mkdir(path.dirname(this.file), { recursive: true })
      const temp = `${this.file}.tmp`
      await writeFile(temp, `${JSON.stringify({ schema_version: 1, styles }, null, 2)}\n`, 'utf8')
      await rename(temp, this.file)
    })()
    try {
      await this.writing
    } finally {
      this.writing = null
    }
  }

  /** Compact view for list rows; the full css ships only on request. */
  publicView(entry, includeCss = false) {
    const view = {
      id: entry.id,
      name: entry.name,
      category: entry.category,
      tags: entry.tags,
      description: entry.description,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
      cssLength: entry.css.length,
      hasPreviewHtml: entry.previewHtml !== '',
    }
    if (includeCss) view.css = entry.css
    return view
  }

  categoryCounts() {
    const counts = new Map()
    for (const entry of this.styles) {
      const key = entry.category || ''
      counts.set(key, (counts.get(key) || 0) + 1)
    }
    return [...counts.entries()]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, 'zh-Hant'))
  }

  async list({ query = '', category = '', limit = 100, includeCss = false } = {}) {
    await this.init()
    const needle = String(query ?? '').trim().toLowerCase()
    const wantCategory = String(category ?? '').trim().toLowerCase()
    let rows = this.styles
    if (wantCategory) rows = rows.filter((entry) => (entry.category || '').toLowerCase() === wantCategory)
    if (needle) rows = rows.filter((entry) => matchesQuery(entry, needle))
    const cap = Math.max(1, Math.min(500, Number(limit) || 100))
    const shown = rows.slice(0, cap)
    return {
      total: rows.length,
      shown: shown.length,
      styles: shown.map((entry) => this.publicView(entry, includeCss === true)),
      categories: this.categoryCounts(),
    }
  }

  async get(id) {
    await this.init()
    const key = String(id ?? '').trim()
    const entry = this.byId.get(key)
    if (!entry) {
      throw fail('style-not-found', `no style with id ${JSON.stringify(key)}`, { field: 'id' })
    }
    return { style: entry }
  }

  async create(input) {
    await this.init()
    const entry = normalizeEntry(input)
    this.styles.push(entry)
    await this.write(this.styles)
    this.setStyles(this.styles)
    return { style: entry }
  }

  async update(id, patch) {
    await this.init()
    const key = String(id ?? '').trim()
    const existing = this.byId.get(key)
    if (!existing) {
      throw fail('style-not-found', `no style with id ${JSON.stringify(key)}`, { field: 'id' })
    }
    const entry = normalizeEntry(patch, existing)
    const index = this.styles.indexOf(existing)
    this.styles[index] = entry
    await this.write(this.styles)
    this.setStyles(this.styles)
    return { style: entry }
  }

  async remove(id) {
    await this.init()
    const key = String(id ?? '').trim()
    const existing = this.byId.get(key)
    if (!existing) {
      throw fail('style-not-found', `no style with id ${JSON.stringify(key)}`, { field: 'id' })
    }
    const index = this.styles.indexOf(existing)
    this.styles.splice(index, 1)
    await this.write(this.styles)
    this.setStyles(this.styles)
    return { deleted: existing.id, name: existing.name }
  }
}
