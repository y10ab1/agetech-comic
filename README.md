# AgeTech Comic 樂齡漫畫日記

一個為樂齡族群設計的 AI 漫畫日記服務。長輩透過 **LINE Bot** 用文字（未來可擴充語音）描述今天做了什麼事情，系統會用 AI 生成一則漫畫來總結這一天，並提供**無障礙口述影像**讓視力不便的使用者也能理解畫面內容。

> 樂齡漫畫比賽參賽專案。

## 專案特色

- **LINE Bot 互動**：長輩在熟悉的 LINE 上就能使用，門檻低。
- **AI 漫畫生成**：把一天的文字日記轉成分鏡漫畫。
- **無障礙口述影像**：每個漫畫分格都附有 `alt_text`，並可串成整篇口述內容，支援螢幕報讀器。

## 專案結構（Monorepo）

```
agetech-comic/
├── backend/     # Python + FastAPI（LINE webhook、AI 漫畫生成）— 使用 uv 管理
├── frontend/    # Next.js（PM 負責的展示 / 操作介面）
└── docs/        # 專案文件
```

## 分工

| 角色 | 目錄 | 技術 |
|------|------|------|
| 後端 / AI | `backend/` | Python 3.12、FastAPI、line-bot-sdk、uv |
| 前端 / 介面（PM） | `frontend/` | Next.js、TypeScript、Tailwind CSS |

前端透過後端提供的 `POST /comics/generate` API 生成漫畫，不需依賴 LINE 平台即可開發與展示。

> **協作規則**：禁止直接 push 到 `main`，一律開分支走 Pull Request。詳見 [CONTRIBUTING.md](CONTRIBUTING.md)。
> Clone 後請執行 `git config core.hooksPath .githooks` 啟用本地保護。

## 快速開始

### 後端

```bash
cd backend
uv sync                       # 安裝依賴
cp .env.example .env          # 填入 LINE / AI 憑證
uv run fastapi dev app/main.py   # http://localhost:8000
uv run pytest                 # 執行測試
```

API 文件（Swagger）：http://localhost:8000/docs

### 前端

```bash
cd frontend
npm install
cp .env.example .env.local    # 設定後端 API 位址
npm run dev                   # http://localhost:3000
```

## 主要 API

| 方法 | 路徑 | 說明 |
|------|------|------|
| `POST` | `/webhook` | LINE Messaging API webhook |
| `POST` | `/comics/generate` | 由日記文字生成漫畫（前端用） |
| `GET`  | `/health` | 健康檢查 |

## 開發狀態

目前為專案骨架，AI 生成（文字總結、圖片生成）為 stub 實作，待串接實際模型。詳見 [docs/](docs/)。
