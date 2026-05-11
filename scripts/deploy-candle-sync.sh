#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════
# deploy-candle-sync.sh
# Phase 9 (DATA-01) — Cloud Run Job 3개 + Cloud Scheduler 2개 배포
#
# RESEARCH §5.1 채택: Job 3개 분리 (daily/recover/backfill 동일 이미지, default MODE 분리)
# RESEARCH §5.2: task-timeout daily=300s / recover=900s / backfill=10800s
# RESEARCH §5.3: memory daily/recover=512Mi / backfill=1Gi
# RESEARCH §7 T-09-04: --oauth-service-account-email 사용 (OIDC 금지)
# ═══════════════════════════════════════════════════════════════

# Section 1: 가드 (master-sync 미러)
EXPECTED_PROJECT="${GCP_PROJECT_ID:-}"
EXPECTED_CONFIG="gh-radar"

if [[ -z "$EXPECTED_PROJECT" ]]; then
  echo "ERROR: GCP_PROJECT_ID env var is required" >&2
  exit 1
fi

ACTIVE_CONFIG=$(gcloud config configurations list --filter='IS_ACTIVE=true' --format='value(name)')
ACTIVE_PROJECT=$(gcloud config get-value project 2>/dev/null || true)

if [[ "$ACTIVE_CONFIG" != "$EXPECTED_CONFIG" ]] || [[ "$ACTIVE_PROJECT" != "$EXPECTED_PROJECT" ]]; then
  echo "ERROR: gcloud config mismatch" >&2
  exit 1
fi

# 선행 SA 검증
for SA in gh-radar-scheduler-sa gh-radar-candle-sync-sa; do
  SA_EMAIL="${SA}@${EXPECTED_PROJECT}.iam.gserviceaccount.com"
  if ! gcloud iam service-accounts describe "$SA_EMAIL" >/dev/null 2>&1; then
    echo "ERROR: SA '$SA' not found. Run: bash scripts/setup-candle-sync-iam.sh" >&2
    exit 1
  fi
done

echo "✓ gcloud guard + SA check"

# Section 2: 변수
REGION=asia-northeast3
REPO=gh-radar
SHA=$(git rev-parse --short HEAD)
REGISTRY="${REGION}-docker.pkg.dev/${EXPECTED_PROJECT}/${REPO}"
IMAGE="${REGISTRY}/candle-sync:${SHA}"
IMAGE_LATEST="${REGISTRY}/candle-sync:latest"

: "${SUPABASE_URL:?SUPABASE_URL must be set (export or source .env.deploy)}"

echo "✓ variables: SHA=$SHA, IMAGE=$IMAGE"

# Section 3: Build (amd64 강제, GIT_SHA 주입)
echo "▶ docker build..."
docker build \
  --platform=linux/amd64 \
  --build-arg "GIT_SHA=${SHA}" \
  -f workers/candle-sync/Dockerfile \
  -t "$IMAGE" \
  -t "$IMAGE_LATEST" \
  .

# Section 4: Push
echo "▶ docker push..."
docker push "$IMAGE"
docker push "$IMAGE_LATEST"

# Section 5: Deploy 3 Cloud Run Jobs (동일 이미지, mode 별 default env + 자원 분리)
RUNTIME_SA="gh-radar-candle-sync-sa@${EXPECTED_PROJECT}.iam.gserviceaccount.com"
COMMON_ENV="^@^SUPABASE_URL=${SUPABASE_URL}@KRX_BASE_URL=https://data-dbg.krx.co.kr/svc/apis@LOG_LEVEL=info@APP_VERSION=${SHA}"
COMMON_SECRETS="KRX_AUTH_KEY=gh-radar-krx-auth-key:latest,SUPABASE_SERVICE_ROLE_KEY=gh-radar-supabase-service-role:latest"

deploy_job() {
  local job="$1" mode="$2" timeout="$3" memory="$4"
  echo "▶ deploying Cloud Run Job: $job (MODE=$mode, timeout=$timeout, memory=$memory)..."
  gcloud run jobs deploy "$job" \
    --image="$IMAGE" \
    --region="$REGION" \
    --service-account="$RUNTIME_SA" \
    --cpu=1 \
    --memory="$memory" \
    --task-timeout="$timeout" \
    --max-retries=0 \
    --parallelism=1 \
    --tasks=1 \
    --set-env-vars="${COMMON_ENV}@MODE=${mode}" \
    --set-secrets="$COMMON_SECRETS"

  # T-09-04: Scheduler SA → Job invoker (리소스 단위 바인딩, 프로젝트 단위 금지)
  gcloud run jobs add-iam-policy-binding "$job" \
    --region="$REGION" \
    --member="serviceAccount:gh-radar-scheduler-sa@${EXPECTED_PROJECT}.iam.gserviceaccount.com" \
    --role=roles/run.invoker >/dev/null
  echo "✓ run.invoker bound: gh-radar-scheduler-sa → $job"
}

# RESEARCH §5.2 / §5.3
deploy_job "gh-radar-candle-sync-daily"    "daily"    "300s"   "512Mi"
deploy_job "gh-radar-candle-sync-recover"  "recover"  "900s"   "512Mi"
deploy_job "gh-radar-candle-sync-backfill" "backfill" "10800s" "1Gi"

# Section 6: Cloud Scheduler 2개 — eod (daily) + recover
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

# D-09: 1차 cron 30 17 * * 1-5 (EOD 17:00 + 30분 마진, R1 가설 의존)
create_or_update_scheduler \
  "gh-radar-candle-sync-eod" \
  "gh-radar-candle-sync-daily" \
  "30 17 * * 1-5"

# D-09: 2차 cron 10 8 * * 1-5 (KRX 갱신 08:00 + 10분 마진, R1 fallback)
create_or_update_scheduler \
  "gh-radar-candle-sync-recover" \
  "gh-radar-candle-sync-recover" \
  "10 8 * * 1-5"

# Section 7: 완료
echo ""
echo "✓ Deployed 3 Jobs + 2 Schedulers @ $IMAGE"
echo "  - gh-radar-candle-sync-daily    (cron 30 17 * * 1-5, KST)"
echo "  - gh-radar-candle-sync-recover  (cron 10 8  * * 1-5, KST)"
echo "  - gh-radar-candle-sync-backfill (수동 execute — Plan 06 Task 3)"
echo ""
echo "Next: bash scripts/smoke-candle-sync.sh (post-deploy verification)"
