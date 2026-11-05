/**
 * Modbus Poll — client half.
 *
 * Registers a sidebar entry (`sidebar.panellist` id `modbus-poll`) and the
 * matching central panel (`main` key `modbus-poll`). The sidebar owns the
 * button; this module supplies its icon and the panel body.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-plugin-modbus-poll',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const NS = 'modbusPoll'

    const STORAGE_KEY = 'dsh.modbus-poll/v1'
    const TYPE_OPTIONS = ['u16', 'i16', 'u32', 'i32', 'f32']
    const TYPE_WIDTH = { u16: 1, i16: 1, u32: 2, i32: 2, f32: 2 }
    const WORD_ORDER_OPTIONS = ['ABCD', 'CDAB', 'BADC', 'DCBA']
    const KIND_OPTIONS = ['holding', 'input', 'coil', 'discrete']
    const DEFAULT_CONNECTION = { host: '127.0.0.1', port: '502', unitId: '1' }
    const DEFAULT_VIEW = {
      kind: 'holding',
      start: '0',
      count: '16',
      interval: '1000',
      type: 'u16',
      wordOrder: 'ABCD',
      scale: '1',
      offset: '0',
    }

    const DICTIONARIES = {
      en: {
        'poll.title': 'Modbus Poll',
        'poll.subtitle': 'Read and write Modbus TCP registers, coils and bits.',
        'poll.host': 'Host',
        'poll.port': 'Port',
        'poll.unit': 'Unit ID',
        'poll.connect': 'Connect',
        'poll.connecting': 'Connecting…',
        'poll.disconnect': 'Disconnect',
        'poll.connected': 'Connected',
        'poll.disconnected': 'Disconnected',
        'poll.preset': 'Saved devices',
        'poll.presetName': 'Device name',
        'poll.presetNone': 'Current connection',
        'poll.presetSave': 'Save',
        'poll.presetDelete': 'Delete',
        'poll.presetSaved': 'Connection saved.',
        'poll.table': 'Data table',
        'poll.holding': 'Holding registers (03)',
        'poll.input': 'Input registers (04)',
        'poll.coil': 'Coils (01)',
        'poll.discrete': 'Discrete inputs (02)',
        'poll.startAddress': 'Start address',
        'poll.count': 'Count',
        'poll.interval': 'Interval (ms)',
        'poll.read': 'Read',
        'poll.startPolling': 'Start polling',
        'poll.stopPolling': 'Stop polling',
        'poll.polling': 'Polling',
        'poll.type': 'Type',
        'poll.wordOrder': 'Word order',
        'poll.scale': 'Scale',
        'poll.offset': 'Offset',
        'poll.address': 'Address',
        'poll.value': 'Value',
        'poll.hex': 'Hex',
        'poll.bits': 'Bits',
        'poll.write': 'Write',
        'poll.readOnly': 'read-only',
        'poll.empty': 'No data yet. Connect to a server and press Read.',
        'poll.invalidRange': 'Start address must be 0–65535, count 1–125 registers or 1–2000 bits.',
        'poll.invalidValue': 'Enter a valid value for the selected type.',
        'poll.writeOk': 'Value written.',
        'poll.updated': 'Updated',
        'poll.latency': 'ms',
        'poll.on': 'On',
        'poll.off': 'Off',
        'poll.toggle': 'Toggle',
        'poll.reconnected': 'Reconnected to the server.',
        'poll.readOnlyLock': 'Read-only lock',
        'poll.guardOn': 'Writes are locked.',
        'poll.guardOff': 'Writes are unlocked.',
        'poll.writeLog': 'Write log',
        'poll.writeLogPanel': 'panel',
        'poll.writeLogTool': 'agent',
      },
      zh: {
        'poll.title': 'Modbus 讀寫台',
        'poll.subtitle': '讀取與修改 Modbus TCP 暫存器、線圈與位元。',
        'poll.host': '位址',
        'poll.port': '埠號',
        'poll.unit': '站號',
        'poll.connect': '連線',
        'poll.connecting': '連線中…',
        'poll.disconnect': '中斷',
        'poll.connected': '已連線',
        'poll.disconnected': '未連線',
        'poll.preset': '已存裝置',
        'poll.presetName': '裝置名稱',
        'poll.presetNone': '目前連線',
        'poll.presetSave': '儲存',
        'poll.presetDelete': '刪除',
        'poll.presetSaved': '已儲存連線。',
        'poll.table': '資料表',
        'poll.holding': '保持暫存器 (03)',
        'poll.input': '輸入暫存器 (04)',
        'poll.coil': '線圈 (01)',
        'poll.discrete': '離散輸入 (02)',
        'poll.startAddress': '起始位址',
        'poll.count': '數量',
        'poll.interval': '間隔 (毫秒)',
        'poll.read': '讀取',
        'poll.startPolling': '開始輪詢',
        'poll.stopPolling': '停止輪詢',
        'poll.polling': '輪詢中',
        'poll.type': '型別',
        'poll.wordOrder': '字序',
        'poll.scale': '比例',
        'poll.offset': '位移',
        'poll.address': '位址',
        'poll.value': '數值',
        'poll.hex': '十六進位',
        'poll.bits': '位元',
        'poll.write': '寫入',
        'poll.readOnly': '唯讀',
        'poll.empty': '尚無資料。連線後按「讀取」。',
        'poll.invalidRange': '起始位址需為 0–65535，數量需為 1–125 個暫存器或 1–2000 個位元。',
        'poll.invalidValue': '請輸入符合所選型別的有效數值。',
        'poll.writeOk': '已寫入。',
        'poll.updated': '更新於',
        'poll.latency': '毫秒',
        'poll.on': '開',
        'poll.off': '關',
        'poll.toggle': '切換',
        'poll.reconnected': '已重新連線至伺服器。',
        'poll.readOnlyLock': '唯讀鎖定',
        'poll.guardOn': '已鎖定寫入。',
        'poll.guardOff': '已解除寫入鎖定。',
        'poll.writeLog': '寫入紀錄',
        'poll.writeLogPanel': '面板',
        'poll.writeLogTool': 'Agent',
      },
    }

    const CSS = `
 .mbp { display:flex; flex-direction:column; height:100%; min-height:0; background:var(--dsw-alias-bg-base); color:var(--dsw-alias-label-primary); font-family:inherit; }
 .mbp-head { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; padding:20px 24px 14px; border-bottom:1px solid var(--dsw-alias-border-l1); }
 .mbp-title { margin:0; font-size:16px; font-weight:600; line-height:1.3; }
 .mbp-subtitle { margin:3px 0 0; font-size:12px; color:var(--dsw-alias-label-secondary); }
 .mbp-pills { display:flex; align-items:center; gap:8px; padding-top:2px; }
 .mbp-pill { display:inline-flex; align-items:center; gap:6px; font-size:12px; color:var(--dsw-alias-label-secondary); background:var(--dsw-alias-bg-layer-2); border:1px solid var(--dsw-alias-border-l1); border-radius:999px; padding:4px 10px; white-space:nowrap; }
 .mbp-dot { width:7px; height:7px; border-radius:50%; background:var(--dsw-alias-state-idle-primary); }
 .mbp-pill.is-on { color:var(--dsw-alias-label-primary); }
 .mbp-pill.is-on .mbp-dot { background:var(--dsw-alias-state-success-primary); }
 .mbp-pill.is-busy .mbp-dot { background:var(--dsw-alias-state-warn-primary); }
 .mbp-body { flex:1 1 auto; min-height:0; overflow:auto; display:flex; flex-direction:column; gap:12px; padding:16px 24px 24px; }
 .mbp-card { background:var(--dsw-alias-bg-layer-1); border:1px solid var(--dsw-alias-border-l1); border-radius:10px; padding:12px 14px; }
 .mbp-card-table { padding:12px 4px 8px; }
 .mbp-row { display:flex; flex-wrap:wrap; align-items:flex-end; gap:10px; }
 .mbp-row + .mbp-row { margin-top:10px; padding-top:10px; border-top:1px solid var(--dsw-alias-border-l1); }
 .mbp-field { display:flex; flex-direction:column; gap:4px; }
 .mbp-label { font-size:11px; color:var(--dsw-alias-label-secondary); }
 .mbp-input { box-sizing:border-box; height:28px; border-radius:6px; border:1px solid var(--dsw-alias-border-l1); background:var(--dsw-alias-bg-base); color:var(--dsw-alias-label-primary); font:inherit; font-size:12px; padding:0 8px; outline:none; }
 .mbp-input:focus { border-color:var(--dsw-alias-brand-primary); }
 .mbp-input:disabled { color:var(--dsw-alias-label-secondary); background:var(--dsw-alias-bg-layer-2); }
 .mbp-input-host { width:150px; }
 .mbp-input-num { width:76px; }
 .mbp-input-write { width:88px; }
 .mbp-input-name { width:140px; }
 .mbp-select { width:190px; }
 .mbp-select-preset { width:196px; }
 .mbp-select-type { width:92px; }
 .mbp-select-order { width:92px; }
 .mbp-actions { display:flex; gap:8px; margin-left:auto; }
 .mbp-btn { height:28px; padding:0 12px; border-radius:6px; border:1px solid transparent; background:var(--dsw-alias-brand-primary); color:var(--dsw-alias-bg-base); font:inherit; font-size:12px; cursor:pointer; white-space:nowrap; }
 .mbp-btn:disabled { opacity:.5; cursor:default; }
 .mbp-btn-ghost { background:var(--dsw-alias-bg-layer-2); color:var(--dsw-alias-label-primary); border-color:var(--dsw-alias-border-l1); }
 .mbp-btn-stop { background:var(--dsw-alias-state-error-primary); color:var(--dsw-alias-bg-base); }
 .mbp-btn-sm { height:26px; padding:0 10px; }
 .mbp-tablebar { display:flex; align-items:baseline; justify-content:space-between; gap:12px; padding:0 10px 8px; min-height:16px; }
 .mbp-hint { font-size:11px; color:var(--dsw-alias-label-secondary); }
 .mbp-error { font-size:12px; color:var(--dsw-alias-state-error-primary); }
 .mbp-ok { font-size:12px; color:var(--dsw-alias-state-success-primary); }
 .mbp-table { width:100%; border-collapse:collapse; font-size:12px; }
 .mbp-table th { text-align:left; font-weight:500; color:var(--dsw-alias-label-secondary); padding:6px 10px; border-bottom:1px solid var(--dsw-alias-border-l1); }
 .mbp-table td { padding:5px 10px; border-bottom:1px solid var(--dsw-alias-border-l1); vertical-align:middle; }
 .mbp-table tbody tr:last-child td { border-bottom:none; }
 .mbp-table tbody tr:hover td { background:var(--dsw-alias-bg-layer-2); }
 .mbp-mono { font-variant-numeric:tabular-nums; font-family:ui-monospace,SFMono-Regular,Consolas,monospace; }
 .mbp-strong { font-weight:600; }
 .mbp-dim { color:var(--dsw-alias-label-secondary); }
 .mbp-write { display:flex; align-items:center; gap:6px; }
 .mbp-empty { margin:0; padding:18px 10px; font-size:12px; color:var(--dsw-alias-label-secondary); }
 .mbp-bits { display:flex; align-items:center; gap:2px; }
 .mbp-bit { width:10px; height:16px; padding:0; border-radius:2px; border:1px solid var(--dsw-alias-border-l1); background:var(--dsw-alias-bg-base); cursor:pointer; }
 .mbp-bit.is-on { background:var(--dsw-alias-brand-primary); border-color:var(--dsw-alias-brand-primary); }
 .mbp-bit:disabled { cursor:default; opacity:.55; }
 .mbp-changed > td:first-child { animation:mbpFlash 1.4s ease-out; }
 @keyframes mbpFlash { from { box-shadow:inset 2px 0 0 var(--dsw-alias-brand-primary); } to { box-shadow:inset 2px 0 0 transparent; } }
 .mbp-coil { display:inline-flex; align-items:center; gap:6px; }
 .mbp-tablebar-right { display:flex; align-items:center; gap:12px; }
 .mbp-guard { display:inline-flex; align-items:center; gap:6px; font-size:12px; color:var(--dsw-alias-label-secondary); cursor:pointer; user-select:none; white-space:nowrap; }
 .mbp-log { margin:6px 10px 4px; font-size:12px; color:var(--dsw-alias-label-secondary); }
 .mbp-log summary { cursor:pointer; }
 .mbp-log ul { margin:6px 0 0; padding-left:18px; }
 .mbp-log li { padding:2px 0; }
 `

    function hex4(value) {
      return value.toString(16).toUpperCase().padStart(4, '0')
    }

    function parseU16(text) {
      const raw = String(text == null ? '' : text).trim()
      if (raw === '') return null
      const isHex = /^0x/i.test(raw)
      const digits = isHex ? raw.slice(2) : raw
      if (digits === '' || !(isHex ? /^[0-9a-f]+$/i : /^[0-9]+$/).test(digits)) return null
      const value = Number.parseInt(digits, isHex ? 16 : 10)
      if (!Number.isInteger(value) || value < 0 || value > 65535) return null
      return value
    }

    function parseCount(text, kind) {
      const raw = String(text == null ? '' : text).trim()
      if (!/^[0-9]+$/.test(raw)) return null
      const value = Number.parseInt(raw, 10)
      const max = kind === 'coil' || kind === 'discrete' ? 2000 : 125
      return value >= 1 && value <= max ? value : null
    }

    function parseNumber(text, fallback) {
      const raw = String(text == null ? '' : text).trim()
      if (raw === '') return fallback
      const value = Number(raw)
      return Number.isFinite(value) ? value : null
    }

    /** Parse one write box for the selected type; null means "not a value". */
    function parseWrite(text, type) {
      const raw = String(text == null ? '' : text).trim()
      if (raw === '') return null
      if (type === 'u16') return parseU16(raw)
      if (type === 'i16') {
        const value = Number(raw)
        return Number.isInteger(value) ? value : null
      }
      if (type === 'f32') {
        const value = Number(raw)
        return Number.isFinite(value) ? value : null
      }
      const value = Number(raw)
      return Number.isInteger(value) ? value : null
    }

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

    function rowKey(row) {
      if (typeof row.on === 'boolean') return row.on ? 'on' : 'off'
      return row.text + '|' + (row.raw || []).join(',')
    }

    async function callHost(payload) {
      const url = new URL('modbus-poll/api', document.baseURI)
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
      if (!data || data.ok !== true) throw new Error('empty response from the Modbus host')
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
        {
          viewBox: '0 0 24 24',
          width: size,
          height: size,
          'aria-hidden': true,
          style: { display: 'block' },
        },
        h('rect', {
          x: 3.5,
          y: 4,
          width: 17,
          height: 4,
          rx: 1.4,
          fill: 'none',
          stroke: color,
          strokeWidth: 1.5,
        }),
        h('rect', { x: 3.5, y: 10, width: 17, height: 4, rx: 1.4, fill: color }),
        h('rect', {
          x: 3.5,
          y: 16,
          width: 17,
          height: 4,
          rx: 1.4,
          fill: 'none',
          stroke: color,
          strokeWidth: 1.5,
        }),
      )
    }

    function makePanel(ctx) {
      return function ModbusPollPanel() {
        const t = useTranslate(ctx)
        const storedRef = React.useRef(null)
        if (storedRef.current === null) storedRef.current = readStore()
        const stored = storedRef.current

        const [conn, setConn] = React.useState(() => ({ ...DEFAULT_CONNECTION, ...(stored.connection || {}) }))
        const [view, setView] = React.useState(() => ({ ...DEFAULT_VIEW, ...(stored.view || {}) }))
        const [profiles, setProfiles] = React.useState(() => (Array.isArray(stored.profiles) ? stored.profiles : []))
        const [activeProfile, setActiveProfile] = React.useState(stored.activeProfile || '')
        const [presetName, setPresetName] = React.useState('')
        const [connected, setConnected] = React.useState(false)
        const [polling, setPolling] = React.useState(false)
        const [busy, setBusy] = React.useState(false)
        const [rows, setRows] = React.useState([])
        const [stamp, setStamp] = React.useState(null)
        const [error, setError] = React.useState('')
        const [drafts, setDrafts] = React.useState({})
        const [notice, setNotice] = React.useState('')
        const [changed, setChanged] = React.useState([])
        const [readOnly, setReadOnly] = React.useState(false)
        const [writes, setWrites] = React.useState([])
        const noticeTimer = React.useRef(0)
        const failures = React.useRef(0)
        const inflight = React.useRef(false)
        const rowsRef = React.useRef([])

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
          writeStore({ connection: conn, view, profiles, activeProfile })
        }, [conn, view, profiles, activeProfile])

        // Rows from one kind/type must not be shown as another: a stale boolean
        // row read as a register (or the reverse) would be written back wrong.
        React.useEffect(() => {
          rowsRef.current = []
          setRows([])
          setChanged([])
          setDrafts({})
        }, [view.kind, view.type])

        const registerView = view.kind === 'holding' || view.kind === 'input'
        const width = TYPE_WIDTH[view.type] || 1
        // A read that started under another kind must not be drawn as this one.
        const visibleRows = rows.filter((row) => row.kind === view.kind)

        const readNow = React.useCallback(async () => {
          if (inflight.current) return
          const start = parseU16(view.start)
          const count = parseCount(view.count, view.kind)
          const scale = parseNumber(view.scale, 1)
          const offset = parseNumber(view.offset, 0)
          if (start === null || count === null) {
            setError(t('poll.invalidRange'))
            return
          }
          if (scale === null || offset === null) {
            setError(t('poll.invalidValue'))
            return
          }
          inflight.current = true
          try {
            const data = await callHost({
              op: 'read',
              kind: view.kind,
              start,
              count,
              type: view.type,
              wordOrder: view.wordOrder,
              scale,
              offset,
            })
            const next = Array.isArray(data.bits)
              ? data.bits.map((on, index) => ({ kind: view.kind, address: start + index, on }))
              : (data.rows || []).map((row) => ({
                  kind: view.kind,
                  address: row.address,
                  text: row.text,
                  raw: Array.isArray(row.raw) ? row.raw : [],
                }))
            const before = new Map(rowsRef.current.map((row) => [row.address, rowKey(row)]))
            const diff = next
              .filter((row) => before.has(row.address) && before.get(row.address) !== rowKey(row))
              .map((row) => row.address)
            rowsRef.current = next
            setRows(next)
            setChanged(diff)
            setStamp({ at: new Date(), latency: data.latencyMs })
            setError('')
            failures.current = 0
            if (data.reconnected) flash(t('poll.reconnected'))
          } catch (failure) {
            setError(messageOf(failure))
            failures.current += 1
            if (failures.current >= 3) setPolling(false)
          } finally {
            inflight.current = false
          }
        }, [view, t, flash])

        const readRef = React.useRef(readNow)
        React.useEffect(() => {
          readRef.current = readNow
        }, [readNow])

        // Serial polling: the next read is scheduled only after the previous one
        // finished, so a slow device cannot accumulate a queue of stale reads.
        React.useEffect(() => {
          if (!polling || !connected) return undefined
          let cancelled = false
          let timer = 0
          const parsed = Number.parseInt(view.interval, 10)
          const interval = Math.min(60000, Math.max(200, Number.isFinite(parsed) ? parsed : 1000))
          const tick = async () => {
            if (cancelled) return
            await readRef.current()
            if (cancelled) return
            timer = window.setTimeout(tick, interval)
          }
          timer = window.setTimeout(tick, 0)
          return () => {
            cancelled = true
            window.clearTimeout(timer)
          }
        }, [polling, connected, view.interval])

        // The guard lives on the host, so the agent and the panel see one switch.
        const refreshGuard = React.useCallback(async () => {
          try {
            const data = await callHost({ op: 'guard' })
            setReadOnly(data.readOnly === true)
            setWrites(Array.isArray(data.writes) ? data.writes : [])
          } catch {
            /* the guard is optional; a missing host must not break the panel */
          }
        }, [])

        React.useEffect(() => {
          let alive = true
          ;(async () => {
            try {
              await refreshGuard()
              const data = await callHost({ op: 'status' })
              if (!alive || !data.connected) return
              setConn({ host: data.host, port: String(data.port), unitId: String(data.unitId) })
              setConnected(true)
              await readNow()
            } catch {
              /* host half unreachable: stay disconnected and let the user retry */
            }
          })()
          return () => {
            alive = false
          }
        }, [])

        const connect = async () => {
          setBusy(true)
          setError('')
          try {
            await callHost({
              op: 'connect',
              host: conn.host.trim(),
              port: Number(conn.port),
              unitId: Number(conn.unitId),
            })
            setConnected(true)
            failures.current = 0
            await readNow()
          } catch (failure) {
            setConnected(false)
            setError(messageOf(failure))
          } finally {
            setBusy(false)
          }
        }

        const disconnect = async () => {
          setPolling(false)
          setConnected(false)
          setRows([])
          rowsRef.current = []
          setChanged([])
          setDrafts({})
          setStamp(null)
          setError('')
          try {
            await callHost({ op: 'disconnect' })
          } catch (failure) {
            setError(messageOf(failure))
          }
        }

        const writeRow = async (address) => {
          if (readOnly) {
            setError(t('poll.guardOn'))
            return
          }
          const value = parseWrite(drafts[address], registerView ? view.type : 'u16')
          if (value === null) {
            setError(t('poll.invalidValue'))
            return
          }
          try {
            await callHost({
              op: 'write',
              kind: view.kind,
              address,
              value,
              type: view.type,
              wordOrder: view.wordOrder,
              scale: parseNumber(view.scale, 1),
              offset: parseNumber(view.offset, 0),
            })
            setDrafts((current) => {
              if (!(address in current)) return current
              const next = { ...current }
              delete next[address]
              return next
            })
            setError('')
            flash(t('poll.writeOk'))
            await readNow()
            await refreshGuard()
          } catch (failure) {
            setError(messageOf(failure))
          }
        }

        const toggleBit = async (row, bit) => {
          if (readOnly) {
            setError(t('poll.guardOn'))
            return
          }
          const on = (((row.raw || [])[0] || 0) >> bit) & 1
          try {
            await callHost({ op: 'write-bit', address: row.address, bit, value: on ? 0 : 1 })
            setError('')
            flash(t('poll.writeOk'))
            await readNow()
            await refreshGuard()
          } catch (failure) {
            setError(messageOf(failure))
          }
        }

        const toggleCoil = async (row) => {
          if (readOnly) {
            setError(t('poll.guardOn'))
            return
          }
          try {
            await callHost({ op: 'write', kind: 'coil', address: row.address, value: row.on ? 0 : 1 })
            setError('')
            flash(t('poll.writeOk'))
            await readNow()
            await refreshGuard()
          } catch (failure) {
            setError(messageOf(failure))
          }
        }

        const toggleGuard = async (next) => {
          try {
            const data = await callHost({ op: 'set-guard', readOnly: next })
            setReadOnly(data.readOnly === true)
            setWrites(Array.isArray(data.writes) ? data.writes : [])
            flash(next ? t('poll.guardOn') : t('poll.guardOff'))
          } catch (failure) {
            setError(messageOf(failure))
          }
        }

        const savePreset = () => {
          const name = presetName.trim() || `${conn.host.trim()}:${conn.port.trim()} / ${conn.unitId.trim()}`
          setProfiles((current) => [...current.filter((entry) => entry.name !== name), {
            name,
            host: conn.host,
            port: conn.port,
            unitId: conn.unitId,
          }])
          setActiveProfile(name)
          setPresetName('')
          flash(t('poll.presetSaved'))
        }

        const deletePreset = () => {
          if (activeProfile === '') return
          setProfiles((current) => current.filter((entry) => entry.name !== activeProfile))
          setActiveProfile('')
        }

        const choosePreset = (name) => {
          setActiveProfile(name)
          const found = profiles.find((entry) => entry.name === name)
          if (!found) return
          // The host/port fields are locked while connected, so leave the old
          // server first rather than showing an address that is not in use.
          if (connected) disconnect()
          setConn({ host: found.host, port: found.port, unitId: found.unitId })
        }

        const field = (label, control) =>
          h('div', { className: 'mbp-field' }, h('span', { className: 'mbp-label' }, label), control)

        const setViewField = (name, value) => setView((current) => ({ ...current, [name]: value }))

        const presetRow = h(
          'div',
          { className: 'mbp-row' },
          field(
            t('poll.preset'),
            h(
              'select',
              {
                className: 'mbp-input mbp-select mbp-select-preset',
                value: activeProfile,
                onChange: (event) => choosePreset(event.target.value),
              },
              h('option', { value: '' }, t('poll.presetNone')),
              profiles.map((entry) => h('option', { key: entry.name, value: entry.name }, entry.name)),
            ),
          ),
          field(
            t('poll.presetName'),
            h('input', {
              className: 'mbp-input mbp-input-name',
              value: presetName,
              placeholder: `${conn.host.trim()}:${conn.port.trim()} / ${conn.unitId.trim()}`,
              spellCheck: false,
              onChange: (event) => setPresetName(event.target.value),
            }),
          ),
          field(
            ' ',
            h(
              'div',
              { className: 'mbp-actions', style: { marginLeft: 0 } },
              h('button', { type: 'button', className: 'mbp-btn mbp-btn-ghost mbp-btn-sm', onClick: savePreset }, t('poll.presetSave')),
              h(
                'button',
                {
                  type: 'button',
                  className: 'mbp-btn mbp-btn-ghost mbp-btn-sm',
                  onClick: deletePreset,
                  disabled: activeProfile === '',
                },
                t('poll.presetDelete'),
              ),
            ),
          ),
        )

        const connectionRow = h(
          'div',
          { className: 'mbp-row' },
          field(
            t('poll.host'),
            h('input', {
              className: 'mbp-input mbp-input-host',
              value: conn.host,
              disabled: connected || busy,
              spellCheck: false,
              onChange: (event) => setConn((current) => ({ ...current, host: event.target.value })),
            }),
          ),
          field(
            t('poll.port'),
            h('input', {
              className: 'mbp-input mbp-input-num',
              value: conn.port,
              disabled: connected || busy,
              inputMode: 'numeric',
              onChange: (event) => setConn((current) => ({ ...current, port: event.target.value })),
            }),
          ),
          field(
            t('poll.unit'),
            h('input', {
              className: 'mbp-input mbp-input-num',
              value: conn.unitId,
              disabled: busy,
              inputMode: 'numeric',
              onChange: (event) => setConn((current) => ({ ...current, unitId: event.target.value })),
            }),
          ),
          h(
            'div',
            { className: 'mbp-actions' },
            connected
              ? h('button', { type: 'button', className: 'mbp-btn mbp-btn-ghost', onClick: disconnect }, t('poll.disconnect'))
              : h('button', { type: 'button', className: 'mbp-btn', onClick: connect, disabled: busy }, busy ? t('poll.connecting') : t('poll.connect')),
          ),
        )

        const viewFields = [
          field(
            t('poll.table'),
            h(
              'select',
              {
                className: 'mbp-input mbp-select',
                value: view.kind,
                onChange: (event) => setViewField('kind', event.target.value),
              },
              KIND_OPTIONS.map((kind) => h('option', { key: kind, value: kind }, t('poll.' + kind))),
            ),
          ),
          field(
            t('poll.startAddress'),
            h('input', {
              className: 'mbp-input mbp-input-num',
              value: view.start,
              inputMode: 'numeric',
              onChange: (event) => setViewField('start', event.target.value),
            }),
          ),
          field(
            t('poll.count'),
            h('input', {
              className: 'mbp-input mbp-input-num',
              value: view.count,
              inputMode: 'numeric',
              onChange: (event) => setViewField('count', event.target.value),
            }),
          ),
          field(
            t('poll.interval'),
            h('input', {
              className: 'mbp-input mbp-input-num',
              value: view.interval,
              inputMode: 'numeric',
              onChange: (event) => setViewField('interval', event.target.value),
            }),
          ),
        ]

        if (registerView) {
          viewFields.push(
            field(
              t('poll.type'),
              h(
                'select',
                {
                  className: 'mbp-input mbp-select-type',
                  value: view.type,
                  onChange: (event) => setViewField('type', event.target.value),
                },
                TYPE_OPTIONS.map((type) => h('option', { key: type, value: type }, type)),
              ),
            ),
            field(
              t('poll.wordOrder'),
              h(
                'select',
                {
                  className: 'mbp-input mbp-select-order',
                  value: view.wordOrder,
                  disabled: width === 1,
                  onChange: (event) => setViewField('wordOrder', event.target.value),
                },
                WORD_ORDER_OPTIONS.map((order) => h('option', { key: order, value: order }, order)),
              ),
            ),
            field(
              t('poll.scale'),
              h('input', {
                className: 'mbp-input mbp-input-num',
                value: view.scale,
                inputMode: 'decimal',
                onChange: (event) => setViewField('scale', event.target.value),
              }),
            ),
            field(
              t('poll.offset'),
              h('input', {
                className: 'mbp-input mbp-input-num',
                value: view.offset,
                inputMode: 'decimal',
                onChange: (event) => setViewField('offset', event.target.value),
              }),
            ),
          )
        }

        viewFields.push(
          h(
            'div',
            { className: 'mbp-actions' },
            h(
              'button',
              { type: 'button', className: 'mbp-btn mbp-btn-ghost', onClick: () => readNow(), disabled: !connected },
              t('poll.read'),
            ),
            polling
              ? h('button', { type: 'button', className: 'mbp-btn mbp-btn-stop', onClick: () => setPolling(false) }, t('poll.stopPolling'))
              : h(
                  'button',
                  {
                    type: 'button',
                    className: 'mbp-btn',
                    disabled: !connected,
                    onClick: () => {
                      setPolling(true)
                      readNow()
                    },
                  },
                  t('poll.startPolling'),
                ),
          ),
        )

        const pollRow = h('div', { className: 'mbp-row' }, ...viewFields)

        const header = h(
          'header',
          { className: 'mbp-head' },
          h(
            'div',
            null,
            h('h1', { className: 'mbp-title' }, t('poll.title')),
            h('p', { className: 'mbp-subtitle' }, t('poll.subtitle')),
          ),
          h(
            'div',
            { className: 'mbp-pills' },
            polling ? h('span', { className: 'mbp-pill is-busy' }, h('span', { className: 'mbp-dot' }), t('poll.polling')) : null,
            h(
              'span',
              { className: 'mbp-pill ' + (connected ? 'is-on' : '') },
              h('span', { className: 'mbp-dot' }),
              connected
                ? t('poll.connected') + ' · ' + conn.host + ':' + conn.port + ' / ' + conn.unitId
                : t('poll.disconnected'),
            ),
          ),
        )

        const tableBar = h(
          'div',
          { className: 'mbp-tablebar' },
          h(
            'span',
            { className: 'mbp-hint' },
            stamp ? t('poll.updated') + ' ' + stamp.at.toLocaleTimeString() + ' · ' + String(stamp.latency) + ' ' + t('poll.latency') : '',
          ),
          h(
            'span',
            { className: 'mbp-tablebar-right' },
            h(
              'label',
              { className: 'mbp-guard', title: t('poll.readOnlyLock') },
              h('input', {
                type: 'checkbox',
                checked: readOnly,
                onChange: (event) => toggleGuard(event.target.checked),
              }),
              t('poll.readOnlyLock'),
            ),
            error ? h('span', { className: 'mbp-error' }, error) : notice ? h('span', { className: 'mbp-ok' }, notice) : null,
          ),
        )

        const writeLog =
          writes.length === 0
            ? null
            : h(
                'details',
                { className: 'mbp-log' },
                h('summary', null, t('poll.writeLog') + ' (' + writes.length + ')'),
                h(
                  'ul',
                  null,
                  writes.slice(0, 10).map((entry, index) =>
                    h(
                      'li',
                      { key: index },
                      h('span', { className: 'mbp-dim' }, new Date(entry.at).toLocaleTimeString() + ' · '),
                      h(
                        'span',
                        { className: 'mbp-dim' },
                        (entry.source === 'tool' ? t('poll.writeLogTool') : t('poll.writeLogPanel')) + ' · ',
                      ),
                      h(
                        'span',
                        { className: 'mbp-mono' },
                        t('poll.address') +
                          ' ' +
                          entry.address +
                          ' = ' +
                          (Array.isArray(entry.values) && entry.values.length > 0
                            ? entry.values.join(', ')
                            : String(entry.value)),
                      ),
                    ),
                  ),
                ),
              )

        const writable = connected && view.kind === 'holding' && !readOnly
        const bitCells = (row) => {
          const cells = []
          const word = (row.raw || [])[0] || 0
          for (let bit = 15; bit >= 0; bit -= 1) {
            const on = (word >> bit) & 1
            cells.push(
              h('button', {
                key: bit,
                type: 'button',
                className: 'mbp-bit' + (on ? ' is-on' : ''),
                title: 'bit ' + bit,
                'aria-label': 'bit ' + bit,
                disabled: !writable,
                onClick: () => toggleBit(row, bit),
              }),
            )
          }
          return cells
        }

        const registerHead = h(
          'thead',
          null,
          h(
            'tr',
            null,
            h('th', null, t('poll.address')),
            h('th', null, t('poll.value')),
            h('th', null, t('poll.hex')),
            h('th', null, t('poll.bits')),
            h('th', null, t('poll.write')),
          ),
        )

        const registerBody = () =>
          h(
            'tbody',
            null,
          visibleRows.map((row) =>
            h(
              'tr',
              { key: row.address, className: changed.includes(row.address) ? 'mbp-changed' : undefined },
              h('td', { className: 'mbp-mono' }, String(row.address)),
              h('td', { className: 'mbp-mono mbp-strong' }, String(row.text)),
              h('td', { className: 'mbp-mono mbp-dim' }, (row.raw || []).map((word) => '0x' + hex4(word)).join(' ')),
              h(
                'td',
                null,
                width === 1 ? h('div', { className: 'mbp-bits' }, bitCells(row)) : h('span', { className: 'mbp-dim' }, '—'),
              ),
              h(
                'td',
                null,
                view.kind === 'holding'
                  ? h(
                      'form',
                      {
                        className: 'mbp-write',
                        onSubmit: (event) => {
                          event.preventDefault()
                          writeRow(row.address)
                        },
                      },
                      h('input', {
                        className: 'mbp-input mbp-input-write',
                        value: drafts[row.address] ?? '',
                        placeholder: String(row.text),
                        disabled: !writable,
                        inputMode: view.type === 'f32' ? 'decimal' : 'numeric',
                        'aria-label': t('poll.write') + ' ' + row.address,
                        onChange: (event) => {
                          const value = event.target.value
                          setDrafts((current) => ({ ...current, [row.address]: value }))
                        },
                      }),
                      h('button', { type: 'submit', className: 'mbp-btn mbp-btn-ghost mbp-btn-sm', disabled: !writable }, t('poll.write')),
                    )
                  : h('span', { className: 'mbp-dim' }, t('poll.readOnly')),
              ),
            ),
          ),
        )

        const coilHead = h(
          'thead',
          null,
          h('tr', null, h('th', null, t('poll.address')), h('th', null, t('poll.value')), h('th', null, t('poll.toggle'))),
        )

        const coilBody = () =>
          h(
            'tbody',
            null,
            visibleRows.map((row) =>
            h(
              'tr',
              { key: row.address, className: changed.includes(row.address) ? 'mbp-changed' : undefined },
              h('td', { className: 'mbp-mono' }, String(row.address)),
              h(
                'td',
                null,
                h(
                  'span',
                  { className: 'mbp-coil ' + (row.on ? 'mbp-strong' : 'mbp-dim') },
                  h('span', {
                    className: 'mbp-bit' + (row.on ? ' is-on' : ''),
                    style: { cursor: 'default', display: 'inline-block' },
                  }),
                  row.on ? t('poll.on') : t('poll.off'),
                ),
              ),
              h(
                'td',
                null,
                view.kind === 'coil'
                  ? h(
                      'button',
                      {
                        type: 'button',
                        className: 'mbp-btn mbp-btn-ghost mbp-btn-sm',
                        disabled: !connected || readOnly,
                        onClick: () => toggleCoil(row),
                      },
                      t('poll.toggle'),
                    )
                  : h('span', { className: 'mbp-dim' }, t('poll.readOnly')),
              ),
            ),
          ),
        )

        return h(
          'div',
          { className: 'mbp' },
          h('style', { key: 'mbp-style' }, CSS),
          header,
          h(
            'div',
            { className: 'mbp-body' },
            h('section', { className: 'mbp-card' }, presetRow, connectionRow, pollRow),
            h(
              'section',
              { className: 'mbp-card mbp-card-table' },
              tableBar,
              visibleRows.length === 0
                ? h('p', { className: 'mbp-empty' }, t('poll.empty'))
                : h('table', { className: 'mbp-table' }, registerView ? registerHead : coilHead, registerView ? registerBody() : coilBody()),
              writeLog,
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

        const label = () => ctx.locale.bind(NS)('poll.title')
        const Panel = makePanel(ctx)

        ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register({ name: 'sidebar.panellist', id: 'modbus-poll', order: 20, label }, Icon),
        )
        ctx.slots.inject('main', () =>
          ctx.slots.register({ name: 'main', key: 'modbus-poll' }, Panel),
        )
      },
    }
  },
})
