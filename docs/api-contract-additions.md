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

**tags 白名單**（controlled vocabulary，禁止自由生成）——
**唯一事實來源：repo 根目錄 `shared/tags.json`**（前端直接 import、後端載入餵 DB seed 與 `GET /tags`）。
現行 v3：`grandchild`(孫子/孫女)、`children`(兒女)、`parents`(父母)、`spouse`(伴侶)、
`friend`(朋友)、`market`(買菜)、`walk`(出門走走)、`center`(樂齡中心)、`exercise`(運動)、
`food`(美食)、`music`(音樂)、`home`(在家)、`health`(健康，保留)。

**共同維護規則（前後端都遵守）**：
1. `id` **永不改、永不刪**（歷史日記靠它；淘汰改用 `reserved: true`）
2. `label`／`icon` 隨時可改（顯示層，舊資料自動跟著新 label）
3. 新增 tag **必須標 `dimensions`**（否則週報規則涵蓋不到）
4. 任何變更走 **PR、前後端互相 review**（同時影響前端篩選、AI 白名單、週報規則）
5. `version` 遞增

## 1-1. 單張四格圖生成約定（P0 補充，2026-07-21 前後端定案）

漫畫採**單張 2×2 四格圖**（一次生成一張含四格的圖；利於 LINE 以單圖分享），
`ComicResult.panels` 正常僅 1 個元素。為讓前端的「象限高亮」與無障礙呈現可靠運作
（見 `accessibility-spec-v1.md` §一-1），後端生圖需遵守：

| 約定 | 規格 | 為什麼 |
|---|---|---|
| 解析度下限 | 輸出 **≥ 2048×2048** | 四格擠一張，每格有效解析度剩 1/4；長輩點擊放大單格時不能糊 |
| 固定版式 | **2×2、四格等分、邊距/格線位置一致**（提示詞固定） | 前端朗讀高亮框以象限（50%×50%）對位，格線飄移會框錯格 |
| 禁圖內文字 | 提示詞明確要求**畫面不含文字/對話框** | 圖內字對報讀器不存在、AI 生成常亂碼、低視力難讀（WCAG 1.4.5）；敘事一律由 caption/narration 真文字承擔 |
| `alt_text` | 該 panel 的 alt_text ＝**依閱讀順序（左上→右上→左下→右下）的短版總述** | alt 過長無法暫停/導航；完整口述放 `narration` |
| `narration` | 完整口述影像（逐格、依閱讀順序） | 劇場「完整故事」段落的資料來源（目前規則式 stub，接 LLM 後品質提升，欄位契約不變） |

## 2. `DiaryEntry` 增補欄位（P0）

| 欄位 | 型別 | 說明 |
|---|---|---|
| `style` | `str \| None` | 畫風 id（見 /styles）。None＝預設畫風 |

## 3. 日記持久化（P0——localStorage 遷移）

目前日記/集章存於前端 localStorage，僅供 demo。正式版由後端持有
（**每日提醒、KPI、跨裝置都依賴這張表**）：

- **寫入**：`POST /comics/generate` 成功時，後端**順手建立日記紀錄**
  （user_id、created_at、title、tags、**mood**、style、cover_url、logline）。前端不再另行寫入。
  - `mood`：`happy | calm | tired`（長輩每次都會選，零 UX 改動）——**每週關懷小結最強的訊號**（如「累 ≥4 天」觸發關懷語）。
  - `tags`：後端正式持有 **tag table v2（含 dimensions 維度欄）**，未來以 `GET /tags` 下發；
    週報規則跑在維度上（social/outing/physical/leisure/home/health），
    副本見 `frontend/src/data/tags.ts`。
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
