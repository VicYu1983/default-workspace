# CSS Style Library（`@local/css-style-library`）

即時預覽的 CSS 樣式收藏盒：在 Web UI 側邊欄開啟「CSS 樣式庫」面板，挑選效果、複製 CSS 原始碼，直接貼進自己的網頁。面板與 AI（Agent 工具）共用同一套操作，兩邊看到的永遠是同一份樣式庫。

## 面板

- **卡片瀏覽**：每筆樣式一張卡，卡片上直接以沙箱 iframe 呈現即時預覽；顯示名稱、分類、標籤與說明
- **搜尋與分類**：搜尋框同時比對名稱／標籤／說明／CSS 內容；分類下拉含每類數量
- **詳情視窗**：大圖預覽（亮／暗背景切換）、CSS 原始碼區塊、示範 HTML，皆可複製
- **一鍵複製**：卡片與詳情視窗都有「複製 CSS」
- **新增／編輯**：表單左側編輯欄位與 CSS，右側即時預覽（輸入 300ms 後更新）；未填示範 HTML 時自動從 CSS 推導預覽
- **刪除**：兩段式確認（先按一次變紅，再按一次才刪）
- 深淺色主題跟隨 Harness 主題 token；樣式預覽隔離在 `sandbox=""` iframe 內，使用者 CSS 不會影響主介面

## Agent 工具

`css_styles` 一個工具、五個 action，與面板共用同一個 `dispatch`：

| action | 說明 |
| --- | --- |
| `list` | 緊湊列（id／名稱／分類／標籤），支援 `query`、`category`、`limit`；`includeCss: true` 可附上 CSS |
| `get` | 讀取單筆完整內容（含 CSS 與 previewHtml） |
| `create` | 新增樣式：`name`、`css` 必填；建議附 `category`、`tags`、`description`、`previewHtml` |
| `update` | 部分更新：只送要改的欄位；空字串代表清空選填欄位 |
| `delete` | 依 id 刪除 |

```json
{ "action": "list", "query": "卡片" }
{ "action": "create", "name": "霓虹按鈕", "category": "buttons", "css": ".neon-btn { ... }", "previewHtml": "<button class=\"neon-btn\">開始</button>" }
{ "action": "update", "id": "st_xxx", "description": "新的說明" }
{ "action": "delete", "id": "st_xxx" }
```

## 資料位置

| 內容 | 預設 | 覆寫方式 |
| --- | --- | --- |
| 樣式庫 | 外掛目錄下的 `data/styles.json` | 環境變數 `DSH_CSS_LIBRARY_DATA` |

首次啟動自動寫入 20 個範例樣式（按鈕、卡片、文字、載入、背景、表單、效果）。寫入走暫存檔＋改名並序列化，崩潰不會留下半截檔案。格式：`{ schema_version: 1, styles: [...] }`。

## 檔案

| 檔案 | 作用 |
| --- | --- |
| `index.js` | Host 外掛：`dispatch(op)` 同時服務 `css_styles` 工具與 `/css-style-library/api` route |
| `library.js` | 儲存與正規化：載入／seed／CRUD／搜尋／分類統計（`LibraryStore`） |
| `seed.js` | 20 個範例樣式（名稱、分類、標籤、說明、CSS、示範 HTML） |
| `client.js` | Web 面板：側邊欄項目與 `main` 面板（瀏覽、預覽、複製、詳情、編輯器） |
| `cordis.patch.yml` | Bundle patch，插入 `css-style-library` 資料列 |
| `locale/*.json` | 英／繁中介面與 Plugin Manager 顯示名稱 |
| `icon.svg` | 外掛圖示（漸層底＋大括號＋黃點，原創） |

## 測試

```powershell
node css-style-library-tests/store.test.mjs        # 儲存層：seed、CRUD、搜尋、錯誤碼
node css-style-library-tests/host.test.mjs         # 工具 + route 端到端（共用 dispatch）
node css-style-library-tests/consistency.test.mjs  # 雙語字典鍵完整性、範例 CSS 健全性
```
