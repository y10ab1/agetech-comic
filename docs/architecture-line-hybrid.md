# 架構提案：LINE bot 殼 ＋ LIFF 核（混合架構）

> 狀態：PM 已定案採用，本文件供前後端對齊分工與契約。
> 對應現有架構：後端 `/webhook`（LINE Messaging API）骨架已存在；前端 Next.js（`frontend/`）將 LIFF 化。

## 一、決策與理由

**長輩的唯一入口是 LINE**：加入官方帳號好友＝完成註冊（零門檻，PRD 痛點「近 50% 長者因恐懼詐騙拒絕輸入個資」直接消失）。產品分成兩層：

| 層 | 技術 | 負責的功能 | 為什麼 |
|---|---|---|---|
| **聊天層（殼）** | Messaging API webhook＋Rich Menu＋Flex Message | 每日提醒推播、快速打卡（吃藥/運動）、分享家人、入口導流 | 推播與家庭群組是 LINE 原生強項；Web push 對長輩不可行 |
| **LIFF 層（核）** | 現有 Next.js 前端＋LIFF SDK | 圖卡日記、劇場朗讀、集章存摺看版、設定 | 複雜互動聊天泡泡做不到；**WCAG 合規只有網頁能展示**（競賽硬要求） |

兩層共用同一個 FastAPI 後端與資料庫，**LINE userId 為唯一使用者鍵**。

## 二、分工

| 誰 | 做什麼 |
|---|---|
| 後端 | webhook 對話流、推播排程（聰明提醒）、LIFF 用 REST API（契約見 `api-contract-additions.md`）、事件入庫 |
| 前端（PM） | LIFF 化（liff.init／真實 userId）、LIFF 全部頁面（已完成 P1–P6）、Rich Menu 視覺與 Flex Message 模板設計稿 |

## 三、聊天層無障礙補償規範（重要）

純聊天 UI **無法**達成 WCAG 稽核（無 aria/focus/字級控制），競賽合規由 LIFF 層承擔展示；聊天層遵守以下補償規則：

1. **一泡泡一問題**（延續減法層「一頁一問題」）。
2. **文字＋語音雙軌**：關鍵訊息同時發文字與語音訊息（bot 可發 audio），低視力長輩直接受益。
3. 短句白話、禁止技術用語與錯誤碼（同無障礙規格書）。
4. Flex Message：按鈕滿寬、高度用最大檔；色彩沿用前端色票（磚紅 `#8C3B24` 白字 7.59:1、碳灰 `#2E2E2B`）；**不用 quick reply 承載關鍵動作**（膠囊太小）。
5. Rich Menu：格子大（建議 2×2 以內）、圖上文字 ≥ 對比 7:1、每格單一動作。
6. 推播文案永遠正向（「阿咪想聽您今天的故事了」），**禁止倒數/催促語氣**。

## 四、每日提醒推播：成本結構與策略

LINE 推播為付費資源（輕用量免費約 200 則/月、中用量約 NT$800/3,000 則，以官方價目為準）。「每天全推」＝每用戶 30 則/月，免費額度僅撐約 6 人。策略：

1. **聰明提醒**：每日傍晚只推給「今天尚未記錄」者（後端查當日 stamp）。
2. **reply 免費**：Rich Menu 引導長輩主動開啟對話，回覆訊息不計費。
3. 頻率/時段做成後端參數（同 REWARDS 模式），可動態調整。
4. 決審 demo 期用戶少、成本趨近零；擴散期再依用戶數編推播預算。

## 五、前端 LIFF 化改動點（P7a，小工程）

1. 加 `@line/liff`：`liff.init({ liffId })` → `liff.getProfile()` 取真實 userId/displayName。
2. 以 `NEXT_PUBLIC_USE_MOCK` 同模式加 `NEXT_PUBLIC_LIFF_ID`；**無 LIFF 環境時退回現行 mock 登入**（開發/瀏覽器 demo 不依賴 LINE）。
3. 「分享到 LINE」由 mock 換 `liff.shareTargetPicker()`（真實分享到家族群組）。
4. 其餘頁面零改動（P1–P6 全部沿用）。

## 六、數據事件表（草案，入同一 DB）

| 事件 | 來源 | KPI 用途 |
|---|---|---|
| `friend_added` / `friend_blocked` | webhook follow/unfollow | 註冊數（決審指標） |
| `diary_created`（含 style、tags、輸入模式） | LIFF API | 活躍/使用次數 |
| `reminder_sent` / `reminder_converted` | 推播排程＋當日是否記錄 | 提醒轉換率 |
| `shared_to_family` | LIFF shareTargetPicker 回報 | 社會參與指標（共享陪伴） |
| `reward_granted`（里程碑/畫風解鎖） | 後端獎勵引擎 | 黏著分析 |
| `quick_checkin`（吃藥/運動打卡） | webhook postback | 健康類成就（Phase 3） |

## 七、LIFF 相容性評估（PM 審閱官方文件後定案）

| 項目 | 決策／對策 |
|---|---|
| 檢視尺寸 | **Full**（app 級體驗） |
| Action button | **開 Module mode 隱藏**——避免長輩誤觸多分頁/最小化而迷路；再進入點本來就是 Rich Menu，不依賴「最近使用的服務」 |
| 分享 | 一律 `liff.shareTargetPicker()`；**不用** `liff.sendMessages()`（官方明載 reload 後失效） |
| TTS | ⚠️ LIFF browser 為 WKWebView/Android WebView——**拿到 LIFF ID 後第一個 spike：實測 speechSynthesis**；失敗則切後端 TTS 音檔（台語版本來就走此路） |
| 語音輸入 | WebView 無 SpeechRecognition → 確定走 MediaRecorder＋後端 STT（與原規劃一致） |
| 快取 | LIFF browser 快取無法手動清 → HTML 設 `Cache-Control: no-cache`（hashed assets 照常快取），避免長輩卡舊版 |
| 舊機型風險 | 官方僅承諾最新版最佳；**場域實測必列舊 Android/舊版 LINE 機型** |
| 建置注意 | LIFF 掛在 **LINE Login channel**（與 Messaging API channel 分開、同 provider）；Endpoint URL 需 HTTPS（前端需正式部署位置；本機用 LIFF CLI 的 HTTPS dev server） |
| 展示 | LIFF 支援 external browser → 決審投影可用一般瀏覽器跑 |

## 八、階段規劃

- **P7a 前端 LIFF 化**（可立即做，含 mock 後備）
- **P7b 聊天層設計**：Rich Menu 視覺、提醒文案、快速打卡 Flex 模板（前端出稿、後端接線）
- **P7c 獎勵經濟後端化**：`GET /me/rewards`（含參數下發）取代 localStorage 錢包，防竄改＋跨裝置
