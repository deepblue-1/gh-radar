#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════
# Phase 13 Plan 06 — home-sync Cloud Run Job + 단일 Scheduler 배포
#                     (theme-sync 배포 스택 복제 — VPC 불필요, RESEARCH §Pattern 5)
#
# 선행: scripts/setup-home-sync-iam.sh (SA + Secret accessor 2건 — 전부 재사용)
#
# 리소스:
#   - Cloud Run Job: gh-radar-home-sync (asia-northeast3, 512Mi, 120s, retries=1)
#   - Image: asia-northeast3-docker.pkg.dev/<proj>/gh-radar/home-sync:<sha>
#   - Scheduler: gh-radar-home-sync-cron "*/5 8-15 * * 1-5" (KST, 장중 5분 간격)
#       09:00~15:55 매 5분(15:30 마감 슬롯 포함). hash-skip 로 변경 없는 슬롯은 Claude 0회.
#
# Scheduler → Cloud Run Job 인증: --oauth-service-account-email 전용
#   (OIDC 금지, Phase 05.1 Pitfall 2 — Cloud Run Job 호출은 OAuth bearer token 만 허용)
#   THREAT T-13-13 mitigate: OAuth only + scheduler SA run.invoker 를 Job 리소스로 scope.
#
# ENV (home-sync config.ts default 와 정합):
#   SUPABASE_URL, HOME_SYNC_SURGE_THRESHOLD(=15), HOME_SYNC_NEWS_PER_STOCK(=5),
#   HOME_SYNC_SURGE_MAX(=120), LOG_LEVEL, APP_VERSION
#   ※ brightdata/alpha/scrape/VPC ENV 없음 — home-sync 는 외부 크롤링 0.
# Secrets (전부 기존 재사용, 신규 0 — MEMORY: 기존 creds 재요청 금지):
#   SUPABASE_SERVICE_ROLE_KEY=gh-radar-supabase-service-role:latest
#   ANTHROPIC_API_KEY=gh-radar-anthropic-api-key:latest
#
# task-timeout=120s — Claude 1회 호출 + Supabase R/W 만(theme-sync 600s 대비 짧음).
# --network 없음 — home-sync 는 IP whitelist 무관(intraday-sync VPC 스택 미복제).
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

# 선행 SA 검증 — setup-home-sync-iam.sh 가 먼저 실행되어야 함
for SA in gh-radar-scheduler-sa gh-radar-home-sync-sa; do
  SA_EMAIL="${SA}@${EXPECTED_PROJECT}.iam.gserviceaccount.com"
  if ! gcloud iam service-accounts describe "$SA_EMAIL" --project="$EXPECTED_PROJECT" >/dev/null 2>&1; then
    echo "ERROR: SA '$SA' not found. Run: bash scripts/setup-home-sync-iam.sh" >&2
    exit 1
  fi
done

# 선행 Secret 검증 — 기존 시크릿 2종(재사용, 신규 0)
for SECRET in gh-radar-supabase-service-role gh-radar-anthropic-api-key; do
  if ! gcloud secrets describe "$SECRET" --project="$EXPECTED_PROJECT" >/dev/null 2>&1; then
    echo "ERROR: Secret '$SECRET' not found. Run: bash scripts/setup-home-sync-iam.sh" >&2
    exit 1
  fi
done

echo "✓ gcloud guard + SA/Secret check"

# ═══════════════════════════════════════════════════════════════
# Section 2: 변수
# ═══════════════════════════════════════════════════════════════
JOB=gh-radar-home-sync
REGION=asia-northeast3
REPO=gh-radar
SHA=$(git rev-parse --short HEAD)
REGISTRY="${REGION}-docker.pkg.dev/${EXPECTED_PROJECT}/${REPO}"
IMAGE="${REGISTRY}/home-sync:${SHA}"
IMAGE_LATEST="${REGISTRY}/home-sync:latest"

: "${SUPABASE_URL:?SUPABASE_URL must be set (export or source .env.deploy)}"

# 동작 파라미터 — home-sync config.ts default 와 정합. env override 허용.
HOME_SYNC_SURGE_THRESHOLD_VAL="${HOME_SYNC_SURGE_THRESHOLD:-15}"
HOME_SYNC_NEWS_PER_STOCK_VAL="${HOME_SYNC_NEWS_PER_STOCK:-5}"
HOME_SYNC_SURGE_MAX_VAL="${HOME_SYNC_SURGE_MAX:-120}"

echo "✓ variables: SHA=$SHA, IMAGE=$IMAGE, surgeThreshold=$HOME_SYNC_SURGE_THRESHOLD_VAL"

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
  -f workers/home-sync/Dockerfile \
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
#   task-timeout=120s (Claude 1회 + Supabase R/W — theme-sync 600s 대비 짧음)
#   max-retries=1 / --network 없음(home-sync 는 IP whitelist 무관, VPC 미복제)
# ═══════════════════════════════════════════════════════════════
echo "▶ deploying Cloud Run Job..."
gcloud run jobs deploy "$JOB" \
  --image="$IMAGE" \
  --region="$REGION" \
  --service-account="gh-radar-home-sync-sa@${EXPECTED_PROJECT}.iam.gserviceaccount.com" \
  --cpu=1 \
  --memory=512Mi \
  --task-timeout=120s \
  --max-retries=1 \
  --parallelism=1 \
  --tasks=1 \
  --set-env-vars="SUPABASE_URL=${SUPABASE_URL},HOME_SYNC_SURGE_THRESHOLD=${HOME_SYNC_SURGE_THRESHOLD_VAL},HOME_SYNC_NEWS_PER_STOCK=${HOME_SYNC_NEWS_PER_STOCK_VAL},HOME_SYNC_SURGE_MAX=${HOME_SYNC_SURGE_MAX_VAL},LOG_LEVEL=info,APP_VERSION=${SHA}" \
  --set-secrets="SUPABASE_SERVICE_ROLE_KEY=gh-radar-supabase-service-role:latest,ANTHROPIC_API_KEY=gh-radar-anthropic-api-key:latest" \
  --project="$EXPECTED_PROJECT"

# ═══════════════════════════════════════════════════════════════
# Section 6.5: Scheduler SA → Job invoker (리소스 단위 바인딩)
#   프로젝트 단위 바인딩 금지(Anti-Pattern) → Job 리소스에만 부여.
#   Job 생성 후(Phase 05.1 선례) — 리소스가 존재해야 바인딩 가능.
#   THREAT T-13-13 mitigate: run.invoker 를 이 Job 으로 scope.
# ═══════════════════════════════════════════════════════════════
gcloud run jobs add-iam-policy-binding "$JOB" \
  --region="$REGION" \
  --member="serviceAccount:gh-radar-scheduler-sa@${EXPECTED_PROJECT}.iam.gserviceaccount.com" \
  --role=roles/run.invoker \
  --project="$EXPECTED_PROJECT" >/dev/null
echo "✓ run.invoker bound: gh-radar-scheduler-sa → $JOB"

# ═══════════════════════════════════════════════════════════════
# Section 7: Cloud Scheduler — 장중 5분 간격 KST (09:00~15:55, 15:30 마감 포함)
#   - --schedule="*/5 8-15 * * 1-5" (분=매 5분, 시=9~15, 월~금)
#   - hash-skip clone-append 로 변경 없는 슬롯은 Claude 호출 0 (비용 방어)
#   - --oauth-service-account-email 사용 (OIDC 금지, Phase 05.1 Pitfall 2)
#   - time-zone Asia/Seoul
# ═══════════════════════════════════════════════════════════════
JOB_INVOKE_URI="https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${EXPECTED_PROJECT}/jobs/${JOB}:run"
SCHED_SA="gh-radar-scheduler-sa@${EXPECTED_PROJECT}.iam.gserviceaccount.com"
SCHEDULER_NAME="gh-radar-home-sync-cron"
SCHEDULE="*/5 8-15 * * 1-5"

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
# Section 8: 결과 출력
# ═══════════════════════════════════════════════════════════════
echo ""
echo "✓ Deployed: Cloud Run Job $JOB @ $IMAGE"
echo "  Scheduler: $SCHEDULER_NAME (KST 장중 5분 간격, OAuth invoker)"
echo "  Secrets reused (신규 0): supabase-service-role, anthropic-api-key"
echo "  No VPC / no brightdata (home-sync 는 Supabase + Anthropic 만)"
echo ""
echo "Next:"
echo "  bash scripts/smoke-home-sync.sh    # 배포 검증 (Job 1회 실행 → snapshot row 적재)"
echo ""
echo "✅ deploy-home-sync.sh complete"
