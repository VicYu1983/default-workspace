/**
 * Host half of the Smart Building Studio bundle.
 *
 * Provides:
 *  - HTTP API on /studio/api (generate / models / list / asset) served by the
 *    built-in web server, consumed by the Client panel.
 *  - An agent tool `studio_generate_asset` exposing the same generate operation.
 *
 * The OpenRouter API key is read from the workspace `.env` file
 * (OPENROUTER_API_KEY=sk-or-v1-...) or the process environment.
 */
import fsp from 'node:fs/promises';
import fs from 'node:fs';
import path from 'node:path';

export const inject = ['webServer', 'tools'];

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

// `webServer` routes are plain node:http handlers — the request must be answered
// through `response`, a returned value is ignored and the socket would hang.
const MAX_BODY_BYTES = 1024 * 1024;

function send(response, status, payload) {
  response.statusCode = status;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.setHeader('cache-control', 'no-store');
  response.end(JSON.stringify(payload));
}

function sendImage(response, type, buffer) {
  response.statusCode = 200;
  response.setHeader('content-type', type);
  response.setHeader('cache-control', 'no-store');
  response.end(buffer);
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('request body too large'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        reject(new Error('請求內容必須是合法 JSON'));
      }
    });
    request.on('error', (err) => reject(err));
  });
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function slugify(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function extFromMediaType(mediaType) {
  const mt = String(mediaType || '').toLowerCase();
  if (mt.includes('png')) return 'png';
  if (mt.includes('jpeg')) return 'jpg';
  if (mt.includes('webp')) return 'webp';
  if (mt.includes('svg')) return 'svg';
  if (mt.includes('gif')) return 'gif';
  return 'png';
}

function parseEnvFile(text) {
  const out = {};
  for (const line of String(text || '').split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v;
  }
  return out;
}

function defaultDirectory(ctx) {
  const wd = ctx.get?.('workingDirectory');
  return wd?.defaultDirectory || process.cwd();
}

const NO_KEY_MESSAGE =
  'OPENROUTER_API_KEY 未設定。請在工作區根目錄建立 .env 檔,加入一行:OPENROUTER_API_KEY=sk-or-v1-你的key (或設定同名環境變數後重新啟動)。';

async function getApiKeyInfo(ctx) {
  const fromProcess = process.env.OPENROUTER_API_KEY?.trim();
  if (fromProcess) return { key: fromProcess, source: 'env' };
  try {
    const text = await fsp.readFile(path.join(defaultDirectory(ctx), '.env'), 'utf8');
    const key = parseEnvFile(text).OPENROUTER_API_KEY?.trim();
    if (key) return { key, source: 'dotenv' };
  } catch {
    /* .env absent — fall through */
  }
  return { key: undefined, source: null };
}

async function getApiKey(ctx) {
  const { key } = await getApiKeyInfo(ctx);
  return key;
}

function envFilePath(ctx) {
  return path.join(defaultDirectory(ctx), '.env');
}

function assetsRoot(ctx) {
  return path.join(defaultDirectory(ctx), 'smart-building-assets');
}

/* ------------------------------------------------------------------ */
/* OpenRouter image generation                                         */
/* ------------------------------------------------------------------ */

async function generateImage(apiKey, params) {
  const res = await fetch(`${OPENROUTER_BASE}/images`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = body?.error?.message || body?.error || `HTTP ${res.status}`;
    throw new Error(`OpenRouter 繪圖請求失敗: ${message}`);
  }
  const data = Array.isArray(body?.data) ? body.data : [];
  const images = data
    .filter((item) => item?.b64_json)
    .map((item) => ({
      base64: item.b64_json,
      mediaType: item.media_type || 'image/png',
    }));
  if (images.length === 0) throw new Error('OpenRouter 未回傳圖片資料');
  return { images, usage: body?.usage ?? {} };
}

/**
 * Shared generation pipeline used by both the HTTP route and the agent tool.
 * Returns a JSON-serialisable result.
 */
async function generateFromParams(ctx, body) {
  if (!body || typeof body !== 'object') throw new Error('請求內容必須是 JSON 物件');
  const apiKey = await getApiKey(ctx);
  if (!apiKey) throw new Error(NO_KEY_MESSAGE);

  const params = {};
  params.model = typeof body.model === 'string' && body.model ? body.model : 'openai/gpt-image-1';
  params.prompt = String(body.prompt || '').trim();
  if (!params.prompt) throw new Error('prompt 為必填');

  if (typeof body.size === 'string' && /^\d{2,5}x\d{2,5}$/.test(body.size)) {
    params.size = body.size;
  } else {
    if (body.resolution) params.resolution = String(body.resolution);
    if (body.aspect_ratio) params.aspect_ratio = String(body.aspect_ratio);
  }
  if (body.output_format) params.output_format = String(body.output_format);
  if (body.background) params.background = String(body.background);
  if (params.output_format === 'gif') {
    if (Number.isInteger(body.frame_count)) params.frame_count = clamp(body.frame_count, 2, 64);
    if (Number.isInteger(body.frame_duration_ms)) {
      params.frame_duration_ms = clamp(body.frame_duration_ms, 20, 2000);
    }
  }
  if (Number.isInteger(body.seed)) params.seed = body.seed;
  if (body.quality) params.quality = String(body.quality);
  if (Number.isInteger(body.n)) params.n = clamp(body.n, 1, 10);

  const { images, usage } = await generateImage(apiKey, params);

  const kind = body.kind === 'icon' ? 'icons' : 'backgrounds';
  const slug = slugify(String(body.filename || params.prompt)) || 'asset';
  const dir = path.join(assetsRoot(ctx), kind);
  await fsp.mkdir(dir, { recursive: true });

  const files = [];
  for (const image of images) {
    const name = `${Date.now()}-${files.length > 0 ? files.length : 'a'}-${slug}.${extFromMediaType(image.mediaType)}`;
    await fsp.writeFile(path.join(dir, name), Buffer.from(image.base64, 'base64'));
    const rel = `${kind}/${name}`;
    files.push({
      file: rel,
      url: `/studio/api?op=asset&file=${encodeURIComponent(rel)}`,
      mediaType: image.mediaType,
    });
  }

  return {
    ok: true,
    files,
    url: files[0]?.url,
    model: params.model,
    cost: usage?.cost ?? null,
  };
}

/* ------------------------------------------------------------------ */
/* model list (cached)                                                 */
/* ------------------------------------------------------------------ */

let modelsCache = { at: 0, data: null };

async function listImageModels(ctx) {
  const apiKey = await getApiKey(ctx);
  if (!apiKey) throw new Error(NO_KEY_MESSAGE);
  if (modelsCache.data && Date.now() - modelsCache.at < 5 * 60_000) return modelsCache.data;
  const res = await fetch(`${OPENROUTER_BASE}/images/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body?.error?.message || `OpenRouter 模型清單請求失敗 (HTTP ${res.status})`);
  }
  const raw = body?.data ?? body?.models ?? [];
  const models = raw
    .filter((m) => m && (m.id || m.slug))
    .map((m) => ({
      id: m.id ?? m.slug,
      name: m.name ?? m.display_name ?? m.id ?? m.slug,
    }));
  modelsCache = { at: Date.now(), data: models };
  return models;
}

/* ------------------------------------------------------------------ */
/* asset library                                                       */
/* ------------------------------------------------------------------ */

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg']);

async function listAssets(ctx) {
  const root = assetsRoot(ctx);
  const entries = [];
  let categories = ['backgrounds', 'icons'];
  try {
    const dirents = await fsp.readdir(root, { withFileTypes: true });
    categories = dirents.filter((d) => d.isDirectory()).map((d) => d.name);
  } catch {
    return [];
  }
  for (const category of categories) {
    let names = [];
    try {
      names = await fsp.readdir(path.join(root, category));
    } catch {
      continue;
    }
    for (const name of names) {
      if (!IMAGE_EXT.has(path.extname(name).toLowerCase())) continue;
      const rel = `${category}/${name}`;
      try {
        const stat = await fsp.stat(path.join(root, category, name));
        entries.push({
          file: rel,
          url: `/studio/api?op=asset&file=${encodeURIComponent(rel)}`,
          size: stat.size,
          mtime: stat.mtimeMs,
        });
      } catch {
        /* skip vanished files */
      }
    }
  }
  entries.sort((a, b) => b.mtime - a.mtime);
  return entries;
}

async function readAsset(ctx, rel) {
  const root = path.resolve(assetsRoot(ctx));
  const target = path.resolve(root, String(rel || ''));
  if (target !== root && !target.startsWith(root + path.sep)) {
    return { status: 400, error: '無效的檔案路徑' };
  }
  let buffer;
  try {
    buffer = await fsp.readFile(target);
  } catch {
    return { status: 404, error: '找不到該資產檔案' };
  }
  const types = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
  };
  const type = types[path.extname(target).toLowerCase()] || 'application/octet-stream';
  return { status: 200, type, buffer };
}

/* ------------------------------------------------------------------ */
/* HTTP route                                                          */
/* ------------------------------------------------------------------ */

function createRouteHandler(ctx) {
  return async function handleRequest(request, response) {
    const connection = ctx.get('connection');
    const rejection =
      connection && typeof connection.requestRejection === 'function'
        ? connection.requestRejection(request)
        : undefined;
    if (rejection) {
      send(response, rejection, { ok: false, error: 'request rejected by the browser trust boundary' });
      return;
    }

    let url;
    try {
      url = new URL(request.url ?? '/', 'http://localhost');
    } catch {
      send(response, 400, { ok: false, error: 'invalid url' });
      return;
    }
    if (!url.pathname.startsWith('/studio/api')) {
      send(response, 404, { ok: false, error: 'not found' });
      return;
    }

    const op = url.searchParams.get('op');
    try {
      if (op === 'status') {
        const { key, source } = await getApiKeyInfo(ctx);
        send(response, 200, {
          ok: true,
          hasKey: Boolean(key),
          keySource: source,
          envFile: envFilePath(ctx),
        });
        return;
      }
      if (op === 'models') {
        send(response, 200, { ok: true, models: await listImageModels(ctx) });
        return;
      }
      if (op === 'list') {
        send(response, 200, { ok: true, entries: await listAssets(ctx) });
        return;
      }
      if (op === 'asset') {
        const asset = await readAsset(ctx, url.searchParams.get('file'));
        if (asset.error) {
          send(response, asset.status, { ok: false, error: asset.error });
          return;
        }
        sendImage(response, asset.type, asset.buffer);
        return;
      }
      if (op === 'generate') {
        if (request.method !== 'POST') {
          response.setHeader('allow', 'POST');
          send(response, 405, { ok: false, error: 'POST required' });
          return;
        }
        send(response, 200, await generateFromParams(ctx, await readJsonBody(request)));
        return;
      }
      send(response, 400, { ok: false, error: 'unknown op' });
    } catch (err) {
      send(response, 400, { ok: false, error: String(err?.message || err) });
    }
  };
}

/* ------------------------------------------------------------------ */
/* agent tool                                                          */
/* ------------------------------------------------------------------ */

function createToolDefinition(ctx) {
  return {
    name: 'studio_generate_asset',
    description:
      'Generate a smart-building drawing asset with an OpenRouter image model: a full background image (any size/aspect) or a device-state icon (normal / running / overload / fault / offline states, optionally an animated GIF). The file is saved into the workspace smart-building-assets folder and a preview URL is returned.',
    parameters: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['background', 'icon'], description: 'Asset kind. Default background.' },
        prompt: { type: 'string', description: 'Full image prompt. For icons include the device type and its state.' },
        model: { type: 'string', description: 'OpenRouter image model slug, e.g. openai/gpt-image-1.' },
        output_format: { type: 'string', enum: ['png', 'jpeg', 'webp', 'gif'] },
        background: { type: 'string', enum: ['auto', 'transparent', 'opaque'], description: 'transparent requires png/webp.' },
        resolution: { type: 'string', enum: ['512', '768', '1K', '1.5K', '2K', '4K'] },
        aspect_ratio: { type: 'string', description: 'e.g. 16:9, 1:1, 9:16.' },
        size: { type: 'string', description: 'Explicit WxH pixels, e.g. 1024x1024 (provider-dependent; overrides resolution/aspect).' },
        frame_count: { type: 'integer', description: 'GIF frames 2-64 (animation-capable models only, e.g. gpt-image-2.6).' },
        frame_duration_ms: { type: 'integer', description: 'GIF per-frame time 20-2000 ms.' },
        seed: { type: 'integer', description: 'Deterministic seed when supported.' },
        quality: { type: 'string', enum: ['auto', 'low', 'medium', 'high'] },
        filename: { type: 'string', description: 'Short slug used in the saved file name.' },
      },
      required: ['prompt'],
    },
    async execute(args) {
      try {
        const result = await generateFromParams(ctx, { kind: 'background', ...args });
        const f = result.files?.[0];
        return `Generated ${result.files.length} image(s). Saved to: ${result.files.map((x) => x.file).join(', ')}. Preview: ${f?.url ?? ''}${result.cost != null ? ` (cost $${result.cost})` : ''}`;
      } catch (err) {
        return `Generation failed: ${String(err?.message || err)}`;
      }
    },
  };
}

/* ------------------------------------------------------------------ */
/* apply                                                               */
/* ------------------------------------------------------------------ */

export function apply(ctx) {
  // `ctx.inject` defers each registration until its service is ready, so the
  // plugin stays inert in profiles that lack webServer or tools.
  ctx.inject(['webServer'], (inner) => {
    const webServer = inner.webServer ?? inner.get?.('webServer');
    if (!webServer?.register) return;
    const dispose = webServer.register({ kind: 'exact', path: '/studio/api', handler: createRouteHandler(ctx) });
    inner.effect(() => dispose);
  });

  ctx.inject(['tools'], (inner) => {
    const tools = inner.tools ?? inner.get?.('tools');
    if (!tools?.register) return;
    const dispose = tools.register(createToolDefinition(ctx));
    inner.effect(() => dispose);
  });
}
