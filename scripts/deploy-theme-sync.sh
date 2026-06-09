#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════
# Phase 10 Plan 08 — theme-sync Cloud Run Job + 단일 Scheduler 배포
#                     (master-sync/discussion-sync 배포 스택 1:1 복제)
#
# 선행: scripts/setup-theme-sync-iam.sh (SA + Secret accessor 3건 — 전부 재사용)
#
# 리소스:
#   - Cloud Run Job: gh-radar-theme-sync (asia-northeast3, 512Mi, 600s, retries=1)
#   - Image: asia-northeast3-docker.pkg.dev/<proj>/gh-radar/theme-sync:<sha>
#   - Scheduler: gh-radar-theme-sync-daily "0 16 * * *" (KST, 매일 16:00 — 5원칙 #1 배치 캡)
#
# Scheduler → Cloud Run Job 인증: --oauth-service-account-email 전용
#   (OIDC 금지, RESEARCH §Pitfall 4 — Cloud Run Job 호출은 OAuth bearer token 만 허용)
#
# ENV (RESEARCH §Code Examples 골격):
#   SUPABASE_URL, ALPHA_API_BASE, NAVER_THEME_BASE, BRIGHTDATA_ZONE, BRIGHTDATA_URL,
#   THEME_SYNC_MAX_PAGES, THEME_SYNC_ALPHA_CATEGORIES, THEME_SYNC_CLASSIFY_ENABLED(=true),
#   LOG_LEVEL, APP_VERSION
# Secrets (전부 기존 재사용 — MEMORY: 기존 creds 재요청 금지):
#   SUPABASE_SERVICE_ROLE_KEY=gh-radar-supabase-service-role:latest
#   BRIGHTDATA_API_KEY=gh-radar-brightdata-api-key:latest
#   ANTHROPIC_API_KEY=gh-radar-anthropic-api-key:latest
#
# THEME_SYNC_CLASSIFY_ENABLED=true — Plan 06 POC 게이트(source='ai' 표시) 승인됨.
#   production AI 발굴/교정 활성화. kill-switch 가 필요하면 false 로 재배포.
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

# 선행 SA 검증 — setup-theme-sync-iam.sh 가 먼저 실행되어야 함
for SA in gh-radar-scheduler-sa gh-radar-theme-sync-sa; do
  SA_EMAIL="${SA}@${EXPECTED_PROJECT}.iam.gserviceaccount.com"
  if ! gcloud iam service-accounts describe "$SA_EMAIL" --project="$EXPECTED_PROJECT" >/dev/null 2>&1; then
    echo "ERROR: SA '$SA' not found. Run: bash scripts/setup-theme-sync-iam.sh" >&2
    exit 1
  fi
done

# 선행 Secret 검증 — 기존 시크릿 3종(재사용)
for SECRET in gh-radar-supabase-service-role gh-radar-brightdata-api-key gh-radar-anthropic-api-key; do
  if ! gcloud secrets describe "$SECRET" --project="$EXPECTED_PROJECT" >/dev/null 2>&1; then
    echo "ERROR: Secret '$SECRET' not found. Run: bash scripts/setup-theme-sync-iam.sh" >&2
    exit 1
  fi
done

echo "✓ gcloud guard + SA/Secret check"

# ═══════════════════════════════════════════════════════════════
# Section 2: 변수
# ═══════════════════════════════════════════════════════════════
JOB=gh-radar-theme-sync
REGION=asia-northeast3
REPO=gh-radar
SHA=$(git rev-parse --short HEAD)
REGISTRY="${REGION}-docker.pkg.dev/${EXPECTED_PROJECT}/${REPO}"
IMAGE="${REGISTRY}/theme-sync:${SHA}"
IMAGE_LATEST="${REGISTRY}/theme-sync:latest"

: "${SUPABASE_URL:?SUPABASE_URL must be set (export or source .env.deploy)}"

# 동작 파라미터 — config.ts default 와 정합. env override 허용.
ALPHA_API_BASE_VAL="${ALPHA_API_BASE:-https://api.alphasquare.co.kr}"
NAVER_THEME_BASE_VAL="${NAVER_THEME_BASE:-https://finance.naver.com}"
BRIGHTDATA_ZONE_VAL="${BRIGHTDATA_ZONE:-gh_radar_naver}"
BRIGHTDATA_URL_VAL="${BRIGHTDATA_URL:-https://api.brightdata.com/request}"
THEME_SYNC_MAX_PAGES_VAL="${THEME_SYNC_MAX_PAGES:-10}"
THEME_SYNC_ALPHA_CATEGORIES_VAL="${THEME_SYNC_ALPHA_CATEGORIES:-정치,트렌드}"
# Plan 06 POC 게이트 승인 → production AI 발굴/교정 활성화(default true). env override 로 kill-switch.
THEME_SYNC_CLASSIFY_ENABLED_VAL="${THEME_SYNC_CLASSIFY_ENABLED:-true}"

echo "✓ variables: SHA=$SHA, IMAGE=$IMAGE, classify=$THEME_SYNC_CLASSIFY_ENABLED_VAL"

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
  -f workers/theme-sync/Dockerfile \
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
#   delimiter `^@^` → URL 의 `:` 충돌 회피 (RESEARCH §Pitfall 4)
#   task-timeout=600s (2-tier 스크랩 + AI 보강 여유) / max-retries=1
# ═══════════════════════════════════════════════════════════════
echo "▶ deploying Cloud Run Job..."
gcloud run jobs deploy "$JOB" \
  --image="$IMAGE" \
  --region="$REGION" \
  --service-account="gh-radar-theme-sync-sa@${EXPECTED_PROJECT}.iam.gserviceaccount.com" \
  --cpu=1 \
  --memory=512Mi \
  --task-timeout=600s \
  --max-retries=1 \
  --parallelism=1 \
  --tasks=1 \
  --set-env-vars="^@^SUPABASE_URL=${SUPABASE_URL}@ALPHA_API_BASE=${ALPHA_API_BASE_VAL}@NAVER_THEME_BASE=${NAVER_THEME_BASE_VAL}@BRIGHTDATA_ZONE=${BRIGHTDATA_ZONE_VAL}@BRIGHTDATA_URL=${BRIGHTDATA_URL_VAL}@THEME_SYNC_MAX_PAGES=${THEME_SYNC_MAX_PAGES_VAL}@THEME_SYNC_ALPHA_CATEGORIES=${THEME_SYNC_ALPHA_CATEGORIES_VAL}@THEME_SYNC_CLASSIFY_ENABLED=${THEME_SYNC_CLASSIFY_ENABLED_VAL}@LOG_LEVEL=info@APP_VERSION=${SHA}" \
  --set-secrets="SUPABASE_SERVICE_ROLE_KEY=gh-radar-supabase-service-role:latest,BRIGHTDATA_API_KEY=gh-radar-brightdata-api-key:latest,ANTHROPIC_API_KEY=gh-radar-anthropic-api-key:latest" \
  --project="$EXPECTED_PROJECT"

# ═══════════════════════════════════════════════════════════════
# Section 6.5: Scheduler SA → Job invoker (리소스 단위 바인딩)
#   프로젝트 단위 바인딩 금지(Anti-Pattern) → Job 리소스에만 부여.
#   Job 생성 후(§5.5, Phase 05.1 선례) — 리소스가 존재해야 바인딩 가능.
# ═══════════════════════════════════════════════════════════════
gcloud run jobs add-iam-policy-binding "$JOB" \
  --region="$REGION" \
  --member="serviceAccount:gh-radar-scheduler-sa@${EXPECTED_PROJECT}.iam.gserviceaccount.com" \
  --role=roles/run.invoker \
  --project="$EXPECTED_PROJECT" >/dev/null
echo "✓ run.invoker bound: gh-radar-scheduler-sa → $JOB"

# ═══════════════════════════════════════════════════════════════
# Section 7: Cloud Scheduler — 일 1회 16:00 KST (5원칙 #1 배치 캡)
#   - --oauth-service-account-email 사용 (OIDC 금지, RESEARCH §Pitfall 4)
#   - time-zone Asia/Seoul
# ═══════════════════════════════════════════════════════════════
JOB_INVOKE_URI="https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${EXPECTED_PROJECT}/jobs/${JOB}:run"
SCHED_SA="gh-radar-scheduler-sa@${EXPECTED_PROJECT}.iam.gserviceaccount.com"
SCHEDULER_NAME="gh-radar-theme-sync-daily"
SCHEDULE="0 16 * * *"

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
echo "  Scheduler: $SCHEDULER_NAME (KST 매일 16:00, OAuth invoker)"
echo "  classify_enabled: $THEME_SYNC_CLASSIFY_ENABLED_VAL"
echo ""
echo "Next:"
echo "  bash scripts/smoke-theme-sync.sh    # 배포 검증 (Job 1회 실행 → themes count > 0)"
echo ""
echo "✅ deploy-theme-sync.sh complete"
