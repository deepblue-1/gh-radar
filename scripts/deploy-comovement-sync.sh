#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════
# deploy-comovement-sync.sh
# Phase 11 (COMV-01) — Cloud Run Job 1개 + Cloud Scheduler 1개 배포
#
# candle-sync 1:1 복제 + 변경점 (11-04-PLAN.md / 11-RESEARCH §워커/배포):
#   - Job 1개 (gh-radar-comovement-sync, 단일 cycle — MODE 없음)
#   - Scheduler 1개 야간 — EOD candle-sync 이후 다음날 새벽 (전 영업일 데이터 확정)
#   - task-timeout = 180s (11-CALIBRATION.md 확정 — 실측 ~25s ×7 마진, DB 천장 600s 하위)
#   - 외부 secret = supabase-service-role 1개만 (외부 API 키 없음 — 자체 DB 집계, T-11-16)
#   - T-11-14: --oauth-service-account-email 사용 (OIDC 금지)
# ═══════════════════════════════════════════════════════════════

# Section 1: 가드 (candle-sync 미러)
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
for SA in gh-radar-scheduler-sa gh-radar-comovement-sync-sa; do
  SA_EMAIL="${SA}@${EXPECTED_PROJECT}.iam.gserviceaccount.com"
  if ! gcloud iam service-accounts describe "$SA_EMAIL" >/dev/null 2>&1; then
    echo "ERROR: SA '$SA' not found. Run: bash scripts/setup-comovement-sync-iam.sh" >&2
    exit 1
  fi
done

echo "✓ gcloud guard + SA check"

# Section 2: 변수
REGION=asia-northeast3
REPO=gh-radar
SHA=$(git rev-parse --short HEAD)
REGISTRY="${REGION}-docker.pkg.dev/${EXPECTED_PROJECT}/${REPO}"
IMAGE="${REGISTRY}/co-movement-sync:${SHA}"
IMAGE_LATEST="${REGISTRY}/co-movement-sync:latest"

: "${SUPABASE_URL:?SUPABASE_URL must be set (export or source .env.deploy)}"

echo "✓ variables: SHA=$SHA, IMAGE=$IMAGE"

# Section 3: Build (amd64 강제, GIT_SHA 주입)
echo "▶ docker build..."
docker build \
  --platform=linux/amd64 \
  --build-arg "GIT_SHA=${SHA}" \
  -f workers/co-movement-sync/Dockerfile \
  -t "$IMAGE" \
  -t "$IMAGE_LATEST" \
  .

# Section 4: Push
echo "▶ docker push..."
docker push "$IMAGE"
docker push "$IMAGE_LATEST"

# Section 5: Deploy 1 Cloud Run Job (단일 cycle — MODE 없음)
RUNTIME_SA="gh-radar-comovement-sync-sa@${EXPECTED_PROJECT}.iam.gserviceaccount.com"
COMMON_ENV="^@^SUPABASE_URL=${SUPABASE_URL}@LOG_LEVEL=info@APP_VERSION=${SHA}@LOOKBACK_MONTHS=24"
COMMON_SECRETS="SUPABASE_SERVICE_ROLE_KEY=gh-radar-supabase-service-role:latest"

deploy_job() {
  local job="$1" timeout="$2" memory="$3"
  echo "▶ deploying Cloud Run Job: $job (timeout=$timeout, memory=$memory)..."
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
    --set-env-vars="${COMMON_ENV}" \
    --set-secrets="$COMMON_SECRETS"

  # T-11-14: Scheduler SA → Job invoker (리소스 단위 바인딩, 프로젝트 단위 금지)
  gcloud run jobs add-iam-policy-binding "$job" \
    --region="$REGION" \
    --member="serviceAccount:gh-radar-scheduler-sa@${EXPECTED_PROJECT}.iam.gserviceaccount.com" \
    --role=roles/run.invoker >/dev/null
  echo "✓ run.invoker bound: gh-radar-scheduler-sa → $job"
}

# 11-CALIBRATION.md: task-timeout 180s, memory 512Mi
deploy_job "gh-radar-comovement-sync" "180s" "512Mi"

# Section 6: Cloud Scheduler 1개 — 야간 (EOD candle-sync 이후 다음날 새벽)
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

# RESEARCH §Open Q 3 권고: 다음날 새벽 (화~토) — 전 영업일 EOD candle-sync 데이터 확정 후 재집계
create_or_update_scheduler \
  "gh-radar-comovement-sync-nightly" \
  "gh-radar-comovement-sync" \
  "0 2 * * 2-6"

# Section 7: 완료
echo ""
echo "✓ Deployed 1 Job + 1 Scheduler @ $IMAGE"
echo "  - gh-radar-comovement-sync          (Job, task-timeout 180s, single cycle)"
echo "  - gh-radar-comovement-sync-nightly  (Scheduler, cron 0 2 * * 2-6, KST)"
echo ""
echo "Next: bash scripts/smoke-comovement-sync.sh (post-deploy verification)"
