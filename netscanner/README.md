# 網段掃描器（`@local/dsh-plugin-netscanner`）

DSH 的 IPv4 網段掃描外掛。側邊欄提供可設定網段的面板，Agent 則可透過 `net_scan` 工具呼叫同一個掃描核心。

## 功能

- **可設定掃描網段**：CIDR、起訖範圍、末段萬用字元或單一 IP。
  - `192.168.1.0/24`
  - `192.168.1.10-192.168.1.50`
  - `192.168.1.10-50`
  - `192.168.1.*`
  - `192.168.1.20`
- **連接埠**：快速（3 埠）、標準（10 埠）、常見服務（18 埠）或自訂（支援 `8000-8010`，最多 32 埠）。
- **並行掃描**：可調逾時與同時掃描主機數；掃描中可隨時停止。
- **結果資訊**：IP、反解主機名稱、ARP MAC 位址、開放的 TCP 連接埠、延遲；以 ARP 找到的裝置會標示 `ARP`。
- **即時進度**：面板每 700 ms 讀取一次掃描快照，結果陸續出現。
- **匯出 CSV**、以 IP／主機名稱／MAC／連接埠篩選。
- **本機網段捷徑**：自動列出本機非內部 IPv4 網段，點一下即可填入。
- **Agent 工具**：`net_scan`，支援 `scan`、`status`、`stop`、`interfaces`。

## 使用

1. 在左側欄開啟「網段掃描器」。
2. 在「掃描網段」輸入網段，或點選「本機網段」下的建議項目。
3. 選擇連接埠組合、逾時與同時掃描主機數；按「開始掃描」。
4. 掃描完成後可篩選結果或按「匯出 CSV」。
5. 變更設定會保存在瀏覽器 `localStorage`，下次開啟面板時沿用。

### Agent 工具範例

```json
{ "action": "scan", "cidr": "192.168.1.0/24", "ports": [22, 80, 443, 445] }
{ "action": "status" }
{ "action": "interfaces" }
```

`scan` 預設會等待完成（最多 90 秒）；長網段可傳 `"wait": false`，再以 `status` 讀取進度。

## 掃描原理

瀏覽器不能開 raw socket，因此所有探測都在 Harness 主機行程執行：

- 對每個目標的每個連接埠發起 TCP 連線。
- 連線成功代表連接埠開放；收到 `ECONNREFUSED`／`ECONNRESET` 代表主機有回應但該埠關閉。兩者都視為「存活」，所以沒有開放埠的裝置也能被找到。
- 掃描後讀取作業系統 ARP 表（Windows `arp -a`、其他平台 `arp -an`）：同一 L2 網段的主機即使防火牆丟棄所有 TCP 探測，仍會留下 ARP 項目；這些裝置會以 `via: "arp"` 加入結果，並在面板標示 `ARP`。
- 對存活主機做有逾時上限的反向 DNS。

預設連線逾時為 **700 ms**；Wi-Fi 省電裝置或較慢的網路可調高到 800–1500 ms。

## 限制

- 每次最多掃描 **4096** 個位址（約 `/20`）與 **32** 個連接埠。
- 同一時間只允許一個掃描；再次啟動會回傳 `scan-running`。
- 防火牆若靜默丟棄封包，且裝置不在本機 ARP 快取中（例如跨路由器或 Wi-Fi 用戶端隔離），該主機可能無法被偵測。
- 僅請掃描你被授權測試的網段。

## 檔案

| 檔案 | 作用 |
| --- | --- |
| `index.js` | Host 外掛：`/netscanner/api` 路由與 `net_scan` 工具 |
| `scanner.js` | 掃描核心：網段解析、TCP 探測、ARP、反解、進度狀態 |
| `client.js` | Web 面板：側邊欄項目與 `main` 面板 |
| `cordis.patch.yml` | Bundle patch，插入 `netscanner` 資料列 |
| `locale/*.json` | 外掛管理頁的標題與描述 |
| `icon.svg` | 外掛圖示 |

## 測試

```powershell
node netscanner-tests/scanner.test.mjs
node netscanner-tests/host.test.mjs
node netscanner-tests/client.test.mjs
```

- `scanner.test.mjs`：網段／連接埠解析、ARP 解析與 ARP 快取發現、本機 TCP 伺服器實際掃描、停止與上限。
- `host.test.mjs`：以最小 Cordis context 掛載外掛，驅動路由與 Agent 工具。
- `client.test.mjs`：載入瀏覽器模組，檢查模組 id、雙語字典與兩個 slot 註冊（不渲染 React）。

## 安裝狀態

已連結到 `desktop` profile：

- `package.json` 的 `dsh.profile.bundles` 包含 `@local/dsh-plugin-netscanner`
- 依賴為 `link:C:/Users/final/Documents/deepseek-harness/default-workspace/netscanner`
- `node_modules/@local/dsh-plugin-netscanner` 為符號連結
