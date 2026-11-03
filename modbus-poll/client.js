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

    const DICTIONARIES = {
      en: {
        'poll.title': 'Modbus Poll',
        'poll.subtitle': 'Read and write Modbus TCP holding registers.',
        'poll.host': 'Host',
        'poll.port': 'Port',
        'poll.unit': 'Unit ID',
        'poll.connect': 'Connect',
        'poll.connecting': 'Connecting…',
        'poll.disconnect': 'Disconnect',
        'poll.connected': 'Connected',
        'poll.disconnected': 'Disconnected',
        'poll.table': 'Register table',
        'poll.holding': 'Holding registers (03)',
        'poll.input': 'Input registers (04)',
        'poll.startAddress': 'Start address',
        'poll.count': 'Count',
        'poll.interval': 'Interval (ms)',
        'poll.read': 'Read',
        'poll.startPolling': 'Start polling',
        'poll.stopPolling': 'Stop polling',
        'poll.polling': 'Polling',
        'poll.address': 'Address',
        'poll.value': 'Value',
        'poll.hex': 'Hex',
        'poll.write': 'Write',
        'poll.readOnly': 'read-only',
        'poll.empty': 'No data yet. Connect to a server and press Read.',
        'poll.invalidRange': 'Start address must be 0–65535 and count 1–125.',
        'poll.invalidValue': 'Enter a value between 0 and 65535 (decimal or 0x hex).',
        'poll.writeOk': 'Value written.',
        'poll.updated': 'Updated',
        'poll.latency': 'ms',
      },
      zh: {
        'poll.title': 'Modbus 讀寫台',
        'poll.subtitle': '讀取與修改 Modbus TCP 伺服器的保持暫存器。',
        'poll.host': '位址',
        'poll.port': '埠號',
        'poll.unit': '站號',
        'poll.connect': '連線',
        'poll.connecting': '連線中…',
        'poll.disconnect': '中斷',
        'poll.connected': '已連線',
        'poll.disconnected': '未連線',
        'poll.table': '暫存器表',
        'poll.holding': '保持暫存器 (03)',
        'poll.input': '輸入暫存器 (04)',
        'poll.startAddress': '起始位址',
        'poll.count': '數量',
        'poll.interval': '間隔 (毫秒)',
        'poll.read': '讀取',
        'poll.startPolling': '開始輪詢',
        'poll.stopPolling': '停止輪詢',
        'poll.polling': '輪詢中',
        'poll.address': '位址',
        'poll.value': '數值',
        'poll.hex': '十六進位',
        'poll.write': '寫入',
        'poll.readOnly': '唯讀',
        'poll.empty': '尚無資料。連線後按「讀取」。',
        'poll.invalidRange': '起始位址需為 0–65535，數量需為 1–125。',
        'poll.invalidValue': '請輸入 0–65535 的數值（十進位或 0x 十六進位）。',
        'poll.writeOk': '已寫入。',
        'poll.updated': '更新於',
        'poll.latency': '毫秒',
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
.mbp-select { width:190px; }
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

    function parseCount(text) {
      const raw = String(text == null ? '' : text).trim()
      if (!/^[0-9]+$/.test(raw)) return null
      const value = Number.parseInt(raw, 10)
      return value >= 1 && value <= 125 ? value : null
    }

    function messageOf(error) {
      if (!error) return 'request failed'
      return error.message ? String(error.message) : String(error)
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
        const [conn, setConn] = React.useState({ host: '127.0.0.1', port: '502', unitId: '1' })
        const [view, setView] = React.useState({ kind: 'holding', start: '0', count: '16', interval: '1000' })
        const [connected, setConnected] = React.useState(false)
        const [polling, setPolling] = React.useState(false)
        const [busy, setBusy] = React.useState(false)
        const [rows, setRows] = React.useState([])
        const [stamp, setStamp] = React.useState(null)
        const [error, setError] = React.useState('')
        const [drafts, setDrafts] = React.useState({})
        const [notice, setNotice] = React.useState('')
        const noticeTimer = React.useRef(0)
        const failures = React.useRef(0)

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

        const readNow = React.useCallback(async () => {
          const start = parseU16(view.start)
          const count = parseCount(view.count)
          if (start === null || count === null) {
            setError(t('poll.invalidRange'))
            return
          }
          try {
            const data = await callHost({ op: 'read', kind: view.kind, start, count })
            const values = Array.isArray(data.values) ? data.values : []
            setRows(values.map((value, index) => ({ address: start + index, value })))
            setStamp({ at: new Date(), latency: data.latencyMs })
            setError('')
            failures.current = 0
          } catch (failure) {
            setError(messageOf(failure))
            failures.current += 1
            if (failures.current >= 3) setPolling(false)
          }
        }, [view, t])

        const readRef = React.useRef(readNow)
        React.useEffect(() => {
          readRef.current = readNow
        }, [readNow])

        React.useEffect(() => {
          if (!polling || !connected) return undefined
          const parsed = Number.parseInt(view.interval, 10)
          const interval = Math.min(60000, Math.max(200, Number.isFinite(parsed) ? parsed : 1000))
          const id = window.setInterval(() => {
            readRef.current()
          }, interval)
          return () => window.clearInterval(id)
        }, [polling, connected, view.interval])

        React.useEffect(() => {
          let alive = true
          ;(async () => {
            try {
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
          const value = parseU16(drafts[address])
          if (value === null) {
            setError(t('poll.invalidValue'))
            return
          }
          try {
            await callHost({ op: 'write', address, value })
            setDrafts((current) => {
              if (!(address in current)) return current
              const next = { ...current }
              delete next[address]
              return next
            })
            setError('')
            flash(t('poll.writeOk'))
            await readNow()
          } catch (failure) {
            setError(messageOf(failure))
          }
        }

        const field = (label, control) =>
          h('div', { className: 'mbp-field' }, h('span', { className: 'mbp-label' }, label), control)

        const setViewField = (name, value) => setView((current) => ({ ...current, [name]: value }))

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

        const pollRow = h(
          'div',
          { className: 'mbp-row' },
          field(
            t('poll.table'),
            h(
              'select',
              {
                className: 'mbp-input mbp-select',
                value: view.kind,
                onChange: (event) => setViewField('kind', event.target.value),
              },
              h('option', { value: 'holding' }, t('poll.holding')),
              h('option', { value: 'input' }, t('poll.input')),
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
              connected ? t('poll.connected') + ' · ' + conn.host + ':' + conn.port : t('poll.disconnected'),
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
          error ? h('span', { className: 'mbp-error' }, error) : notice ? h('span', { className: 'mbp-ok' }, notice) : null,
        )

        const writable = connected && view.kind === 'holding'

        const head = h(
          'thead',
          null,
          h(
            'tr',
            null,
            h('th', null, t('poll.address')),
            h('th', null, t('poll.value')),
            h('th', null, t('poll.hex')),
            h('th', null, t('poll.write')),
          ),
        )

        const body = h(
          'tbody',
          null,
          rows.map((row) =>
            h(
              'tr',
              { key: row.address },
              h('td', { className: 'mbp-mono' }, String(row.address)),
              h('td', { className: 'mbp-mono mbp-strong' }, String(row.value)),
              h('td', { className: 'mbp-mono mbp-dim' }, '0x' + hex4(row.value)),
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
                        placeholder: String(row.value),
                        disabled: !writable,
                        inputMode: 'numeric',
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

        return h(
          'div',
          { className: 'mbp' },
          h('style', { key: 'mbp-style' }, CSS),
          header,
          h(
            'div',
            { className: 'mbp-body' },
            h('section', { className: 'mbp-card' }, connectionRow, pollRow),
            h(
              'section',
              { className: 'mbp-card mbp-card-table' },
              tableBar,
              rows.length === 0 ? h('p', { className: 'mbp-empty' }, t('poll.empty')) : h('table', { className: 'mbp-table' }, head, body),
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
