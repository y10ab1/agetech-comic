# 前端 → 後端 API 契約增補提案（草稿，待後端確認）

前端集章存摺／畫風／tag 系統已用 mock 實作完成（`NEXT_PUBLIC_USE_MOCK=true`）。
以下是接真 API 需要的契約增補。對應現有契約：
`frontend/src/lib/api.ts` ↔ `backend/app/models/comic.py`。

## 0. 優先序總表（建議的開工順序）

| 優先 | 項目 | 為什麼是這個順序 |
|---|---|---|
| **P0** | `/comics/generate` 增補欄位（§1、§2）＋ **日記持久化**（§3） | 核心價值鏈；且**每日提醒、KPI、跨裝置都依賴 server-side 日記表**，不做提醒功能無法存在 |
| **P1** | 身分驗證（§4）＋ LINE channel/LIFF app 建置（§7） | P0 的 API 需要知道「這是哪個 user」 |
| **P2** | `GET /styles`（§5） | 畫風選擇；前端 mock 可先頂著 |
| **P3** | `GET /me/rewards`（§6）＋ 提醒排程（§7） | 獎勵經濟後端化與推播；demo 期前端 localStorage 可頂 |

> 前端 demo 完全不被擋：所有功能有 mock 後備。上表是「真整合」的順序。

## 1. `ComicResult` 增補欄位（P0）

| 欄位 | 型別 | 說明 |
|---|---|---|
| `title` | `str` | AI 依故事內容下的標題（如「菜市場的一天：跟朋友泡茶」），集章存摺卡片顯示用 |
| `tags` | `list[str]` | **限定 taxonomy**（見下方白名單）。拍照/語音輸入時由 AI 判斷；圖卡輸入時可由前端傳入或後端重算 |
| `cover_url` | `str` | 封面圖（可用第一格或另生成）。前端目前以「準備中」佔位圖呈現，拿到即替換 |

**tags 白名單**（controlled vocabulary，禁止自由生成，來源 `frontend/src/data/tags.ts`）：
`grandchild`(孫子)、`friend`(朋友)、`market`(買菜)、`food`(美食)、`walk`(出門走走)、`exercise`(運動)、`music`(音樂)、`home`(在家)、`center`(樂齡中心)、`health`(健康，保留)

## 2. `DiaryEntry` 增補欄位（P0）

| 欄位 | 型別 | 說明 |
|---|---|---|
| `style` | `str \| None` | 畫風 id（見 /styles）。None＝預設畫風 |

## 3. 日記持久化（P0——localStorage 遷移）

目前日記/集章存於前端 localStorage，僅供 demo。正式版由後端持有
（**每日提醒、KPI、跨裝置都依賴這張表**）：

- **寫入**：`POST /comics/generate` 成功時，後端**順手建立日記紀錄**
  （user_id、created_at、title、tags、style、cover_url、logline）。前端不再另行寫入。
- **讀取**：`GET /me/diaries?month=2026-07` → 該月日記陣列（集章存摺頁用）；
  另附 `total_count`（集點卡進度）與 `recorded_today: bool`。
- 前端切換方式：`data/collection.ts` 已隔離存取層，換成 API 呼叫即可，頁面不動。

## 4. 身分驗證（P1）

- LIFF 前端以 `liff.getAccessToken()` 取得 token，放在 `Authorization: Bearer <token>`。
- 後端以 LINE 的 verify API 驗 token → 取得穩定 `userId` 作為所有資料的 key。
- 開發模式：`ENV=dev` 時允許 `X-Debug-User: <fake-id>` 跳過驗證（方便本機測試）。

## 5. `GET /styles`（P2，新端點）

回傳畫風清單，供前端畫風選擇頁與解鎖機制使用：

```json
[
  { "id": "japanese", "name": "日系漫畫", "thumbnail_url": "...", "is_default": true },
  { "id": "american", "name": "美式漫畫", "thumbnail_url": "..." },
  { "id": "korean",   "name": "韓式漫畫", "thumbnail_url": "..." },
  { "id": "watercolor", "name": "溫暖水彩", "thumbnail_url": "..." }
]
```

## 6. `GET /me/rewards`（P3，新端點）

集章獎勵經濟目前為前端 localStorage mock（`frontend/src/data/rewards.ts`），
正式版建議由後端持有（防竄改、跨裝置同步）：

```json
{
  "stamp_count": 12,
  "bonus_generations": 2,
  "unlocked_style_ids": ["korean"],
  "generations_used_today": 1,
  "config": {
    "daily_free_generations": 1,
    "cycle_length": 7,
    "milestones": [
      { "at": 3, "generations": 1 },
      { "at": 7, "styles": 1, "fallback_generations": 2 }
    ]
  }
}
```

> `config` 由後端下發＝獎勵參數可動態調整不用改前端（PM 需求）。

## 7. LIFF／推播與營運建置（P1/P3，詳見 `architecture-line-hybrid.md`）

- 後端需建立 **LIFF app**（LINE Developers console）並提供 `LIFF_ID` 給前端環境變數。
- LIFF 層呼叫的 REST API 以 **LINE userId** 識別使用者（`liff.getProfile()` 取得，後端以 access token 驗證）。
- **每日提醒排程**（後端 cron）：傍晚只推給「今日尚未記錄」者；文案正向、頻率/時段參數化。
- webhook 事件（follow/unfollow/postback）與 LIFF API 事件入同一 DB（事件表見架構提案 §六）。

## 8. 每日上限的錯誤語意

若後端在 `/comics/generate` 做次數把關，超限時請回結構化錯誤
（如 `429 { "code": "DAILY_LIMIT" }`），**勿回純文字錯誤**——
前端需轉成高齡友善話術（「今天的漫畫做好了！明天再來蓋新的章喔」），
嚴禁把技術錯誤碼顯示給長輩（無障礙規格書要求）。
