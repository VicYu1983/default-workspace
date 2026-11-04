# Modbus 讀寫台（`@local/dsh-plugin-modbus-poll`）

DSH 的 Modbus TCP 讀寫外掛。側邊欄提供可設定連線與資料型別的面板，Agent 則可透過 `modbus_poll` 工具操作同一個連線。

## 功能

- **資料型別**：`u16`、`i16`、`u32`、`i32`、`f32`（IEEE-754）。
- **32 位字序**：`ABCD`（預設）、`CDAB`、`BADC`、`DCBA`，對應現場常見的四種排列。
- **工程比例**：`scale` / `offset`，例如 `scale=0.1` 時暫存器 `235` 顯示為 `23.5`；寫入時自動反算回 `235`。
- **位元檢視**：每個 16 位元暫存器展開 16 格，點擊即 toggle（先讀、改位元、再寫回），不需手算遮罩。
- **線圈與離散輸入**：`FC01` / `FC02` 讀取，線圈可一鍵切換（`FC05`）。
- **批次寫入**：`FC15` 多筆線圈、`FC16` 多筆暫存器；32 位型別的值會自動以兩筆暫存器寫入。
- **輪詢**：可調間隔，請求序列化且不會堆積（同一時間僅一個讀取在飛）。
- **設定持久化**：連線參數、資料表選項、已存裝置都存在瀏覽器 `localStorage`（`dsh.modbus-poll/v1`）。
- **已存裝置**：把 `host:port / 站號` 存成 preset，一鍵切回（切換時會先中斷目前連線，避免顯示不實的位址）。
- **值變動提示**：與上一輪不同的列會在位址欄閃一下。
- **Agent 工具**：`modbus_poll`，支援 `status`、`connect`、`disconnect`、`read`、`write`、`write-bit`。

## 使用

1. 左側欄開啟「Modbus 讀寫台」。
2. 輸入位址／埠號／站號，按「連線」（或從「已存裝置」選一個）。
3. 選資料表：保持暫存器、輸入暫存器、線圈、離散輸入；設定起始位址與數量。
4. 需要時調整型別、字序、比例、位移；按「讀取」或「開始輪詢」。
5. 暫存器列右側可直接輸入數值寫入；位元格點擊即切換；線圈列按「切換」。

## Agent 工具範例

```json
{ "action": "connect", "host": "192.168.1.10", "port": 502, "unitId": 1 }
{ "action": "read", "kind": "holding", "start": 0, "count": 16, "type": "f32", "wordOrder": "CDAB" }
{ "action": "read", "kind": "holding", "start": 100, "count": 1, "scale": 0.1 }
{ "action": "read", "kind": "coil", "start": 0, "count": 32 }
{ "action": "write", "address": 10, "value": 23.5, "type": "u16", "scale": 0.1 }
{ "action": "write", "address": 20, "values": [1, 2, 3] }
{ "action": "write-bit", "address": 30, "bit": 4, "value": 1 }
{ "action": "status" }
```

`read` 會回傳原始暫存器（`values`）、解碼後的列（`rows`）與可直接閱讀的 `summary`；位元表則回傳 `bits`。

## 通訊協定

| 功能 | 代碼 |
| --- | --- |
| 讀線圈 | FC01 |
| 讀離散輸入 | FC02 |
| 讀保持暫存器 | FC03 |
| 讀輸入暫存器 | FC04 |
| 寫單一線圈 | FC05 |
| 寫單一暫存器 | FC06 |
| 寫多筆線圈 | FC15 |
| 寫多筆暫存器 | FC16 |

單一連線、單一請求在飛：並行呼叫會排隊，回應依交易 ID 對應，逾時會銷毀 socket 以避免串流錯位。

## 檔案

| 檔案 | 作用 |
| --- | --- |
| `index.js` | Host 外掛：`/modbus-poll/api` 路由與 `modbus_poll` 工具 |
| `modbus.js` | Modbus TCP 核心：連線、交易、FC01–FC16 子集 |
| `types.js` | 型別、字序、比例的解碼與編碼（面板與工具共用） |
| `client.js` | Web 面板：側邊欄項目與 `main` 面板 |
| `cordis.patch.yml` | Bundle patch，插入 `modbus-poll` 資料列 |
| `locale/*.json` | 外掛管理頁的標題與描述 |
| `icon.svg` | 外掛圖示 |

## 測試

```powershell
node modbus-poll-tests/types.test.mjs    # 型別／字序／比例，不開 socket
node modbus-poll-tests/core.test.mjs     # 對假伺服器的協定行為
node modbus-poll-tests/host.test.mjs     # 路由與 Agent 工具
node modbus-poll-tests/client.test.mjs   # 模組 id、雙語字典、slot 註冊
node modbus-poll-tests/render.test.mjs   # 以最小 hook runtime 實際渲染面板
```

`modbus-poll-tests/fake-server.mjs` 支援 FC01/02/03/04/05/06/15/16，也可直接拿來當無硬體的展示伺服器：

```powershell
node modbus-poll-tools/serve-fake.mjs 15020
node modbus-poll-tools/query.mjs 127.0.0.1 15020 0 16
```

## 限制

- 一次讀取最多 125 個暫存器或 2000 個位元；寫入最多 123 個暫存器或 1968 個線圈。
- 一次只連一台伺服器；切換裝置請先中斷（面板會自動處理）。
- 沒有 TLS／序列埠（僅 Modbus TCP）。
- 寫入立即生效，沒有二次確認；請只對你有權限的設備操作。

## 安裝狀態

已連結到 `desktop` profile：

- `package.json` 的 `dsh.profile.bundles` 包含 `@local/dsh-plugin-modbus-poll`
- 依賴為 `link:C:/Users/user/Documents/deepseek-harness/default-workspace/modbus-poll`
- `node_modules/@local/dsh-plugin-modbus-poll` 為 junction
