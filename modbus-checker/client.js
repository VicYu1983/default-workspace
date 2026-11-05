/**
 * Modbus Site Checker — client half.
 *
 * Registers a sidebar entry (`sidebar.panellist` id `modbus-checker`) and the
 * matching central panel (`main` key `modbus-checker`).
 *
 * The panel talks to the host over the same JSON route the agent's ops run on
 * (/modbus-checker/api), so a button can never do something the agent could
 * not, and vice versa.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-plugin-modbus-checker',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const NS = 'modbusChecker'

    const STORAGE_KEY = 'dsh.modbus-checker/v1'
    const POLL_MS = 700

    const DICTIONARIES = {
      en: {
        'panel.title': 'Modbus Site Checker',
        'panel.subtitle': 'Check every device in a site over Ping, TCP and Modbus, and keep regression baselines.',
        'panel.site': 'Site',
        'panel.refresh': 'Refresh',
        'panel.summary': 'Summary',
        'panel.check': 'Check',
        'panel.note': 'Note',
        'panel.notePlaceholder': 'e.g. pre-acceptance check',
        'panel.concurrency': 'Parallel',
        'panel.start': 'Start check',
        'panel.stop': 'Stop',
        'panel.running': 'Checking',
        'panel.result': 'Last result',
        'panel.passRate': 'Pass rate',
        'panel.pass': 'Pass',
        'panel.fail': 'Fail',
        'panel.timeout': 'Timeout',
        'panel.issues': 'Issues',
        'panel.noIssues': 'All devices passed.',
        'panel.devices': 'Devices',
        'panel.showDevices': 'Show device list',
        'panel.hideDevices': 'Hide device list',
        'panel.baseline': 'Regression batches',
        'panel.noBatches': 'No saved batches yet. Run a check first.',
        'panel.setBaseline': 'Set as baseline',
        'panel.compare': 'Compare',
        'panel.compareLatest': 'Compare with baseline',
        'panel.baselineMark': 'baseline',
        'panel.comparison': 'Baseline comparison',
        'panel.closeComparison': 'Close',
        'panel.saved': 'Saved.',
        'panel.cleared': 'Baseline cleared.',
        'panel.starting': 'Starting…',
        'panel.noSite': 'No readable site files in the sites directory.',
        'panel.deviceCount': 'devices',
      },
      zh: {
        'panel.title': 'Modbus 案場檢查',
        'panel.subtitle': '以 Ping、TCP 與 Modbus 檢查案場全部設備，並保存回歸基準。',
        'panel.site': '案場',
        'panel.refresh': '重新整理',
        'panel.summary': '摘要',
        'panel.check': '檢查',
        'panel.note': '備註',
        'panel.notePlaceholder': '例如：驗收前檢查',
        'panel.concurrency': '並行數',
        'panel.start': '開始檢查',
        'panel.stop': '停止',
        'panel.running': '檢查中',
        'panel.result': '最近結果',
        'panel.passRate': '通過率',
        'panel.pass': '通過',
        'panel.fail': '失敗',
        'panel.timeout': '逾時',
        'panel.issues': '異常',
        'panel.noIssues': '全部設備通過。',
        'panel.devices': '設備',
        'panel.showDevices': '檢視設備清單',
        'panel.hideDevices': '收起設備清單',
        'panel.baseline': '回歸批次',
        'panel.noBatches': '尚無批次。先執行一次檢查。',
        'panel.setBaseline': '設為基準',
        'panel.compare': '比較',
        'panel.compareLatest': '與基準比較',
        'panel.baselineMark': '基準',
        'panel.comparison': '基準比較',
        'panel.closeComparison': '關閉',
        'panel.saved': '已儲存。',
        'panel.cleared': '已清除基準。',
        'panel.starting': '啟動中…',
        'panel.noSite': 'sites 目錄內沒有可讀取的案場檔。',
        'panel.deviceCount': '台',
      },
    }

    const CSS = `
 .msc { display:flex; flex-direction:column; height:100%; min-height:0; background:var(--dsw-alias-bg-base); color:var(--dsw-alias-label-primary); font-family:inherit; }
 .msc-head { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; padding:20px 24px 14px; border-bottom:1px solid var(--dsw-alias-border-l1); }
 .msc-title { margin:0; font-size:16px; font-weight:600; line-height:1.3; }
 .msc-subtitle { margin:3px 0 0; font-size:12px; color:var(--dsw-alias-label-secondary); }
 .msc-pills { display:flex; align-items:center; gap:8px; padding-top:2px; }
 .msc-pill { display:inline-flex; align-items:center; gap:6px; font-size:12px; color:var(--dsw-alias-label-secondary); background:var(--dsw-alias-bg-layer-2); border:1px solid var(--dsw-alias-border-l1); border-radius:999px; padding:4px 10px; white-space:nowrap; }
 .msc-dot { width:7px; height:7px; border-radius:50%; background:var(--dsw-alias-state-idle-primary); }
 .msc-pill.is-on { color:var(--dsw-alias-label-primary); }
 .msc-pill.is-on .msc-dot { background:var(--dsw-alias-state-success-primary); }
 .msc-pill.is-busy .msc-dot { background:var(--dsw-alias-state-warn-primary); }
 .msc-body { flex:1 1 auto; min-height:0; overflow:auto; display:flex; flex-direction:column; gap:12px; padding:16px 24px 24px; }
 .msc-card { background:var(--dsw-alias-bg-layer-1); border:1px solid var(--dsw-alias-border-l1); border-radius:10px; padding:12px 14px; }
 .msc-row { display:flex; flex-wrap:wrap; align-items:flex-end; gap:10px; }
 .msc-field { display:flex; flex-direction:column; gap:4px; }
 .msc-label { font-size:11px; color:var(--dsw-alias-label-secondary); }
 .msc-input { box-sizing:border-box; height:28px; border-radius:6px; border:1px solid var(--dsw-alias-border-l1); background:var(--dsw-alias-bg-base); color:var(--dsw-alias-label-primary); font:inherit; font-size:12px; padding:0 8px; outline:none; }
 .msc-input:focus { border-color:var(--dsw-alias-brand-primary); }
 .msc-input:disabled { color:var(--dsw-alias-label-secondary); background:var(--dsw-alias-bg-layer-2); }
 .msc-select { width:220px; }
 .msc-num { width:70px; }
 .msc-note { width:180px; }
 .msc-actions { display:flex; gap:8px; margin-left:auto; align-items:center; }
 .msc-btn { height:28px; padding:0 12px; border-radius:6px; border:1px solid transparent; background:var(--dsw-alias-brand-primary); color:var(--dsw-alias-bg-base); font:inherit; font-size:12px; cursor:pointer; white-space:nowrap; }
 .msc-btn:disabled { opacity:.5; cursor:default; }
 .msc-btn-ghost { background:var(--dsw-alias-bg-layer-2); color:var(--dsw-alias-label-primary); border-color:var(--dsw-alias-border-l1); }
 .msc-btn-stop { background:var(--dsw-alias-state-error-primary); color:var(--dsw-alias-bg-base); }
 .msc-btn-sm { height:24px; padding:0 8px; font-size:11px; }
 .msc-text { margin:8px 2px 0; font-size:12px; line-height:1.6; white-space:pre-line; color:var(--dsw-alias-label-primary); }
 .msc-bar { height:6px; border-radius:3px; background:var(--dsw-alias-bg-layer-2); overflow:hidden; margin-top:10px; }
 .msc-bar > div { height:100%; background:var(--dsw-alias-brand-primary); transition:width .3s ease; }
 .msc-table { width:100%; border-collapse:collapse; font-size:12px; margin-top:8px; }
 .msc-table th { text-align:left; font-weight:500; color:var(--dsw-alias-label-secondary); padding:5px 8px; border-bottom:1px solid var(--dsw-alias-border-l1); }
 .msc-table td { padding:4px 8px; border-bottom:1px solid var(--dsw-alias-border-l1); vertical-align:top; }
 .msc-table tbody tr:last-child td { border-bottom:none; }
 .msc-mono { font-variant-numeric:tabular-nums; font-family:ui-monospace,SFMono-Regular,Consolas,monospace; }
 .msc-strong { font-weight:600; }
 .msc-dim { color:var(--dsw-alias-label-secondary); }
 .msc-ok { color:var(--dsw-alias-state-success-primary); }
 .msc-bad { color:var(--dsw-alias-state-error-primary); }
 .msc-warn { color:var(--dsw-alias-state-warn-primary); }
 .msc-error { font-size:12px; color:var(--dsw-alias-state-error-primary); }
 .msc-okline { font-size:12px; color:var(--dsw-alias-state-success-primary); }
 .msc-chips { display:flex; flex-wrap:wrap; gap:6px; margin-top:8px; }
 .msc-chip { font-size:11px; border:1px solid var(--dsw-alias-border-l1); border-radius:999px; padding:2px 8px; background:var(--dsw-alias-bg-layer-2); color:var(--dsw-alias-label-secondary); }
 .msc-empty { margin:8px 2px; font-size:12px; color:var(--dsw-alias-label-secondary); }
 .msc-star { color:var(--dsw-alias-state-warn-primary); }
 .msc-section { margin-top:10px; }
 .msc-section-title { font-size:12px; font-weight:600; margin:0 0 4px; }
 `

    function messageOf(error) {
      if (!error) return 'request failed'
      return error.message ? String(error.message) : String(error)
    }

    function readStore() {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY)
        if (!raw) return {}
        const parsed = JSON.parse(raw)
        return parsed && typeof parsed === 'object' ? parsed : {}
      } catch {
        return {}
      }
    }

    function writeStore(value) {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
      } catch {
        /* storage may be unavailable; the panel still works for this session */
      }
    }

    async function callHost(payload) {
      const url = new URL('modbus-checker/api', document.baseURI)
      const controller = new AbortController()
      const timer = window.setTimeout(() => controller.abort(), 15000)
      let response
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
          credentials: 'same-origin',
          signal: controller.signal,
        })
      } catch (error) {
        const text = error && error.name === 'AbortError' ? 'request timed out' : messageOf(error)
        throw new Error(text)
      } finally {
        window.clearTimeout(timer)
      }

      let data = null
      try {
        data = await response.json()
      } catch {
        data = null
      }

      if (data && data.ok === false) {
        const failure = new Error(data.error && data.error.message ? data.error.message : 'request failed')
        failure.code = data.error && data.error.code
        throw failure
      }
      if (!response.ok) throw new Error('HTTP ' + response.status)
      if (!data || data.ok !== true) throw new Error('empty response from the checker host')
      return data
    }

    function useTranslate(ctx) {
      const [, force] = React.useState(0)
      React.useEffect(() => {
        if (!ctx.locale || typeof ctx.locale.subscribe !== 'function') return undefined
        return ctx.locale.subscribe(() => force((value) => value + 1))
      }, [ctx])
      return ctx.locale.bind(NS)
    }

    function Icon(props) {
      const size = props && Number.isFinite(props.size) ? props.size : 20
      const color = props && props.active ? 'var(--dsw-alias-brand-primary)' : 'var(--dsw-alias-label-secondary)'
      return h(
        'svg',
        { viewBox: '0 0 24 24', width: size, height: size, 'aria-hidden': true, style: { display: 'block' } },
        h('rect', { x: 4, y: 3.5, width: 16, height: 17, rx: 2, fill: 'none', stroke: color, strokeWidth: 1.5 }),
        h('path', { d: 'M8 8.5h8M8 12h8M8 15.5h4', stroke: color, strokeWidth: 1.5, strokeLinecap: 'round', fill: 'none' }),
        h('path', { d: 'M14.5 17.5l1.6 1.6 3-3.4', stroke: color, strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none' }),
      )
    }

    function statusClass(status) {
      if (status === 'PASS') return 'msc-ok'
      if (status === 'TIMEOUT') return 'msc-warn'
      return 'msc-bad'
    }

    function makePanel(ctx) {
      return function ModbusCheckerPanel() {
        const t = useTranslate(ctx)
        const storedRef = React.useRef(null)
        if (storedRef.current === null) storedRef.current = readStore()
        const stored = storedRef.current

        const [sites, setSites] = React.useState([])
        const [site, setSite] = React.useState(stored.site || '')
        const [summary, setSummary] = React.useState(null)
        const [devices, setDevices] = React.useState(null)
        const [showDevices, setShowDevices] = React.useState(false)
        const [note, setNote] = React.useState('')
        const [concurrency, setConcurrency] = React.useState('8')
        const [job, setJob] = React.useState(null)
        const [batches, setBatches] = React.useState([])
        const [comparison, setComparison] = React.useState(null)
        const [error, setError] = React.useState('')
        const [notice, setNotice] = React.useState('')
        const noticeTimer = React.useRef(0)
        const jobRef = React.useRef(null)
        const siteRef = React.useRef(site)

        const flash = React.useCallback((text) => {
          setNotice(text)
          window.clearTimeout(noticeTimer.current)
          noticeTimer.current = window.setTimeout(() => setNotice(''), 3000)
        }, [])

        React.useEffect(
          () => () => {
            window.clearTimeout(noticeTimer.current)
          },
          [],
        )

        React.useEffect(() => {
          writeStore({ site })
        }, [site])

        React.useEffect(() => {
          siteRef.current = site
        }, [site])

        // jobRef is read from timers (poll / cancel), which run outside the
        // render pass; without this sync they would always see null.
        React.useEffect(() => {
          jobRef.current = job
        })

        const loadSites = React.useCallback(async () => {
          const data = await callHost({ op: 'sites' })
          setSites(data.sites || [])
          return data.sites || []
        }, [])

        const loadSummary = React.useCallback(async (name) => {
          if (!name) {
            setSummary(null)
            return
          }
          const data = await callHost({ op: 'summary', site: name })
          setSummary(data)
        }, [])

        const loadBatches = React.useCallback(async (name) => {
          if (!name) {
            setBatches([])
            return
          }
          const data = await callHost({ op: 'batches', site: name, limit: 10 })
          setBatches(data.batches || [])
        }, [])

        const loadDevices = React.useCallback(async (name) => {
          if (!name) {
            setDevices(null)
            return
          }
          const data = await callHost({ op: 'list', site: name, limit: 100 })
          setDevices(data)
        }, [])

        // Mount: load the site list, then fall back to the saved site.
        React.useEffect(() => {
          let alive = true
          ;(async () => {
            try {
              const list = await loadSites()
              if (!alive) return
              const names = list.filter((entry) => !entry.error).map((entry) => entry.site)
              if (names.length === 0) {
                setError(t('panel.noSite'))
                return
              }
              setSite((current) => (names.includes(current) ? current : names[0]))
            } catch (failure) {
              if (alive) setError(messageOf(failure))
            }
          })()
          return () => {
            alive = false
          }
        }, [])

        // Site changed (or first selection): refresh the summary and batches.
        React.useEffect(() => {
          if (!site) return undefined
          let alive = true
          ;(async () => {
            setError('')
            setSummary(null)
            setDevices(null)
            setComparison(null)
            try {
              await loadSummary(site)
              await loadBatches(site)
            } catch (failure) {
              if (alive) setError(messageOf(failure))
            }
          })()
          return () => {
            alive = false
          }
        }, [site])

        const refreshSite = async () => {
          setError('')
          try {
            const list = await loadSites()
            if (site) {
              await loadSummary(site)
              await loadBatches(site)
              if (showDevices) await loadDevices(site)
            }
            if (!list.some((entry) => entry.site === site && !entry.error)) {
              const names = list.filter((entry) => !entry.error).map((entry) => entry.site)
              setSite(names[0] ?? '')
            }
          } catch (failure) {
            setError(messageOf(failure))
          }
        }

        const pickJob = (data) => ({
          jobId: data.jobId,
          site: data.site,
          status: data.status,
          progress: data.progress || { done: 0, total: 0 },
          batchId: data.batchId,
          saved: data.saved,
          stats: data.stats,
          error: data.error,
        })

        const runCheck = async () => {
          if (!site) return
          setError('')
          setComparison(null)
          try {
            const data = await callHost({
              op: 'run',
              site,
              note: note.trim() === '' ? null : note.trim(),
              concurrency: Number(concurrency) || 8,
            })
            setJob(pickJob(data))
            if (data.status !== 'running') {
              await loadBatches(site)
              flash(t('panel.saved'))
            }
          } catch (failure) {
            setError(messageOf(failure))
          }
        }

        const stopJob = async () => {
          const current = jobRef.current
          if (!current || !current.jobId) return
          try {
            const data = await callHost({ op: 'cancel', jobId: current.jobId })
            setJob(pickJob(data))
          } catch (failure) {
            setError(messageOf(failure))
          }
        }

        // Poll while a job is running; the run op hands back background jobs
        // for any selection over 25 devices.
        const jobRunning = Boolean(job && job.status === 'running' && job.jobId)
        React.useEffect(() => {
          if (!jobRunning) return undefined
          const id = window.setInterval(async () => {
            const current = jobRef.current
            if (!current || !current.jobId) return
            try {
              const data = await callHost({ op: 'status', jobId: current.jobId })
              const next = pickJob(data)
              setJob(next)
              if (next.status !== 'running') {
                await loadBatches(siteRef.current)
              }
            } catch (failure) {
              // The job may have been evicted after a host reload: stop rather
              // than spin forever.
              window.clearInterval(id)
              setJob((value) => (value && value.status === 'running' ? { ...value, status: 'failed', error: messageOf(failure) } : value))
            }
          }, POLL_MS)
          return () => window.clearInterval(id)
        }, [jobRunning])

        const setBaseline = async (batchId) => {
          setError('')
          try {
            const data = await callHost({ op: 'save', site, batchId })
            flash(data.summary ?? t('panel.saved'))
            await loadBatches(site)
          } catch (failure) {
            setError(messageOf(failure))
          }
        }

        const runCompare = async (batchId) => {
          setError('')
          try {
            const data = await callHost({ op: 'compare', site, batchId: batchId ?? undefined })
            setComparison(data)
          } catch (failure) {
            setError(messageOf(failure))
          }
        }

        const toggleDevices = async () => {
          const next = !showDevices
          setShowDevices(next)
          if (next && !devices) {
            try {
              await loadDevices(site)
            } catch (failure) {
              setError(messageOf(failure))
            }
          }
        }

        const field = (label, control) =>
          h('div', { className: 'msc-field' }, h('span', { className: 'msc-label' }, label), control)

        const header = h(
          'header',
          { className: 'msc-head' },
          h(
            'div',
            null,
            h('h1', { className: 'msc-title' }, t('panel.title')),
            h('p', { className: 'msc-subtitle' }, t('panel.subtitle')),
          ),
          h(
            'div',
            { className: 'msc-pills' },
            jobRunning ? h('span', { className: 'msc-pill is-busy' }, h('span', { className: 'msc-dot' }), t('panel.running')) : null,
            h(
              'span',
              { className: 'msc-pill ' + (site ? 'is-on' : '') },
              h('span', { className: 'msc-dot' }),
              site || t('panel.noSite'),
            ),
          ),
        )

        const siteCard = h(
          'section',
          { className: 'msc-card' },
          h(
            'div',
            { className: 'msc-row' },
            field(
              t('panel.site'),
              h(
                'select',
                {
                  className: 'msc-input msc-select',
                  value: site,
                  onChange: (event) => setSite(event.target.value),
                },
                sites.length === 0
                  ? h('option', { value: '' }, '—')
                  : sites
                      .filter((entry) => !entry.error)
                      .map((entry) =>
                        h('option', { key: entry.site, value: entry.site }, `${entry.site}（${entry.devices}${t('panel.deviceCount')}）`),
                      ),
              ),
            ),
            h(
              'div',
              { className: 'msc-actions' },
              h('button', { type: 'button', className: 'msc-btn msc-btn-ghost', onClick: refreshSite }, t('panel.refresh')),
            ),
          ),
          summary ? h('p', { className: 'msc-text' }, summary.summary) : null,
        )

        const checkCard = h(
          'section',
          { className: 'msc-card' },
          h(
            'div',
            { className: 'msc-row' },
            field(
              t('panel.note'),
              h('input', {
                className: 'msc-input msc-note',
                value: note,
                placeholder: t('panel.notePlaceholder'),
                disabled: jobRunning,
                onChange: (event) => setNote(event.target.value),
              }),
            ),
            field(
              t('panel.concurrency'),
              h('input', {
                className: 'msc-input msc-num',
                value: concurrency,
                inputMode: 'numeric',
                disabled: jobRunning,
                onChange: (event) => setConcurrency(event.target.value),
              }),
            ),
            h(
              'div',
              { className: 'msc-actions' },
              jobRunning
                ? h('button', { type: 'button', className: 'msc-btn msc-btn-stop', onClick: stopJob }, t('panel.stop'))
                : h(
                    'button',
                    { type: 'button', className: 'msc-btn', disabled: !site, onClick: runCheck },
                    job && job.status === 'starting' ? t('panel.starting') : t('panel.start'),
                  ),
            ),
          ),
          jobRunning
            ? h(
                'div',
                null,
                h('div', { className: 'msc-bar' }, h('div', {
                  style: {
                    width: job.progress.total > 0 ? `${Math.round((job.progress.done / job.progress.total) * 100)}%` : '0%',
                  },
                })),
                h('p', { className: 'msc-text' }, `進度 ${job.progress.done}/${job.progress.total}`),
              )
            : null,
        )

        const stats = job && job.status !== 'running' ? job.stats : null

        const resultCard = h(
          'section',
          { className: 'msc-card' },
          h('div', { className: 'msc-row' }, h('span', { className: 'msc-label' }, t('panel.result'))),
          !stats
            ? h('p', { className: 'msc-empty' }, t('panel.noBatches'))
            : h(
                'div',
                null,
                h(
                  'div',
                  { className: 'msc-chips' },
                  h('span', { className: 'msc-chip' }, `${t('panel.passRate')} ${stats.passRate}%`),
                  h('span', { className: 'msc-chip' }, `${t('panel.pass')} ${stats.pass}`),
                  h('span', { className: 'msc-chip' }, `${t('panel.fail')} ${stats.fail}`),
                  stats.timeout > 0 ? h('span', { className: 'msc-chip' }, `${t('panel.timeout')} ${stats.timeout}`) : null,
                  (stats.byErrorType || []).map((entry) =>
                    h('span', { key: entry.type, className: 'msc-chip' }, `${entry.type}×${entry.count}`),
                  ),
                ),
                (stats.issues || []).length === 0
                  ? h('p', { className: 'msc-text msc-ok' }, t('panel.noIssues'))
                  : h(
                      'table',
                      { className: 'msc-table' },
                      h(
                        'thead',
                        null,
                        h(
                          'tr',
                          null,
                          h('th', null, t('panel.issues')),
                          h('th', null, 'IP'),
                          h('th', null, '診斷'),
                        ),
                      ),
                      h(
                        'tbody',
                        null,
                        stats.issues.map((issue) =>
                          h(
                            'tr',
                            { key: issue.device },
                            h('td', { className: 'msc-strong ' + statusClass(issue.status) }, issue.device),
                            h('td', { className: 'msc-mono msc-dim' }, issue.ip),
                            h('td', null, `${issue.status} ${issue.error_type ?? ''} — ${issue.diagnosis}`),
                          ),
                        ),
                      ),
                    ),
              ),
        )

        const batchRows = batches.map((batch) =>
          h(
            'tr',
            { key: batch.id },
            h(
              'td',
              { className: 'msc-mono' },
              (batch.finished_at ?? batch.started_at ?? '').replace('T', ' ').slice(0, 19),
            ),
            h('td', { className: 'msc-mono' }, String((batch.summary && batch.summary.passRate) ?? '?') + '%'),
            h(
              'td',
              null,
              batch.baseline ? h('span', { className: 'msc-star msc-strong' }, '★ ' + t('panel.baselineMark')) : null,
              batch.note ? h('span', { className: 'msc-dim' }, ' ' + batch.note) : null,
            ),
            h(
              'td',
              null,
              h(
                'div',
                { className: 'msc-actions', style: { margin: 0 } },
                batch.baseline
                  ? null
                  : h(
                      'button',
                      {
                        type: 'button',
                        className: 'msc-btn msc-btn-ghost msc-btn-sm',
                        onClick: () => setBaseline(batch.id),
                      },
                      t('panel.setBaseline'),
                    ),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'msc-btn msc-btn-ghost msc-btn-sm',
                    onClick: () => runCompare(batch.id),
                  },
                  t('panel.compare'),
                ),
              ),
            ),
          ),
        )

        const comparisonView = comparison
          ? h(
              'div',
              { className: 'msc-section' },
              h('p', { className: 'msc-section-title' }, t('panel.comparison')),
              h('p', { className: 'msc-text' }, comparison.summary),
              (comparison.comparison.counts?.newIssues ?? 0) > 0
                ? h(
                    'table',
                    { className: 'msc-table' },
                    h('thead', null, h('tr', null, h('th', null, 'IP'), h('th', null, '診斷'))),
                    h(
                      'tbody',
                      null,
                      comparison.comparison.newIssues.map((issue) =>
                        h(
                          'tr',
                          { key: issue.device },
                          h('td', { className: 'msc-strong msc-bad' }, issue.device),
                          h('td', { className: 'msc-mono msc-dim' }, issue.ip),
                          h('td', null, `${issue.was} → ${issue.now}${issue.diagnosis ? ' — ' + issue.diagnosis : ''}`),
                        ),
                      ),
                    ),
                  )
                : null,
              h(
                'div',
                { className: 'msc-actions', style: { marginTop: 8 } },
                h(
                  'button',
                  { type: 'button', className: 'msc-btn msc-btn-ghost msc-btn-sm', onClick: () => setComparison(null) },
                  t('panel.closeComparison'),
                ),
              ),
            )
          : null

        const baselineCard = h(
          'section',
          { className: 'msc-card' },
          h(
            'div',
            { className: 'msc-row' },
            h('span', { className: 'msc-label' }, t('panel.baseline')),
            h(
              'div',
              { className: 'msc-actions' },
              h(
                'button',
                { type: 'button', className: 'msc-btn msc-btn-ghost', disabled: !site, onClick: () => runCompare() },
                t('panel.compareLatest'),
              ),
            ),
          ),
          batches.length === 0
            ? h('p', { className: 'msc-empty' }, t('panel.noBatches'))
            : h(
                'table',
                { className: 'msc-table' },
                h(
                  'thead',
                  null,
                  h('tr', null, h('th', null, '時間'), h('th', null, t('panel.passRate')), h('th', null, '備註'), h('th', null, '')),
                ),
                h('tbody', null, batchRows),
              ),
          comparisonView,
        )

        const deviceCard = devices && showDevices
          ? h(
              'section',
              { className: 'msc-card' },
              h('p', { className: 'msc-section-title' }, `${t('panel.devices')}（${devices.total}${t('panel.deviceCount')}）`),
              h(
                'table',
                { className: 'msc-table' },
                h(
                  'thead',
                  null,
                  h(
                    'tr',
                    null,
                    h('th', null, '名稱'),
                    h('th', null, 'IP'),
                    h('th', null, '流程'),
                    h('th', null, '位址'),
                  ),
                ),
                h(
                  'tbody',
                  null,
                  (devices.rows || []).map((row) =>
                    h(
                      'tr',
                      { key: row.name },
                      h('td', null, row.name),
                      h('td', { className: 'msc-mono msc-dim' }, row.ip),
                      h('td', { className: 'msc-dim' }, row.check_profile),
                      h('td', { className: 'msc-mono' }, String(row.plc_address)),
                    ),
                  ),
                ),
              ),
              devices.total > (devices.rows || []).length
                ? h('p', { className: 'msc-dim', style: { fontSize: 11, margin: '6px 2px 0' } }, `…另有 ${devices.total - devices.rows.length} 台`)
                : null,
            )
          : null

        return h(
          'div',
          { className: 'msc' },
          h('style', { key: 'msc-style' }, CSS),
          header,
          h(
            'div',
            { className: 'msc-body' },
            error ? h('div', { className: 'msc-error' }, error) : notice ? h('div', { className: 'msc-okline' }, notice) : null,
            siteCard,
            checkCard,
            resultCard,
            baselineCard,
            showDevices
              ? h(
                  'div',
                  { className: 'msc-row' },
                  h(
                    'button',
                    { type: 'button', className: 'msc-btn msc-btn-ghost msc-btn-sm', onClick: toggleDevices },
                    t('panel.hideDevices'),
                  ),
                )
              : h(
                  'div',
                  { className: 'msc-row' },
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'msc-btn msc-btn-ghost msc-btn-sm',
                      disabled: !site,
                      onClick: toggleDevices,
                    },
                    t('panel.showDevices'),
                  ),
                ),
            deviceCard,
          ),
        )
      }
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => {
          const disposers = [
            ctx.locale.register(NS, 'en', DICTIONARIES.en),
            ctx.locale.register(NS, 'zh', DICTIONARIES.zh),
          ]
          return () => {
            for (const dispose of disposers) dispose()
          }
        })

        const label = () => ctx.locale.bind(NS)('panel.title')
        const Panel = makePanel(ctx)

        ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register({ name: 'sidebar.panellist', id: 'modbus-checker', order: 25, label }, Icon),
        )
        ctx.slots.inject('main', () =>
          ctx.slots.register({ name: 'main', key: 'modbus-checker' }, Panel),
        )
      },
    }
  },
})
