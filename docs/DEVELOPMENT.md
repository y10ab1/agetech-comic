# 開發指南

## 後端架構（已實作）

```
POST /comics/generate
  └─ ComicGenerator.create_comic()               app/services/comic_generator.py
       ├─ summarize / build_title / build_narration   （規則式 stub，待接 LLM）
       ├─ VertexImageGenerator.generate_comic_image()  app/services/image_generator.py
       │     └─ Vertex Nano Banana 2 Lite（gemini-3.1-flash-lite-image），生成「一張」四格圖
       └─ PocketBaseClient.create_diary()              app/services/pocketbase_client.py
             └─ 上傳圖檔 + 建立日記紀錄 → 回傳 cover_url

GET /me/diaries → PocketBaseClient.list_diaries()（集章存摺）
```

**圖片策略**：生成單張含 2x2 四格的圖（非四張）。`ComicResult.panels` 仍是
陣列但只含 1 元素，向後相容前端。

## 待辦與擴充方向

### AI 生成（app/services/story_writer.py、tts.py）
- 文字模型一次寫出：標題、總結、四格圖說＋畫面、口述影像 `narration`、
  taxonomy `tags`（白名單 `TAG_LABELS`，與 `shared/tags.json` 有測試防漂移）、
  分享問候語 `greeting`；全部經驗證與「不可編造」檢查，失敗退回規則式。
- 旁白語音：Gemini 3.8 Flash-Lite TTS（備援 Flash TTS），每格各念一段、並行合成後
  接成一個 MP3，`narration_audio_marks_ms` 給前端逐格高亮；失敗＝無音檔、前端退回瀏覽器 TTS。

### 圖片生成（app/services/image_generator.py）
- 已接 Vertex `gemini-3.1-flash-lite-image`（Nano Banana 2 Lite，最大 1K）。**需確認 GCP 專案已開通該模型**
  （否則回 404；本機測試曾遇到，故加了 `IMAGE_GEN_FALLBACK`）。
- 畫風 prompt 在 `_STYLE_PROMPTS`，對應前端 `/styles`。

### LINE Bot（app/api/line_webhook.py）
- 長輩傳文字日記 → 背景生成 → 回覆故事文字＋四格漫畫圖（JPEG 變體）＋旁白語音。
- 之後：語音輸入（audio message + STT）讓長輩用說的；Flex Message 排版。

### 無障礙
- 單張四格圖的 `alt_text` 需完整描述四格內容。
- 前端呈現時圖片帶 `alt`，並提供「播放口述」按鈕（接 TTS）。
- 遵循 WCAG：足夠對比、大字體、鍵盤可操作。

## 前後端協作

- 後端提供 `POST /comics/generate`、`GET /me/diaries`，前端（PM）用
  `frontend/src/lib/api.ts` 呼叫。
- 資料模型定義在 `backend/app/models/comic.py`，前端型別對應在
  `frontend/src/lib/api.ts`；契約增補見 `docs/api-contract-additions.md`。
  **兩邊修改時請保持一致，並走 PR 互相 review。**
- tag taxonomy 唯一事實來源：`shared/tags.json`。

## 環境變數

- 後端：`backend/.env`（參考 `.env.example`）— Vertex、PocketBase、LINE 設定。
- 前端：`frontend/.env.local`（參考 `.env.example`）— 後端 API 位址。
- **切勿**把含真實金鑰的 `.env` 提交到 git。
- Vertex 認證走 GCP ADC（`gcloud auth application-default login`），不是 API key。
