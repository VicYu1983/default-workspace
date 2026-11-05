/**
 * Modbus Site Checker — host half.
 *
 * One implementation, two callers:
 *   - the agent, through three tools (site_devices / site_check / site_baseline);
 *   - the panel, over an authenticated same-origin JSON route (/modbus-checker/api).
 *
 * Both go through dispatch(op, args), so the panel can never drift from what
 * the agent can do.
 *
 * Long batches run as jobs: a tool call that blocks for minutes would be killed
 * by the runner, and the caller learns more from progress than from a timeout.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { checkDevices, summarizeResults } from './checker.js'
import { compareBatches, describeComparison } from './compare.js'
import { HistoryStore, makeBatchId } from './history.js'
import {
  SiteError,
  assertSiteName,
  deleteSite,
  listSites,
  loadSite,
  normalizeSite,
  saveSite,
  selectDevices,
  siteExists,
  summarizeSite,
} from './sites.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_SITES_DIR = process.env.DSH_MODBUS_CHECKER_SITES || path.join(HERE, 'sites')
const DEFAULT_DATA_DIR = process.env.DSH_MODBUS_CHECKER_DATA || path.join(HERE, 'data')

const ROUTE_PATH = '/modbus-checker/api'
/** A 500-device site JSON is well under this; the limit only stops runaway bodies. */
const MAX_BODY_BYTES = 512 * 1024

/** Above this many devices a run is handed back as a job instead of blocking. */
const AUTO_BACKGROUND_DEVICES = 25
const MAX_JOBS = 20

const SITES_DIR_PARAM = {
  type: 'string',
  description:
    'Directory holding <site>.json files. Defaults to the plugin\'s own sites/ directory; point it at a ModbusPollChecker data/ folder to use existing site files.',
}

const FILTER_PARAM = {
  type: 'object',
  additionalProperties: false,
  description: 'Narrow the device selection.',
  properties: {
    profile: { type: 'string', enum: ['ping', 'ping_tcp', 'full_stack'] },
    function: { type: 'string', enum: ['01', '02', '03', '04'] },
    ipPrefix: { type: 'string' },
    enabled: { type: 'boolean' },
    nameContains: { type: 'string' },
  },
}

function fail(code, message, details) {
  return new SiteError(message, code, details)
}

function ok(payload) {
  return { ok: true, ...payload }
}

export const inject = ['tools', 'webServer']

export function apply(ctx) {
  const store = new HistoryStore({ file: path.join(DEFAULT_DATA_DIR, 'history.json') })
  const jobs = new Map()
  const controllers = new Map()

  function sitesDirOf(args) {
    return path.resolve(String(args?.sitesDir ?? DEFAULT_SITES_DIR))
  }

  async function resolveSite(args) {
    const dir = sitesDirOf(args)
    const siteName = String(args?.site ?? '').trim()

    if (siteName === '') {
      const sites = await listSites(dir)
      const readable = sites.filter((entry) => !entry.error)
      if (readable.length === 1) {
        return { dir, site: await loadSite(dir, readable[0].site) }
      }
      if (readable.length === 0) {
        throw fail('no-sites', `no readable site files in ${dir}`, { dir, found: sites.length })
      }
      throw fail('site-required', `site is required; ${dir} holds ${readable.length} sites`, {
        dir,
        sites: readable.map((entry) => entry.site),
      })
    }
    return { dir, site: await loadSite(dir, siteName) }
  }

  function rememberJob(job) {
    jobs.set(job.id, job)
    if (jobs.size > MAX_JOBS) {
      const oldest = [...jobs.values()].sort((a, b) => a.startedAt.localeCompare(b.startedAt))[0]
      if (oldest) jobs.delete(oldest.id)
    }
  }

  /**
   * Start a batch and return immediately.
   *
   * The job keeps only the summary for later `status` reads; the full results
   * go to the history store once, which is where the baseline comparison reads
   * them from.
   */
  function startJob({ site, devices, note, concurrency, save }) {
    const id = makeBatchId('job')
    const controller = new AbortController()
    const startedAt = new Date().toISOString()
    const job = {
      id,
      site: site.site_name,
      status: 'running',
      startedAt,
      finishedAt: null,
      total: devices.length,
      done: 0,
      batchId: null,
      results: [],
      summary: null,
      error: null,
      saved: false,
    }
    rememberJob(job)
    controllers.set(id, controller)

    const run = (async () => {
      const began = Date.now()
      try {
        const results = await checkDevices(devices, {
          concurrency,
          signal: controller.signal,
          onResult: (_result, done) => {
            job.done = done
          },
        })
        const summary = summarizeResults(results)
        job.results = results
        job.summary = summary
        job.status = controller.signal.aborted ? 'cancelled' : 'finished'
        job.finishedAt = new Date().toISOString()

        if (save !== false && results.length > 0) {
          const batch = await store.saveBatch({
            site: site.site_name,
            note: note ?? null,
            started_at: startedAt,
            finished_at: job.finishedAt,
            duration_ms: Date.now() - began,
            cancelled: controller.signal.aborted,
            summary,
            results,
          })
          job.batchId = batch.id
          job.saved = true
        }
        // The results live in the store now; free the memory copy.
        job.results = []
      } catch (error) {
        job.status = 'failed'
        job.error = error?.message ?? String(error)
        job.finishedAt = new Date().toISOString()
      } finally {
        controllers.delete(id)
      }
    })()

    job.done_ = run
    return job
  }

  function jobView(job) {
    return {
      jobId: job.id,
      site: job.site,
      status: job.status,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      progress: { done: job.done, total: job.total },
      batchId: job.batchId,
      saved: job.saved,
      error: job.error,
      // Structured numbers live in `stats`; `summary` stays the quoted text.
      stats: job.summary,
    }
  }

  function jobSummaryText(job) {
    if (job.status === 'running') {
      return `檢查進行中：${job.done}/${job.total} 台（job ${job.id}）`
    }
    if (job.status === 'failed') {
      return `檢查失敗：${job.error}（job ${job.id}）`
    }
    const summary = job.summary ?? { checked: 0, pass: 0, fail: 0, passRate: 0 }
    const head = job.status === 'cancelled' ? '檢查已取消' : '檢查完成'
    const batch = job.batchId ? `，批次 ${job.batchId}` : '（未保存）'
    const lines = [
      `${head}：${job.site} 共 ${summary.checked} 台，通過 ${summary.pass}、失敗 ${summary.fail}、逾時 ${summary.timeout}，通過率 ${summary.passRate}%${batch}`,
    ]
    if (summary.byErrorType?.length) {
      lines.push(`失敗類型：${summary.byErrorType.map((entry) => `${entry.type}×${entry.count}`).join('、')}`)
    }
    for (const issue of (summary.issues ?? []).slice(0, 15)) {
      lines.push(`  ${issue.device} (${issue.ip}) ${issue.status} ${issue.error_type ?? ''} — ${issue.diagnosis}`)
    }
    if ((summary.issues?.length ?? 0) > 15) {
      lines.push(`  …另有 ${summary.issues.length - 15} 台異常`)
    }
    return lines.join('\n')
  }

  // ---------------------------------------------------------------- shared ops

  async function opSites(args) {
    const dir = sitesDirOf(args)
    const sites = await listSites(dir)
    const lines = sites.map((entry) =>
      entry.error
        ? `  ${entry.site} — 無法讀取：${entry.error}`
        : `  ${entry.site} — ${entry.devices} 台（啟用 ${entry.enabled}）`,
    )
    return {
      dir,
      sites,
      summary: sites.length === 0 ? `目錄 ${dir} 沒有案場檔` : `${dir} 共有 ${sites.length} 個案場：\n${lines.join('\n')}`,
    }
  }

  async function opSummary(args) {
    const { dir, site } = await resolveSite(args)
    const stats = summarizeSite(site)
    const lines = [
      `${stats.site}：${stats.devices} 台（啟用 ${stats.enabled}、停用 ${stats.disabled}）`,
      `檢查流程：${stats.byProfile.map((entry) => `${entry.value}×${entry.count}`).join('、')}`,
      `功能碼：${stats.byFunction.map((entry) => `${entry.value}×${entry.count}`).join('、')}`,
      `網段：${stats.subnets.map((entry) => `${entry.value}.x×${entry.count}`).join('、')}`,
      `不同 IP ${stats.distinctIps} 個，設有預期值 ${stats.withExpected} 台`,
    ]
    if (stats.duplicateIps.length > 0) {
      lines.push(`重複 IP：${stats.duplicateIps.map((entry) => `${entry.value}×${entry.count}`).join('、')}`)
    }
    return { dir, site: stats.site, stats, summary: lines.join('\n') }
  }

  async function opList(args) {
    const { dir, site } = await resolveSite(args)
    const { devices, missing } = selectDevices(site, { devices: args.devices, filter: args.filter })
    const limit = Math.max(1, Math.min(500, Number(args.limit) || 50))
    const rows = devices.slice(0, limit).map((device) => ({
      name: device.name,
      ip: device.ip,
      port: device.port,
      unit_id: device.unit_id,
      function: device.function,
      plc_address: device.plc_address,
      quantity: device.quantity,
      check_profile: device.check_profile,
      enabled: device.enabled,
      expected: device.expected,
    }))
    const lines = rows.map(
      (row) =>
        `  ${row.name} ${row.ip}:${row.port} unit ${row.unit_id} FC${row.function} @${row.plc_address} ×${row.quantity} [${row.check_profile}]${row.enabled ? '' : ' (停用)'}`,
    )
    return {
      dir,
      site: site.site_name,
      total: devices.length,
      shown: rows.length,
      rows,
      missing,
      summary:
        `${site.site_name} 符合條件的設備 ${devices.length} 台` +
        (rows.length < devices.length ? `，顯示前 ${rows.length} 台` : '') +
        (missing.length > 0 ? `\n找不到的設備名稱：${missing.join('、')}` : '') +
        (lines.length > 0 ? `\n${lines.join('\n')}` : ''),
    }
  }

  async function opRun(args) {
    const { site } = await resolveSite(args)
    const { devices, missing } = selectDevices(site, { devices: args.devices, filter: args.filter })
    if (devices.length === 0) {
      throw fail('no-devices', 'the selection matched no devices', { site: site.site_name, missing })
    }

    const concurrency = Math.max(1, Math.min(32, Number(args.concurrency) || 8))
    const save = args.save !== false
    const job = startJob({ site, devices, note: args.note, concurrency, save })

    const wait = args.wait !== false && devices.length <= AUTO_BACKGROUND_DEVICES
    if (!wait) {
      return {
        ...jobView(job),
        mode: 'background',
        missing,
        summary:
          `已在背景開始檢查 ${site.site_name}：${devices.length} 台` +
          (args.wait === false ? '（指定不等待）' : `（超過 ${AUTO_BACKGROUND_DEVICES} 台，改為背景執行）`) +
          `\njob ${job.id}；用 action "status" 搭配 jobId 讀取進度` +
          (missing.length > 0 ? `\n找不到的設備名稱：${missing.join('、')}` : ''),
      }
    }

    await job.done_
    return { ...jobView(job), mode: 'finished', missing, summary: jobSummaryText(job) }
  }

  async function opStatus(args) {
    const jobId = String(args?.jobId ?? '').trim()
    const job = jobs.get(jobId)
    if (!job) {
      throw fail('job-not-found', `no job ${JSON.stringify(jobId)}; running jobs: ${[...jobs.keys()].join(', ') || 'none'}`, {
        field: 'jobId',
      })
    }
    return { ...jobView(job), summary: jobSummaryText(job) }
  }

  async function opCancel(args) {
    const jobId = String(args?.jobId ?? '').trim()
    const job = jobs.get(jobId)
    if (!job) {
      throw fail('job-not-found', `no job ${JSON.stringify(jobId)}`, { field: 'jobId' })
    }
    const controller = controllers.get(jobId)
    if (controller && !controller.signal.aborted) controller.abort()
    return { ...jobView(job), summary: `已要求取消 job ${jobId}（目前在 ${job.done}/${job.total}）` }
  }

  async function opBatches(args) {
    const site = String(args?.site ?? '').trim()
    if (site === '') throw fail('site-required', 'site is required', { field: 'site' })
    const limit = Math.max(1, Math.min(200, Number(args.limit) || 10))
    const batches = await store.listBatches(site, limit)
    const lines = batches.map((batch) => {
      const summary = batch.summary ?? {}
      return `  ${batch.id} ${batch.finished_at ?? batch.started_at} 通過率 ${summary.passRate ?? '?'}%（${summary.checked ?? '?'} 台）${batch.baseline ? ' ★基準' : ''}${batch.note ? ` — ${batch.note}` : ''}`
    })
    return {
      site,
      batches,
      summary: batches.length === 0 ? `${site} 尚無已保存的批次` : `${site} 最近 ${batches.length} 個批次：\n${lines.join('\n')}`,
    }
  }

  async function opBaselineSave(args) {
    const site = String(args?.site ?? '').trim()
    if (site === '') throw fail('site-required', 'site is required', { field: 'site' })
    const batchId = String(args?.batchId ?? '').trim() || (await store.latestBatch(site))?.id
    if (!batchId) throw fail('batch-not-found', `site ${site} 尚無批次可設為基準`, { field: 'batchId' })
    const result = await store.setBaseline(site, batchId)
    if (!result.ok) throw fail(result.reason, `無法設為基準：${result.reason}`, { batchId })
    return { site, batchId, summary: `已將批次 ${batchId} 設為 ${site} 的基準` }
  }

  async function opBaselineShow(args) {
    const site = String(args?.site ?? '').trim()
    if (site === '') throw fail('site-required', 'site is required', { field: 'site' })
    const baseline = await store.getBaseline(site)
    if (!baseline) return { site, baseline: null, summary: `${site} 尚未設定基準` }
    const summary = baseline.summary ?? {}
    return {
      site,
      baseline: { id: baseline.id, at: baseline.finished_at, note: baseline.note, summary },
      summary:
        `${site} 的基準是 ${baseline.id}（${baseline.finished_at}）：${summary.checked} 台，通過率 ${summary.passRate}%` +
        (summary.fail ? `，其中失敗 ${summary.fail} 台` : '') +
        (baseline.note ? `\n備註：${baseline.note}` : ''),
    }
  }

  async function opBaselineClear(args) {
    const site = String(args?.site ?? '').trim()
    if (site === '') throw fail('site-required', 'site is required', { field: 'site' })
    const result = await store.clearBaseline(site)
    return { site, summary: result.cleared ? `已清除 ${site} 的基準` : `${site} 本來就沒有基準` }
  }

  async function opCompare(args) {
    const site = String(args?.site ?? '').trim()
    if (site === '') throw fail('site-required', 'site is required', { field: 'site' })
    const baseline = await store.getBaseline(site)
    if (!baseline) {
      throw fail('no-baseline', `${site} 尚未設定基準；先用 action "save" 指定一個批次`, { site })
    }
    const batchId = String(args?.batchId ?? '').trim()
    const batch = batchId ? await store.getBatch(batchId) : await store.latestBatch(site)
    if (!batch) throw fail('batch-not-found', `找不到批次 ${batchId || '(最新)'}`, { batchId })
    const comparison = compareBatches(baseline, batch)
    return {
      site,
      comparison,
      summary: `比較 ${batch.id} 與基準 ${baseline.id}：\n${describeComparison(comparison)}`,
    }
  }

  // ------------------------------------------------------- site editor ops

  /**
   * Load one site as editable device rows. The editor keeps the whole
   * normalized device so fields it does not render survive a save.
   */
  async function opSiteRead(args) {
    const { dir, site } = await resolveSite(args)
    return {
      dir,
      site: site.site_name,
      file: site.source_file,
      devices: site.devices,
      summary: `已載入 ${site.site_name}（${site.devices.length} 台）供編輯`,
    }
  }

  /**
   * Validate and write one site file. Rows go through the same normalization
   * as loading, so the panel and the agent cannot write a file the checker
   * would refuse to read; the derived plc_address is recomputed, not stored.
   */
  async function opSiteSave(args) {
    const dir = sitesDirOf(args)
    const siteName = assertSiteName(String(args?.site ?? ''))
    const rawDevices = Array.isArray(args?.devices) ? args.devices : []
    const site = normalizeSite({ schema_version: 1, site_name: siteName, devices: rawDevices })

    const overwrite = args?.overwrite === true
    if (!overwrite && (await siteExists(dir, siteName))) {
      throw fail(
        'site-exists',
        `site ${siteName} already exists in ${dir}; pass overwrite true to replace it`,
        { dir, site: siteName },
      )
    }

    const devices = site.devices.map(({ plc_address, ...config }) => config)
    const file = await saveSite(dir, { schema_version: 1, site_name: siteName, devices })
    return {
      dir,
      site: siteName,
      file: path.basename(file),
      devices: devices.length,
      summary: `已儲存案場 ${siteName}（${devices.length} 台）到 ${file}`,
    }
  }

  async function opSiteDelete(args) {
    const dir = sitesDirOf(args)
    const siteName = assertSiteName(String(args?.site ?? ''))
    const file = await deleteSite(dir, siteName)
    return { dir, site: siteName, file: path.basename(file), summary: `已刪除案場檔 ${path.basename(file)}` }
  }

  const OPS = {
    sites: opSites,
    summary: opSummary,
    list: opList,
    run: opRun,
    status: opStatus,
    cancel: opCancel,
    batches: opBatches,
    save: opBaselineSave,
    show: opBaselineShow,
    clear: opBaselineClear,
    compare: opCompare,
    siteRead: opSiteRead,
    siteSave: opSiteSave,
    siteDelete: opSiteDelete,
  }

  async function dispatch(op, args) {
    const handler = OPS[op]
    if (!handler) {
      throw fail(
        'invalid-op',
        `unknown operation ${JSON.stringify(op)}; use sites, summary, list, run, status, cancel, batches, save, show, clear, compare, siteRead, siteSave or siteDelete`,
        { field: 'op' },
      )
    }
    return handler(args)
  }

  // ------------------------------------------------------------------- tools

  const OUTPUT_SCHEMA = {
    type: 'object',
    additionalProperties: true,
    required: ['action', 'summary'],
    properties: {
      action: { type: 'string' },
      summary: { type: 'string' },
    },
  }

  function makeTool(name, description, parameters, actions, opMap) {
    return {
      name,
      description,
      parameters,
      output: {
        schema: OUTPUT_SCHEMA,
        render: (_args, value) => [{ type: 'text', text: value.summary ?? '' }],
      },
      async execute(args) {
        const action = String(args?.action ?? '')
        if (!actions.includes(action)) {
          throw fail('invalid-action', `unknown action ${JSON.stringify(action)}; use ${actions.join(', ')}`, {
            field: 'action',
          })
        }
        return { action, ...(await dispatch(opMap?.[action] ?? action, args)) }
      },
    }
  }

  const devicesTool = makeTool(
    'site_devices',
    'Inspect a Modbus site configuration: list saved sites, summarize a site (device counts, check profiles, function codes, subnets, duplicate IPs) or list its devices with optional filters. Read-only.',
    {
      type: 'object',
      additionalProperties: false,
      required: ['action'],
      properties: {
        action: {
          type: 'string',
          enum: ['sites', 'summary', 'list'],
          description: 'sites lists every site file; summary aggregates one site; list returns device rows.',
        },
        site: { type: 'string', description: 'Site name (the JSON file name without .json).' },
        sitesDir: SITES_DIR_PARAM,
        devices: {
          type: 'array',
          items: { type: 'string' },
          description: 'Only these device names (list action, or as a check selection).',
        },
        filter: FILTER_PARAM,
        limit: { type: 'integer', description: 'Maximum device rows to return for list (default 50, max 500).' },
      },
    },
    ['sites', 'summary', 'list'],
  )

  const checkTool = makeTool(
    'site_check',
    'Check site devices over Ping, TCP and Modbus TCP using each device\'s own check profile, and save the batch for comparison. Long runs return a job id: poll it with action "status". Use action "run" to start, "status" to read progress, "cancel" to stop.',
    {
      type: 'object',
      additionalProperties: false,
      required: ['action'],
      properties: {
        action: {
          type: 'string',
          enum: ['run', 'status', 'cancel'],
          description: 'run starts a batch; status reads a job; cancel aborts one.',
        },
        site: { type: 'string', description: 'Site name. Required unless the directory holds exactly one site.' },
        sitesDir: SITES_DIR_PARAM,
        devices: { type: 'array', items: { type: 'string' }, description: 'Check only these device names.' },
        filter: FILTER_PARAM,
        concurrency: { type: 'integer', description: 'Devices checked in parallel, 1-32 (default 8).' },
        wait: {
          type: 'boolean',
          description:
            'true waits for completion. Runs over 25 devices always return a job instead, so the call cannot time out.',
        },
        save: { type: 'boolean', description: 'Store the batch in history (default true).' },
        note: { type: 'string', description: 'Note saved with the batch, e.g. "驗收前檢查".' },
        jobId: { type: 'string', description: 'Job to read or cancel (status/cancel actions).' },
      },
    },
    ['run', 'status', 'cancel'],
  )

  const baselineTool = makeTool(
    'site_baseline',
    'Manage the site baseline and compare batches against it: what regressed, what recovered, which values changed and which devices got slower. Actions: batches, save, show, clear, compare.',
    {
      type: 'object',
      additionalProperties: false,
      required: ['action'],
      properties: {
        action: {
          type: 'string',
          enum: ['batches', 'save', 'show', 'clear', 'compare'],
          description:
            'batches lists stored batches; save sets the baseline; show reads it; clear removes it; compare diffs a batch against it.',
        },
        site: { type: 'string', description: 'Site name.' },
        batchId: {
          type: 'string',
          description: 'Batch to save as baseline (save) or to compare (compare). Defaults to the newest batch of the site.',
        },
        limit: { type: 'integer', description: 'How many batches to list (default 10).' },
      },
    },
    ['batches', 'save', 'show', 'clear', 'compare'],
  )

  const DEVICE_ROW_PARAM = {
    type: 'object',
    additionalProperties: true,
    required: ['name', 'ip'],
    description: 'One device row. Only name and ip are required; omitted fields fall back to their defaults.',
    properties: {
      name: { type: 'string', description: 'Unique device name within the site.' },
      ip: { type: 'string', description: 'Device IPv4 address or host name.' },
      port: { type: 'integer', description: 'Modbus TCP port (default 502).' },
      unit_id: { type: 'integer', description: 'Modbus unit id (default 1).' },
      address: { type: 'integer', description: 'Zero-based register offset (default 0).' },
      quantity: { type: 'integer', description: 'Registers/bits to read (default 1).' },
      function: { type: 'string', enum: ['01', '02', '03', '04'], description: 'Modbus function code (default 03).' },
      expected: { type: 'string', description: 'Expected values: "100,107", a "0..100" range or booleans "1,0,1".' },
      check_profile: {
        type: 'string',
        enum: ['ping', 'ping_tcp', 'full_stack'],
        description: 'ping = ICMP only; ping_tcp = ICMP + TCP port; full_stack = ICMP + TCP + Modbus read.',
      },
      enabled: { type: 'boolean', description: 'Disabled devices are skipped by checks (default true).' },
      tcp_port: { type: 'integer', description: 'TCP port for ping_tcp devices; defaults to port.' },
    },
  }

  /**
   * The write half of the site checklist. `site_devices` stays read-only; this
   * tool carries the editor ops so a panel button and the agent share one
   * implementation.
   */
  const editTool = makeTool(
    'site_edit',
    'Edit the site checklist: read one site JSON as editable device rows, save a site (create new, or overwrite with overwrite: true) and delete a site file. Actions: read, save, delete.',
    {
      type: 'object',
      additionalProperties: false,
      required: ['action', 'site'],
      properties: {
        action: {
          type: 'string',
          enum: ['read', 'save', 'delete'],
          description: 'read loads one site as device rows; save writes the site JSON; delete removes the site file.',
        },
        site: { type: 'string', description: 'Site name (the JSON file name without .json).' },
        sitesDir: SITES_DIR_PARAM,
        overwrite: { type: 'boolean', description: 'save only: replace the file even when the site already exists.' },
        devices: {
          type: 'array',
          description: 'save only: the device rows to write.',
          items: DEVICE_ROW_PARAM,
        },
      },
    },
    ['read', 'save', 'delete'],
    { read: 'siteRead', save: 'siteSave', delete: 'siteDelete' },
  )

  /** Surface the error code to the agent, the same way modbus_poll does. */
  function withCodes(impl) {
    return async (args) => {
      try {
        return await impl(args)
      } catch (error) {
        const code = error?.code ?? 'error'
        const message = error?.message ?? String(error)
        const wrapped = new Error(`${code}: ${message}`)
        wrapped.info = { name: error?.name ?? 'Error', code, reason: message, details: error?.details }
        throw wrapped
      }
    }
  }

  for (const toolDef of [devicesTool, checkTool, baselineTool, editTool]) {
    const execute = toolDef.execute
    toolDef.execute = withCodes(execute)
    ctx.effect(() => ctx.tools.register(toolDef))
  }

  // ------------------------------------------------------------------- route

  const HTTP_STATUS = {
    'invalid-parameter': 400,
    'invalid-op': 400,
    'invalid-action': 400,
    'invalid-device': 400,
    'invalid-site': 400,
    'site-required': 400,
    'no-devices': 400,
    'no-sites': 404,
    'site-not-found': 404,
    'job-not-found': 404,
    'batch-not-found': 404,
    'site-unreadable': 502,
    'site-dir-unreadable': 502,
    'no-baseline': 409,
    'site-mismatch': 409,
    'batch-is-baseline': 409,
    'site-exists': 409,
  }

  function send(response, status, payload) {
    response.statusCode = status
    response.setHeader('content-type', 'application/json; charset=utf-8')
    response.setHeader('cache-control', 'no-store')
    response.end(JSON.stringify(payload))
  }

  async function readJsonBody(request) {
    return new Promise((resolve, reject) => {
      const chunks = []
      let size = 0
      request.on('data', (chunk) => {
        size += chunk.length
        if (size > MAX_BODY_BYTES) {
          reject(new SiteError('request body too large', 'body-too-large'))
          request.destroy()
          return
        }
        chunks.push(chunk)
      })
      request.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'))
        } catch {
          reject(new SiteError('request body is not valid JSON', 'invalid-json'))
        }
      })
      request.on('error', (error) => {
        reject(new SiteError(`request failed: ${error.message}`, 'request-error'))
      })
    })
  }

  const handler = async (request, response) => {
    const connection = ctx.get('connection')
    const rejection =
      connection && typeof connection.requestRejection === 'function'
        ? connection.requestRejection(request)
        : undefined
    if (rejection) {
      send(response, rejection, {
        ok: false,
        error: { code: 'unauthorized', message: 'request rejected by the browser trust boundary' },
      })
      return
    }
    if (request.method !== 'POST') {
      response.setHeader('allow', 'POST')
      send(response, 405, { ok: false, error: { code: 'method-not-allowed', message: 'use POST' } })
      return
    }

    let body
    try {
      body = await readJsonBody(request)
    } catch (error) {
      send(response, HTTP_STATUS[error?.code] ?? 400, {
        ok: false,
        error: { code: error?.code ?? 'invalid-json', message: error?.message ?? 'bad request' },
      })
      return
    }

    try {
      const result = await dispatch(String(body.op ?? ''), body)
      send(response, 200, ok(result))
    } catch (error) {
      const code = error?.code ?? 'internal'
      send(response, HTTP_STATUS[code] ?? 500, {
        ok: false,
        error: { code, message: error?.message ?? String(error), details: error?.details },
      })
    }
  }

  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: ROUTE_PATH, handler }))

  ctx.effect(() => () => {
    for (const controller of controllers.values()) controller.abort()
    controllers.clear()
    jobs.clear()
  })
}
