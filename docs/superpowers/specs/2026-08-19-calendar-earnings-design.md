# 行事曆整合美股財報時間 — 設計

**日期**: 2026-08-19
**狀態**: Approved（待使用者複閱）

## 目標

在行事曆（`CalendarView` / `CalendarMonthGrid` / `CalendarDayAgenda`）上以**唯讀覆蓋層**方式，自動顯示使用者關注的美股公司**財報公布日**。財報資料不寫入 `CalendarEntry`，不與使用者手動事件混淆，只做純顯示疊加。

## 非目標（Out of Scope）

- 不做整個大盤 / S&P 500 的財報行事曆。
- 不做財報內容（營收、EPS 實際值、連結財報全文）——只顯示「哪一天、哪家公司、盤前/盤後」。
- 不寫入 / 不修改 `CalendarEntry`。財報不是事件，無法編輯或刪除。
- 不在此階段引入「整個 app 依使用者時區運作」的大改動（見「時區」章節）。

## 決策紀錄

| 面向 | 決策 |
|---|---|
| 資料來源 | 追蹤清單（`StockWatchItem`）+ 手動搜尋加入 |
| 手動加入的 symbol | 存 DB（獨立表，見資料模型） |
| 時間粒度 | 當天日期；顯示在「實際事件發生日」 |
| 時區 | 先使用台灣時區（UTC+8），顯示在實際發生日 |
| 盤前/盤後時段 | 順手帶出，顯示在 agenda 與 tooltip（不影響行事曆位置） |
| 整合方式 | 唯讀覆蓋層（不寫入 CalendarEntry） |
| 股票選擇 | 使用者個別勾選要顯示財報的股票 |

## 資料模型

新增 Prisma model，記錄「使用者要在行事曆顯示財報的股票」：

```prisma
model CalendarEarningsWatch {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  symbol    String
  name      String   // 手動加入時必要；追蹤清單勾選時也一併存下快照
  source    String   @default("tracked")  // "tracked" | "manual"
  createdAt DateTime @default(now()) @db.Timestamptz(3)

  @@unique([userId, symbol])
  @@index([userId])
}
```

**設計說明**

- 用**獨立表**而非在 `StockWatchItem` 加 `showEarnings` 欄位，因為：
  1. 手動搜尋加入的股票未必在追蹤清單。
  2. 「是否顯示財報」是行事曆專屬偏好，與追蹤清單鬆耦合，可獨立移除而不影響股票追蹤。
  3. 勾選是「行事曆要顯示誰的財報」，語意上屬於行事曆範疇。
- `source` 欄位保留來源以便 UI 區分（追蹤清單勾選 vs 手動加入）。
- `name` 存快照，避免每次都要向追蹤清單反查，且手動加入時有獨立名稱。

### Migration

新增 `CalendarEarningsWatch` 表的 Prisma migration。無既有資料遷移需求（全新表）。

## 資料取得（Server 端，唯讀）

```
Calendar 頁面 (server component)
  ↓ 讀 CalendarEarningsWatch 的 symbols（該 user）
  ↓ getCalendarEarnings(userId, symbols, from, to)
  ↓   yahooFinance.earnings(symbols)   // 沿用 getYahooClient()
  ↓   過濾 [from, to] 內財報日 + 換算台灣日
  ↓   unstable_cache / cacheTag（數小時）
  ↓ 回傳 Map<date, { symbol, name, hour?, epsEstimate? }[]>
```

- **沿用既有 `getYahooClient()`**，無新增 dependency。
- **快取**：仿照 `getCalendarEntriesInRange`，用 `unstable_cache` + `cacheTag`，`cacheLife("hours")`。財報日不會頻繁變動。
- **Rate limit / refresh credit**：仿照既有 market-data 路徑（`marketData: "refresh-credit"`）或獨立 rate-limit key，避免濫用。

### Yahoo `earnings` 回傳

`yahooFinance.earnings(symbols)` 回傳每檔的 `earningsDate: [Date, Date]`（分別對應盤後、盤前）與 `hour`（如 `"AMC"` / `"BMO"` / `"AMC+DA"`）。本設計使用：

- `earningsDate` + `hour` 判斷盤前（BMO）/ 盤後（AMC）。
- 回傳中若有 `epsEstimate` 等欄位則順手帶出顯示。

## 時區與日期換算（核心規則）

財報以**美股（美東 ET）時段**為基準，顯示在**台灣行事曆日（UTC+8，實際事件發生日）**。換算規則：

| 美股時段 | 美東時間 | 台灣時間（近似） | 台灣行事曆日 |
|---|---|---|---|
| 盤前 (BMO) | 08:00 ET | 20:00–21:00 同日 | **當日** |
| 盤後 (AMC) | 16:00 ET | 次日 04:00–05:00 | **次日** |
| 盤中 / 時間未定 | — | — | 美東當日 → 台灣當日（保守，不跨日） |

**規則**：

1. **盤後 (AMC)** → 台灣**次日**（美東週四盤後 16:00 = 台灣週五凌晨，屬週五）。
2. **盤前 (BMO)** → 台灣**當日**（美東週四盤前 = 台灣週四晚間）。
3. **無時段資訊** → 以美東當日對應台灣當日（保守，不跨日）。
4. 美東 offset：採固定推算（不需處理 DST 細粒度；財報日顯示 ±1 天在可接受範圍，若有 DST 誤差以 ET 當日為準）。實作時可用 `Intl.DateTimeFormat` 帶 `timeZone: "America/New_York"` 換算。

**為何不用美東當日直接當台灣日**：會把盤後財報顯示成台灣「前一天」，與實際事件發生日不符（美東週四盤後實際發生在台灣週五）。

## 顯示層（唯讀 overlay）

### 日期格（`CalendarMonthGrid`）

- 財報日顯示「財報」徽章，與現有 `CalendarCategoryBadge` 並排但用**不同樣式**（區分唯讀 overlay 與使用者事件）。
- 多檔同日財報 → 顯示數量（如 `財報 3`）或堆疊徽章。

### 日議程（`CalendarDayAgenda`）

- 財報日下方新增唯讀區塊：「📊 AAPL 財報 · 盤後」（含 EPS 預估，若有）。
- 與使用者事件**視覺分隔**（不同 section / 不同底色），且**不可編輯 / 刪除**。
- 時段（盤前/盤後）在此顯示。

### 管理 UI

- 在行事曆（或股票頁）提供「管理財報顯示股票」入口。
- 清單 = 追蹤清單（可勾選）+ 手動搜尋加入（複用現有 `HoldingSearch` / `/api/search`）。
- 可取消勾選 / 刪除手動加入項。

## 錯誤處理

- **Yahoo 掛掉 / 逾時 / rate-limit** → 行事曆照常顯示（財報是 best-effort），財報區塊顯示「暫時無法取得」或隱藏。不阻斷使用者事件。
- **無財報資料**（該股近期無財報）→ 不顯示。
- 財報資料快取失效 → 下次請求重新抓取，不影響行事曆其他資料。

## 測試

- **Unit**：
  - 時區換算：盤前 / 盤後 / 無時段 → 台灣日（含跨日、跨月、跨年邊界）。
  - `getCalendarEarnings` 過濾 `[from, to]` 範圍。
  - 資料模型 CRUD（勾選 / 取消 / 手動加入 / 重複加去重）。
- **E2E**（選擇性）：財報徽章顯示、agenda 唯讀區塊、管理 UI 流程。

## 相依 / 影響

- 新增 DB migration（`CalendarEarningsWatch`）。
- 新增 server service（`getCalendarEarnings`）+ 可能的 API route。
- `CalendarMonthGrid` / `CalendarDayAgenda` 增加唯讀 overlay props。
- **不影響**既有 `CalendarEntry` 模型、既有行事曆事件 CRUD、既有 `taiwanCalendarDay`。

## 後續（非本階段）

- 若未來要「整個 app 依使用者時區」，需另開 spec：新增 `Setting.timeZone`、影響 snapshot/cron/行事曆 today 等。
