/**
 * Client half of the Smart Building Studio bundle.
 *
 * Registers a full studio panel (sidebar entry + main-panel page) with three
 * tabs: background images, device-state icons, and the generated asset library.
 */
window.__ModuleLoader__.load({
  id: '@local/smart-building-studio',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useState, useEffect, useCallback } = React;

    /* ---------------------------------------------------------------- */
    /* strings                                                           */
    /* ---------------------------------------------------------------- */

    const DICTS = {
      'zh-Hant': {
        'panel.label': '繪圖工作室',
        'app.title': '智慧建築繪圖工作室',
        'app.desc': '使用 OpenRouter 繪圖模型生成背景圖與設備狀態圖標(含 GIF 動畫)。',
        'tab.background': '背景圖',
        'tab.icons': '設備圖標',
        'tab.library': '資產庫',
        'label.prompt': '繪圖提示詞 (Prompt)',
        'label.model': '模型',
        'label.size': '尺寸',
        'label.format': '輸出格式',
        'label.quality': '品質',
        'label.count': '生成數量',
        'label.seed': 'Seed(選填,固定可保持風格一致)',
        'label.gif': '生成 GIF 動畫',
        'label.gifFrames': '幀數',
        'label.gifDuration': '每幀顯示時間 (ms)',
        'size.tier': '解析度等級 + 長寬比',
        'size.pixels': '自訂像素 (依模型支援)',
        'btn.generate': '生成',
        'btn.generating': '生成中…',
        'btn.refresh': '重新整理',
        'icon.devices': '設備類型(可多選)',
        'icon.states': '狀態(可多選)',
        'icon.style': '風格前綴',
        'icon.transparent': '透明背景 PNG',
        'icon.animated': 'GIF 動畫圖標',
        'icon.custom': '自訂設備…',
        'device.hvac': '空調冷氣',
        'device.fan': '送風機',
        'device.light': '照明燈具',
        'device.sensor': '環境感測器',
        'device.camera': '監視攝影機',
        'device.access': '門禁讀卡機',
        'device.elevator': '電梯',
        'device.pump': '水泵',
        'device.generator': '發電機',
        'device.meter': '電表',
        'state.normal': '正常',
        'state.running': '運轉',
        'state.overload': '過載',
        'state.fault': '故障',
        'state.offline': '離線',
        'lib.empty': '尚未生成任何資產。到「背景圖」或「設備圖標」分頁開始創作。',
        'lib.file': '檔案',
        'state.done': '完成',
        'state.failed': '失敗',
        'state.pending': '等待中',
        'error.models': '無法載入模型清單',
        'hint.key': '尚未設定 OpenRouter API key。請在工作區根目錄的 .env 檔加入:OPENROUTER_API_KEY=sk-or-v1-你的key',
        'label.envFile': '設定檔路徑',
        'result.saved': '已儲存',
        'result.cost': '成本',
        'gif.note': 'OpenRouter 目前尚未提供動畫 GIF 輸出,此選項暫不支援;PNG 透明背景亦不適用於 GIF。',
        'icons.note': '批次產生每個「設備 × 狀態」組合一張;固定 Seed 有助於保持整套圖標風格一致。',
      },
      en: {
        'panel.label': 'Drawing Studio',
        'app.title': 'Smart Building Studio',
        'app.desc': 'Generate smart-building backgrounds and device-state icons (including animated GIFs) with OpenRouter image models.',
        'tab.background': 'Backgrounds',
        'tab.icons': 'Device icons',
        'tab.library': 'Library',
        'label.prompt': 'Prompt',
        'label.model': 'Model',
        'label.size': 'Size',
        'label.format': 'Output format',
        'label.quality': 'Quality',
        'label.count': 'Count',
        'label.seed': 'Seed (optional, fixed seed keeps style consistent)',
        'label.gif': 'Generate GIF animation',
        'label.gifFrames': 'Frames',
        'label.gifDuration': 'Frame duration (ms)',
        'size.tier': 'Resolution tier + aspect ratio',
        'size.pixels': 'Custom pixels (provider-dependent)',
        'btn.generate': 'Generate',
        'btn.generating': 'Generating…',
        'btn.refresh': 'Refresh',
        'icon.devices': 'Device types (multi-select)',
        'icon.states': 'States (multi-select)',
        'icon.style': 'Style prefix',
        'icon.transparent': 'Transparent PNG',
        'icon.animated': 'Animated GIF icon',
        'icon.custom': 'Custom device…',
        'device.hvac': 'HVAC unit',
        'device.fan': 'Air fan',
        'device.light': 'Lighting',
        'device.sensor': 'Environment sensor',
        'device.camera': 'Security camera',
        'device.access': 'Access reader',
        'device.elevator': 'Elevator',
        'device.pump': 'Water pump',
        'device.generator': 'Generator',
        'device.meter': 'Power meter',
        'state.normal': 'Normal',
        'state.running': 'Running',
        'state.overload': 'Overload',
        'state.fault': 'Fault',
        'state.offline': 'Offline',
        'lib.empty': 'No assets yet. Start in the Backgrounds or Device icons tab.',
        'lib.file': 'File',
        'state.done': 'Done',
        'state.failed': 'Failed',
        'state.pending': 'Pending',
        'error.models': 'Failed to load model list',
        'hint.key': 'No OpenRouter API key configured. Add OPENROUTER_API_KEY=sk-or-v1-… to the .env file in the workspace root.',
        'label.envFile': 'Config file',
        'result.saved': 'Saved',
        'result.cost': 'Cost',
        'gif.note': 'Animated GIF output is not yet available through OpenRouter, so this option is currently unsupported; transparency does not apply to GIF.',
        'icons.note': 'Batch-generates one image per selected device × state combination; a fixed seed helps keep the icon set consistent.',
      },
    };

    function createTranslate(locale) {
      const id = locale?.getLocale?.()?.id || locale?.getSnapshot?.()?.id || 'zh-Hant';
      const dict = DICTS[id] || DICTS[id.split('-')[0]] || DICTS['zh-Hant'];
      return (key) => dict[key] || DICTS['zh-Hant'][key] || DICTS.en[key] || key;
    }

    /* ---------------------------------------------------------------- */
    /* API helpers                                                       */
    /* ---------------------------------------------------------------- */

    async function apiCall(op, init) {
      const res = await fetch(`/studio/api?op=${encodeURIComponent(op)}`, {
        credentials: 'same-origin',
        ...init,
      });
      const body = await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }));
      if (!body.ok) throw new Error(body.error || `HTTP ${res.status}`);
      return body;
    }

    /* ---------------------------------------------------------------- */
    /* constants                                                         */
    /* ---------------------------------------------------------------- */

    const DEVICES = [
      ['device.hvac', '冷氣空調冷暖機組'],
      ['device.fan', '送風機'],
      ['device.light', '照明燈具'],
      ['device.sensor', '環境感測器'],
      ['device.camera', '監視攝影機'],
      ['device.access', '門禁讀卡機'],
      ['device.elevator', '電梯'],
      ['device.pump', '水泵'],
      ['device.generator', '發電機'],
      ['device.meter', '電表'],
    ];

    const STATES = [
      ['state.normal', 'status indicator: steady green light, idle and healthy'],
      ['state.running', 'status indicator: bright blue active glow, spinning fan or flowing energy, in motion'],
      ['state.overload', 'status indicator: amber warning glow, overloaded with visible heat effect'],
      ['state.fault', 'status indicator: red alarm light flashing, crossed-out fault symbol'],
      ['state.offline', 'greyed out, dimmed, disconnected, no lights'],
    ];

    const DEFAULT_STYLE =
      'flat vector icon, smart-building dashboard style, thick clean strokes, rounded corners, centered composition, no text, no watermark';

    const ASPECTS = ['16:9', '21:9', '16:10', '4:3', '3:2', '1:1', '9:16', 'auto'];
    const RESOLUTIONS = ['512', '768', '1K', '1.5K', '2K', '4K'];
    const QUALITIES = ['auto', 'low', 'medium', 'high'];

    /* ---------------------------------------------------------------- */
    /* styles                                                            */
    /* ---------------------------------------------------------------- */

    const CSS = `
.sbs-root { color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-base);
  min-height: 100%; display: flex; flex-direction: column; gap: 16px; padding: 24px; box-sizing: border-box;
  font-size: 13px; line-height: 1.5; }
.sbs-header h1 { font-size: 18px; font-weight: 600; margin: 0; }
.sbs-header p { margin: 4px 0 0; color: var(--dsw-alias-label-secondary, inherit); opacity: .75; }
.sbs-tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--dsw-alias-border-l1); }
.sbs-tab { appearance: none; background: transparent; border: none; border-bottom: 2px solid transparent;
  padding: 8px 14px; font-size: 13px; color: inherit; cursor: pointer; opacity: .7; }
.sbs-tab.active { border-bottom-color: var(--dsw-alias-brand-primary); opacity: 1; font-weight: 600; }
.sbs-card { background: var(--dsw-alias-bg-layer-1); border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 10px; padding: 16px; display: flex; flex-direction: column; gap: 12px; max-width: 860px; }
.sbs-row { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
.sbs-field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.sbs-field.grow { flex: 1 1 240px; }
.sbs-label { font-size: 12px; opacity: .8; }
.sbs-input, .sbs-select, .sbs-textarea { background: var(--dsw-alias-bg-base); color: inherit;
  border: 1px solid var(--dsw-alias-border-l1); border-radius: 6px; padding: 6px 8px; font-size: 13px;
  font-family: inherit; box-sizing: border-box; width: 100%; }
.sbs-textarea { resize: vertical; min-height: 64px; }
.sbs-number { width: 84px; }
.sbs-button { appearance: none; border: 1px solid var(--dsw-alias-border-l1); border-radius: 6px;
  padding: 7px 16px; font-size: 13px; cursor: pointer; background: var(--dsw-alias-bg-layer-1); color: inherit; }
.sbs-button.primary { background: var(--dsw-alias-brand-primary); border-color: transparent; color: #fff; font-weight: 600; }
.sbs-button:disabled { opacity: .5; cursor: default; }
.sbs-chip { appearance: none; border: 1px solid var(--dsw-alias-border-l1); border-radius: 999px;
  padding: 4px 12px; font-size: 12px; cursor: pointer; background: transparent; color: inherit; }
.sbs-chip.on { background: var(--dsw-alias-brand-primary); border-color: transparent; color: #fff; }
.sbs-note { font-size: 12px; opacity: .7; }
.sbs-banner { border: 1px solid var(--dsw-alias-border-l1); border-left: 3px solid var(--dsw-alias-state-warn, #c7811f);
  border-radius: 8px; padding: 10px 12px; font-size: 12px; max-width: 860px; }
.sbs-banner.error { border-left-color: var(--dsw-alias-state-error-primary, #d24a43); }
.sbs-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; max-width: 980px; }
.sbs-tile { background: var(--dsw-alias-bg-layer-1); border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 10px; padding: 10px; display: flex; flex-direction: column; gap: 6px; }
.sbs-tile img { width: 100%; aspect-ratio: 1 / 1; object-fit: contain; border-radius: 6px;
  background: repeating-conic-gradient(#8881 0 25%, transparent 0 50%) 0 0 / 16px 16px; }
.sbs-tile.wide img { aspect-ratio: auto; }
.sbs-file { font-size: 11px; opacity: .75; word-break: break-all; }
.sbs-status { font-size: 12px; }
.sbs-status.ok { color: var(--dsw-alias-state-success-primary, #3d9a50); }
.sbs-status.err { color: var(--dsw-alias-state-error-primary, #d24a43); }
.sbs-panelicon { width: 20px; height: 20px; display: block; }
`;

    /* ---------------------------------------------------------------- */
    /* shared form pieces                                                */
    /* ---------------------------------------------------------------- */

    function SizeControls(props) {
      const { t, sizeMode, setSizeMode, resolution, setResolution, aspect, setAspect, pxW, setPxW, pxH, setPxH } = props;
      return h('div', { className: 'sbs-row' },
        h('label', { className: 'sbs-field' },
          h('span', { className: 'sbs-label' }, t('label.size')),
          h('select', {
            className: 'sbs-select', value: sizeMode,
            onChange: (e) => setSizeMode(e.target.value),
          },
            h('option', { value: 'tier' }, t('size.tier')),
            h('option', { value: 'pixels' }, t('size.pixels')))),
        sizeMode === 'tier'
          ? h('label', { className: 'sbs-field' },
              h('span', { className: 'sbs-label' }, '解析度 / Resolution'),
              h('select', { className: 'sbs-select', value: resolution, onChange: (e) => setResolution(e.target.value) },
                RESOLUTIONS.map((r) => h('option', { key: r, value: r }, r))),
              h('select', { className: 'sbs-select', value: aspect, onChange: (e) => setAspect(e.target.value) },
                ASPECTS.map((a) => h('option', { key: a, value: a }, a))))
          : h('label', { className: 'sbs-field' },
              h('span', { className: 'sbs-label' }, 'W × H (px)'),
              h('div', { className: 'sbs-row' },
                h('input', { className: 'sbs-input sbs-number', type: 'number', value: pxW, min: 64, onChange: (e) => setPxW(e.target.value) }),
                h('input', { className: 'sbs-input sbs-number', type: 'number', value: pxH, min: 64, onChange: (e) => setPxH(e.target.value) }))));
    }

    function GifControls(props) {
      const { t, gif, setGif, frames, setFrames, duration, setDuration } = props;
      if (!gif) return null;
      return h('div', { className: 'sbs-row' },
        h('label', { className: 'sbs-field' },
          h('span', { className: 'sbs-label' }, t('label.gifFrames')),
          h('input', { className: 'sbs-input sbs-number', type: 'number', min: 2, max: 64, value: frames, onChange: (e) => setFrames(e.target.value) })),
        h('label', { className: 'sbs-field' },
          h('span', { className: 'sbs-label' }, t('label.gifDuration')),
          h('input', { className: 'sbs-input sbs-number', type: 'number', min: 20, max: 2000, step: 20, value: duration, onChange: (e) => setDuration(e.target.value) })));
    }

    function buildSizePayload(sizeMode, resolution, aspect, pxW, pxH) {
      if (sizeMode === 'pixels') {
        const w = Math.round(Number(pxW) || 0);
        const hgt = Math.round(Number(pxH) || 0);
        if (w > 0 && hgt > 0) return { size: `${w}x${hgt}` };
        return {};
      }
      const payload = {};
      if (resolution && resolution !== 'auto') payload.resolution = resolution;
      if (aspect && aspect !== 'auto') payload.aspect_ratio = aspect;
      return payload;
    }

    /* ---------------------------------------------------------------- */
    /* background tab                                                    */
    /* ---------------------------------------------------------------- */

    function BackgroundTab(props) {
      const { t, models, modelsError } = props;
      const [prompt, setPrompt] = useState(
        '智慧建築中控系統儀表板背景:扁平插畫風格的建築剖面圖,帶空調、照明、電梯與感測器線路,深藍色調,大量留白供 UI 疊加');
      const [model, setModel] = useState('');
      const [sizeMode, setSizeMode] = useState('tier');
      const [resolution, setResolution] = useState('2K');
      const [aspect, setAspect] = useState('16:9');
      const [pxW, setPxW] = useState('1920');
      const [pxH, setPxH] = useState('1080');
      const [format, setFormat] = useState('png');
      const [gif, setGif] = useState(false);
      const [frames, setFrames] = useState('6');
      const [duration, setDuration] = useState('120');
      const [quality, setQuality] = useState('auto');
      const [count, setCount] = useState('1');
      const [seed, setSeed] = useState('');
      const [busy, setBusy] = useState(false);
      const [error, setError] = useState('');
      const [results, setResults] = useState(null);

      const generate = useCallback(async () => {
        setBusy(true);
        setError('');
        setResults(null);
        try {
          const payload = {
            kind: 'background',
            prompt,
            ...(model ? { model } : {}),
            ...buildSizePayload(sizeMode, resolution, aspect, pxW, pxH),
            output_format: gif ? 'gif' : format,
            quality,
            n: Math.max(1, Math.min(4, Number(count) || 1)),
          };
          if (gif) {
            payload.frame_count = Math.max(2, Math.min(64, Number(frames) || 6));
            payload.frame_duration_ms = Math.max(20, Math.min(2000, Number(duration) || 120));
          }
          if (seed.trim() !== '' && Number.isFinite(Number(seed))) payload.seed = Number(seed);
          const body = await apiCall('generate', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload),
          });
          setResults(body);
        } catch (err) {
          setError(String(err.message || err));
        } finally {
          setBusy(false);
        }
      }, [prompt, model, sizeMode, resolution, aspect, pxW, pxH, format, gif, frames, duration, quality, count, seed]);

      const selectedModel = model || (models && models[0] && models[0].id) || '';

      return h('div', { className: 'sbs-card' },
        h('label', { className: 'sbs-field grow' },
          h('span', { className: 'sbs-label' }, t('label.prompt')),
          h('textarea', { className: 'sbs-textarea', value: prompt, onChange: (e) => setPrompt(e.target.value) })),
        h('div', { className: 'sbs-row' },
          h('label', { className: 'sbs-field grow' },
            h('span', { className: 'sbs-label' }, t('label.model')),
            modelsError
              ? h('span', { className: 'sbs-note' }, `${t('error.models')}: ${modelsError}`)
              : h('select', { className: 'sbs-select', value: selectedModel, onChange: (e) => setModel(e.target.value) },
                  (models || []).map((m) => h('option', { key: m.id, value: m.id }, m.name || m.id)))),
          h('label', { className: 'sbs-field' },
            h('span', { className: 'sbs-label' }, t('label.format')),
            h('select', { className: 'sbs-select', value: gif ? 'gif' : format, disabled: gif,
              onChange: (e) => setFormat(e.target.value) },
              ['png', 'jpeg', 'webp'].map((f) => h('option', { key: f, value: f }, f.toUpperCase()))))),
        h(SizeControls, { t, sizeMode, setSizeMode, resolution, setResolution, aspect, setAspect, pxW, setPxW, pxH, setPxH }),
        h('div', { className: 'sbs-row' },
          h('label', { className: 'sbs-field' },
            h('span', { className: 'sbs-label' }, t('label.quality')),
            h('select', { className: 'sbs-select', value: quality, onChange: (e) => setQuality(e.target.value) },
              QUALITIES.map((q) => h('option', { key: q, value: q }, q)))),
          h('label', { className: 'sbs-field' },
            h('span', { className: 'sbs-label' }, t('label.count')),
            h('input', { className: 'sbs-input sbs-number', type: 'number', min: 1, max: 4, value: count, onChange: (e) => setCount(e.target.value) })),
          h('label', { className: 'sbs-field grow' },
            h('span', { className: 'sbs-label' }, t('label.seed')),
            h('input', { className: 'sbs-input', value: seed, onChange: (e) => setSeed(e.target.value), placeholder: '12345' }))),
        h('div', { className: 'sbs-row' },
          h('label', { className: 'sbs-field' },
            h('span', { className: 'sbs-label' }, t('label.gif')),
            h('input', { type: 'checkbox', checked: gif, onChange: (e) => setGif(e.target.checked) })),
          h(GifControls, { t, gif, setGif, frames, setFrames, duration, setDuration })),
        gif ? h('div', { className: 'sbs-note' }, t('gif.note')) : null,
        h('div', { className: 'sbs-row' },
          h('button', { className: 'sbs-button primary', disabled: busy || !prompt.trim(), onClick: generate },
            busy ? t('btn.generating') : t('btn.generate'))),
        error ? h('div', { className: 'sbs-banner error' }, error) : null,
        results
          ? h('div', { className: 'sbs-grid' },
              (results.files || []).map((f, i) =>
                h('div', { className: 'sbs-tile wide', key: i },
                  h('img', { src: f.url, alt: f.file }),
                  h('div', { className: 'sbs-file' }, `${t('result.saved')}: ${f.file}`),
                  results.cost != null ? h('div', { className: 'sbs-file' }, `${t('result.cost')}: $${results.cost}`) : null)))
          : null);
    }

    /* ---------------------------------------------------------------- */
    /* icons tab                                                         */
    /* ---------------------------------------------------------------- */

    function IconTab(props) {
      const { t, models, modelsError } = props;
      const [devices, setDevices] = useState(['device.hvac']);
      const [customDevice, setCustomDevice] = useState('');
      const [states, setStates] = useState(['state.normal']);
      const [style, setStyle] = useState(DEFAULT_STYLE);
      const [model, setModel] = useState('');
      const [sizeMode, setSizeMode] = useState('tier');
      const [resolution, setResolution] = useState('512');
      const [aspect, setAspect] = useState('1:1');
      const [pxW, setPxW] = useState('512');
      const [pxH, setPxH] = useState('512');
      const [transparent, setTransparent] = useState(true);
      const [animated, setAnimated] = useState(false);
      const [frames, setFrames] = useState('6');
      const [duration, setDuration] = useState('120');
      const [seed, setSeed] = useState('');
      const [busy, setBusy] = useState(false);
      const [items, setItems] = useState([]);

      const toggle = (list, setList, value) => {
        setList(list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);
      };

      const generateAll = useCallback(async () => {
        const tasks = [];
        for (const deviceKey of devices) {
          for (const [stateKey, stateHint] of STATES) {
            if (!states.includes(stateKey)) continue;
            const deviceText = deviceKey === 'custom'
              ? customDevice.trim()
              : DEVICES.find(([k]) => k === deviceKey)?.[1] || deviceKey;
            if (!deviceText) continue;
            tasks.push({
              id: `${deviceKey}:${stateKey}:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`,
              label: `${t(deviceKey) || deviceText} × ${t(stateKey)}`,
              deviceText, stateKey, stateHint,
            });
          }
        }
        if (tasks.length === 0) return;
        setBusy(true);
        setItems(tasks.map((task) => ({ ...task, status: 'pending' })));
        for (const task of tasks) {
          setItems((prev) => prev.map((x) => (x.id === task.id ? { ...x, status: 'running' } : x)));
          try {
            const prompt = `${style}, ${task.deviceText}, ${task.stateHint}`;
            const payload = {
              kind: 'icon',
              prompt,
              ...(model ? { model } : {}),
              ...buildSizePayload(sizeMode, resolution, aspect, pxW, pxH),
              output_format: animated ? 'gif' : 'png',
              background: animated || !transparent ? 'opaque' : 'transparent',
              filename: `${task.deviceText}-${t(task.stateKey)}`,
            };
            if (animated) {
              payload.frame_count = Math.max(2, Math.min(64, Number(frames) || 6));
              payload.frame_duration_ms = Math.max(20, Math.min(2000, Number(duration) || 120));
            }
            if (seed.trim() !== '' && Number.isFinite(Number(seed))) payload.seed = Number(seed);
            const body = await apiCall('generate', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(payload),
            });
            setItems((prev) => prev.map((x) => (x.id === task.id
              ? { ...x, status: 'done', url: body.url, file: body.files?.[0]?.file }
              : x)));
          } catch (err) {
            setItems((prev) => prev.map((x) => (x.id === task.id
              ? { ...x, status: 'error', error: String(err.message || err) }
              : x)));
          }
        }
        setBusy(false);
      }, [devices, customDevice, states, style, model, sizeMode, resolution, aspect, pxW, pxH, transparent, animated, frames, duration, seed, t]);

      const selectedModel = model || (models && models[0] && models[0].id) || '';

      return h('div', { className: 'sbs-card' },
        h('div', { className: 'sbs-field' },
          h('span', { className: 'sbs-label' }, t('icon.devices')),
          h('div', { className: 'sbs-row' },
            DEVICES.map(([key]) => h('button', {
              key, className: `sbs-chip${devices.includes(key) ? ' on' : ''}`,
              onClick: () => toggle(devices, setDevices, key),
            }, t(key))),
            h('button', {
              className: `sbs-chip${devices.includes('custom') ? ' on' : ''}`,
              onClick: () => toggle(devices, setDevices, 'custom'),
            }, t('icon.custom'))),
          devices.includes('custom')
            ? h('input', { className: 'sbs-input', value: customDevice, placeholder: '例如:冰水主機 / 排煙風機',
                onChange: (e) => setCustomDevice(e.target.value) })
            : null),
        h('div', { className: 'sbs-field' },
          h('span', { className: 'sbs-label' }, t('icon.states')),
          h('div', { className: 'sbs-row' },
            STATES.map(([key]) => h('button', {
              key, className: `sbs-chip${states.includes(key) ? ' on' : ''}`,
              onClick: () => toggle(states, setStates, key),
            }, t(key))))),
        h('label', { className: 'sbs-field grow' },
          h('span', { className: 'sbs-label' }, t('icon.style')),
          h('textarea', { className: 'sbs-textarea', value: style, onChange: (e) => setStyle(e.target.value) })),
        h('div', { className: 'sbs-row' },
          h('label', { className: 'sbs-field grow' },
            h('span', { className: 'sbs-label' }, t('label.model')),
            modelsError
              ? h('span', { className: 'sbs-note' }, `${t('error.models')}: ${modelsError}`)
              : h('select', { className: 'sbs-select', value: selectedModel, onChange: (e) => setModel(e.target.value) },
                  (models || []).map((m) => h('option', { key: m.id, value: m.id }, m.name || m.id)))),
          h('label', { className: 'sbs-field' },
            h('span', { className: 'sbs-label' }, t('label.seed')),
            h('input', { className: 'sbs-input', value: seed, onChange: (e) => setSeed(e.target.value), placeholder: '12345' }))),
        h(SizeControls, { t, sizeMode, setSizeMode, resolution, setResolution, aspect, setAspect, pxW, setPxW, pxH, setPxH }),
        h('div', { className: 'sbs-row' },
          h('label', { className: 'sbs-field' },
            h('span', { className: 'sbs-label' }, t('icon.transparent')),
            h('input', { type: 'checkbox', checked: transparent, disabled: animated,
              onChange: (e) => setTransparent(e.target.checked) })),
          h('label', { className: 'sbs-field' },
            h('span', { className: 'sbs-label' }, t('icon.animated')),
            h('input', { type: 'checkbox', checked: animated, onChange: (e) => setAnimated(e.target.checked) })),
          h(GifControls, { t, gif: animated, setGif: setAnimated, frames, setFrames, duration, setDuration })),
        h('div', { className: 'sbs-note' }, t('icons.note')),
        animated ? h('div', { className: 'sbs-note' }, t('gif.note')) : null,
        h('div', { className: 'sbs-row' },
          h('button', { className: 'sbs-button primary', disabled: busy || (devices.length === 0 || (devices.includes('custom') && !customDevice.trim())), onClick: generateAll },
            busy ? t('btn.generating') : `${t('btn.generate')} (${devices.length * states.length})`)),
        items.length > 0
          ? h('div', { className: 'sbs-grid' },
              items.map((item) => h('div', { className: 'sbs-tile', key: item.id },
                item.status === 'done' && item.url
                  ? h('img', { src: item.url, alt: item.label })
                  : h('div', { style: { height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: .5 } },
                      item.status === 'running' ? '…' : ''),
                h('div', { className: 'sbs-status' }, item.label),
                item.status === 'done'
                  ? h('div', { className: 'sbs-status ok' }, t('state.done'))
                  : item.status === 'error'
                    ? h('div', { className: 'sbs-status err' }, `${t('state.failed')}: ${item.error || ''}`)
                    : h('div', { className: 'sbs-status' }, item.status === 'running' ? '…' : t('state.pending')),
                item.file ? h('div', { className: 'sbs-file' }, item.file) : null)))
          : null);
    }

    /* ---------------------------------------------------------------- */
    /* library tab                                                       */
    /* ---------------------------------------------------------------- */

    function LibraryTab(props) {
      const { t } = props;
      const [entries, setEntries] = useState([]);
      const [busy, setBusy] = useState(false);
      const [error, setError] = useState('');

      const refresh = useCallback(async () => {
        setBusy(true);
        setError('');
        try {
          const body = await apiCall('list');
          setEntries(body.entries || []);
        } catch (err) {
          setError(String(err.message || err));
        } finally {
          setBusy(false);
        }
      }, []);

      useEffect(() => { refresh(); }, [refresh]);

      return h('div', { className: 'sbs-card' },
        h('div', { className: 'sbs-row' },
          h('button', { className: 'sbs-button', disabled: busy, onClick: refresh }, t('btn.refresh'))),
        error ? h('div', { className: 'sbs-banner error' }, error) : null,
        entries.length === 0 && !busy && !error
          ? h('div', { className: 'sbs-note' }, t('lib.empty'))
          : h('div', { className: 'sbs-grid' },
              entries.map((entry) => h('div', { className: 'sbs-tile', key: entry.file },
                h('img', { src: `/studio/api?op=asset&file=${encodeURIComponent(entry.file)}`, alt: entry.file }),
                h('div', { className: 'sbs-file' }, entry.file),
                h('div', { className: 'sbs-file' }, `${(entry.size / 1024).toFixed(1)} KB`)))));
    }

    /* ---------------------------------------------------------------- */
    /* panel page                                                        */
    /* ---------------------------------------------------------------- */

    function StudioPage() {
      const [tab, setTab] = useState('background');
      const [models, setModels] = useState(null);
      const [modelsError, setModelsError] = useState('');
      const [keyStatus, setKeyStatus] = useState(null);
      const t = createTranslate(globalThis.__SBS_LOCALE__);

      useEffect(() => {
        let alive = true;
        apiCall('status')
          .then((body) => { if (alive) setKeyStatus(body); })
          .catch(() => { if (alive) setKeyStatus(null); });
        apiCall('models')
          .then((body) => { if (alive) setModels(body.models || []); })
          .catch((err) => { if (alive) setModelsError(String(err.message || err)); });
        return () => { alive = false; };
      }, []);

      const showKeyHint = (keyStatus && keyStatus.hasKey === false) || /OPENROUTER_API_KEY/.test(modelsError);

      return h('div', { className: 'sbs-root' },
        h('style', null, CSS),
        h('div', { className: 'sbs-header' },
          h('h1', null, t('app.title')),
          h('p', null, t('app.desc'))),
        showKeyHint
          ? h('div', { className: 'sbs-banner' },
              h('div', null, t('hint.key')),
              keyStatus && keyStatus.envFile
                ? h('div', { className: 'sbs-note' }, `${t('label.envFile')}: ${keyStatus.envFile}`)
                : null)
          : null,
        h('div', { className: 'sbs-tabs' },
          [['background', t('tab.background')], ['icons', t('tab.icons')], ['library', t('tab.library')]].map(([key, label]) =>
            h('button', { key, className: `sbs-tab${tab === key ? ' active' : ''}`, onClick: () => setTab(key) }, label))),
        tab === 'background' ? h(BackgroundTab, { t, models, modelsError }) : null,
        tab === 'icons' ? h(IconTab, { t, models, modelsError }) : null,
        tab === 'library' ? h(LibraryTab, { t }) : null);
    }

    /* ---------------------------------------------------------------- */
    /* sidebar panel icon                                                */
    /* ---------------------------------------------------------------- */

    function PanelIcon() {
      return h('svg', {
        viewBox: '0 0 24 24', className: 'sbs-panelicon', fill: 'none',
        stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round',
      },
        h('path', { d: 'M4 21h16' }),
        h('path', { d: 'M7 21V9l5-4 5 4v12' }),
        h('rect', { x: 10, y: 11, width: 4, height: 3, rx: 0.5 }),
        h('path', { d: 'M10 17.5h4' }),
        h('circle', { cx: 17.5, cy: 6.5, r: 1.5 }));
    }

    /* ---------------------------------------------------------------- */
    /* apply                                                             */
    /* ---------------------------------------------------------------- */

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        try {
          const locale = ctx.locale;
          globalThis.__SBS_LOCALE__ = locale;
          const t = createTranslate(locale);

          ctx.slots.inject('sidebar.panellist', () => ctx.slots.register(
            { name: 'sidebar.panellist', id: 'studio', order: 70, label: () => t('panel.label') },
            PanelIcon));
          ctx.slots.inject('main', () => ctx.slots.register(
            { name: 'main', key: 'studio' },
            StudioPage));
        } catch (err) {
          console.error('[smart-building-studio] client apply failed:', err);
          throw err;
        }
      },
    };
  },
});
