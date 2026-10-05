# 正式部署（GCP）

所有正式服務都由本目錄的腳本建立與更新；雲端上不應有「只存在 console、repo 裡沒有」的設定。

## 架構

```
瀏覽器 ──HTTPS──▶ Cloud Run  agetech-frontend   (frontend/Dockerfile，Next.js standalone)
   │
   └──HTTPS──▶ Cloud Run  agetech-backend    (backend/Dockerfile，FastAPI)
                   │  Direct VPC egress（private-ranges-only）
                   ├──▶ GCE VM  agetech-pb  10.140.0.x:8090   PocketBase（日記 DB＋圖檔）
                   └──▶ Vertex AI  gemini-3-flash-preview（備援 2.5-flash）寫故事 → gemini-3-pro-image 生圖
```

| 元件 | GCP 資源 | repo 來源 |
|---|---|---|
| 前端 | Cloud Run `agetech-frontend`（SA `agetech-frontend@`，無任何角色） | `frontend/`、`frontend/Dockerfile` |
| 後端 | Cloud Run `agetech-backend`（SA `agetech-backend@`：`roles/aiplatform.user`＋讀密碼 secret） | `backend/`、`backend/Dockerfile` |
| 資料庫／圖檔 | VM `agetech-pb`（e2-small、Debian 12、20GB、固定內網 IP `agetech-pb-internal`、8090 只開給 default 子網（防火牆 `agetech-pb-internal-8090`）、SSH 只允許經 IAP（`agetech-pb-ssh-iap`／`-deny`）、無 SA） | `pocketbase/pb_migrations/`、`deploy/gcp/pb_vm_setup.sh` |
| 備份 | 磁碟每日快照 `agetech-pb-daily`（保留 14 天）＋每次部署前 `/opt/pocketbase/backups/` tar（保留 10 份） | `deploy/gcp/deploy.sh` |
| 密碼 | Secret Manager `agetech-pb-admin-password`（自動產生，不落地） | `deploy/gcp/deploy.sh` |
| 映像 | Artifact Registry `asia-east1/agetech`，tag＝git commit | `deploy/gcp/deploy.sh` |

- PocketBase 不對外：瀏覽器拿到的圖檔網址是後端的 `/api/files/...`（`backend/app/api/files.py` 代理，只轉發檔案 GET）。
- 正式環境 `ENV=prod`：`X-Debug-User` 無效；`IMAGE_GEN_FALLBACK=false`，生圖失敗時前端顯示「再試一次」。
- CORS 只允許前端網址。
- 生成上限（LINE 驗證上線前的費用防護）：每 IP 每小時 10 次、每執行個體每小時 60 次，超過回 429；後端最多 3 個執行個體（每個同時 10 個請求），即每小時最多約 180 次生圖。來源 IP 取 `X-Forwarded-For` 最後一個值（直連 `run.app` 時為真實來源）；**若之後前面加 HTTPS Load Balancer／自訂網域，要改 `backend/app/core/rate_limit.py` 的 `_client_ip`**（最後一個會變成 LB）。
- 生圖原檔（PNG 約 7MB）存成 WebP（約 0.8MB）。

## 網址

```bash
deploy/gcp/deploy.sh urls
# 前端：https://agetech-frontend-492093083442.asia-east1.run.app
# 後端：https://agetech-backend-492093083442.asia-east1.run.app
```

## 部署

需要：`gcloud`（已登入，專案 owner/editor）、`docker`。**請從乾淨的 `main` 部署**（映像 tag 會帶 commit，有未提交改動時加 `-dirty`）。

```bash
git checkout main && git pull
deploy/gcp/deploy.sh all        # 首次：infra → pb → backend → frontend
deploy/gcp/deploy.sh pb         # 改了 pocketbase/pb_migrations/ 時（會先停服務並備份）
deploy/gcp/deploy.sh backend    # 改了 backend/
deploy/gcp/deploy.sh frontend   # 改了 frontend/ 或 shared/
```

檢查目前上線的版本：

```bash
gcloud run services describe agetech-backend --region asia-east1 --format='value(metadata.labels.commit)'
```

## 維運

```bash
# PocketBase 狀態／log
gcloud compute ssh agetech-pb --zone asia-east1-b --tunnel-through-iap --command='systemctl status pocketbase; journalctl -u pocketbase -n 50'
# PocketBase Admin UI（經 SSH tunnel，不對外開放）
gcloud compute ssh agetech-pb --zone asia-east1-b --tunnel-through-iap -- -L 8090:127.0.0.1:8090   # 再開 http://localhost:8090/_/
gcloud secrets versions access latest --secret=agetech-pb-admin-password     # 帳號 admin@agetech.app
# 後端 log
gcloud run services logs read agetech-backend --region asia-east1 --limit 50
# 回滾到上一版
gcloud run revisions list --service agetech-backend --region asia-east1
gcloud run services update-traffic agetech-backend --region asia-east1 --to-revisions=<REVISION>=100
```

## 尚未涵蓋

- 檔案代理尚未支援 HTTP Range；之後接上旁白音檔（iOS `<audio>` 需要 Range）時要補。
- 使用者身分：目前前端以 localStorage 的 user id 呼叫 API（與本機相同）；LINE Login / LIFF token 驗證（api-contract §4）尚未實作，`/me/diaries` 在正式環境會回 401。
- LINE Bot webhook：未設定 channel 憑證，`POST /webhook` 回 503。
- 自訂網域與 CI 自動部署：目前以腳本手動部署。
