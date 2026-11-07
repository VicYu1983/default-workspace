/**
 * CSS Style Library — host half.
 *
 * One implementation, two callers:
 *   - the agent, through one tool (css_styles) with list/get/create/update/delete;
 *   - the panel, over an authenticated same-origin JSON route (/css-style-library/api).
 *
 * Both go through dispatch(op, args), so the panel can never drift from what
 * the agent can do.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { LibraryError, LibraryStore } from './library.js'
import { SEED_STYLES } from './seed.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const DATA_FILE = process.env.DSH_CSS_LIBRARY_DATA || path.join(HERE, 'data', 'styles.json')

const ROUTE_PATH = '/css-style-library/api'
/** A snippet library stays small; the limit only stops runaway bodies. */
const MAX_BODY_BYTES = 512 * 1024

export const inject = ['tools', 'webServer']

export function apply(ctx) {
  const store = new LibraryStore({ file: DATA_FILE, seeds: SEED_STYLES })

  function categoryLabel(category) {
    return category || '未分類'
  }

  // ---------------------------------------------------------------- shared ops

  async function opList(args) {
    const result = await store.list({
      query: args?.query,
      category: args?.category,
      limit: args?.limit,
      includeCss: args?.includeCss === true,
    })
    const lines = result.styles.map(
      (style) =>
        `  ${style.id}  ${style.name} [${categoryLabel(style.category)}]` +
        (style.tags.length > 0 ? ` #${style.tags.join(' #')}` : ''),
    )
    const parts = [`樣式庫共 ${result.total} 筆，顯示前 ${result.shown} 筆`]
    if (args?.query) parts.push(`（符合「${String(args.query)}」）`)
    if (args?.category) parts.push(`（分類 ${categoryLabel(String(args.category))}）`)
    if (result.total > result.shown) parts.push(`；另有 ${result.total - result.shown} 筆未顯示，可加大 limit`)
    if (args?.includeCss !== true) parts.push(`；list 不含 CSS，用 action "get" + id 取完整內容`)
    const categoryLine = result.categories
      .map((entry) => `${entry.value ? entry.value : '未分類'}×${entry.count}`)
      .join('、')
    if (categoryLine) parts.push(`\n分類：${categoryLine}`)
    if (lines.length > 0) parts.push(`\n${lines.join('\n')}`)
    return { ...result, summary: parts.join('') }
  }

  async function opGet(args) {
    const { style } = await store.get(args?.id)
    const lines = [
      `樣式「${style.name}」（id ${style.id}，分類 ${categoryLabel(style.category)}）`,
      style.tags.length > 0 ? `標籤：${style.tags.join('、')}` : '',
      style.description ? `說明：${style.description}` : '',
      style.previewHtml ? '附有示範 HTML（previewHtml）' : '無示範 HTML（面板會自動推導預覽）',
      `--- CSS ---`,
      style.css,
    ].filter(Boolean)
    return { style, summary: lines.join('\n') }
  }

  async function opCreate(args) {
    const { style } = await store.create({
      name: args?.name,
      css: args?.css,
      category: args?.category,
      tags: args?.tags,
      description: args?.description,
      previewHtml: args?.previewHtml,
    })
    return {
      style,
      summary: `已新增樣式「${style.name}」（id ${style.id}，分類 ${categoryLabel(style.category)}）；樣式庫現有 ${store.styles.length} 筆`,
    }
  }

  async function opUpdate(args) {
    const patch = {}
    if (args?.name !== undefined) patch.name = args.name
    if (args?.css !== undefined) patch.css = args.css
    if (args?.category !== undefined) patch.category = args.category
    if (args?.tags !== undefined) patch.tags = args.tags
    if (args?.description !== undefined) patch.description = args.description
    if (args?.previewHtml !== undefined) patch.previewHtml = args.previewHtml
    const { style } = await store.update(args?.id, patch)
    const changed = Object.keys(patch)
    return {
      style,
      summary:
        `已更新樣式「${style.name}」（id ${style.id}）：${changed.length > 0 ? changed.join('、') : '無欄位變更'}` +
        `\nCSS 長度 ${style.css.length} 字元`,
    }
  }

  async function opDelete(args) {
    const result = await store.remove(args?.id)
    return {
      deleted: result.deleted,
      name: result.name,
      summary: `已刪除樣式「${result.name}」（id ${result.deleted}）；樣式庫剩 ${store.styles.length} 筆`,
    }
  }

  const OPS = {
    list: opList,
    get: opGet,
    create: opCreate,
    update: opUpdate,
    delete: opDelete,
  }

  async function dispatch(op, args) {
    const handler = OPS[op]
    if (!handler) {
      throw fail('invalid-op', `unknown operation ${JSON.stringify(op)}; use list, get, create, update or delete`, {
        field: 'op',
      })
    }
    return handler(args)
  }

  function fail(code, message, details) {
    return new LibraryError(message, code, details)
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

  const cssStylesTool = {
    name: 'css_styles',
    description:
      'Browse and manage the CSS style library the user previews in the "CSS 樣式庫" panel: ready-to-copy, self-contained CSS snippets shown with a live preview. ' +
      'Actions: list (compact rows, add includeCss for full css), get (one entry with its full css), create, update, delete. ' +
      'When creating a style, write complete class-based CSS with no external assets, pick a short category (buttons, cards, text, backgrounds, effects, forms or loaders), add tags, and include a small previewHtml snippet whenever the demo markup is not obvious from the css. ' +
      'Update only sends the fields to change; empty strings clear optional fields.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['action'],
      properties: {
        action: {
          type: 'string',
          enum: ['list', 'get', 'create', 'update', 'delete'],
          description: 'list searches the library; get reads one entry; create adds one; update edits one; delete removes one.',
        },
        id: { type: 'string', description: 'Style id. Required for get, update and delete; ids come from list.' },
        query: {
          type: 'string',
          description: 'list only: space-separated words matched against name, category, tags, description and css; every word must appear.',
        },
        category: {
          type: 'string',
          description: 'list filters by exact category (case-insensitive); create/update sets the entry category.',
        },
        limit: { type: 'integer', description: 'list only: maximum rows (default 100, max 500).' },
        includeCss: { type: 'boolean', description: 'list only: also return each css (default false; prefer get for full css).' },
        name: { type: 'string', description: 'create/update: display name, e.g. "玻璃擬態卡片".' },
        css: {
          type: 'string',
          description: 'create/update: the complete CSS snippet; required for create. Build it on class selectors so the user can copy it into any page.',
        },
        tags: {
          type: ['array', 'string'],
          items: { type: 'string' },
          description: 'create/update: tags as an array or a comma-separated string (max 8).',
        },
        description: { type: 'string', description: 'create/update: one- or two-sentence description of the effect.' },
        previewHtml: {
          type: 'string',
          description:
            'create/update: small HTML snippet rendered inside a sandboxed iframe as the live preview body; omit to derive one from the first class in css.',
        },
      },
    },
    output: {
      schema: OUTPUT_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: value.summary ?? '' }],
    },
    async execute(args) {
      const action = String(args?.action ?? '')
      if (!['list', 'get', 'create', 'update', 'delete'].includes(action)) {
        throw fail('invalid-action', `unknown action ${JSON.stringify(action)}; use list, get, create, update or delete`, {
          field: 'action',
        })
      }
      return { action, ...(await dispatch(action, args)) }
    },
  }

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

  cssStylesTool.execute = withCodes(cssStylesTool.execute)
  ctx.effect(() => ctx.tools.register(cssStylesTool))

  // ------------------------------------------------------------------- route

  const HTTP_STATUS = {
    'invalid-parameter': 400,
    'invalid-op': 400,
    'invalid-action': 400,
    'invalid-field': 400,
    'field-required': 400,
    'field-too-long': 400,
    'style-not-found': 404,
    'body-too-large': 413,
    'library-unreadable': 500,
    'library-corrupt': 500,
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
          reject(new LibraryError('request body too large', 'body-too-large'))
          request.destroy()
          return
        }
        chunks.push(chunk)
      })
      request.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'))
        } catch {
          reject(new LibraryError('request body is not valid JSON', 'invalid-json'))
        }
      })
      request.on('error', (error) => {
        reject(new LibraryError(`request failed: ${error.message}`, 'request-error'))
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
      send(response, 200, { ok: true, ...result })
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
    /* the store keeps no timers or sockets; nothing to unwind */
  })
}
