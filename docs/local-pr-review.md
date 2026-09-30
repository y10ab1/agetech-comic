# 本機 OpenCode 自動審查 PR

## 觸發方式

GitHub Actions 的 `Local OpenCode PR review` workflow 在 PR 開啟、有新 commit、
重新開啟、或 Draft 轉 Ready 時觸發。**沒有 repo 輪詢排程**。

本機 self-hosted runner 主動連 GitHub 等待工作；不需 webhook server 或入站 port。
本機離線時工作會等待 runner 上線（受 GitHub job 排隊期限限制）。

只處理以本 repo 為 base 的非 Draft PR，且作者為 OWNER / MEMBER / COLLABORATOR，
並由 API 再確認目前有 write / maintain / admin 權限；允許這些協作者從 fork 開 PR。
`pull_request_target` 使用 base branch 的 workflow，執行本機已安裝的 controller，
不 checkout 或執行 PR 提供的 workflow/controller。

## 審查與發布

- 用本機 `~/.opencode/bin/opencode` 與既有模型憑證；模型固定為
  `amazon-bedrock/global.openai.gpt-6-astra`。
- 每次建立新的 OpenCode session 和獨立 checkout，不影響開發工作目錄。
- 收集完整 diff、PR 討論、既有 reviews、開啟中及 PR body 引用的 issues。
- OpenCode 的工具僅允許工作目錄內的讀檔搜尋。停用 project config、外部 plugins、
  外部 skills、LSP、formatter、session sharing 和 snapshot。
- 前端變更在無 host 憑證的 Node Docker container 執行 npm ci、lint、build、tsc。
  後端變更在 Python container 執行 pytest；shared 變更兩者皆跑。
  Controller 變更執行 Python unittest。容器不掛 Docker socket 或 host home。
- OpenCode 產出 JSON 結果，controller 嚴格驗證後發布正式 GitHub review。
  結論由 controller 依 findings 決定：有任何 P1/P2 → REQUEST_CHANGES（即使部分驗證未完成）；
  無 P1/P2、檢查通過且驗證完成 → APPROVE（可附 P3 建議）；其餘 → COMMENT。
  模型錯誤、JSON 不完整或執行中斷會讓 job 失敗，不會 approve。
- 以本機 `gh` 的登入帳號發布。GitHub 不允許自我 approve / request changes，
  因此自己開的 PR 一律以 COMMENT 發布。
- 發布前重查 PR 的 open/draft、head 和 base SHA；版本已變則丟棄結果。
  Review 明確綁定 `commit_id`。同一 head/base 的已完成自動審查不重複發布。
- 不自動 merge PR；issues 僅提供審查上下文，不會自動關閉或修改。

## 安裝／更新本機 controller

Linux x64、Python 3.12+、Git、gh、Docker，以及本機 OpenCode 必須已安裝。
先確認 `gh auth status` 和模型可以使用，再從**已確認可信的版本**執行：

```bash
python3 scripts/pr-review/install.py
```

Installer 會下載並驗 SHA-256 的 runner、以短效 registration token 註冊至本 repo，
安裝 user-level systemd service，並複製 controller/config/prompt 到：

```text
~/.local/share/agetech-pr-review/
```

無 GitHub token 或模型金鑰寫入 repo。Service 使用同一使用者的 HOME 與明確 PATH。
登出後仍要運作需啟用 user lingering：`loginctl enable-linger "$USER"`。

Controller/config/prompt 的更新需重新執行 installer 才會套用，避免 PR 自行改寫正在審查它的程式。
每個 job 都啟動新的 OpenCode，因此下個 job 即採用新設定；已開啟的互動 OpenCode session
不會熱載入設定，需要退出後重啟。

## 操作

```bash
# 狀態／日誌
systemctl --user status agetech-opencode-runner
journalctl --user -u agetech-opencode-runner -n 80

# 手動觸發既有 PR（例如部署時補審 #11）
gh workflow run opencode-review.yml --repo y10ab1/agetech-comic -f pr_number=11

# 暫停／恢復
systemctl --user stop agetech-opencode-runner
systemctl --user start agetech-opencode-runner

# 停用開機啟動
systemctl --user disable --now agetech-opencode-runner
```

Actions 頁面顯示 job 狀態與發布的 review URL。完整模型輸出、檢查日誌與 review JSON
僅存於本機 `~/.local/share/agetech-pr-review/jobs/`；原始碼 checkout 在完成後清除。
模型或測試環境修好後可以手動重跑；驗證未完成的審查（包含 REQUEST_CHANGES）不會阻擋同一版本再次審查。

## 驗證 controller

```bash
python3 -m unittest discover -s scripts/pr-review -p 'test_*.py' -v

# 真實資料與模型的完整演練，但不發布 review
REVIEW_PR=11 REVIEW_DRY_RUN=1 python3 scripts/pr-review/review.py
```

涵蓋 draft/作者過濾、協作者 fork、SHA 變更、重複 review、模型錯誤與截斷輸出、
不合法 findings、P1/P2 一律 request changes、驗證失敗禁止 approve、自我 review 降為 COMMENT。
