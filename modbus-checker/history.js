/**
 * Batch history and baselines.
 *
 * The desktop tool keeps this in SQLite; here a JSON document is enough for a
 * POC and keeps the plugin dependency-free. The shape is deliberately the same
 * (batches + one baseline per site) so moving to ctx.storage later is an
 * adapter swap rather than a redesign.
 *
 * Writes go through a temp file and a rename so a crash mid-write cannot leave
 * a truncated history — losing the last batch is fine, corrupting all of them
 * is not.
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

export const BATCHES_PER_SITE = 50

function stamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0')
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-` +
    `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  )
}

function randomSuffix() {
  return Math.random().toString(36).slice(2, 6)
}

export function makeBatchId(prefix = 'batch') {
  return `${prefix}-${stamp()}-${randomSuffix()}`
}

export class HistoryStore {
  constructor({ file }) {
    this.file = file
    this.state = { version: 1, batches: [], baselines: {} }
    this.loaded = false
    this.writing = null
  }

  async load() {
    if (this.loaded) return this.state
    try {
      const text = await readFile(this.file, 'utf8')
      const parsed = JSON.parse(text)
      this.state = {
        version: 1,
        batches: Array.isArray(parsed.batches) ? parsed.batches : [],
        baselines: parsed.baselines && typeof parsed.baselines === 'object' ? parsed.baselines : {},
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        // A corrupt history must not stop a check from running.
        this.state = { version: 1, batches: [], baselines: {}, loadError: error.message }
      }
    }
    this.loaded = true
    return this.state
  }

  async persist() {
    if (this.writing) await this.writing
    this.writing = (async () => {
      await mkdir(path.dirname(this.file), { recursive: true })
      const temp = `${this.file}.tmp`
      await writeFile(temp, `${JSON.stringify(this.state, null, 2)}\n`, 'utf8')
      await rename(temp, this.file)
    })()
    try {
      await this.writing
    } finally {
      this.writing = null
    }
  }

  async saveBatch(batch) {
    await this.load()
    const record = {
      id: batch.id ?? makeBatchId(),
      site: batch.site,
      note: batch.note ?? null,
      started_at: batch.started_at,
      finished_at: batch.finished_at ?? new Date().toISOString(),
      duration_ms: batch.duration_ms ?? null,
      cancelled: batch.cancelled === true,
      summary: batch.summary,
      results: batch.results,
    }
    this.state.batches.unshift(record)
    // Keep the store bounded: the newest batches are the ones compared.
    const sameSite = this.state.batches.filter((entry) => entry.site === record.site)
    if (sameSite.length > BATCHES_PER_SITE) {
      const keep = new Set(sameSite.slice(0, BATCHES_PER_SITE).map((entry) => entry.id))
      this.state.batches = this.state.batches.filter(
        (entry) => entry.site !== record.site || keep.has(entry.id),
      )
    }
    await this.persist()
    return record
  }

  async listBatches(site, limit = 20) {
    await this.load()
    return this.state.batches
      .filter((entry) => !site || entry.site === site)
      .slice(0, Math.max(1, Math.min(200, limit)))
      .map((entry) => ({
        id: entry.id,
        site: entry.site,
        note: entry.note,
        started_at: entry.started_at,
        finished_at: entry.finished_at,
        cancelled: entry.cancelled,
        summary: entry.summary,
        baseline: this.state.baselines[entry.site] === entry.id,
      }))
  }

  async getBatch(id) {
    await this.load()
    return this.state.batches.find((entry) => entry.id === id) ?? null
  }

  async latestBatch(site) {
    await this.load()
    return this.state.batches.find((entry) => entry.site === site) ?? null
  }

  async setBaseline(site, batchId) {
    await this.load()
    const batch = this.state.batches.find((entry) => entry.id === batchId)
    if (!batch) return { ok: false, reason: 'batch-not-found' }
    if (batch.site !== site) return { ok: false, reason: 'site-mismatch' }
    this.state.baselines[site] = batchId
    await this.persist()
    return { ok: true, site, batchId }
  }

  async clearBaseline(site) {
    await this.load()
    const existed = this.state.baselines[site] !== undefined
    delete this.state.baselines[site]
    if (existed) await this.persist()
    return { ok: true, cleared: existed }
  }

  async getBaseline(site) {
    await this.load()
    const id = this.state.baselines[site]
    if (!id) return null
    return this.state.batches.find((entry) => entry.id === id) ?? null
  }

  async deleteBatch(id) {
    await this.load()
    const batch = this.state.batches.find((entry) => entry.id === id)
    if (!batch) return { ok: false, reason: 'batch-not-found' }
    if (this.state.baselines[batch.site] === id) return { ok: false, reason: 'batch-is-baseline' }
    this.state.batches = this.state.batches.filter((entry) => entry.id !== id)
    await this.persist()
    return { ok: true }
  }
}
