# 開發規範 CONTRIBUTING

本專案採 **Monorepo**（`backend/` + `frontend/`），為了讓後端與前端（PM）順利協作，請務必遵守以下開發流程。

## 核心規則

> **禁止直接 push 到 `main` 分支。**
> 所有變更都必須開新分支，經由 Pull Request（PR）合併，且需至少 1 人 review approve。

`main` 分支必須隨時保持可運作、可展示的狀態（比賽 demo 用）。

## 分支流程

### 1. 從最新的 main 開新分支

```bash
git checkout main
git pull origin main
git checkout -b <類型>/<簡短描述>
```

### 2. 分支命名規則

| 類型 | 用途 | 範例 |
|------|------|------|
| `feat/`  | 新功能 | `feat/comic-flex-message` |
| `fix/`   | 修 bug | `fix/webhook-signature` |
| `ui/`    | 前端介面 / 樣式（PM 常用） | `ui/diary-input-page` |
| `docs/`  | 文件 | `docs/setup-guide` |
| `chore/` | 雜項、設定、依賴 | `chore/update-deps` |

前端相關工作（PM）建議用 `ui/` 或 `feat/` 開頭。

### 3. 提交 commit

- 一個 commit 做一件事，訊息用中文或英文皆可，但要清楚。
- 範例：`feat: 新增日記輸入頁面`、`fix: 修正 LINE 簽章驗證`。

### 4. 推送分支並開 PR

```bash
git push -u origin <你的分支名>
```

到 GitHub 開 Pull Request，target 為 `main`，填寫 PR 模板。

### 5. Review 與合併

- **`main` 已設定分支保護：PR 必須至少 1 人 approve 才能合併。**
- **基本上由後端（repo owner）review PR**；前端（PM）的改動送 PR 後，由後端 review 通過再合併。
- GitHub 不允許自己 approve 自己的 PR，所以請找對方 review。
- 合併後刪除該分支。

## 各自負責範圍

| 角色 | 目錄 | 說明 |
|------|------|------|
| 後端 / AI | `backend/` | 盡量不動 `frontend/` |
| 前端 / 介面（PM） | `frontend/` | 盡量不動 `backend/` |
| 共用契約 | API 型別 | 改 `backend/app/models/comic.py` 或 `frontend/src/lib/api.ts` 時，另一方要同步 |

## 安裝本地保護（強烈建議）

專案內含 pre-push hook，可在**本機**擋住直接 push 到 main。
Clone 後請執行一次：

```bash
git config core.hooksPath .githooks
```

之後若嘗試 `git push` 到 main 會被擋下，提醒你開分支。

## 環境變數

- 切勿提交含真實金鑰的 `.env`。只提交 `.env.example`。
- 後端：`backend/.env`；前端：`frontend/.env.local`。
