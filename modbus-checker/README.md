# Modbus Site Checker（`@local/dsh-plugin-modbus-checker`）

DSH 的案場檢查外掛（階段 1：Agent 工具＋側邊欄面板＋案場編輯器）。把 ModbusPollChecker 桌面工具的核心領域邏輯移植過來：對話中用四個 Agent 工具檢查整個案場、維護案場清單、與基準比較；側邊欄面板提供一鍵全檢、進度、結果、回歸比較，以及直接在 UI 編輯案場設備清單。

與桌面工具**共用同一份案場 JSON 格式**，可以直接把 `sitesDir` 指向桌面工具的 `data/` 目錄（唯讀），不必轉檔。

## 面板

側邊欄開啟「Modbus 案場檢查」：

- **案場**：下拉選擇（自動列出 sites 目錄內的案場），顯示設備數／檢查流程／功能碼／網段分佈摘要；可展開前 100 台設備清單；附「編輯」與「新增案場」開啟案場編輯器
- **案場編輯器**：表格直接編輯設備列（啟用、名稱、IP、埠、站號、功能碼、位址、數量、預期值、檢查流程、TCP 埠），可新增／刪除設備、建立新案場、刪除案場檔（兩段式確認）；儲存走 Host 同一套正規化驗證，格式錯誤會顯示原因
- **檢查**：填備註與並行數，按「開始檢查」；超過 25 台自動轉背景 job，進度條即時更新，可隨時停止
- **最近結果**：通過率／通過／失敗／逾時晶片、失敗類型統計、異常設備表（含主機端診斷文字）
- **回歸批次**：最近 10 個批次（★ 為基準），可「設為基準」或「比較」；比較視圖列出新增異常（含診斷）、已恢復與通過率變化

選擇的案場記在瀏覽器 `localStorage`（`dsh.modbus-checker/v1`）。

## Agent 工具

### `site_devices` — 案場裡有什麼

| action | 說明 |
| --- | --- |
| `sites` | 列出目錄內所有案場與設備數 |
| `summary` | 單一案場的統計：檢查流程、功能碼、網段分佈、重複 IP |
| `list` | 依名稱或條件列出設備列（profile、function、ipPrefix、enabled、nameContains） |

```json
{ "action": "summary", "site": "板橋艾美", "sitesDir": "C:\\...\\data" }
{ "action": "list", "site": "家泰家悅", "filter": { "ipPrefix": "192.168.7.", "enabled": true }, "limit": 20 }
```

### `site_check` — 跑檢查

依每台設備自己的 `check_profile` 執行：

- `ping`：只測 ICMP
- `ping_tcp`：ICMP + TCP 埠
- `full_stack`：ICMP + TCP + Modbus TCP 讀取（FC01/02/03/04）

```json
{ "action": "run", "site": "福美富居", "concurrency": 8, "note": "週巡檢" }
{ "action": "status", "jobId": "job-20261105-..." }
{ "action": "cancel", "jobId": "job-20261105-..." }
```

- **≤ 25 台**：預設等待完成，直接回傳統計與異常清單
- **> 25 台**：自動改為背景 job（避免工具呼叫逾時），用 `status` 輪詢
- 每次檢查結果存入歷史（`save: false` 可關閉）
- 預期值支援 `100,107`、`0..100`、布林（`1,0,1`）三種形式，與桌面工具相同

### `site_baseline` — 回歸比較

| action | 說明 |
| --- | --- |
| `batches` | 列出案場最近的批次（★ 標記基準） |
| `save` | 把批次設為基準（預設取最新） |
| `show` | 讀取目前基準 |
| `clear` | 清除基準 |
| `compare` | 比較批次與基準：新增異常、已恢復、持續異常、讀值變更、延遲劣化 |

```json
{ "action": "save", "site": "福美富居" }
{ "action": "compare", "site": "福美富居" }
```

比較語意：通過率變化、`PASS → FAIL` 為新增異常、`FAIL → PASS` 為已恢復、兩次都過但讀值不同列為變更；延遲劣化需同時超過相對（×1.5）與絕對（+20 ms）門檻，避免把 3 ms → 6 ms 的雜訊當成回歸。

### `site_edit` — 編輯案場清單

面板「案場編輯器」與 Agent 共用的寫入路徑：讀取、儲存、刪除案場 JSON。儲存前走與載入同一套正規化驗證（只必填 `name` 與 `ip`，其餘欄位有預設值），寫入時不保存推導欄位（`plc_address` 重新計算）。

| action | 說明 |
| --- | --- |
| `read` | 載入一個案場，回傳可編輯的設備列（含所有已正規化欄位） |
| `save` | 寫入案場 JSON；新案場直接建立，覆蓋已存在的檔案需 `overwrite: true` |
| `delete` | 刪除案場檔（檔案不存在視為錯誤，不會靜默成功） |

```json
{ "action": "read", "site": "福美富居" }
{ "action": "save", "site": "新案場", "devices": [ { "name": "閘道器-01", "ip": "192.168.1.10", "expected": "100,107" } ] }
{ "action": "save", "site": "福美富居", "overwrite": true, "devices": [ ... ] }
{ "action": "delete", "site": "舊案場" }
```

## 資料位置

| 內容 | 預設 | 覆寫方式 |
| --- | --- | --- |
| 案場 JSON | 外掛目錄下的 `sites/` | 參數 `sitesDir` 或環境變數 `DSH_MODBUS_CHECKER_SITES` |
| 批次歷史 | 外掛目錄下的 `data/history.json` | 環境變數 `DSH_MODBUS_CHECKER_DATA` |

歷史採 JSON 文件（每案場保留 50 批），寫入走暫存檔＋改名，崩潰不會留下半截檔案。之後若要換到 `ctx.storage`（DSH 內建 SQLite 後端），只需替換 `history.js` 這一層。

## 診斷

檢查結果附帶現場語言的診斷，例如：

- 「但 TCP 可連線，通常是設備或防火牆封鎖 ICMP，不代表設備離線」
- 「TCP 可連線但 Modbus 無回應，請確認 Unit ID、位址與設備的 Modbus 服務」
- 「設備回應 Modbus 例外 2，通常是位址或功能碼不支援」
- 「讀值 100, 107 與預期 999 不符」

ICMP 無法執行時（例如環境禁止 spawn ping）會明確標示「已略過 ICMP 檢查」，**不會**誤報為設備離線。

## 測試

```powershell
node modbus-checker-tests/sites.test.mjs     # 案場 JSON 正規化、篩選、統計
node modbus-checker-tests/compare.test.mjs   # 基準比較語意
node modbus-checker-tests/checker.test.mjs   # 三種檢查流程（真 TCP/Modbus/ping）
node modbus-checker-tests/host.test.mjs      # 工具與 HTTP route 端到端 + schema 驗證
node modbus-checker-tests/client.test.mjs    # 面板模組註冊、雙語字典、slot
node modbus-checker-tests/render.test.mjs    # 以最小 hook runtime 實際渲染面板
node modbus-checker-tests/real-data.check.mjs  # 對真實案場資料做唯讀相容性檢查
```

Modbus 測試借用 `modbus-poll-tests/fake-server.mjs`（FC01–04、可指定只回應特定站號）；ping 失敗路徑以可注入的假 ping 測試，不依賴真實網路行為。

## 檔案

| 檔案 | 作用 |
| --- | --- |
| `index.js` | Host 外掛：`dispatch(op)` 同時服務工具與 `/modbus-checker/api` route |
| `client.js` | Web 面板：側邊欄項目與 `main` 面板（摘要、案場編輯器、檢查、結果、基準） |
| `sites.js` | 案場 JSON 讀取／正規化／篩選／統計（與桌面工具同格式） |
| `checker.js` | 檢查流程、預期值比對、診斷、併發批次 |
| `compare.js` | 基準比較（純函式） |
| `net.js` | Ping（跨語系解析）與 TCP 探測 |
| `modbus.js` | 唯讀 Modbus TCP 客戶端（FC01–04） |
| `history.js` | 批次與基準儲存 |
| `cordis.patch.yml` | Bundle patch，插入 `modbus-checker` 資料列 |

## 階段規劃

- **階段 0（完成）**：host-only，三個工具
- **階段 1（完成）**：精簡面板（案場摘要、一鍵全檢、進度、結果、基準比較；DSH 風格，不用 AntD）
- **階段 1.5（本版 0.3.0）**：案場編輯器（面板表格編輯＋`site_edit` 工具，共用同一套 Host ops）
- 階段 2：CSV 批次新增、趨勢、報告輸出（xlsx/docx）
- 階段 3：與桌面工具並存，共用案場 JSON
