#!/usr/bin/env bash
# AgeTech Comic 正式部署（GCP）。可重複執行（idempotent）。
#
#   deploy/gcp/deploy.sh all        # 首次：基礎設施 + PocketBase VM + 後端 + 前端
#   deploy/gcp/deploy.sh pb         # 只更新 PocketBase（同步 pb_migrations 並重啟）
#   deploy/gcp/deploy.sh backend    # 只重建／部署後端
#   deploy/gcp/deploy.sh frontend   # 只重建／部署前端
#
# 架構見 deploy/gcp/README.md。需要：gcloud（已登入、有專案 owner/editor）、docker。
set -euo pipefail

PROJECT="${PROJECT:-gen-lang-client-0048129386}"
REGION="${REGION:-asia-east1}"
ZONE="${ZONE:-asia-east1-b}"
PB_VERSION="${PB_VERSION:-0.39.7}"   # 與 pocketbase/Dockerfile 一致

AR_REPO="agetech"
REGISTRY="${REGION}-docker.pkg.dev/${PROJECT}/${AR_REPO}"
BACKEND_SVC="agetech-backend"
FRONTEND_SVC="agetech-frontend"
BACKEND_SA="agetech-backend@${PROJECT}.iam.gserviceaccount.com"
FRONTEND_SA="agetech-frontend@${PROJECT}.iam.gserviceaccount.com"
PB_VM="agetech-pb"
PB_IP_NAME="agetech-pb-internal"
PB_SNAPSHOT_POLICY="agetech-pb-daily"
PB_PASSWORD_SECRET="agetech-pb-admin-password"
PB_ADMIN_EMAIL="admin@agetech.app"
VERTEX_IMAGE_MODEL="${VERTEX_IMAGE_MODEL:-gemini-3-pro-image}"

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TAG="$(git -C "$ROOT" rev-parse --short HEAD)$(git -C "$ROOT" diff --quiet HEAD -- . ':!deploy' || echo -dirty)"
G="gcloud --project=${PROJECT} --quiet"
# PocketBase VM 的 SSH 只允許經 IAP（見 infra 的防火牆規則）
SSH="$G compute ssh $PB_VM --zone=$ZONE --tunnel-through-iap"

log() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }

project_number() { $G projects describe "$PROJECT" --format='value(projectNumber)'; }
backend_url() { echo "https://${BACKEND_SVC}-$(project_number).${REGION}.run.app"; }
frontend_url() { echo "https://${FRONTEND_SVC}-$(project_number).${REGION}.run.app"; }
pb_internal_ip() { $G compute addresses describe "$PB_IP_NAME" --region="$REGION" --format='value(address)'; }

ensure_sa() { # name display
  $G iam service-accounts describe "$1@${PROJECT}.iam.gserviceaccount.com" >/dev/null 2>&1 \
    || $G iam service-accounts create "$1" --display-name="$2"
}

infra() {
  log "啟用 API"
  $G services enable run.googleapis.com compute.googleapis.com artifactregistry.googleapis.com \
    secretmanager.googleapis.com aiplatform.googleapis.com iap.googleapis.com

  log "Artifact Registry：${AR_REPO}"
  $G artifacts repositories describe "$AR_REPO" --location="$REGION" >/dev/null 2>&1 \
    || $G artifacts repositories create "$AR_REPO" --repository-format=docker --location="$REGION" \
         --description="AgeTech Comic images"
  gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet >/dev/null

  log "Service accounts（最小權限，不用預設 compute SA）"
  ensure_sa agetech-backend "AgeTech Comic backend (Cloud Run)"
  ensure_sa agetech-frontend "AgeTech Comic frontend (Cloud Run)"
  $G projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:${BACKEND_SA}" \
    --role=roles/aiplatform.user --condition=None >/dev/null

  log "Secret：PocketBase superuser 密碼"
  if ! $G secrets describe "$PB_PASSWORD_SECRET" >/dev/null 2>&1; then
    $G secrets create "$PB_PASSWORD_SECRET" --replication-policy=automatic
    openssl rand -base64 33 | tr -d '\n/+=' | head -c 40 \
      | $G secrets versions add "$PB_PASSWORD_SECRET" --data-file=-
  fi
  $G secrets add-iam-policy-binding "$PB_PASSWORD_SECRET" --member="serviceAccount:${BACKEND_SA}" \
    --role=roles/secretmanager.secretAccessor >/dev/null

  log "PocketBase VM：${PB_VM}（只開內網 8090；資料在 VM 磁碟、每日快照）"
  $G compute addresses describe "$PB_IP_NAME" --region="$REGION" >/dev/null 2>&1 \
    || $G compute addresses create "$PB_IP_NAME" --region="$REGION" --subnet=default
  $G compute resource-policies describe "$PB_SNAPSHOT_POLICY" --region="$REGION" >/dev/null 2>&1 \
    || $G compute resource-policies create snapshot-schedule "$PB_SNAPSHOT_POLICY" --region="$REGION" \
         --daily-schedule --start-time=18:00 --max-retention-days=14 --on-source-disk-delete=keep-auto-snapshots
  # SSH 只開 IAP 來源：專案預設的 default-allow-ssh 對 0.0.0.0/0 開 22，
  # 以較高優先序（數字較小）的規則覆蓋 agetech-pb 標籤的 VM。8090 沒有任何對外規則。
  $G compute firewall-rules describe agetech-pb-ssh-iap >/dev/null 2>&1 \
    || $G compute firewall-rules create agetech-pb-ssh-iap --network=default --direction=INGRESS \
         --priority=800 --action=ALLOW --rules=tcp:22 --source-ranges=35.235.240.0/20 --target-tags=agetech-pb
  $G compute firewall-rules describe agetech-pb-ssh-deny >/dev/null 2>&1 \
    || $G compute firewall-rules create agetech-pb-ssh-deny --network=default --direction=INGRESS \
         --priority=900 --action=DENY --rules=tcp:22 --source-ranges=0.0.0.0/0 --target-tags=agetech-pb
  if ! $G compute instances describe "$PB_VM" --zone="$ZONE" >/dev/null 2>&1; then
    $G compute instances create "$PB_VM" --zone="$ZONE" --machine-type=e2-small \
      --image-family=debian-12 --image-project=debian-cloud \
      --boot-disk-size=20GB --boot-disk-type=pd-balanced \
      --private-network-ip="$(pb_internal_ip)" --subnet=default \
      --no-service-account --no-scopes --shielded-secure-boot --tags=agetech-pb \
      --labels=app=agetech-comic,role=pocketbase
    $G compute disks add-resource-policies "$PB_VM" --zone="$ZONE" \
      --resource-policies="$PB_SNAPSHOT_POLICY" --region="$REGION" 2>/dev/null \
      || $G compute disks add-resource-policies "$PB_VM" --zone="$ZONE" --resource-policies="$PB_SNAPSHOT_POLICY"
    log "等待 VM 開機"
    for _ in $(seq 1 30); do
      $SSH --command=true >/dev/null 2>&1 && break
      sleep 5
    done
  fi
  # 既有 VM 補上標籤（讓上面的 SSH 規則生效）
  $G compute instances add-tags "$PB_VM" --zone="$ZONE" --tags=agetech-pb >/dev/null
}

pb() {
  log "PocketBase：安裝 v${PB_VERSION}、同步 migrations、重啟"
  local tmp
  tmp="$(mktemp -d)"
  cp "$ROOT"/pocketbase/pb_migrations/*.js "$ROOT/deploy/gcp/pb_vm_setup.sh" "$tmp/"
  $SSH --command="rm -rf ~/pb_staging && mkdir -p ~/pb_staging"
  $G compute scp "$tmp"/* "$PB_VM:~/pb_staging/" --zone="$ZONE" --tunnel-through-iap
  rm -rf "$tmp"
  # 密碼走 stdin，不出現在指令列／process list
  $G secrets versions access latest --secret="$PB_PASSWORD_SECRET" \
    | $SSH --command="sudo bash ~/pb_staging/pb_vm_setup.sh '${PB_VERSION}' '${PB_ADMIN_EMAIL}'"
}

build_push() { # name dockerfile context [build-args...]
  local name="$1" dockerfile="$2" ctx="$3"; shift 3
  local image="${REGISTRY}/${name}:${TAG}"
  log "build ${image}" >&2
  docker build --platform=linux/amd64 -f "$dockerfile" "$@" -t "$image" "$ctx" >&2
  docker push -q "$image" >&2
  echo "$image"
}

backend() {
  local image pbip
  image="$(build_push backend "$ROOT/backend/Dockerfile" "$ROOT/backend")"
  pbip="$(pb_internal_ip)"
  log "deploy ${BACKEND_SVC}"
  $G run deploy "$BACKEND_SVC" --region="$REGION" --image="$image" \
    --service-account="$BACKEND_SA" --allow-unauthenticated \
    --network=default --subnet=default --vpc-egress=private-ranges-only \
    --cpu=1 --memory=1Gi --concurrency=40 --timeout=300 --min-instances=0 --max-instances=5 \
    --set-env-vars="^|^ENV=prod|DEBUG=false|VERTEX_PROJECT=${PROJECT}|VERTEX_LOCATION=global|VERTEX_IMAGE_MODEL=${VERTEX_IMAGE_MODEL}|IMAGE_GEN_FALLBACK=false|PERSIST_DIARIES=true|POCKETBASE_URL=http://${pbip}:8090|POCKETBASE_PUBLIC_URL=$(backend_url)|POCKETBASE_ADMIN_EMAIL=${PB_ADMIN_EMAIL}|CORS_ORIGINS=[\"$(frontend_url)\"]" \
    --set-secrets="POCKETBASE_ADMIN_PASSWORD=${PB_PASSWORD_SECRET}:latest" \
    --labels="app=agetech-comic,commit=${TAG}"
  curl -fsS "$(backend_url)/health" && echo
}

frontend() {
  local image
  image="$(build_push frontend "$ROOT/frontend/Dockerfile" "$ROOT" \
    --build-arg "NEXT_PUBLIC_API_BASE_URL=$(backend_url)" --build-arg NEXT_PUBLIC_USE_MOCK=false)"
  log "deploy ${FRONTEND_SVC}"
  $G run deploy "$FRONTEND_SVC" --region="$REGION" --image="$image" \
    --service-account="$FRONTEND_SA" --allow-unauthenticated \
    --cpu=1 --memory=512Mi --concurrency=80 --timeout=60 --min-instances=0 --max-instances=5 \
    --labels="app=agetech-comic,commit=${TAG}"
  curl -fsS -o /dev/null -w "frontend %{http_code}\n" "$(frontend_url)/"
}

case "${1:-}" in
  infra) infra ;;
  pb) pb ;;
  backend) backend ;;
  frontend) frontend ;;
  all) infra; pb; backend; frontend
       log "完成"; echo "前端：$(frontend_url)"; echo "後端：$(backend_url)" ;;
  urls) echo "前端：$(frontend_url)"; echo "後端：$(backend_url)" ;;
  *) sed -n '2,9p' "$0"; exit 1 ;;
esac
