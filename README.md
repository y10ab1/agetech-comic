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
├── backend/       # Python + FastAPI（LINE webhook、Vertex 生圖、日記 API）— uv 管理
├── frontend/      # Next.js（PM 負責的展示 / 操作介面）
├── pocketbase/    # PocketBase（DB + 圖檔儲存；schema 走 pb_migrations）
├── docker-compose.yml  # 一鍵起 backend + pocketbase
└── docs/          # 專案文件
```

## 分工

| 角色 | 目錄 | 技術 |
|------|------|------|
| 後端 / AI | `backend/` | Python 3.12、FastAPI、line-bot-sdk、google-genai、uv |
| 資料 / 儲存 | `pocketbase/` | PocketBase（日記 DB + 四格漫畫圖檔） |
| 前端 / 介面（PM） | `frontend/` | Next.js、TypeScript、Tailwind CSS |

前端透過後端提供的 `POST /comics/generate` API 生成漫畫，不需依賴 LINE 平台即可開發與展示。

> **協作規則**：禁止直接 push 到 `main`，一律開分支走 Pull Request。詳見 [CONTRIBUTING.md](CONTRIBUTING.md)。
> Clone 後請執行 `git config core.hooksPath .githooks` 啟用本地保護。

## 快速開始

### 一鍵啟動（推薦：backend + PocketBase）

```bash
cp backend/.env.example backend/.env   # 填入 VERTEX_PROJECT 等
gcloud auth application-default login  # Vertex 走 GCP ADC，不需 API key
docker compose up --build              # backend:8000 + pocketbase:8090
```

首次啟動需建立 PocketBase superuser（帳密需與 `backend/.env` 的
`POCKETBASE_ADMIN_*` 一致）：

```bash
docker compose exec pocketbase /pb/pocketbase superuser create admin@agetech.local changeme123
```

PocketBase Admin UI：http://localhost:8090/_/ ；日記 collection schema 由
`pocketbase/pb_migrations/` 自動套用。

### 後端（本機開發，不透過 docker）

```bash
cd backend
uv sync                       # 安裝依賴
cp .env.example .env          # 填入 Vertex / PocketBase / LINE 設定
uv run fastapi dev app/main.py   # http://localhost:8000
uv run pytest                 # 執行測試（不需 Vertex/PocketBase）
```

> 本機無 GCP 權限時，設 `IMAGE_GEN_FALLBACK=true`、`PERSIST_DIARIES=false`
> 仍可跑完整流程（不產圖、不寫 DB）。開發時可用 `X-Debug-User` 標頭帶入
> 假 user_id（需 `ENV=dev`）。

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
| `POST` | `/comics/generate` | 由日記文字生成單張四格漫畫（同步）並持久化 |
| `GET`  | `/me/diaries` | 列出當前使用者日記（集章存摺；可 `?month=YYYY-MM`） |
| `GET`  | `/health` | 健康檢查 |

## 開發狀態

- **已完成**：Vertex Nano Banana 2 生圖（單張四格漫畫）、PocketBase 日記持久化 + 圖檔儲存、`/comics/generate` 與 `/me/diaries`、docker-compose。
- **stub / 待強化**：文字總結、標題、tag 判斷、無障礙口述目前為規則式，待接 LLM。
- **待做**：LINE channel/LIFF 建置與 token 驗證（P1）、`GET /styles`、`GET /me/rewards`、推播排程。

詳見 [docs/](docs/)（PRD、架構、API 契約）。
