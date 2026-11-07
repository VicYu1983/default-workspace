/**
 * CSS Style Library — seed styles.
 *
 * Seeded on the first run so the panel is useful immediately. Every seed is a
 * complete, self-contained, class-based snippet the user can copy as-is; each
 * carries an explicit previewHtml because the live preview renders it inside a
 * sandboxed iframe.
 */
export const SEED_STYLES = [
  {
    name: '漸層主按鈕',
    category: 'buttons',
    tags: ['按鈕', '漸層', 'hover'],
    description: '紫粉漸層底色的主要行動按鈕，hover 時上浮並加深陰影。',
    css: `.btn-gradient-primary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 22px;
  border: none;
  border-radius: 10px;
  cursor: pointer;
  font: 600 15px/1.2 inherit;
  color: #fff;
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #d946ef 100%);
  background-size: 150% 150%;
  box-shadow: 0 4px 14px rgba(99, 102, 241, 0.35);
  transition: transform 0.15s ease, box-shadow 0.2s ease, background-position 0.3s ease;
}
.btn-gradient-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(99, 102, 241, 0.45);
  background-position: 100% 100%;
}
.btn-gradient-primary:active {
  transform: translateY(0);
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.35);
}`,
    previewHtml: '<button class="btn-gradient-primary">立即開始</button>',
  },
  {
    name: '幽靈按鈕',
    category: 'buttons',
    tags: ['按鈕', '外框', 'hover'],
    description: '透明底、細外框的次要按鈕，hover 時填滿淡色底。',
    css: `.btn-ghost {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 9px 20px;
  border: 1.5px solid #94a3b8;
  border-radius: 8px;
  background: transparent;
  color: #334155;
  font: 500 15px/1.2 inherit;
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease, color 0.2s ease;
}
.btn-ghost:hover {
  background: rgba(59, 130, 246, 0.08);
  border-color: #3b82f6;
  color: #1d4ed8;
}`,
    previewHtml: '<button class="btn-ghost">了解更多</button>',
  },
  {
    name: '膠囊發光按鈕',
    category: 'buttons',
    tags: ['按鈕', '膠囊', '發光'],
    description: '全圓角膠囊按鈕，hover 時出現青色外光暈。',
    css: `.btn-pill-glow {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 26px;
  border: none;
  border-radius: 999px;
  background: #0ea5e9;
  color: #fff;
  font: 600 15px/1.2 inherit;
  cursor: pointer;
  transition: box-shadow 0.25s ease, transform 0.15s ease;
}
.btn-pill-glow:hover {
  box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.25), 0 0 24px rgba(14, 165, 233, 0.55);
  transform: translateY(-1px);
}`,
    previewHtml: '<button class="btn-pill-glow">✦ 探索更多</button>',
  },
  {
    name: '玻璃擬態卡片',
    category: 'cards',
    tags: ['卡片', '玻璃', '毛玻璃'],
    description: '半透明磨砂玻璃質感卡片，需要放在有顏色的背景上才明顯。',
    css: `.glass-card {
  max-width: 260px;
  padding: 20px 22px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.16);
  border: 1px solid rgba(255, 255, 255, 0.35);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  box-shadow: 0 8px 32px rgba(31, 38, 135, 0.2);
  color: #fff;
}
.glass-card h3 {
  margin: 0 0 8px;
  font-size: 17px;
}
.glass-card p {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  opacity: 0.9;
}`,
    previewHtml:
      '<div style="background:linear-gradient(135deg,#667eea,#764ba2);padding:26px;border-radius:14px"><div class="glass-card"><h3>玻璃卡片</h3><p>backdrop-filter 模糊背景，適合放在漸層或圖片上。</p></div></div>',
  },
  {
    name: '懸浮陰影卡片',
    category: 'cards',
    tags: ['卡片', '陰影', 'hover'],
    description: 'hover 時上浮並加大陰影的標準內容卡。',
    css: `.elevated-card {
  max-width: 240px;
  padding: 18px 20px;
  border-radius: 12px;
  background: #fff;
  border: 1px solid #e2e8f0;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.elevated-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.16);
}
.elevated-card h3 {
  margin: 0 0 6px;
  font-size: 16px;
  color: #0f172a;
}
.elevated-card p {
  margin: 0;
  font-size: 13px;
  color: #64748b;
  line-height: 1.6;
}`,
    previewHtml: '<div class="elevated-card"><h3>專案名稱</h3><p>滑過這張卡片看看浮起效果。</p></div>',
  },
  {
    name: '漸層邊框卡片',
    category: 'cards',
    tags: ['卡片', '漸層', '邊框'],
    description: '用雙層背景做出的漸層外框卡片，內部底色可自行替換。',
    css: `.gradient-border-card {
  max-width: 240px;
  padding: 18px 20px;
  border-radius: 14px;
  border: 2px solid transparent;
  background:
    linear-gradient(#ffffff, #ffffff) padding-box,
    linear-gradient(135deg, #f97316, #ec4899, #8b5cf6) border-box;
  color: #0f172a;
}
.gradient-border-card h3 {
  margin: 0 0 6px;
  font-size: 16px;
}
.gradient-border-card p {
  margin: 0;
  font-size: 13px;
  color: #64748b;
  line-height: 1.6;
}`,
    previewHtml: '<div class="gradient-border-card"><h3>精選方案</h3><p>邊框是三色漸層，內部保持純白。</p></div>',
  },
  {
    name: '霓虹發光文字',
    category: 'text',
    tags: ['文字', '霓虹', '發光'],
    description: '多層 text-shadow 疊出的霓虹燈管字，適合深色背景。',
    css: `.neon-text {
  font: 800 34px/1.2 inherit;
  letter-spacing: 2px;
  color: #fff;
  text-shadow:
    0 0 6px rgba(255, 255, 255, 0.9),
    0 0 14px #22d3ee,
    0 0 28px #22d3ee,
    0 0 52px #0891b2;
}`,
    previewHtml:
      '<div style="background:#0b1220;padding:26px 34px;border-radius:12px"><span class="neon-text">NEON</span></div>',
  },
  {
    name: '漸層文字',
    category: 'text',
    tags: ['文字', '漸層', '標題'],
    description: 'background-clip 做出的漸層色標題文字。',
    css: `.gradient-text {
  font: 800 32px/1.25 inherit;
  background: linear-gradient(90deg, #f43f5e, #f59e0b, #10b981);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}`,
    previewHtml: '<h2 class="gradient-text" style="margin:0">Gradient Title</h2>',
  },
  {
    name: '動畫底線連結',
    category: 'text',
    tags: ['文字', '連結', '動畫'],
    description: 'hover 時底線從左往右長出來的連結效果。',
    css: `.link-underline {
  position: relative;
  color: #2563eb;
  text-decoration: none;
  font: 500 16px/1.4 inherit;
}
.link-underline::after {
  content: '';
  position: absolute;
  left: 0;
  bottom: -3px;
  width: 100%;
  height: 2px;
  border-radius: 1px;
  background: #2563eb;
  transform: scaleX(0);
  transform-origin: left;
  transition: transform 0.25s ease;
}
.link-underline:hover::after {
  transform: scaleX(1);
}`,
    previewHtml: '<a class="link-underline" href="#" onclick="return false">這是一個連結</a>',
  },
  {
    name: '旋轉載入環',
    category: 'loaders',
    tags: ['載入', 'spinner'],
    description: '純 CSS 的旋轉載入圈，尺寸用 font-size 或自訂調整。',
    css: `.spinner-ring {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 4px solid rgba(59, 130, 246, 0.2);
  border-top-color: #3b82f6;
  animation: spinner-ring-rotate 0.9s linear infinite;
}
@keyframes spinner-ring-rotate {
  to { transform: rotate(360deg); }
}`,
    previewHtml: '<div class="spinner-ring"></div>',
  },
  {
    name: '跳動載入點',
    category: 'loaders',
    tags: ['載入', '點點', '動畫'],
    description: '三顆輪流跳動的小圓點載入動畫。',
    css: `.dots-loading {
  display: inline-flex;
  gap: 7px;
  align-items: center;
}
.dots-loading span {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #6366f1;
  animation: dots-loading-bounce 1.2s ease-in-out infinite;
}
.dots-loading span:nth-child(2) { animation-delay: 0.15s; }
.dots-loading span:nth-child(3) { animation-delay: 0.3s; }
@keyframes dots-loading-bounce {
  0%, 80%, 100% { transform: translateY(0); opacity: 0.5; }
  40% { transform: translateY(-9px); opacity: 1; }
}`,
    previewHtml: '<div class="dots-loading"><span></span><span></span><span></span></div>',
  },
  {
    name: '斜紋進度條',
    category: 'loaders',
    tags: ['進度', '動畫', '條紋'],
    description: '會流動的斜紋進度條，寬度用 inline style 或變數控制。',
    css: `.progress-stripes {
  width: 220px;
  height: 12px;
  border-radius: 999px;
  background: #e2e8f0;
  overflow: hidden;
}
.progress-stripes > i {
  display: block;
  height: 100%;
  width: 68%;
  border-radius: 999px;
  background-image: repeating-linear-gradient(
    -45deg,
    #3b82f6 0 10px,
    #60a5fa 10px 20px
  );
  background-size: 28px 28px;
  animation: progress-stripes-move 0.8s linear infinite;
}
@keyframes progress-stripes-move {
  to { background-position: 28px 0; }
}`,
    previewHtml: '<div class="progress-stripes"><i></i></div>',
  },
  {
    name: '網格藍圖背景',
    category: 'backgrounds',
    tags: ['背景', '網格'],
    description: '工程藍圖風格的細網格背景，可直接鋪在容器上。',
    css: `.bg-grid {
  background-color: #f8fafc;
  background-image:
    linear-gradient(rgba(15, 23, 42, 0.06) 1px, transparent 1px),
    linear-gradient(90deg, rgba(15, 23, 42, 0.06) 1px, transparent 1px);
  background-size: 24px 24px;
}`,
    previewHtml: '<div class="bg-grid" style="width:200px;height:120px;border-radius:10px;border:1px solid #e2e8f0"></div>',
  },
  {
    name: '光暈柔霧背景',
    category: 'backgrounds',
    tags: ['背景', '漸層', '光暈'],
    description: '多層放射漸層疊出的柔和光暈背景。',
    css: `.bg-glow {
  background-color: #0b1220;
  background-image:
    radial-gradient(ellipse 60% 50% at 20% 30%, rgba(99, 102, 241, 0.4), transparent),
    radial-gradient(ellipse 50% 45% at 80% 70%, rgba(236, 72, 153, 0.32), transparent),
    radial-gradient(ellipse 40% 40% at 60% 15%, rgba(34, 211, 238, 0.28), transparent);
}`,
    previewHtml: '<div class="bg-glow" style="width:220px;height:130px;border-radius:10px"></div>',
  },
  {
    name: '斜紋理背景',
    category: 'backgrounds',
    tags: ['背景', '條紋'],
    description: 'repeating-linear-gradient 做的柔和斜紋底紋。',
    css: `.bg-stripes {
  background: repeating-linear-gradient(
    45deg,
    #f1f5f9 0 12px,
    #e2e8f0 12px 24px
  );
}`,
    previewHtml: '<div class="bg-stripes" style="width:200px;height:120px;border-radius:10px;border:1px solid #e2e8f0"></div>',
  },
  {
    name: '擬切換開關',
    category: 'forms',
    tags: ['表單', '開關', 'toggle'],
    description: '純 CSS 的 iOS 風格開關，用 checkbox + label 組成。',
    css: `.toggle-switch {
  position: relative;
  display: inline-block;
  width: 46px;
  height: 26px;
}
.toggle-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}
.toggle-switch .track {
  position: absolute;
  inset: 0;
  border-radius: 999px;
  background: #cbd5e1;
  cursor: pointer;
  transition: background 0.2s ease;
}
.toggle-switch .track::before {
  content: '';
  position: absolute;
  top: 3px;
  left: 3px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  transition: transform 0.2s ease;
}
.toggle-switch input:checked + .track {
  background: #22c55e;
}
.toggle-switch input:checked + .track::before {
  transform: translateX(20px);
}`,
    previewHtml:
      '<label class="toggle-switch"><input type="checkbox" checked><span class="track"></span></label>',
  },
  {
    name: '聚焦光暈輸入框',
    category: 'forms',
    tags: ['表單', '輸入框', 'focus'],
    description: 'focus 時出現品牌色外光暈與邊框的輸入框。',
    css: `.input-focus-glow {
  width: 220px;
  padding: 10px 14px;
  border-radius: 10px;
  border: 1.5px solid #cbd5e1;
  background: #fff;
  color: #0f172a;
  font: 14px/1.4 inherit;
  outline: none;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}
.input-focus-glow::placeholder {
  color: #94a3b8;
}
.input-focus-glow:focus {
  border-color: #6366f1;
  box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.18);
}`,
    previewHtml: '<input class="input-focus-glow" placeholder="點我聚焦試試">',
  },
  {
    name: '懸停縮放圖卡',
    category: 'effects',
    tags: ['圖片', 'hover', '縮放'],
    description: 'hover 時內部媒體緩慢放大的圖片卡，示範以漸層代替圖片。',
    css: `.zoom-media {
  overflow: hidden;
  border-radius: 12px;
  width: 220px;
  box-shadow: 0 2px 10px rgba(15, 23, 42, 0.12);
}
.zoom-media .media {
  height: 120px;
  background: linear-gradient(135deg, #38bdf8, #6366f1);
  transition: transform 0.4s ease;
}
.zoom-media:hover .media {
  transform: scale(1.12);
}
.zoom-media .caption {
  padding: 10px 14px;
  background: #fff;
  font: 500 13px/1.4 inherit;
  color: #334155;
}`,
    previewHtml:
      '<figure class="zoom-media" style="margin:0"><div class="media"></div><figcaption class="caption">懸停看看縮放效果</figcaption></figure>',
  },
  {
    name: 'CSS 工具提示',
    category: 'effects',
    tags: ['tooltip', 'hover'],
    description: '用 data-tip 屬性與 ::after 做的純 CSS 工具提示。',
    css: `.tooltip-tip {
  position: relative;
  display: inline-block;
  padding: 8px 16px;
  border-radius: 8px;
  background: #334155;
  color: #fff;
  font: 500 14px/1 inherit;
  cursor: help;
}
.tooltip-tip::after {
  content: attr(data-tip);
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%) translateY(4px);
  padding: 6px 10px;
  border-radius: 6px;
  background: #0f172a;
  color: #fff;
  font-size: 12px;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.tooltip-tip:hover::after {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}`,
    previewHtml: '<span class="tooltip-tip" data-tip="我是工具提示！">滑過我</span>',
  },
  {
    name: '骨架屏閃爍',
    category: 'effects',
    tags: ['骨架屏', '載入', '動畫'],
    description: '資料載入前的 shimmer 骨架屏佔位效果。',
    css: `.skeleton {
  width: 220px;
  padding: 14px;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  background: #fff;
}
.skeleton i {
  display: block;
  border-radius: 6px;
  background: linear-gradient(90deg, #eef2f7 25%, #e2e8f0 45%, #eef2f7 65%);
  background-size: 200% 100%;
  animation: skeleton-shimmer 1.3s ease-in-out infinite;
}
.skeleton i + i { margin-top: 10px; }
.skeleton i:nth-child(1) { width: 55%; height: 14px; }
.skeleton i:nth-child(2) { width: 100%; height: 10px; }
.skeleton i:nth-child(3) { width: 82%; height: 10px; }
@keyframes skeleton-shimmer {
  to { background-position: -200% 0; }
}`,
    previewHtml: '<div class="skeleton"><i></i><i></i><i></i></div>',
  },
]
