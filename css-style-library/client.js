/**
 * CSS Style Library — client half.
 *
 * Registers a sidebar entry (`sidebar.panellist` id `css-style-library`) and the
 * matching central panel (`main` key `css-style-library`).
 *
 * The panel talks to the host over the same JSON route the agent's ops run on
 * (/css-style-library/api), so a button can never do something the agent could
 * not, and vice versa. Previews render inside sandboxed iframes, so user CSS
 * can never touch the host page.
 */
window.__ModuleLoader__.load({
  id: '@local/css-style-library',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const NS = 'cssLibrary'

    const DICTIONARIES = {
      en: {
        'panel.title': 'CSS Style Library',
        'panel.subtitle': 'Browse, preview and copy ready-to-use CSS styles; the agent can maintain the library too.',
        'panel.entries': 'styles',
        'panel.newStyle': 'New style',
        'panel.refresh': 'Refresh',
        'panel.searchPlaceholder': 'Search name, tags, description or css…',
        'panel.allCategories': 'All categories',
        'panel.uncategorized': 'Uncategorized',
        'panel.loading': 'Loading…',
        'panel.empty': 'The library is empty',
        'panel.emptyHint': 'Add your first style, or just ask the agent to add one for you.',
        'panel.noMatch': 'No styles match the current filters.',
        'panel.copyCss': 'Copy CSS',
        'panel.copied': 'Copied!',
        'panel.copyFailed': 'Copy failed — please select the code manually.',
        'panel.detail': 'Details',
        'panel.edit': 'Edit',
        'panel.delete': 'Delete',
        'panel.confirmDelete': 'Confirm delete',
        'panel.cancel': 'Cancel',
        'panel.save': 'Save',
        'panel.saving': 'Saving…',
        'panel.saved': 'Saved.',
        'panel.deleted': 'Style deleted.',
        'panel.createTitle': 'New style',
        'panel.editTitle': 'Edit style',
        'panel.name': 'Name',
        'panel.namePlaceholder': 'e.g. Glass card',
        'panel.category': 'Category',
        'panel.categoryPlaceholder': 'e.g. cards',
        'panel.tags': 'Tags (comma separated)',
        'panel.tagsPlaceholder': 'glass, blur',
        'panel.description': 'Description',
        'panel.descriptionPlaceholder': 'What the effect is good for…',
        'panel.css': 'CSS',
        'panel.cssPlaceholder': '.my-style {\n  color: #333;\n}',
        'panel.previewHtml': 'Preview HTML (optional)',
        'panel.previewHtmlPlaceholder': '<div class="my-style">Sample</div>',
        'panel.livePreview': 'Live preview',
        'panel.autoPreviewNote': 'When empty, the preview body is derived from the css.',
        'panel.light': 'Light',
        'panel.dark': 'Dark',
        'panel.cssBlock': 'CSS source',
        'panel.htmlBlock': 'Preview HTML',
        'panel.preview': 'Style preview',
        'panel.openDetails': 'Open details',
      },
      zh: {
        'panel.title': 'CSS 樣式庫',
        'panel.subtitle': '瀏覽、預覽並複製可直接使用的 CSS 樣式；AI 也能透過工具維護樣式庫。',
        'panel.entries': '筆',
        'panel.newStyle': '新增樣式',
        'panel.refresh': '重新整理',
        'panel.searchPlaceholder': '搜尋名稱、標籤、說明或 CSS…',
        'panel.allCategories': '全部分類',
        'panel.uncategorized': '未分類',
        'panel.loading': '載入中…',
        'panel.empty': '樣式庫是空的',
        'panel.emptyHint': '按「新增樣式」建立第一筆，或直接請 AI 幫你加。',
        'panel.noMatch': '沒有符合條件的樣式。',
        'panel.copyCss': '複製 CSS',
        'panel.copied': '已複製！',
        'panel.copyFailed': '複製失敗，請手動選取程式碼。',
        'panel.detail': '詳情',
        'panel.edit': '編輯',
        'panel.delete': '刪除',
        'panel.confirmDelete': '確認刪除？',
        'panel.cancel': '取消',
        'panel.save': '儲存',
        'panel.saving': '儲存中…',
        'panel.saved': '已儲存。',
        'panel.deleted': '已刪除樣式。',
        'panel.createTitle': '新增樣式',
        'panel.editTitle': '編輯樣式',
        'panel.name': '名稱',
        'panel.namePlaceholder': '例如：玻璃擬態卡片',
        'panel.category': '分類',
        'panel.categoryPlaceholder': '例如：cards',
        'panel.tags': '標籤（逗號分隔）',
        'panel.tagsPlaceholder': '玻璃, 毛玻璃',
        'panel.description': '說明',
        'panel.descriptionPlaceholder': '這個效果適合用在…',
        'panel.css': 'CSS',
        'panel.cssPlaceholder': '.my-style {\n  color: #333;\n}',
        'panel.previewHtml': '示範 HTML（選填）',
        'panel.previewHtmlPlaceholder': '<div class="my-style">範例</div>',
        'panel.livePreview': '即時預覽',
        'panel.autoPreviewNote': '未填寫示範 HTML 時，會從 CSS 自動推導預覽內容。',
        'panel.light': '亮',
        'panel.dark': '暗',
        'panel.cssBlock': 'CSS 原始碼',
        'panel.htmlBlock': '示範 HTML',
        'panel.preview': '樣式預覽',
        'panel.openDetails': '開啟詳情',
      },
    }

    const CSS = `
 .csl { display:flex; flex-direction:column; height:100%; min-height:0; background:var(--dsw-alias-bg-base); color:var(--dsw-alias-label-primary); font-family:inherit; }
 .csl-head { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; padding:20px 24px 14px; border-bottom:1px solid var(--dsw-alias-border-l1); }
 .csl-title { margin:0; font-size:16px; font-weight:600; line-height:1.3; }
 .csl-subtitle { margin:3px 0 0; font-size:12px; color:var(--dsw-alias-label-secondary); }
 .csl-head-actions { display:flex; align-items:center; gap:8px; padding-top:2px; }
 .csl-count { font-size:12px; color:var(--dsw-alias-label-secondary); border:1px solid var(--dsw-alias-border-l1); border-radius:999px; padding:3px 10px; background:var(--dsw-alias-bg-layer-2); white-space:nowrap; }
 .csl-body { flex:1 1 auto; min-height:0; overflow:auto; padding:14px 24px 24px; display:flex; flex-direction:column; gap:12px; }
 .csl-toolbar { display:flex; flex-wrap:wrap; gap:10px; align-items:center; }
 .csl-input { box-sizing:border-box; height:30px; border-radius:7px; border:1px solid var(--dsw-alias-border-l1); background:var(--dsw-alias-bg-layer-1); color:var(--dsw-alias-label-primary); font:inherit; font-size:12px; padding:0 10px; outline:none; }
 .csl-input:focus { border-color:var(--dsw-alias-brand-primary); }
 .csl-search { width:250px; }
 .csl-select { width:180px; }
 .csl-btn { height:30px; padding:0 12px; border-radius:7px; border:1px solid transparent; background:var(--dsw-alias-brand-primary); color:var(--dsw-alias-bg-base); font:inherit; font-size:12px; cursor:pointer; white-space:nowrap; }
 .csl-btn:disabled { opacity:.5; cursor:default; }
 .csl-btn-ghost { background:var(--dsw-alias-bg-layer-2); color:var(--dsw-alias-label-primary); border-color:var(--dsw-alias-border-l1); }
 .csl-btn-danger { background:var(--dsw-alias-bg-layer-2); color:var(--dsw-alias-state-error-primary); border-color:var(--dsw-alias-border-l1); }
 .csl-btn-danger.is-armed { background:var(--dsw-alias-state-error-primary); color:var(--dsw-alias-bg-base); }
 .csl-btn-sm { height:26px; padding:0 9px; font-size:11px; }
 .csl-notice { font-size:12px; color:var(--dsw-alias-state-success-primary); }
 .csl-error { font-size:12px; color:var(--dsw-alias-state-error-primary); }
 .csl-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(250px,1fr)); gap:12px; }
 .csl-card { display:flex; flex-direction:column; background:var(--dsw-alias-bg-layer-1); border:1px solid var(--dsw-alias-border-l1); border-radius:12px; overflow:hidden; cursor:pointer; transition:border-color .15s ease, box-shadow .15s ease; }
 .csl-card:hover { border-color:var(--dsw-alias-brand-primary); box-shadow:0 4px 16px rgba(0,0,0,.12); }
 .csl-card-preview { position:relative; height:132px; background:var(--dsw-alias-bg-layer-2); }
 .csl-card-preview-overlay { position:absolute; inset:0; border:none; background:transparent; cursor:pointer; padding:0; }
 .csl-preview { width:100%; border:0; display:block; background:#fff; }
 .csl-card-body { padding:10px 12px 8px; display:flex; flex-direction:column; gap:6px; }
 .csl-card-title-row { display:flex; align-items:center; gap:8px; min-width:0; }
 .csl-card-name { font-size:13px; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
 .csl-chip { font-size:10px; border:1px solid var(--dsw-alias-border-l1); border-radius:999px; padding:1px 8px; background:var(--dsw-alias-bg-layer-2); color:var(--dsw-alias-label-secondary); white-space:nowrap; flex:none; }
 .csl-tags { display:flex; flex-wrap:wrap; gap:4px; }
 .csl-tag { font-size:10px; color:var(--dsw-alias-label-secondary); }
 .csl-card-desc { font-size:11px; color:var(--dsw-alias-label-secondary); line-height:1.5; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
 .csl-card-actions { display:flex; gap:6px; padding:8px 12px 12px; margin-top:auto; }
 .csl-card-actions .csl-btn { flex:1 1 auto; min-width:0; }
 .csl-empty { margin:auto; text-align:center; color:var(--dsw-alias-label-secondary); padding:48px 0; }
 .csl-empty-title { font-size:14px; font-weight:600; color:var(--dsw-alias-label-primary); margin:0 0 6px; }
 .csl-empty-hint { font-size:12px; margin:0 0 16px; }
 .csl-overlay { position:fixed; inset:0; background:rgba(0,0,0,.45); display:flex; align-items:center; justify-content:center; padding:24px; z-index:1000; }
 .csl-modal { background:var(--dsw-alias-bg-layer-1); border:1px solid var(--dsw-alias-border-l1); border-radius:14px; width:100%; max-height:88vh; overflow:auto; box-shadow:0 20px 60px rgba(0,0,0,.3); }
 .csl-modal-head { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:14px 18px; border-bottom:1px solid var(--dsw-alias-border-l1); position:sticky; top:0; background:var(--dsw-alias-bg-layer-1); z-index:2; }
 .csl-modal-title { margin:0; font-size:14px; font-weight:600; }
 .csl-icon-btn { width:28px; height:28px; border-radius:7px; border:1px solid var(--dsw-alias-border-l1); background:var(--dsw-alias-bg-layer-2); color:var(--dsw-alias-label-primary); font-size:16px; line-height:1; cursor:pointer; }
 .csl-modal-body { padding:16px 18px 18px; display:flex; flex-direction:column; gap:12px; }
 .csl-detail-preview-wrap { border:1px solid var(--dsw-alias-border-l1); border-radius:10px; overflow:hidden; background:var(--dsw-alias-bg-layer-2); }
 .csl-meta-row { display:flex; flex-wrap:wrap; align-items:center; gap:8px; }
 .csl-meta-desc { font-size:12px; color:var(--dsw-alias-label-secondary); line-height:1.6; margin:0; }
 .csl-block-title { font-size:11px; font-weight:600; color:var(--dsw-alias-label-secondary); margin:0 0 6px; display:flex; align-items:center; gap:8px; }
 .csl-code { margin:0; padding:10px 12px; border-radius:8px; background:var(--dsw-alias-bg-layer-2); border:1px solid var(--dsw-alias-border-l1); font-family:ui-monospace,SFMono-Regular,Consolas,monospace; font-size:12px; line-height:1.55; overflow:auto; max-height:280px; white-space:pre; user-select:text; cursor:text; }
 .csl-form { display:grid; grid-template-columns:minmax(0,1fr) 300px; gap:16px; }
 .csl-form-fields { display:flex; flex-direction:column; gap:10px; min-width:0; }
 .csl-field { display:flex; flex-direction:column; gap:4px; min-width:0; }
 .csl-label { font-size:11px; color:var(--dsw-alias-label-secondary); }
 .csl-textarea { box-sizing:border-box; width:100%; border-radius:7px; border:1px solid var(--dsw-alias-border-l1); background:var(--dsw-alias-bg-base); color:var(--dsw-alias-label-primary); font:inherit; font-size:12px; padding:7px 9px; outline:none; resize:vertical; }
 .csl-textarea:focus { border-color:var(--dsw-alias-brand-primary); }
 .csl-textarea-mono { font-family:ui-monospace,SFMono-Regular,Consolas,monospace; }
 .csl-textarea-css { min-height:230px; line-height:1.5; }
 .csl-textarea-html { min-height:72px; line-height:1.5; }
 .csl-editor-preview { display:flex; flex-direction:column; gap:6px; min-width:0; }
 .csl-editor-preview-box { border:1px solid var(--dsw-alias-border-l1); border-radius:10px; overflow:hidden; background:#fff; }
 .csl-hint { font-size:10px; color:var(--dsw-alias-label-secondary); }
 .csl-modal-actions { display:flex; gap:8px; justify-content:flex-end; padding-top:4px; }
 .csl-toggle-group { display:inline-flex; border:1px solid var(--dsw-alias-border-l1); border-radius:7px; overflow:hidden; }
 .csl-toggle-btn { height:24px; padding:0 10px; font-size:11px; border:none; background:var(--dsw-alias-bg-layer-2); color:var(--dsw-alias-label-secondary); cursor:pointer; }
 .csl-toggle-btn.is-on { background:var(--dsw-alias-brand-primary); color:var(--dsw-alias-bg-base); }
`

    function messageOf(error) {
      if (!error) return 'request failed'
      return error.message ? String(error.message) : String(error)
    }

    async function callHost(payload) {
      const url = new URL('css-style-library/api', document.baseURI)
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
      if (!data || data.ok !== true) throw new Error('empty response from the style library host')
      return data
    }

    async function copyText(text) {
      try {
        await navigator.clipboard.writeText(text)
        return true
      } catch {
        return false
      }
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
        h('path', {
          d: 'M9 5c-2.5 0-3 1.5-3 3v2c0 1.5-.8 2.3-2.2 2.5v.9C5.2 13.7 6 14.5 6 16v2c0 1.5.5 3 3 3',
          fill: 'none',
          stroke: color,
          strokeWidth: 1.7,
          strokeLinecap: 'round',
        }),
        h('path', {
          d: 'M15 5c2.5 0 3 1.5 3 3v2c0 1.5.8 2.3 2.2 2.5v.9C18.8 13.7 18 14.5 18 16v2c0 1.5-.5 3-3 3',
          fill: 'none',
          stroke: color,
          strokeWidth: 1.7,
          strokeLinecap: 'round',
        }),
        h('circle', { cx: 12, cy: 12, r: 1.9, fill: color }),
      )
    }

    /** Derive a simple demo body from the class selectors found in the css. */
    function derivePreviewHtml(css) {
      const seen = new Set()
      const classes = []
      const re = /(?:^|[\s{},>~+*(:'\["])\.([A-Za-z_][\w-]*)/g
      let match
      while ((match = re.exec(String(css || ''))) !== null) {
        const name = match[1]
        if (!seen.has(name)) {
          seen.add(name)
          classes.push(name)
        }
        if (classes.length >= 4) break
      }
      let inner = 'Aa 樣式預覽 123'
      if (classes.length === 0) {
        return `<div style="font:500 15px system-ui,sans-serif;color:#334155">${inner}</div>`
      }
      for (const cls of classes.slice(0, 3).reverse()) {
        inner = `<div class="${cls}">${inner}</div>`
      }
      return inner
    }

    /** The preview document: base reset, then the user's css, then the demo body. */
    function srcDocFor(entry, dark) {
      const css = String((entry && entry.css) || '')
      const custom = String((entry && entry.previewHtml) || '').trim()
      const body = custom || derivePreviewHtml(css)
      const bg = dark ? '#0b1220' : '#ffffff'
      const fg = dark ? '#e2e8f0' : '#0f172a'
      return (
        '<!doctype html><html><head><meta charset="utf-8">' +
        '<style>html,body{margin:0;padding:0}body{display:flex;align-items:center;justify-content:center;min-height:100vh;box-sizing:border-box;padding:16px;background:' +
        bg +
        ';color:' +
        fg +
        ';font-family:system-ui,-apple-system,"Segoe UI",sans-serif}</style>' +
        '<style>' +
        css +
        '</style></head><body>' +
        body +
        '</body></html>'
      )
    }

    function Preview({ css, previewHtml, dark, height }) {
      const doc = React.useMemo(() => srcDocFor({ css, previewHtml }, dark), [css, previewHtml, dark])
      return h('iframe', {
        className: 'csl-preview',
        sandbox: '',
        title: 'style preview',
        style: { height },
        srcDoc: doc,
      })
    }

    function Modal({ title, onClose, children, width }) {
      React.useEffect(() => {
        const onKey = (event) => {
          if (event.key === 'Escape') onClose()
        }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
      }, [onClose])
      return h(
        'div',
        {
          className: 'csl-overlay',
          onMouseDown: (event) => {
            if (event.target === event.currentTarget) onClose()
          },
        },
        h(
          'div',
          { className: 'csl-modal', role: 'dialog', 'aria-modal': 'true', style: { maxWidth: width || 720 } },
          h(
            'div',
            { className: 'csl-modal-head' },
            h('h2', { className: 'csl-modal-title' }, title),
            h(
              'button',
              { className: 'csl-icon-btn', onClick: onClose, 'aria-label': 'Close', type: 'button' },
              '×',
            ),
          ),
          h('div', { className: 'csl-modal-body' }, children),
        ),
      )
    }

    function makePanel(ctx) {
      return function CssLibraryPanel() {
        const t = useTranslate(ctx)

        const [entries, setEntries] = React.useState([])
        const [categories, setCategories] = React.useState([])
        const [total, setTotal] = React.useState(0)
        const [loading, setLoading] = React.useState(true)
        const [error, setError] = React.useState('')
        const [notice, setNotice] = React.useState('')
        const [query, setQuery] = React.useState('')
        const [category, setCategory] = React.useState('')
        const [detail, setDetail] = React.useState(null)
        const [detailDark, setDetailDark] = React.useState(false)
        const [editor, setEditor] = React.useState(null)
        const [editorError, setEditorError] = React.useState('')
        const [saving, setSaving] = React.useState(false)
        const [deleteArmed, setDeleteArmed] = React.useState('')
        const [copiedId, setCopiedId] = React.useState('')
        const [previewSource, setPreviewSource] = React.useState(null)
        const [refreshTick, setRefreshTick] = React.useState(0)

        const noticeTimer = React.useRef(0)
        const copiedTimer = React.useRef(0)
        const nameRef = React.useRef(null)

        const flash = React.useCallback((text) => {
          setNotice(text)
          window.clearTimeout(noticeTimer.current)
          noticeTimer.current = window.setTimeout(() => setNotice(''), 3000)
        }, [])

        React.useEffect(
          () => () => {
            window.clearTimeout(noticeTimer.current)
            window.clearTimeout(copiedTimer.current)
          },
          [],
        )

        const loadEntries = React.useCallback(async (q, cat) => {
          try {
            // includeCss is what feeds every card's live preview; without it
            // the rows only carry cssLength and the previews render empty.
            const data = await callHost({ op: 'list', query: q, category: cat, limit: 500, includeCss: true })
            setEntries(data.styles || [])
            setCategories(data.categories || [])
            setTotal(data.total || 0)
            setError('')
          } catch (failure) {
            setError(messageOf(failure))
          } finally {
            setLoading(false)
          }
        }, [])

        // Debounced reload on query/category changes and after every mutation.
        React.useEffect(() => {
          const timer = window.setTimeout(() => {
            loadEntries(query.trim(), category)
          }, query ? 250 : 0)
          return () => window.clearTimeout(timer)
        }, [query, category, refreshTick, loadEntries])

        // The agent can edit the library at any time; catch up on window focus.
        React.useEffect(() => {
          const onFocus = () => loadEntries(query.trim(), category)
          window.addEventListener('focus', onFocus)
          return () => window.removeEventListener('focus', onFocus)
        }, [loadEntries, query, category])

        const openCreate = React.useCallback(() => {
          setEditorError('')
          setEditor({
            mode: 'create',
            draft: { name: '', category: '', tags: '', description: '', css: '', previewHtml: '' },
          })
        }, [])

        const openEdit = React.useCallback((entry) => {
          setEditorError('')
          setEditor({
            mode: 'edit',
            id: entry.id,
            draft: {
              name: entry.name,
              category: entry.category,
              tags: entry.tags.join(', '),
              description: entry.description,
              css: entry.css,
              previewHtml: entry.previewHtml,
            },
          })
        }, [])

        const closeEditor = React.useCallback(() => setEditor(null), [])

        // Live preview inside the editor, debounced so typing stays smooth.
        React.useEffect(() => {
          if (!editor) {
            setPreviewSource(null)
            return undefined
          }
          const timer = window.setTimeout(() => {
            setPreviewSource({ css: editor.draft.css, previewHtml: editor.draft.previewHtml })
          }, 300)
          return () => window.clearTimeout(timer)
        }, [editor])

        React.useEffect(() => {
          if (editor && editor.mode === 'create' && nameRef.current) nameRef.current.focus()
        }, [editor])

        const saveEditor = React.useCallback(async () => {
          if (!editor || saving) return
          const draft = editor.draft
          if (!draft.name.trim()) {
            setEditorError(t('panel.name') + ' is required')
            return
          }
          if (!draft.css.trim()) {
            setEditorError('CSS is required')
            return
          }
          setSaving(true)
          setEditorError('')
          const payload = {
            name: draft.name,
            category: draft.category,
            tags: draft.tags,
            description: draft.description,
            css: draft.css,
            previewHtml: draft.previewHtml,
          }
          try {
            if (editor.mode === 'create') {
              await callHost({ op: 'create', ...payload })
            } else {
              await callHost({ op: 'update', id: editor.id, ...payload })
            }
            setEditor(null)
            flash(t('panel.saved'))
            setRefreshTick((value) => value + 1)
          } catch (failure) {
            setEditorError(messageOf(failure))
          } finally {
            setSaving(false)
          }
        }, [editor, saving, flash, t])

        const removeEntry = React.useCallback(
          async (entry) => {
            if (deleteArmed !== entry.id) {
              setDeleteArmed(entry.id)
              return
            }
            setDeleteArmed('')
            try {
              await callHost({ op: 'delete', id: entry.id })
              setDetail(null)
              flash(t('panel.deleted'))
              setRefreshTick((value) => value + 1)
            } catch (failure) {
              setError(messageOf(failure))
            }
          },
          [deleteArmed, flash, t],
        )

        const copyCss = React.useCallback(
          async (entry) => {
            const ok = await copyText(entry.css)
            if (ok) {
              setCopiedId(entry.id)
              window.clearTimeout(copiedTimer.current)
              copiedTimer.current = window.setTimeout(() => setCopiedId(''), 1800)
            } else {
              flash(t('panel.copyFailed'))
            }
          },
          [flash, t],
        )

        const filtered = entries

        return h(
          'div',
          { className: 'csl' },
          h('style', { key: 'csl-style' }, CSS),
          // ---------------------------------------------------------- head
          h(
              'div',
              { className: 'csl-head' },
              h(
                'div',
                null,
                h('h1', { className: 'csl-title' }, t('panel.title')),
                h('p', { className: 'csl-subtitle' }, t('panel.subtitle')),
              ),
              h(
                'div',
                { className: 'csl-head-actions' },
                h('span', { className: 'csl-count' }, `${total} ${t('panel.entries')}`),
                h('button', { className: 'csl-btn csl-btn-ghost', type: 'button', onClick: () => setRefreshTick((value) => value + 1) }, t('panel.refresh')),
                h('button', { className: 'csl-btn', type: 'button', onClick: openCreate }, t('panel.newStyle')),
              ),
            ),
            h(
              'div',
              { className: 'csl-body' },
              // ------------------------------------------------------- toolbar
              h(
                'div',
                { className: 'csl-toolbar' },
                h('input', {
                  className: 'csl-input csl-search',
                  type: 'search',
                  placeholder: t('panel.searchPlaceholder'),
                  value: query,
                  onChange: (event) => setQuery(event.target.value),
                }),
                h(
                  'select',
                  {
                    className: 'csl-input csl-select',
                    value: category,
                    onChange: (event) => setCategory(event.target.value),
                  },
                  h('option', { value: '' }, t('panel.allCategories')),
                  categories.map((entry) =>
                    h('option', { key: entry.value || '(none)', value: entry.value }, `${entry.value || t('panel.uncategorized')} (${entry.count})`),
                  ),
                ),
                notice ? h('span', { className: 'csl-notice' }, notice) : null,
                error ? h('span', { className: 'csl-error' }, error) : null,
              ),
              // ---------------------------------------------------------- grid
              loading && entries.length === 0
                ? h('div', { className: 'csl-empty' }, t('panel.loading'))
                : filtered.length === 0
                  ? h(
                      'div',
                      { className: 'csl-empty' },
                      h('p', { className: 'csl-empty-title' }, total === 0 ? t('panel.empty') : t('panel.noMatch')),
                      total === 0
                        ? h(
                            'div',
                            null,
                            h('p', { className: 'csl-empty-hint' }, t('panel.emptyHint')),
                            h('button', { className: 'csl-btn', type: 'button', onClick: openCreate }, t('panel.newStyle')),
                          )
                        : null,
                    )
                  : h(
                      'div',
                      { className: 'csl-grid' },
                      filtered.map((entry) =>
                        h(
                          'div',
                          {
                            key: entry.id,
                            className: 'csl-card',
                            role: 'button',
                            tabIndex: 0,
                            onClick: () => {
                              setDeleteArmed('')
                              setDetail(entry)
                            },
                            onKeyDown: (event) => {
                              if (event.key === 'Enter') setDetail(entry)
                            },
                          },
                          h(
                            'div',
                            { className: 'csl-card-preview' },
                            h(Preview, { css: entry.css, previewHtml: entry.previewHtml, height: 132 }),
                            h('button', {
                              className: 'csl-card-preview-overlay',
                              type: 'button',
                              'aria-label': t('panel.openDetails'),
                              title: t('panel.openDetails'),
                              onClick: (event) => {
                                event.stopPropagation()
                                setDeleteArmed('')
                                setDetail(entry)
                              },
                            }),
                          ),
                          h(
                            'div',
                            { className: 'csl-card-body' },
                            h(
                              'div',
                              { className: 'csl-card-title-row' },
                              h('span', { className: 'csl-card-name', title: entry.name }, entry.name),
                              h('span', { className: 'csl-chip' }, entry.category || t('panel.uncategorized')),
                            ),
                            entry.tags.length > 0
                              ? h(
                                  'div',
                                  { className: 'csl-tags' },
                                  entry.tags.map((tag) => h('span', { key: tag, className: 'csl-tag' }, '#' + tag)),
                                )
                              : null,
                            entry.description ? h('div', { className: 'csl-card-desc', title: entry.description }, entry.description) : null,
                          ),
                          h(
                            'div',
                            { className: 'csl-card-actions' },
                            h(
                              'button',
                              {
                                className: 'csl-btn csl-btn-sm',
                                type: 'button',
                                onClick: (event) => {
                                  event.stopPropagation()
                                  copyCss(entry)
                                },
                              },
                              copiedId === entry.id ? t('panel.copied') : t('panel.copyCss'),
                            ),
                            h(
                              'button',
                              {
                                className: 'csl-btn csl-btn-ghost csl-btn-sm',
                                type: 'button',
                                onClick: (event) => {
                                  event.stopPropagation()
                                  setDeleteArmed('')
                                  openEdit(entry)
                                },
                              },
                              t('panel.edit'),
                            ),
                            h(
                              'button',
                              {
                                className: 'csl-btn csl-btn-danger csl-btn-sm' + (deleteArmed === entry.id ? ' is-armed' : ''),
                                type: 'button',
                                onClick: (event) => {
                                  event.stopPropagation()
                                  removeEntry(entry)
                                },
                              },
                              deleteArmed === entry.id ? t('panel.confirmDelete') : t('panel.delete'),
                            ),
                          ),
                        ),
                      ),
                    ),
            ),
            // -------------------------------------------------- detail modal
            detail
              ? h(
                  Modal,
                  { title: detail.name, onClose: () => setDetail(null), width: 760 },
                  h(
                    'div',
                    { className: 'csl-detail-preview-wrap' },
                    h(Preview, { css: detail.css, previewHtml: detail.previewHtml, dark: detailDark, height: 280 }),
                  ),
                  h(
                    'div',
                    { className: 'csl-meta-row' },
                    h(
                      'div',
                      { className: 'csl-toggle-group' },
                      h(
                        'button',
                        { className: 'csl-toggle-btn' + (detailDark ? '' : ' is-on'), type: 'button', onClick: () => setDetailDark(false) },
                        t('panel.light'),
                      ),
                      h(
                        'button',
                        { className: 'csl-toggle-btn' + (detailDark ? ' is-on' : ''), type: 'button', onClick: () => setDetailDark(true) },
                        t('panel.dark'),
                      ),
                    ),
                    h('span', { className: 'csl-chip' }, detail.category || t('panel.uncategorized')),
                    detail.tags.map((tag) => h('span', { key: tag, className: 'csl-tag' }, '#' + tag)),
                    h(
                      'button',
                      {
                        className: 'csl-btn csl-btn-ghost csl-btn-sm',
                        type: 'button',
                        onClick: () => copyCss(detail),
                        style: { marginLeft: 'auto' },
                      },
                      copiedId === detail.id ? t('panel.copied') : t('panel.copyCss'),
                    ),
                  ),
                  detail.description ? h('p', { className: 'csl-meta-desc' }, detail.description) : null,
                  h(
                    'div',
                    null,
                    h('div', { className: 'csl-block-title' }, t('panel.cssBlock')),
                    h('pre', { className: 'csl-code' }, detail.css),
                  ),
                  detail.previewHtml
                    ? h(
                        'div',
                        null,
                        h('div', { className: 'csl-block-title' }, t('panel.htmlBlock')),
                        h('pre', { className: 'csl-code' }, detail.previewHtml),
                      )
                    : null,
                  h(
                    'div',
                    { className: 'csl-modal-actions' },
                    h(
                      'button',
                      { className: 'csl-btn csl-btn-danger', type: 'button', onClick: () => removeEntry(detail) },
                      deleteArmed === detail.id ? t('panel.confirmDelete') : t('panel.delete'),
                    ),
                    h(
                      'button',
                      {
                        className: 'csl-btn csl-btn-ghost',
                        type: 'button',
                        onClick: () => {
                          const entry = detail
                          setDetail(null)
                          openEdit(entry)
                        },
                      },
                      t('panel.edit'),
                    ),
                    h('button', { className: 'csl-btn', type: 'button', onClick: () => setDetail(null) }, t('panel.cancel')),
                  ),
                )
              : null,
            // -------------------------------------------------- editor modal
            editor
              ? h(
                  Modal,
                  { title: editor.mode === 'create' ? t('panel.createTitle') : t('panel.editTitle'), onClose: closeEditor, width: 880 },
                  h(
                    'div',
                    { className: 'csl-form' },
                    h(
                      'div',
                      { className: 'csl-form-fields' },
                      h(
                        'div',
                        { className: 'csl-field' },
                        h('label', { className: 'csl-label', htmlFor: 'csl-name' }, t('panel.name')),
                        h('input', {
                          id: 'csl-name',
                          ref: nameRef,
                          className: 'csl-input',
                          value: editor.draft.name,
                          placeholder: t('panel.namePlaceholder'),
                          onChange: (event) =>
                            setEditor((current) => ({ ...current, draft: { ...current.draft, name: event.target.value } })),
                        }),
                      ),
                      h(
                        'div',
                        { className: 'csl-field' },
                        h('label', { className: 'csl-label', htmlFor: 'csl-category' }, t('panel.category')),
                        h('input', {
                          id: 'csl-category',
                          className: 'csl-input',
                          value: editor.draft.category,
                          placeholder: t('panel.categoryPlaceholder'),
                          onChange: (event) =>
                            setEditor((current) => ({ ...current, draft: { ...current.draft, category: event.target.value } })),
                        }),
                      ),
                      h(
                        'div',
                        { className: 'csl-field' },
                        h('label', { className: 'csl-label', htmlFor: 'csl-tags' }, t('panel.tags')),
                        h('input', {
                          id: 'csl-tags',
                          className: 'csl-input',
                          value: editor.draft.tags,
                          placeholder: t('panel.tagsPlaceholder'),
                          onChange: (event) =>
                            setEditor((current) => ({ ...current, draft: { ...current.draft, tags: event.target.value } })),
                        }),
                      ),
                      h(
                        'div',
                        { className: 'csl-field' },
                        h('label', { className: 'csl-label', htmlFor: 'csl-desc' }, t('panel.description')),
                        h('textarea', {
                          id: 'csl-desc',
                          className: 'csl-textarea',
                          rows: 2,
                          value: editor.draft.description,
                          placeholder: t('panel.descriptionPlaceholder'),
                          onChange: (event) =>
                            setEditor((current) => ({ ...current, draft: { ...current.draft, description: event.target.value } })),
                        }),
                      ),
                      h(
                        'div',
                        { className: 'csl-field' },
                        h('label', { className: 'csl-label', htmlFor: 'csl-css' }, t('panel.css')),
                        h('textarea', {
                          id: 'csl-css',
                          className: 'csl-textarea csl-textarea-mono csl-textarea-css',
                          spellCheck: false,
                          value: editor.draft.css,
                          placeholder: t('panel.cssPlaceholder'),
                          onChange: (event) =>
                            setEditor((current) => ({ ...current, draft: { ...current.draft, css: event.target.value } })),
                        }),
                      ),
                      h(
                        'div',
                        { className: 'csl-field' },
                        h('label', { className: 'csl-label', htmlFor: 'csl-html' }, t('panel.previewHtml')),
                        h('textarea', {
                          id: 'csl-html',
                          className: 'csl-textarea csl-textarea-mono csl-textarea-html',
                          spellCheck: false,
                          value: editor.draft.previewHtml,
                          placeholder: t('panel.previewHtmlPlaceholder'),
                          onChange: (event) =>
                            setEditor((current) => ({ ...current, draft: { ...current.draft, previewHtml: event.target.value } })),
                        }),
                        h('span', { className: 'csl-hint' }, t('panel.autoPreviewNote')),
                      ),
                    ),
                    h(
                      'div',
                      { className: 'csl-editor-preview' },
                      h('div', { className: 'csl-label' }, t('panel.livePreview')),
                      h(
                        'div',
                        { className: 'csl-editor-preview-box' },
                        previewSource
                          ? h(Preview, { css: previewSource.css, previewHtml: previewSource.previewHtml, height: 240 })
                          : null,
                      ),
                    ),
                  ),
                  editorError ? h('div', { className: 'csl-error' }, editorError) : null,
                  h(
                    'div',
                    { className: 'csl-modal-actions' },
                    h('button', { className: 'csl-btn csl-btn-ghost', type: 'button', onClick: closeEditor }, t('panel.cancel')),
                    h('button', { className: 'csl-btn', type: 'button', onClick: saveEditor, disabled: saving }, saving ? t('panel.saving') : t('panel.save')),
                  ),
                )
              : null,
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
          ctx.slots.register({ name: 'sidebar.panellist', id: 'css-style-library', order: 26, label }, Icon),
        )
        ctx.slots.inject('main', () =>
          ctx.slots.register({ name: 'main', key: 'css-style-library' }, Panel),
        )
      },
    }
  },
})
