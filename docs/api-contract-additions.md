# 前端 → 後端 API 契約增補提案（草稿，待後端確認）

前端集章存摺／畫風／tag 系統已用 mock 實作完成（`NEXT_PUBLIC_USE_MOCK=true`）。
以下是接真 API 需要的契約增補，依優先序排列。對應現有契約：
`frontend/src/lib/api.ts` ↔ `backend/app/models/comic.py`。

## 1. `ComicResult` 增補欄位（優先）

| 欄位 | 型別 | 說明 |
|---|---|---|
| `title` | `str` | AI 依故事內容下的標題（如「菜市場的一天：跟朋友泡茶」），集章存摺卡片顯示用 |
| `tags` | `list[str]` | **限定 taxonomy**（見下方白名單）。拍照/語音輸入時由 AI 判斷；圖卡輸入時可由前端傳入或後端重算 |
| `cover_url` | `str` | 封面圖（可用第一格或另生成）。前端目前以「準備中」佔位圖呈現，拿到即替換 |

**tags 白名單**（controlled vocabulary，禁止自由生成，來源 `frontend/src/data/tags.ts`）：
`grandchild`(孫子)、`friend`(朋友)、`market`(買菜)、`food`(美食)、`walk`(出門走走)、`exercise`(運動)、`music`(音樂)、`home`(在家)、`center`(樂齡中心)、`health`(健康，保留)

## 2. `DiaryEntry` 增補欄位

| 欄位 | 型別 | 說明 |
|---|---|---|
| `style` | `str \| None` | 畫風 id（見 /styles）。None＝預設畫風 |

## 3. `GET /styles`（新端點）

回傳畫風清單，供前端畫風選擇頁與解鎖機制使用：

```json
[
  { "id": "japanese", "name": "日系漫畫", "thumbnail_url": "...", "is_default": true },
  { "id": "american", "name": "美式漫畫", "thumbnail_url": "..." },
  { "id": "korean",   "name": "韓式漫畫", "thumbnail_url": "..." },
  { "id": "watercolor", "name": "溫暖水彩", "thumbnail_url": "..." }
]
```

## 4. `GET /me/rewards`（新端點，可後期）

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

## 5. LIFF／推播（混合架構，詳見 `architecture-line-hybrid.md`）

- 後端需建立 **LIFF app**（LINE Developers console）並提供 `LIFF_ID` 給前端環境變數。
- LIFF 層呼叫的 REST API 以 **LINE userId** 識別使用者（`liff.getProfile()` 取得，後端以 access token 驗證）。
- **每日提醒排程**（後端 cron）：傍晚只推給「今日尚未記錄」者；文案正向、頻率/時段參數化。
- webhook 事件（follow/unfollow/postback）與 LIFF API 事件入同一 DB（事件表見架構提案 §六）。

## 6. 每日上限的錯誤語意

若後端在 `/comics/generate` 做次數把關，超限時請回結構化錯誤
（如 `429 { "code": "DAILY_LIMIT" }`），**勿回純文字錯誤**——
前端需轉成高齡友善話術（「今天的漫畫做好了！明天再來蓋新的章喔」），
嚴禁把技術錯誤碼顯示給長輩（無障礙規格書要求）。
