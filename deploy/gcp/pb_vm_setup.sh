#!/usr/bin/env bash
# 在 PocketBase VM 上執行（由 deploy.sh pb 以 sudo 呼叫）。可重複執行。
#   用法：pb_vm_setup.sh <PB_VERSION> <ADMIN_EMAIL>   （superuser 密碼由 stdin 傳入）
# - 安裝／升級 PocketBase 執行檔到 /opt/pocketbase
# - 停服務 → 備份 pb_data → 同步 pb_migrations → upsert superuser → 啟動（serve 時自動套用 migrations）
set -euo pipefail

PB_VERSION="$1"
ADMIN_EMAIL="$2"
IFS= read -r ADMIN_PW || true   # 密碼沒有結尾換行時 read 回 1，但值已讀到
[ -n "$ADMIN_PW" ] || { echo "缺少 superuser 密碼（stdin）" >&2; exit 1; }

STAGING="$(cd "$(dirname "$0")" && pwd)"
ROOT=/opt/pocketbase
BIN="$ROOT/pocketbase"

if ! command -v unzip >/dev/null || ! command -v curl >/dev/null || ! command -v sqlite3 >/dev/null; then
  DEBIAN_FRONTEND=noninteractive apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq unzip curl sqlite3 >/dev/null
fi
id pocketbase >/dev/null 2>&1 || useradd --system --home "$ROOT" --shell /usr/sbin/nologin pocketbase
mkdir -p "$ROOT/pb_data" "$ROOT/pb_migrations" "$ROOT/backups"

if [ ! -x "$BIN" ] || ! "$BIN" --version | grep -q "$PB_VERSION"; then
  echo "安裝 PocketBase v$PB_VERSION"
  tmp="$(mktemp -d)"
  curl -fsSL -o "$tmp/pb.zip" \
    "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.zip"
  unzip -q -o "$tmp/pb.zip" pocketbase -d "$tmp"
  install -m 0755 "$tmp/pocketbase" "$BIN"
  rm -rf "$tmp"
fi

cat > /etc/systemd/system/pocketbase.service <<EOF
[Unit]
Description=PocketBase (AgeTech Comic)
After=network-online.target
Wants=network-online.target

[Service]
User=pocketbase
Group=pocketbase
WorkingDirectory=$ROOT
ExecStart=$BIN serve --http=0.0.0.0:8090 --dir=$ROOT/pb_data --migrationsDir=$ROOT/pb_migrations
Restart=always
RestartSec=3
LimitNOFILE=4096
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=$ROOT
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload

systemctl stop pocketbase 2>/dev/null || true
if [ -f "$ROOT/pb_data/data.db" ]; then
  ts="$(date -u +%Y%m%dT%H%M%SZ)"
  tar czf "$ROOT/backups/pb_data-$ts.tgz" -C "$ROOT" pb_data
  ls -1t "$ROOT"/backups/pb_data-*.tgz | tail -n +11 | xargs -r rm -f   # 保留最近 10 份
  echo "已備份 backups/pb_data-$ts.tgz"
fi

rm -f "$ROOT"/pb_migrations/*.js
install -m 0644 "$STAGING"/*.js "$ROOT/pb_migrations/"
chown -R pocketbase:pocketbase "$ROOT"

sudo -u pocketbase "$BIN" superuser upsert "$ADMIN_EMAIL" "$ADMIN_PW" --dir="$ROOT/pb_data" >/dev/null
systemctl enable --now pocketbase >/dev/null 2>&1
systemctl restart pocketbase

for _ in $(seq 1 30); do
  curl -fsS http://127.0.0.1:8090/api/health >/dev/null 2>&1 && break
  sleep 1
done
curl -fsS http://127.0.0.1:8090/api/health && echo
echo "已套用 migrations：$(sqlite3 "$ROOT/pb_data/data.db" "select group_concat(file, ', ') from _migrations where file like '17%';")"
rm -rf "$STAGING"
