#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════
# deploy-limitup-sync.sh
# Phase 28 D-14 — 밤 export 적재 Job 1 + Scheduler 1 + 실패 알림 정책
#
# 선례 = Phase 12 상한가 이력 워커 배포 스크립트(Section 1~7 · deploy_job · Scheduler 함수)
#        + Phase 11 동조 워커 배포 스크립트의 알림 정책 단계.
# 차이 (28-08-PLAN / 28-RESEARCH §E-3):
#   - GCS 볼륨 마운트(읽기 전용 · gen2) — gs://gh-radar-limitup-export → /mnt/export,
#     워커 env LIMITUP_EXPORT_DIR=/mnt/export/export (버킷 접두 export/ — radar-gw 운반기가 올린다)
#   - Scheduler 평일 21:20 KST (radar-gw 운반 21:00 KST 뒤)
#   - task-timeout 1800s · memory 1Gi (첫 run 은 GCS 의 전 날짜를 한 번에 적재)
#   - 실패 실행 알림 정책 gh-radar-limitup-sync-failure (D-20 — 3회 연속 skip · 예외 = 종료 1)
#   - --oauth-service-account-email 사용 (OIDC 금지 — Cloud Run Admin API 호출)
#
# 필수 env: GCP_PROJECT_ID · SUPABASE_URL (없으면 시작부터 실패)
#           NOTIFICATION_CHANNEL_ID (없으면 마지막 알림 단계만 실패 — Job · Scheduler 는 이미 반영됨)
# 선행: bash scripts/setup-limitup-sync-iam.sh (SA · Secret accessor · 버킷 · 버킷 IAM)
# ═══════════════════════════════════════════════════════════════

# Section 1: 가드
EXPECTED_PROJECT="${GCP_PROJECT_ID:-}"
EXPECTED_CONFIG="gh-radar"

if [[ -z "$EXPECTED_PROJECT" ]]; then
  echo "ERROR: GCP_PROJECT_ID env var is required" >&2
  exit 1
fi

: "${SUPABASE_URL:?SUPABASE_URL must be set (export or source .env.deploy)}"

ACTIVE_CONFIG=$(gcloud config configurations list --filter='IS_ACTIVE=true' --format='value(name)')
ACTIVE_PROJECT=$(gcloud config get-value project 2>/dev/null || true)

if [[ "$ACTIVE_CONFIG" != "$EXPECTED_CONFIG" ]] || [[ "$ACTIVE_PROJECT" != "$EXPECTED_PROJECT" ]]; then
  echo "ERROR: gcloud config mismatch" >&2
  exit 1
fi

# 선행 SA 검증
for SA in gh-radar-scheduler-sa gh-radar-limitup-sync-sa; do
  SA_EMAIL="${SA}@${EXPECTED_PROJECT}.iam.gserviceaccount.com"
  if ! gcloud iam service-accounts describe "$SA_EMAIL" >/dev/null 2>&1; then
    echo "ERROR: SA '$SA' not found. Run: bash scripts/setup-limitup-sync-iam.sh" >&2
    exit 1
  fi
done

# 선행 버킷 검증 — 볼륨 마운트 대상이 없으면 Job 이 첫 실행에서 실패한다
BUCKET="gh-radar-limitup-export"
if ! gcloud storage buckets describe "gs://${BUCKET}" >/dev/null 2>&1; then
  echo "ERROR: bucket 'gs://${BUCKET}' not found. Run: bash scripts/setup-limitup-sync-iam.sh 먼저" >&2
  exit 1
fi

echo "✓ gcloud guard + SA + bucket check"

# Section 2: 변수
REGION=asia-northeast3
REPO=gh-radar
SHA=$(git rev-parse --short HEAD)
REGISTRY="${REGION}-docker.pkg.dev/${EXPECTED_PROJECT}/${REPO}"
IMAGE="${REGISTRY}/limitup-sync:${SHA}"
IMAGE_LATEST="${REGISTRY}/limitup-sync:latest"
JOB="gh-radar-limitup-sync"
SCHED="gh-radar-limitup-sync-nightly"
CRON="20 21 * * 1-5"

echo "✓ variables: SHA=$SHA, IMAGE=$IMAGE"

# Section 3: Build (amd64 강제, GIT_SHA 주입)
echo "▶ docker build..."
docker build \
  --platform=linux/amd64 \
  --build-arg "GIT_SHA=${SHA}" \
  -f workers/limitup-sync/Dockerfile \
  -t "$IMAGE" \
  -t "$IMAGE_LATEST" \
  .

# Section 4: Push
echo "▶ docker push..."
docker push "$IMAGE"
docker push "$IMAGE_LATEST"

# Section 5: Deploy Cloud Run Job (GCS 볼륨 읽기 전용 마운트)
RUNTIME_SA="gh-radar-limitup-sync-sa@${EXPECTED_PROJECT}.iam.gserviceaccount.com"
COMMON_ENV="^@^SUPABASE_URL=${SUPABASE_URL}@LOG_LEVEL=info@APP_VERSION=${SHA}@LIMITUP_EXPORT_DIR=/mnt/export/export@LIMITUP_KEEP_DAYS=90@LIMITUP_ALLOC_KEEP_DAYS=30@KIND15_KEEP_DAYS=30"
COMMON_SECRETS="SUPABASE_SERVICE_ROLE_KEY=gh-radar-supabase-service-role:latest"

deploy_job() {
  local job="$1"
  echo "▶ deploying Cloud Run Job: $job (timeout=1800s, memory=1Gi, volume gs://${BUCKET} → /mnt/export ro)..."
  gcloud run jobs deploy "$job" \
    --image="$IMAGE" \
    --region="$REGION" \
    --service-account="$RUNTIME_SA" \
    --cpu=1 \
    --memory=1Gi \
    --task-timeout=1800s \
    --max-retries=0 \
    --parallelism=1 \
    --tasks=1 \
    --execution-environment=gen2 \
    --add-volume=name=export,type=cloud-storage,bucket=gh-radar-limitup-export,readonly=true \
    --add-volume-mount=volume=export,mount-path=/mnt/export \
    --set-env-vars="${COMMON_ENV}" \
    --set-secrets="$COMMON_SECRETS"

  # Scheduler SA → Job invoker (리소스 단위 바인딩, 프로젝트 단위 금지)
  gcloud run jobs add-iam-policy-binding "$job" \
    --region="$REGION" \
    --member="serviceAccount:gh-radar-scheduler-sa@${EXPECTED_PROJECT}.iam.gserviceaccount.com" \
    --role=roles/run.invoker >/dev/null
  echo "✓ run.invoker bound: gh-radar-scheduler-sa → $job"
}

# 첫 run 은 GCS 전 날짜 적재 — 넉넉히 1800s · 1Gi (28-RESEARCH §E-2)
deploy_job "$JOB"

# Section 6: Cloud Scheduler — 평일 21:20 KST (radar-gw 운반기 21:00 KST 뒤)
SCHED_SA="gh-radar-scheduler-sa@${EXPECTED_PROJECT}.iam.gserviceaccount.com"

create_or_update_scheduler() {
  local sched="$1" job="$2" cron="$3"
  local uri="https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${EXPECTED_PROJECT}/jobs/${job}:run"

  if gcloud scheduler jobs describe "$sched" --location="$REGION" >/dev/null 2>&1; then
    echo "▶ scheduler update: $sched (cron $cron → $job)..."
    gcloud scheduler jobs update http "$sched" \
      --location="$REGION" \
      --schedule="$cron" \
      --time-zone="Asia/Seoul" \
      --uri="$uri" \
      --http-method=POST \
      --oauth-service-account-email="$SCHED_SA"
  else
    echo "▶ scheduler create: $sched (cron $cron → $job)..."
    gcloud scheduler jobs create http "$sched" \
      --location="$REGION" \
      --schedule="$cron" \
      --time-zone="Asia/Seoul" \
      --uri="$uri" \
      --http-method=POST \
      --oauth-service-account-email="$SCHED_SA"
  fi
}

# cron "20 21 * * 1-5" Asia/Seoul
create_or_update_scheduler "$SCHED" "$JOB" "$CRON"

# Section 7: Alert policy (idempotent — update-or-create)
ALERT_FILE="ops/alert-limitup-sync-failure.yaml"
ALERT_NAME="gh-radar-limitup-sync-failure"
if [[ -f "$ALERT_FILE" ]]; then
  : "${NOTIFICATION_CHANNEL_ID:?NOTIFICATION_CHANNEL_ID must be set for alert policy}"
  # gcloud monitoring 은 notificationChannels 에 full resource name 을 요구 — ID 만 주어지면 정규화.
  CHANNEL_RESOURCE="$NOTIFICATION_CHANNEL_ID"
  case "$CHANNEL_RESOURCE" in
    projects/*) ;;
    *) CHANNEL_RESOURCE="projects/${EXPECTED_PROJECT}/notificationChannels/${NOTIFICATION_CHANNEL_ID}" ;;
  esac
  RESOLVED_YAML=$(mktemp)
  sed "s|\${NOTIFICATION_CHANNEL_ID}|${CHANNEL_RESOURCE}|g" "$ALERT_FILE" > "$RESOLVED_YAML"

  EXISTING_POLICY=$(gcloud alpha monitoring policies list \
    --filter="displayName=${ALERT_NAME}" \
    --format='value(name)' 2>/dev/null | head -1)

  if [[ -n "$EXISTING_POLICY" ]]; then
    echo "▶ updating alert policy: ${ALERT_NAME}..."
    gcloud alpha monitoring policies update "$EXISTING_POLICY" --policy-from-file="$RESOLVED_YAML" >/dev/null
  else
    echo "▶ creating alert policy: ${ALERT_NAME}..."
    gcloud alpha monitoring policies create --policy-from-file="$RESOLVED_YAML" >/dev/null
  fi
  rm -f "$RESOLVED_YAML"
  echo "✓ Alert policy ready: ${ALERT_NAME}"
else
  echo "ERROR: alert policy file '$ALERT_FILE' not found" >&2
  exit 1
fi

# Section 8: 완료
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "✅ Deployed @ $IMAGE"
echo "   Job:       $JOB (task-timeout 1800s · 1Gi · gen2 · volume gs://${BUCKET} → /mnt/export ro)"
echo "   Scheduler: $SCHED (cron '$CRON' Asia/Seoul)"
echo "   Alert:     $ALERT_NAME"
echo ""
echo "Next: bash scripts/smoke-limitup-sync.sh (post-deploy verification)"
