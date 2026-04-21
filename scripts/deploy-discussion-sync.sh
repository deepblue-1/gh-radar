#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════
# Phase 08 Plan 06 — discussion-sync Cloud Run Job + 단일 Scheduler 배포
#
# 선행: scripts/setup-discussion-sync-iam.sh (SA + Secret + Accessor 3건)
#
# 리소스:
#   - Cloud Run Job: gh-radar-discussion-sync (asia-northeast3, 512Mi, 600s, retries=1)
#   - Image: asia-northeast3-docker.pkg.dev/<proj>/gh-radar/discussion-sync:<sha>
#   - Scheduler: gh-radar-discussion-sync-hourly "0 * * * *" (KST, 매시 정각)
#     ※ CONTEXT D1 — 토론방 24/7 단일 1h 주기 (Phase 7 의 다중 스케줄 분리 미적용)
#
# Scheduler → Cloud Run Job 인증: --oauth-service-account-email 전용
#   (OIDC 금지, Pitfall 2 — Cloud Run Job 호출은 OAuth bearer token 만 허용)
#
# ENV (PIVOT 기준):
#   SUPABASE_URL, BRIGHTDATA_ZONE, BRIGHTDATA_URL, NAVER_DISCUSSION_API_BASE,
#   DISCUSSION_SYNC_DAILY_BUDGET, DISCUSSION_SYNC_CONCURRENCY, DISCUSSION_SYNC_PAGE_SIZE,
#   DISCUSSION_SYNC_BACKFILL_MAX_PAGES, DISCUSSION_SYNC_BACKFILL_DAYS,
#   DISCUSSION_SYNC_INCREMENTAL_HOURS, DISCUSSION_SYNC_INCREMENTAL_MAX_PAGES,
#   LOG_LEVEL, APP_VERSION
# Secrets:
#   SUPABASE_SERVICE_ROLE_KEY=gh-radar-supabase-service-role:latest
#   BRIGHTDATA_API_KEY=gh-radar-brightdata-api-key:latest
# ═══════════════════════════════════════════════════════════════

# ═══════════════════════════════════════════════════════════════
# Section 1: 가드 — gcloud configuration + 선행 SA/Secret 검증
# ═══════════════════════════════════════════════════════════════
EXPECTED_PROJECT="${GCP_PROJECT_ID:-}"
EXPECTED_CONFIG="gh-radar"

if [[ -z "$EXPECTED_PROJECT" ]]; then
  echo "ERROR: GCP_PROJECT_ID env var is required" >&2
  exit 1
fi

ACTIVE_CONFIG=$(gcloud config configurations list --filter='IS_ACTIVE=true' --format='value(name)')
ACTIVE_PROJECT=$(gcloud config get-value project 2>/dev/null || true)

if [[ "$ACTIVE_CONFIG" != "$EXPECTED_CONFIG" ]]; then
  echo "ERROR: active gcloud configuration is '$ACTIVE_CONFIG', expected '$EXPECTED_CONFIG'" >&2
  exit 1
fi

if [[ "$ACTIVE_PROJECT" != "$EXPECTED_PROJECT" ]]; then
  echo "ERROR: active project is '$ACTIVE_PROJECT', expected '$EXPECTED_PROJECT'" >&2
  exit 1
fi

# 선행 SA 검증 — setup-discussion-sync-iam.sh 가 먼저 실행되어야 함
for SA in gh-radar-scheduler-sa gh-radar-discussion-sync-sa; do
  SA_EMAIL="${SA}@${EXPECTED_PROJECT}.iam.gserviceaccount.com"
  if ! gcloud iam service-accounts describe "$SA_EMAIL" --project="$EXPECTED_PROJECT" >/dev/null 2>&1; then
    echo "ERROR: SA '$SA' not found. Run: bash scripts/setup-discussion-sync-iam.sh" >&2
    exit 1
  fi
done

# 선행 Secret 검증 — PIVOT: gh-radar-brightdata-api-key
for SECRET in gh-radar-supabase-service-role gh-radar-brightdata-api-key; do
  if ! gcloud secrets describe "$SECRET" --project="$EXPECTED_PROJECT" >/dev/null 2>&1; then
    echo "ERROR: Secret '$SECRET' not found. Run: bash scripts/setup-discussion-sync-iam.sh" >&2
    exit 1
  fi
done

echo "✓ gcloud guard + SA/Secret check"

# ═══════════════════════════════════════════════════════════════
# Section 2: 변수
# ═══════════════════════════════════════════════════════════════
JOB=gh-radar-discussion-sync
REGION=asia-northeast3
REPO=gh-radar
SHA=$(git rev-parse --short HEAD)
REGISTRY="${REGION}-docker.pkg.dev/${EXPECTED_PROJECT}/${REPO}"
IMAGE="${REGISTRY}/discussion-sync:${SHA}"
IMAGE_LATEST="${REGISTRY}/discussion-sync:latest"

: "${SUPABASE_URL:?SUPABASE_URL must be set (export or source .env.deploy)}"

# Bright Data 환경변수 기본값 — PIVOT 확정값. env override 허용.
BRIGHTDATA_ZONE_VAL="${BRIGHTDATA_ZONE:-gh_radar_naver}"
BRIGHTDATA_URL_VAL="${BRIGHTDATA_URL:-https://api.brightdata.com/request}"
NAVER_DISCUSSION_API_BASE_VAL="${NAVER_DISCUSSION_API_BASE:-https://stock.naver.com/api/community/discussion/posts/by-item}"

# 동작 파라미터 — Phase 7.2 교훈에 따라 보수적 시작 (concurrency 3)
DAILY_BUDGET="${DISCUSSION_SYNC_DAILY_BUDGET:-5000}"
CONCURRENCY="${DISCUSSION_SYNC_CONCURRENCY:-3}"
PAGE_SIZE="${DISCUSSION_SYNC_PAGE_SIZE:-100}"
BACKFILL_MAX_PAGES="${DISCUSSION_SYNC_BACKFILL_MAX_PAGES:-30}"
BACKFILL_DAYS="${DISCUSSION_SYNC_BACKFILL_DAYS:-7}"
INCREMENTAL_HOURS="${DISCUSSION_SYNC_INCREMENTAL_HOURS:-24}"
INCREMENTAL_MAX_PAGES="${DISCUSSION_SYNC_INCREMENTAL_MAX_PAGES:-5}"

echo "✓ variables: SHA=$SHA, IMAGE=$IMAGE, ZONE=$BRIGHTDATA_ZONE_VAL"

# ═══════════════════════════════════════════════════════════════
# Section 3: Artifact Registry repo (idempotent)
# ═══════════════════════════════════════════════════════════════
if ! gcloud artifacts repositories describe "$REPO" --location="$REGION" --project="$EXPECTED_PROJECT" >/dev/null 2>&1; then
  gcloud artifacts repositories create "$REPO" \
    --repository-format=docker \
    --location="$REGION" \
    --description="gh-radar container images" \
    --project="$EXPECTED_PROJECT"
fi
echo "✓ artifact registry repo: $REPO"

# ═══════════════════════════════════════════════════════════════
# Section 4: Build (amd64 강제, GIT_SHA 주입)
# ═══════════════════════════════════════════════════════════════
echo "▶ docker build..."
docker build \
  --platform=linux/amd64 \
  --build-arg "GIT_SHA=${SHA}" \
  -f workers/discussion-sync/Dockerfile \
  -t "$IMAGE" \
  -t "$IMAGE_LATEST" \
  .

# ═══════════════════════════════════════════════════════════════
# Section 5: Push
# ═══════════════════════════════════════════════════════════════
echo "▶ docker push..."
docker push "$IMAGE"
docker push "$IMAGE_LATEST"

# ═══════════════════════════════════════════════════════════════
# Section 6: Deploy Cloud Run Job
#   delimiter `^@^` → URL 의 `:` 충돌 회피 (RESEARCH Pitfall 4)
# ═══════════════════════════════════════════════════════════════
echo "▶ deploying Cloud Run Job..."
gcloud run jobs deploy "$JOB" \
  --image="$IMAGE" \
  --region="$REGION" \
  --service-account="gh-radar-discussion-sync-sa@${EXPECTED_PROJECT}.iam.gserviceaccount.com" \
  --cpu=1 \
  --memory=512Mi \
  --task-timeout=600 \
  --max-retries=1 \
  --parallelism=1 \
  --tasks=1 \
  --set-env-vars="^@^SUPABASE_URL=${SUPABASE_URL}@BRIGHTDATA_ZONE=${BRIGHTDATA_ZONE_VAL}@BRIGHTDATA_URL=${BRIGHTDATA_URL_VAL}@NAVER_DISCUSSION_API_BASE=${NAVER_DISCUSSION_API_BASE_VAL}@DISCUSSION_SYNC_DAILY_BUDGET=${DAILY_BUDGET}@DISCUSSION_SYNC_CONCURRENCY=${CONCURRENCY}@DISCUSSION_SYNC_PAGE_SIZE=${PAGE_SIZE}@DISCUSSION_SYNC_BACKFILL_MAX_PAGES=${BACKFILL_MAX_PAGES}@DISCUSSION_SYNC_BACKFILL_DAYS=${BACKFILL_DAYS}@DISCUSSION_SYNC_INCREMENTAL_HOURS=${INCREMENTAL_HOURS}@DISCUSSION_SYNC_INCREMENTAL_MAX_PAGES=${INCREMENTAL_MAX_PAGES}@LOG_LEVEL=info@APP_VERSION=${SHA}" \
  --set-secrets="SUPABASE_SERVICE_ROLE_KEY=gh-radar-supabase-service-role:latest,BRIGHTDATA_API_KEY=gh-radar-brightdata-api-key:latest" \
  --project="$EXPECTED_PROJECT"

# ═══════════════════════════════════════════════════════════════
# Section 7: Scheduler SA → Job invoker (리소스 단위 바인딩)
# ═══════════════════════════════════════════════════════════════
gcloud run jobs add-iam-policy-binding "$JOB" \
  --region="$REGION" \
  --member="serviceAccount:gh-radar-scheduler-sa@${EXPECTED_PROJECT}.iam.gserviceaccount.com" \
  --role=roles/run.invoker \
  --project="$EXPECTED_PROJECT" >/dev/null
echo "✓ run.invoker bound: gh-radar-scheduler-sa → $JOB"

# ═══════════════════════════════════════════════════════════════
# Section 8: Cloud Scheduler — 단일 1h (CONTEXT D1)
#   - 토론방은 24/7 커뮤니티 → Phase 7 의 다중 스케줄 분리 미적용
#   - --oauth-service-account-email 사용 (OIDC 금지, Pitfall 2)
#   - time-zone Asia/Seoul
# ═══════════════════════════════════════════════════════════════
JOB_INVOKE_URI="https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${EXPECTED_PROJECT}/jobs/${JOB}:run"
SCHED_SA="gh-radar-scheduler-sa@${EXPECTED_PROJECT}.iam.gserviceaccount.com"
SCHEDULER_NAME="gh-radar-discussion-sync-hourly"
SCHEDULE="0 * * * *"

if gcloud scheduler jobs describe "$SCHEDULER_NAME" --location="$REGION" --project="$EXPECTED_PROJECT" >/dev/null 2>&1; then
  echo "▶ scheduler update: $SCHEDULER_NAME (schedule: $SCHEDULE)"
  gcloud scheduler jobs update http "$SCHEDULER_NAME" \
    --location="$REGION" \
    --schedule="$SCHEDULE" \
    --time-zone="Asia/Seoul" \
    --uri="$JOB_INVOKE_URI" \
    --http-method=POST \
    --oauth-service-account-email="$SCHED_SA" \
    --project="$EXPECTED_PROJECT"
else
  echo "▶ scheduler create: $SCHEDULER_NAME (schedule: $SCHEDULE)"
  gcloud scheduler jobs create http "$SCHEDULER_NAME" \
    --location="$REGION" \
    --schedule="$SCHEDULE" \
    --time-zone="Asia/Seoul" \
    --uri="$JOB_INVOKE_URI" \
    --http-method=POST \
    --oauth-service-account-email="$SCHED_SA" \
    --project="$EXPECTED_PROJECT"
fi

# ═══════════════════════════════════════════════════════════════
# Section 9: 결과 출력
# ═══════════════════════════════════════════════════════════════
echo ""
echo "✓ Deployed: Cloud Run Job $JOB @ $IMAGE"
echo "  Scheduler: $SCHEDULER_NAME (KST 매시 정각)"
echo ""
echo "Next:"
echo "  bash scripts/smoke-discussion-sync.sh    # 배포 검증 (≥5 invariants)"
echo "  gcloud run jobs execute $JOB --region $REGION --project $EXPECTED_PROJECT --wait    # 수동 첫 실행"
echo ""
echo "✅ deploy-discussion-sync.sh complete"
