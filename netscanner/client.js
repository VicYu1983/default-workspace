/**
 * Network Scanner — client half.
 *
 * Registers a sidebar entry (`sidebar.panellist` id `netscanner`) and the
 * matching central panel (`main` key `netscanner`). All socket work happens in
 * the host half; this module only renders state and polls the scan snapshot
 * while a scan is running.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-plugin-netscanner',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const NS = 'netscanner'
    const STORAGE_KEY = 'dsh-netscanner-form'
    const MAX_HOSTS = 4096
    const MAX_PORTS = 32

    const DICTIONARIES = {
      en: {
        'nsc.title': 'Network Scanner',
        'nsc.subtitle': 'Discover responsive hosts and open ports on a network segment.',
        'nsc.target': 'Scan target',
        'nsc.targetPlaceholder': '192.168.1.0/24 or 192.168.1.10-50',
        'nsc.targetHint': 'CIDR, address range, wildcard (192.168.1.*) or a single IP.',
        'nsc.targetCount': '{count} addresses will be scanned.',
        'nsc.targetTooLarge': 'A scan can cover at most 4096 addresses.',
        'nsc.localSubnets': 'This host',
        'nsc.noInterfaces': 'No non-internal IPv4 subnet found.',
        'nsc.preset': 'Ports',
        'nsc.presetQuick': 'Quick (3 ports)',
        'nsc.presetStandard': 'Standard (10 ports)',
        'nsc.presetServices': 'Common services (18 ports)',
        'nsc.presetCustom': 'Custom ports',
        'nsc.customPorts': 'Custom ports',
        'nsc.customPortsPlaceholder': '80,443,8000-8010',
        'nsc.customPortsHint': 'Comma or space separated, ranges allowed. Max 32.',
        'nsc.timeout': 'Timeout (ms)',
        'nsc.concurrency': 'Parallel hosts',
        'nsc.resolveNames': 'Resolve hostnames',
        'nsc.start': 'Start scan',
        'nsc.starting': 'Starting…',
        'nsc.stop': 'Stop',
        'nsc.stopping': 'Stopping…',
        'nsc.idle': 'Idle',
        'nsc.scanning': 'Scanning',
        'nsc.resolving': 'Resolving names…',
        'nsc.stoppingPhase': 'Stopping',
        'nsc.complete': 'Complete',
        'nsc.stopped': 'Stopped',
        'nsc.failed': 'Failed',
        'nsc.progress': '{scanned} / {total} scanned',
        'nsc.found': '{count} responsive',
        'nsc.elapsed': '{seconds} s elapsed',
        'nsc.results': 'Results',
        'nsc.resultsCount': '{count} responsive host(s)',
        'nsc.filter': 'Filter',
        'nsc.filterPlaceholder': 'Filter IP, name, MAC or port',
        'nsc.export': 'Export CSV',
        'nsc.colStatus': 'Status',
        'nsc.colIp': 'IP address',
        'nsc.colHost': 'Hostname',
        'nsc.colMac': 'MAC address',
        'nsc.colPorts': 'Open ports',
        'nsc.colLatency': 'Latency',
        'nsc.online': 'Online',
        'nsc.noPorts': 'No open ports',
        'nsc.emptyIdle': 'Choose a target and start a scan.',
        'nsc.emptyRunning': 'Scanning… responsive hosts will appear here.',
        'nsc.emptyDone': 'No responsive hosts were found on this segment.',
        'nsc.emptyFilter': 'No host matches this filter.',
        'nsc.invalidTarget': 'Enter a valid target, for example 192.168.1.0/24.',
        'nsc.invalidPorts': 'Ports must be 1–65535 and at most 32 entries.',
        'nsc.scanStarted': 'Scan started.',
        'nsc.scanStopped': 'Scan stopped.',
        'nsc.scanComplete': 'Scan complete.',
        'nsc.scanFailed': 'Scan failed.',
        'nsc.hostUnknown': '—',
        'nsc.latencyMs': 'ms',
      },
      zh: {
        'nsc.title': '網段掃描器',
        'nsc.subtitle': '掃描指定網段，找出有回應的主機與開放的連接埠。',
        'nsc.target': '掃描網段',
        'nsc.targetPlaceholder': '192.168.1.0/24 或 192.168.1.10-50',
        'nsc.targetHint': '支援 CIDR、起訖範圍、萬用字元（192.168.1.*）或單一 IP。',
        'nsc.targetCount': '將掃描 {count} 個位址。',
        'nsc.targetTooLarge': '一次最多掃描 4096 個位址。',
        'nsc.localSubnets': '本機網段',
        'nsc.noInterfaces': '找不到可用的本機 IPv4 網段。',
        'nsc.preset': '連接埠',
        'nsc.presetQuick': '快速（3 個埠）',
        'nsc.presetStandard': '標準（10 個埠）',
        'nsc.presetServices': '常見服務（18 個埠）',
        'nsc.presetCustom': '自訂連接埠',
        'nsc.customPorts': '自訂連接埠',
        'nsc.customPortsPlaceholder': '80,443,8000-8010',
        'nsc.customPortsHint': '以逗號或空白分隔，可指定範圍，最多 32 個。',
        'nsc.timeout': '連線逾時（毫秒）',
        'nsc.concurrency': '同時掃描主機數',
        'nsc.resolveNames': '解析主機名稱',
        'nsc.start': '開始掃描',
        'nsc.starting': '啟動中…',
        'nsc.stop': '停止',
        'nsc.stopping': '停止中…',
        'nsc.idle': '待機',
        'nsc.scanning': '掃描中',
        'nsc.resolving': '解析主機名稱…',
        'nsc.stoppingPhase': '停止中',
        'nsc.complete': '掃描完成',
        'nsc.stopped': '已停止',
        'nsc.failed': '掃描失敗',
        'nsc.progress': '已掃描 {scanned} / {total}',
        'nsc.found': '存活 {count} 台',
        'nsc.elapsed': '已用 {seconds} 秒',
        'nsc.results': '掃描結果',
        'nsc.resultsCount': '{count} 台有回應',
        'nsc.filter': '篩選',
        'nsc.filterPlaceholder': '篩選 IP、名稱、MAC 或連接埠',
        'nsc.export': '匯出 CSV',
        'nsc.colStatus': '狀態',
        'nsc.colIp': 'IP 位址',
        'nsc.colHost': '主機名稱',
        'nsc.colMac': 'MAC 位址',
        'nsc.colPorts': '開放連接埠',
        'nsc.colLatency': '延遲',
        'nsc.online': '上線',
        'nsc.noPorts': '無開放埠',
        'nsc.emptyIdle': '設定網段後按「開始掃描」。',
        'nsc.emptyRunning': '掃描中…有回應的主機會陸續出現。',
        'nsc.emptyDone': '這個網段沒有找到有回應的主機。',
        'nsc.emptyFilter': '沒有符合篩選條件的主機。',
        'nsc.invalidTarget': '請輸入有效的網段，例如 192.168.1.0/24。',
        'nsc.invalidPorts': '連接埠需為 1–65535，最多 32 個。',
        'nsc.scanStarted': '掃描已開始。',
        'nsc.scanStopped': '掃描已停止。',
        'nsc.scanComplete': '掃描完成。',
        'nsc.scanFailed': '掃描失敗。',
        'nsc.hostUnknown': '—',
        'nsc.latencyMs': '毫秒',
      },
    }

    const CSS = `
.nsc { display:flex; flex-direction:column; height:100%; min-height:0; background:var(--dsw-alias-bg-base); color:var(--dsw-alias-label-primary); font-family:inherit; }
.nsc-head { display:flex; flex-wrap:wrap; align-items:flex-start; justify-content:space-between; gap:16px; padding:20px 24px 14px; border-bottom:1px solid var(--dsw-alias-border-l1); }
.nsc-title { margin:0; font-size:16px; font-weight:600; line-height:1.3; }
.nsc-subtitle { margin:3px 0 0; font-size:12px; color:var(--dsw-alias-label-secondary); }
.nsc-pills { display:flex; flex-wrap:wrap; align-items:center; gap:8px; padding-top:2px; }
.nsc-pill { display:inline-flex; align-items:center; gap:6px; font-size:12px; color:var(--dsw-alias-label-secondary); background:var(--dsw-alias-bg-layer-2); border:1px solid var(--dsw-alias-border-l1); border-radius:999px; padding:4px 10px; white-space:nowrap; }
.nsc-dot { width:7px; height:7px; border-radius:50%; background:var(--dsw-alias-state-idle-primary); }
.nsc-pill.is-on { color:var(--dsw-alias-label-primary); }
.nsc-pill.is-on .nsc-dot { background:var(--dsw-alias-state-success-primary); }
.nsc-pill.is-busy .nsc-dot { background:var(--dsw-alias-state-warn-primary); }
.nsc-pill.is-error .nsc-dot { background:var(--dsw-alias-state-error-primary); }
.nsc-body { flex:1 1 auto; min-height:0; overflow:auto; display:flex; flex-direction:column; gap:12px; padding:16px 24px 24px; }
.nsc-card { background:var(--dsw-alias-bg-layer-1); border:1px solid var(--dsw-alias-border-l1); border-radius:10px; padding:12px 14px; }
.nsc-card-results { padding:12px 4px 8px; }
.nsc-row { display:flex; flex-wrap:wrap; align-items:flex-end; gap:10px; }
.nsc-row + .nsc-row { margin-top:10px; padding-top:10px; border-top:1px solid var(--dsw-alias-border-l1); }
.nsc-row-target { align-items:stretch; }
.nsc-field { display:flex; flex-direction:column; gap:4px; min-width:0; }
.nsc-field-target { flex:1 1 320px; }
.nsc-label { font-size:11px; color:var(--dsw-alias-label-secondary); }
.nsc-input { box-sizing:border-box; height:28px; border-radius:6px; border:1px solid var(--dsw-alias-border-l1); background:var(--dsw-alias-bg-base); color:var(--dsw-alias-label-primary); font:inherit; font-size:12px; padding:0 8px; outline:none; }
.nsc-input:focus { border-color:var(--dsw-alias-brand-primary); }
.nsc-input:disabled { color:var(--dsw-alias-label-secondary); background:var(--dsw-alias-bg-layer-2); }
.nsc-input-target { width:100%; }
.nsc-input-num { width:82px; }
.nsc-input-filter { width:210px; }
.nsc-select { width:190px; }
.nsc-hint { font-size:11px; color:var(--dsw-alias-label-secondary); }
.nsc-hint-error { color:var(--dsw-alias-state-error-primary); }
.nsc-ports-hint { font-family:ui-monospace,SFMono-Regular,Consolas,monospace; }
.nsc-chips { display:flex; flex-wrap:wrap; align-items:center; gap:6px; margin-top:10px; }
.nsc-chips-label { font-size:11px; color:var(--dsw-alias-label-secondary); margin-right:2px; }
.nsc-chip { display:inline-flex; align-items:center; gap:6px; height:24px; padding:0 9px; border-radius:999px; border:1px solid var(--dsw-alias-border-l1); background:var(--dsw-alias-bg-layer-2); color:var(--dsw-alias-label-primary); font:inherit; font-size:11px; cursor:pointer; white-space:nowrap; }
.nsc-chip:hover { border-color:var(--dsw-alias-brand-primary); }
.nsc-chip:disabled { opacity:.5; cursor:default; }
.nsc-chip.is-active { border-color:var(--dsw-alias-brand-primary); }
.nsc-chip-name { color:var(--dsw-alias-label-secondary); }
.nsc-actions { display:flex; gap:8px; margin-left:auto; }
.nsc-btn { height:28px; padding:0 12px; border-radius:6px; border:1px solid transparent; background:var(--dsw-alias-brand-primary); color:var(--dsw-alias-bg-base); font:inherit; font-size:12px; cursor:pointer; white-space:nowrap; }
.nsc-btn:disabled { opacity:.5; cursor:default; }
.nsc-btn-ghost { background:var(--dsw-alias-bg-layer-2); color:var(--dsw-alias-label-primary); border-color:var(--dsw-alias-border-l1); }
.nsc-btn-stop { background:var(--dsw-alias-state-error-primary); color:var(--dsw-alias-bg-base); }
.nsc-check { display:inline-flex; align-items:center; gap:6px; height:28px; font-size:12px; color:var(--dsw-alias-label-primary); cursor:pointer; user-select:none; white-space:nowrap; }
.nsc-check input { accent-color:var(--dsw-alias-brand-primary); margin:0; }
.nsc-progress-wrap { display:flex; flex-direction:column; gap:6px; margin-top:12px; }
.nsc-progress { height:6px; border-radius:999px; background:var(--dsw-alias-bg-layer-2); overflow:hidden; }
.nsc-progress-bar { height:100%; background:var(--dsw-alias-brand-primary); transition:width .25s ease; }
.nsc-progress-bar.is-error { background:var(--dsw-alias-state-error-primary); }
.nsc-stats { display:flex; flex-wrap:wrap; align-items:baseline; gap:4px 16px; font-size:11px; color:var(--dsw-alias-label-secondary); }
.nsc-stat-strong { color:var(--dsw-alias-label-primary); }
.nsc-message { margin-top:8px; font-size:12px; }
.nsc-error { color:var(--dsw-alias-state-error-primary); }
.nsc-ok { color:var(--dsw-alias-state-success-primary); }
.nsc-tablebar { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:10px; padding:0 10px 8px; }
.nsc-tabletitle { margin:0; font-size:13px; font-weight:600; }
.nsc-count { margin-left:6px; font-size:11px; font-weight:400; color:var(--dsw-alias-label-secondary); }
.nsc-tools { display:flex; align-items:center; gap:8px; margin-left:auto; }
.nsc-tablewrap { overflow:auto; }
.nsc-table { width:100%; border-collapse:collapse; font-size:12px; }
.nsc-table th { text-align:left; font-weight:500; color:var(--dsw-alias-label-secondary); padding:6px 10px; border-bottom:1px solid var(--dsw-alias-border-l1); white-space:nowrap; }
.nsc-table td { padding:5px 10px; border-bottom:1px solid var(--dsw-alias-border-l1); vertical-align:middle; }
.nsc-table tbody tr:last-child td { border-bottom:none; }
.nsc-table tbody tr:hover td { background:var(--dsw-alias-bg-layer-2); }
.nsc-col-status { width:44px; }
.nsc-col-latency { text-align:right; }
.nsc-mono { font-variant-numeric:tabular-nums; font-family:ui-monospace,SFMono-Regular,Consolas,monospace; }
.nsc-strong { font-weight:600; }
.nsc-dim { color:var(--dsw-alias-label-secondary); }
.nsc-state-dot { display:inline-block; width:8px; height:8px; border-radius:50%; background:var(--dsw-alias-state-success-primary); }
.nsc-portlist { display:flex; flex-wrap:wrap; gap:4px; }
.nsc-port { display:inline-flex; align-items:center; height:18px; padding:0 6px; border-radius:4px; background:var(--dsw-alias-bg-layer-2); border:1px solid var(--dsw-alias-border-l1); font-family:ui-monospace,SFMono-Regular,Consolas,monospace; font-size:11px; }
.nsc-empty { margin:0; padding:18px 10px; font-size:12px; color:var(--dsw-alias-label-secondary); }
`

    const PRESETS = [
      { id: 'quick', labelKey: 'nsc.presetQuick', ports: [80, 443, 445] },
      {
        id: 'standard',
        labelKey: 'nsc.presetStandard',
        ports: [21, 22, 23, 80, 135, 139, 443, 445, 3389, 8080],
      },
      {
        id: 'services',
        labelKey: 'nsc.presetServices',
        ports: [21, 22, 23, 53, 80, 110, 139, 143, 443, 445, 993, 3306, 3389, 5432, 6379, 8080, 8443, 27017],
      },
      { id: 'custom', labelKey: 'nsc.presetCustom', ports: null },
    ]

    const DEFAULTS = {
      cidr: '',
      preset: 'standard',
      portsText: '',
      timeoutMs: '450',
      concurrency: '48',
      resolveNames: true,
    }

    function messageOf(error) {
      if (!error) return 'request failed'
      return error.message ? String(error.message) : String(error)
    }

    async function callHost(payload) {
      const url = new URL('netscanner/api', document.baseURI)
      const controller = new AbortController()
      const timer = window.setTimeout(() => controller.abort(), 20000)
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
      if (!data || data.ok !== true) throw new Error('empty response from the scan host')
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

    function parseIpv4(text) {
      const parts = String(text == null ? '' : text).trim().split('.')
      if (parts.length !== 4) return null
      const octets = []
      for (const part of parts) {
        if (!/^\d{1,3}$/.test(part)) return null
        const value = Number.parseInt(part, 10)
        if (!Number.isInteger(value) || value < 0 || value > 255) return null
        octets.push(value)
      }
      return octets
    }

    function ipv4ToInt(text) {
      const octets = parseIpv4(text)
      if (!octets) return null
      return ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0
    }

    function previewTarget(text) {
      const raw = String(text == null ? '' : text).trim()
      if (raw === '') return { ok: false, count: 0 }
      if (raw.includes('/')) {
        const slash = raw.indexOf('/')
        const ip = raw.slice(0, slash).trim()
        const prefixText = raw.slice(slash + 1).trim()
        if (!parseIpv4(ip) || !/^\d{1,2}$/.test(prefixText)) return { ok: false, count: 0 }
        const prefix = Number.parseInt(prefixText, 10)
        if (prefix < 8 || prefix > 32) return { ok: false, count: 0 }
        return { ok: true, count: prefix >= 31 ? 2 ** (32 - prefix) : 2 ** (32 - prefix) - 2 }
      }
      if (/^(\d{1,3}\.){3}\d{1,3}\s*-\s*(\d{1,3}\.){3}\d{1,3}$/.test(raw)) {
        const [startText, endText] = raw.split('-').map((part) => part.trim())
        const start = ipv4ToInt(startText)
        const end = ipv4ToInt(endText)
        if (start === null || end === null || start > end) return { ok: false, count: 0 }
        return { ok: true, count: end - start + 1 }
      }
      if (/^(\d{1,3}\.){3}\d{1,3}\s*-\s*\d{1,3}$/.test(raw)) {
        const [startText, endText] = raw.split('-').map((part) => part.trim())
        const octets = parseIpv4(startText)
        const last = Number.parseInt(endText, 10)
        if (!octets || !/^\d{1,3}$/.test(endText) || last < octets[3] || last > 255) {
          return { ok: false, count: 0 }
        }
        return { ok: true, count: last - octets[3] + 1 }
      }
      if (/^(\d{1,3}\.){3}\*$/.test(raw)) {
        return parseIpv4(raw.slice(0, -1) + '0') ? { ok: true, count: 254 } : { ok: false, count: 0 }
      }
      return parseIpv4(raw) ? { ok: true, count: 1 } : { ok: false, count: 0 }
    }

    function parsePortsText(text) {
      const raw = String(text == null ? '' : text).trim()
      if (raw === '') return { ports: [], error: true }
      const ports = new Set()
      for (const token of raw.split(/[\s,;]+/).filter(Boolean)) {
        const match = /^(\d{1,5})(?:\s*-\s*(\d{1,5}))?$/.exec(token)
        if (!match) return { ports: [], error: true }
        const low = Number.parseInt(match[1], 10)
        const high = match[2] === undefined ? low : Number.parseInt(match[2], 10)
        if (low < 1 || low > 65535 || high < 1 || high > 65535 || low > high) {
          return { ports: [], error: true }
        }
        for (let port = low; port <= high; port += 1) {
          ports.add(port)
          if (ports.size > MAX_PORTS) return { ports: [], error: true }
        }
      }
      if (ports.size === 0) return { ports: [], error: true }
      return { ports: [...ports].sort((left, right) => left - right), error: false }
    }

    function formatSeconds(milliseconds) {
      return (Math.max(0, Number(milliseconds) || 0) / 1000).toFixed(1)
    }

    function readStoredForm() {
      const fallback = { ...DEFAULTS }
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY)
        if (!raw) return fallback
        const saved = JSON.parse(raw)
        return {
          cidr: typeof saved.cidr === 'string' ? saved.cidr : fallback.cidr,
          preset: PRESETS.some((preset) => preset.id === saved.preset) ? saved.preset : fallback.preset,
          portsText: typeof saved.portsText === 'string' ? saved.portsText : fallback.portsText,
          timeoutMs: typeof saved.timeoutMs === 'string' ? saved.timeoutMs : fallback.timeoutMs,
          concurrency: typeof saved.concurrency === 'string' ? saved.concurrency : fallback.concurrency,
          resolveNames: saved.resolveNames !== false,
        }
      } catch {
        return fallback
      }
    }

    function rememberForm(form) {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(form))
      } catch {
        /* storage can be unavailable; the scan still works */
      }
    }

    function csvCell(value) {
      let text = String(value == null ? '' : value)
      if (/^[=+\-@\t\r]/.test(text)) text = "'" + text
      return '"' + text.replace(/"/g, '""') + '"'
    }

    function downloadCsv(rows, target) {
      const header = ['IP', 'Hostname', 'MAC', 'Open ports', 'Latency (ms)']
      const lines = [header]
      for (const row of rows) {
        lines.push([
          row.ip,
          row.hostname || '',
          row.mac || '',
          row.ports.join(' '),
          row.latencyMs,
        ])
      }
      const text = '\ufeff' + lines.map((line) => line.map(csvCell).join(',')).join('\r\n')
      const blob = new Blob([text], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      const slug = String(target || 'scan').replace(/[^0-9A-Za-z.-]+/g, '_')
      anchor.href = url
      anchor.download = `netscan-${slug}-${stamp}.csv`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    }

    function statusKey(scan) {
      if (!scan || !scan.phase || scan.phase === 'idle') return 'nsc.idle'
      if (scan.running) {
        if (scan.phase === 'resolving') return 'nsc.resolving'
        if (scan.phase === 'stopping') return 'nsc.stoppingPhase'
        return 'nsc.scanning'
      }
      switch (scan.phase) {
        case 'complete':
          return 'nsc.complete'
        case 'stopped':
          return 'nsc.stopped'
        case 'failed':
          return 'nsc.failed'
        default:
          return 'nsc.idle'
      }
    }

    function Icon(props) {
      const size = props && Number.isFinite(props.size) ? props.size : 20
      const color = props && props.active ? 'var(--dsw-alias-brand-primary)' : 'var(--dsw-alias-label-secondary)'
      return h(
        'svg',
        {
          viewBox: '0 0 24 24',
          width: size,
          height: size,
          'aria-hidden': true,
          style: { display: 'block' },
        },
        h('circle', {
          cx: 12,
          cy: 12,
          r: 8.5,
          fill: 'none',
          stroke: color,
          strokeWidth: 1.5,
          opacity: 0.45,
        }),
        h('circle', {
          cx: 12,
          cy: 12,
          r: 4.5,
          fill: 'none',
          stroke: color,
          strokeWidth: 1.5,
          opacity: 0.7,
        }),
        h('path', {
          d: 'M12 12.5 17.5 6.5',
          fill: 'none',
          stroke: color,
          strokeWidth: 1.6,
          strokeLinecap: 'round',
        }),
        h('circle', { cx: 12, cy: 12, r: 1.6, fill: color }),
        h('circle', { cx: 18, cy: 6, r: 1.5, fill: color }),
      )
    }

    function makePanel(ctx) {
      return function NetworkScannerPanel() {
        const t = useTranslate(ctx)
        const [form, setForm] = React.useState(readStoredForm)
        const [interfaces, setInterfaces] = React.useState([])
        const [interfacesLoaded, setInterfacesLoaded] = React.useState(false)
        const [scan, setScan] = React.useState(null)
        const [busy, setBusy] = React.useState(false)
        const [error, setError] = React.useState('')
        const [notice, setNotice] = React.useState('')
        const [filter, setFilter] = React.useState('')
        const noticeTimer = React.useRef(0)

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
          let alive = true
          ;(async () => {
            try {
              const data = await callHost({ op: 'status' })
              if (alive) setScan(data)
            } catch {
              /* the host may still be starting; the scan button surfaces failures */
            }
            try {
              const data = await callHost({ op: 'interfaces' })
              if (!alive) return
              const list = Array.isArray(data.interfaces) ? data.interfaces : []
              setInterfaces(list)
              setInterfacesLoaded(true)
              if (list.length > 0) {
                setForm((current) =>
                  current.cidr.trim() === '' ? { ...current, cidr: list[0].cidr } : current,
                )
              }
            } catch {
              /* local subnets are a convenience only */
            }
          })()
          return () => {
            alive = false
          }
        }, [])

        const running = Boolean(scan && scan.running)

        React.useEffect(() => {
          if (!running) return undefined
          let cancelled = false
          let misses = 0
          const id = window.setInterval(async () => {
            try {
              const data = await callHost({ op: 'status' })
              if (cancelled) return
              misses = 0
              setScan(data)
              if (!data.running) {
                flash(
                  ctx.locale.bind(NS)(
                    data.phase === 'failed' ? 'nsc.scanFailed' : 'nsc.scanComplete',
                  ),
                )
              }
            } catch (failure) {
              if (cancelled) return
              misses += 1
              setError(messageOf(failure))
              if (misses >= 3) {
                setScan((current) =>
                  current
                    ? { ...current, running: false, phase: 'failed', error: messageOf(failure) }
                    : current,
                )
              }
            }
          }, 700)
          return () => {
            cancelled = true
            window.clearInterval(id)
          }
        }, [running, flash])

        const setField = (name, value) => setForm((current) => ({ ...current, [name]: value }))

        const preset = PRESETS.find((entry) => entry.id === form.preset) || PRESETS[1]
        const custom = parsePortsText(form.portsText)
        const ports = form.preset === 'custom' ? custom.ports : preset.ports
        const preview = previewTarget(form.cidr)

        const start = async () => {
          setError('')
          if (!preview.ok) {
            setError(t('nsc.invalidTarget'))
            return
          }
          if (preview.count > MAX_HOSTS) {
            setError(t('nsc.targetTooLarge'))
            return
          }
          if (form.preset === 'custom' && custom.error) {
            setError(t('nsc.invalidPorts'))
            return
          }
          setBusy(true)
          try {
            rememberForm(form)
            const timeoutText = form.timeoutMs.trim()
            const concurrencyText = form.concurrency.trim()
            const data = await callHost({
              op: 'start',
              cidr: form.cidr.trim(),
              ports,
              timeoutMs: timeoutText === '' ? undefined : Number(timeoutText),
              concurrency: concurrencyText === '' ? undefined : Number(concurrencyText),
              resolveNames: form.resolveNames,
            })
            setScan(data)
            setFilter('')
            flash(t('nsc.scanStarted'))
          } catch (failure) {
            setError(messageOf(failure))
          } finally {
            setBusy(false)
          }
        }

        const stop = async () => {
          setBusy(true)
          try {
            const data = await callHost({ op: 'stop' })
            setScan(data)
            flash(t('nsc.scanStopped'))
          } catch (failure) {
            setError(messageOf(failure))
          } finally {
            setBusy(false)
          }
        }

        const results = scan && Array.isArray(scan.results) ? scan.results : []
        const needle = filter.trim().toLowerCase()
        const visible =
          needle === ''
            ? results
            : results.filter((row) => {
                if (row.ip.includes(needle)) return true
                if (row.hostname && row.hostname.toLowerCase().includes(needle)) return true
                if (row.mac && row.mac.toLowerCase().includes(needle)) return true
                return row.ports.some((port) => String(port).includes(needle))
              })

        const field = (label, control, hint) =>
          h(
            'label',
            { className: 'nsc-field' },
            h('span', { className: 'nsc-label' }, label),
            control,
            hint || null,
          )

        const targetInput = h('input', {
          id: 'nsc-target',
          className: 'nsc-input nsc-input-target',
          value: form.cidr,
          placeholder: t('nsc.targetPlaceholder'),
          spellCheck: false,
          disabled: running,
          onChange: (event) => setField('cidr', event.target.value),
        })

        const targetHint = preview.ok
          ? preview.count > MAX_HOSTS
            ? h('span', { className: 'nsc-hint nsc-hint-error' }, t('nsc.targetTooLarge'))
            : h(
                'span',
                { className: 'nsc-hint' },
                t('nsc.targetCount').replace('{count}', String(preview.count)),
              )
          : h('span', { className: 'nsc-hint' }, t('nsc.targetHint'))

        const targetRow = h(
          'div',
          { className: 'nsc-row nsc-row-target' },
          h(
            'div',
            { className: 'nsc-field nsc-field-target' },
            h('label', { className: 'nsc-label', htmlFor: 'nsc-target' }, t('nsc.target')),
            targetInput,
            targetHint,
          ),
        )

        const chips =
          interfaces.length > 0
            ? h(
                'div',
                { className: 'nsc-chips' },
                h('span', { className: 'nsc-chips-label' }, t('nsc.localSubnets')),
                interfaces.map((entry) =>
                  h(
                    'button',
                    {
                      type: 'button',
                      key: entry.cidr + entry.name,
                      className: 'nsc-chip' + (form.cidr.trim() === entry.cidr ? ' is-active' : ''),
                      title: entry.address + ' / ' + entry.netmask,
                      disabled: running,
                      onClick: () => setField('cidr', entry.cidr),
                    },
                    entry.cidr,
                    h('span', { className: 'nsc-chip-name' }, entry.name),
                  ),
                ),
              )
            : interfacesLoaded
              ? h(
                  'div',
                  { className: 'nsc-chips' },
                  h('span', { className: 'nsc-hint' }, t('nsc.noInterfaces')),
                )
              : null

        const controlRow = h(
          'div',
          { className: 'nsc-row' },
          field(
            t('nsc.preset'),
            h(
              'select',
              {
                className: 'nsc-input nsc-select',
                value: form.preset,
                disabled: running,
                onChange: (event) => setField('preset', event.target.value),
              },
              PRESETS.map((entry) => h('option', { value: entry.id, key: entry.id }, t(entry.labelKey))),
            ),
            form.preset === 'custom'
              ? null
              : h(
                  'span',
                  { className: 'nsc-hint nsc-ports-hint' },
                  preset.ports.join(', '),
                ),
          ),
          form.preset === 'custom'
            ? field(
                t('nsc.customPorts'),
                h('input', {
                  className: 'nsc-input',
                  style: { width: '172px' },
                  value: form.portsText,
                  placeholder: t('nsc.customPortsPlaceholder'),
                  spellCheck: false,
                  disabled: running,
                  onChange: (event) => setField('portsText', event.target.value),
                }),
                h('span', { className: 'nsc-hint' }, t('nsc.customPortsHint')),
              )
            : null,
          field(
            t('nsc.timeout'),
            h('input', {
              className: 'nsc-input nsc-input-num',
              value: form.timeoutMs,
              inputMode: 'numeric',
              disabled: running,
              onChange: (event) => setField('timeoutMs', event.target.value),
            }),
          ),
          field(
            t('nsc.concurrency'),
            h('input', {
              className: 'nsc-input nsc-input-num',
              value: form.concurrency,
              inputMode: 'numeric',
              disabled: running,
              onChange: (event) => setField('concurrency', event.target.value),
            }),
          ),
          h(
            'label',
            { className: 'nsc-check' },
            h('input', {
              type: 'checkbox',
              checked: form.resolveNames,
              disabled: running,
              onChange: (event) => setField('resolveNames', event.target.checked),
            }),
            t('nsc.resolveNames'),
          ),
          h(
            'div',
            { className: 'nsc-actions' },
            running
              ? h(
                  'button',
                  {
                    type: 'button',
                    className: 'nsc-btn nsc-btn-stop',
                    onClick: stop,
                    disabled: busy,
                  },
                  busy ? t('nsc.stopping') : t('nsc.stop'),
                )
              : h(
                  'button',
                  { type: 'button', className: 'nsc-btn', onClick: start, disabled: busy },
                  busy ? t('nsc.starting') : t('nsc.start'),
                ),
          ),
        )

        const percent =
          scan && scan.total > 0
            ? Math.min(100, Math.round((scan.scanned / scan.total) * 100))
            : 0
        const progress =
          scan && scan.scanId
            ? h(
                'div',
                { className: 'nsc-progress-wrap' },
                h(
                  'div',
                  { className: 'nsc-progress' },
                  h('div', {
                    className: 'nsc-progress-bar' + (scan.phase === 'failed' ? ' is-error' : ''),
                    style: { width: percent + '%' },
                  }),
                ),
                h(
                  'div',
                  { className: 'nsc-stats' },
                  h(
                    'span',
                    { className: 'nsc-stat-strong' },
                    t(statusKey(scan)),
                  ),
                  h(
                    'span',
                    null,
                    t('nsc.progress')
                      .replace('{scanned}', String(scan.scanned))
                      .replace('{total}', String(scan.total)),
                  ),
                  h('span', null, t('nsc.found').replace('{count}', String(scan.aliveCount))),
                  h(
                    'span',
                    null,
                    t('nsc.elapsed').replace('{seconds}', formatSeconds(scan.elapsedMs)),
                  ),
                ),
              )
            : null

        const message = error
          ? h(
              'div',
              { className: 'nsc-message nsc-error', role: 'status', 'aria-live': 'polite' },
              error,
            )
          : notice
            ? h(
                'div',
                { className: 'nsc-message nsc-ok', role: 'status', 'aria-live': 'polite' },
                notice,
              )
            : null

        const header = h(
          'header',
          { className: 'nsc-head' },
          h(
            'div',
            null,
            h('h1', { className: 'nsc-title' }, t('nsc.title')),
            h('p', { className: 'nsc-subtitle' }, t('nsc.subtitle')),
          ),
          h(
            'div',
            { className: 'nsc-pills' },
            scan && scan.aliveCount > 0
              ? h(
                  'span',
                  { className: 'nsc-pill' },
                  t('nsc.found').replace('{count}', String(scan.aliveCount)),
                )
              : null,
            h(
              'span',
              {
                className:
                  'nsc-pill ' +
                  (running ? 'is-busy' : scan && scan.phase === 'failed' ? 'is-error' : scan && scan.phase === 'complete' ? 'is-on' : ''),
              },
              h('span', { className: 'nsc-dot' }),
              t(statusKey(scan)),
            ),
          ),
        )

        const tableBar = h(
          'div',
          { className: 'nsc-tablebar' },
          h(
            'h2',
            { className: 'nsc-tabletitle' },
            t('nsc.results'),
            scan && scan.cidr
              ? h('span', { className: 'nsc-count nsc-mono' }, scan.cidr)
              : null,
            results.length > 0
              ? h(
                  'span',
                  { className: 'nsc-count' },
                  t('nsc.resultsCount').replace('{count}', String(results.length)),
                )
              : null,
          ),
          h(
            'div',
            { className: 'nsc-tools' },
            h('input', {
              className: 'nsc-input nsc-input-filter',
              value: filter,
              placeholder: t('nsc.filterPlaceholder'),
              'aria-label': t('nsc.filter'),
              spellCheck: false,
              onChange: (event) => setFilter(event.target.value),
            }),
            h(
              'button',
              {
                type: 'button',
                className: 'nsc-btn nsc-btn-ghost',
                onClick: () => downloadCsv(results, scan && scan.cidr ? scan.cidr : 'scan'),
                disabled: results.length === 0,
              },
              t('nsc.export'),
            ),
          ),
        )

        const head = h(
          'thead',
          null,
          h(
            'tr',
            null,
            h('th', { className: 'nsc-col-status' }, t('nsc.colStatus')),
            h('th', null, t('nsc.colIp')),
            h('th', null, t('nsc.colHost')),
            h('th', null, t('nsc.colMac')),
            h('th', null, t('nsc.colPorts')),
            h('th', { className: 'nsc-col-latency' }, t('nsc.colLatency')),
          ),
        )

        const body = h(
          'tbody',
          null,
          visible.map((row) =>
            h(
              'tr',
              { key: row.ip },
              h(
                'td',
                null,
                h('span', {
                  className: 'nsc-state-dot',
                  title: t('nsc.online'),
                  'aria-label': t('nsc.online'),
                }),
              ),
              h('td', { className: 'nsc-mono nsc-strong' }, row.ip),
              h(
                'td',
                { className: row.hostname ? '' : 'nsc-dim' },
                row.hostname || t('nsc.hostUnknown'),
              ),
              h(
                'td',
                { className: row.mac ? 'nsc-mono' : 'nsc-mono nsc-dim' },
                row.mac || t('nsc.hostUnknown'),
              ),
              h(
                'td',
                null,
                row.ports.length > 0
                  ? h(
                      'div',
                      { className: 'nsc-portlist' },
                      row.ports.map((port) =>
                        h('span', { key: port, className: 'nsc-port' }, String(port)),
                      ),
                    )
                  : h('span', { className: 'nsc-dim' }, t('nsc.noPorts')),
              ),
              h(
                'td',
                { className: 'nsc-mono nsc-dim nsc-col-latency' },
                String(row.latencyMs) + ' ' + t('nsc.latencyMs'),
              ),
            ),
          ),
        )

        const emptyKey =
          results.length > 0
            ? 'nsc.emptyFilter'
            : running
              ? 'nsc.emptyRunning'
              : scan && scan.phase === 'complete'
                ? 'nsc.emptyDone'
                : 'nsc.emptyIdle'

        return h(
          'div',
          { className: 'nsc' },
          h('style', { key: 'nsc-style' }, CSS),
          header,
          h(
            'div',
            { className: 'nsc-body' },
            h(
              'section',
              { className: 'nsc-card' },
              targetRow,
              chips,
              controlRow,
              progress,
              message,
            ),
            h(
              'section',
              { className: 'nsc-card nsc-card-results' },
              tableBar,
              visible.length === 0
                ? h('p', { className: 'nsc-empty' }, t(emptyKey))
                : h('div', { className: 'nsc-tablewrap' }, h('table', { className: 'nsc-table' }, head, body)),
            ),
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

        const label = () => ctx.locale.bind(NS)('nsc.title')
        const Panel = makePanel(ctx)

        ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register({ name: 'sidebar.panellist', id: 'netscanner', order: 21, label }, Icon),
        )
        ctx.slots.inject('main', () =>
          ctx.slots.register({ name: 'main', key: 'netscanner' }, Panel),
        )
      },
    }
  },
})
