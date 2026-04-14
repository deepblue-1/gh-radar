#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════
# Section 1: 가드 — gcloud configuration + 선행 SA 존재 확인
# ═══════════════════════════════════════════════════════════════
EXPECTED_PROJECT="${GCP_PROJECT_ID:-}"
EXPECTED_CONFIG="gh-radar"

if [[ -z "$EXPECTED_PROJECT" ]]; then
  echo "ERROR: GCP_PROJECT_ID env var is required" >&2
  echo "Hint: export GCP_PROJECT_ID=<your-project-id>" >&2
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

# 선행 리소스 검증 — setup-ingestion-iam.sh가 먼저 실행되어야 함
for SA in gh-radar-scheduler-sa gh-radar-ingestion-sa; do
  SA_EMAIL="${SA}@${EXPECTED_PROJECT}.iam.gserviceaccount.com"
  if ! gcloud iam service-accounts describe "$SA_EMAIL" >/dev/null 2>&1; then
    echo "ERROR: SA '$SA' not found. Run: bash scripts/setup-ingestion-iam.sh" >&2
    exit 1
  fi
done

echo "✓ gcloud guard + SA check: config=$ACTIVE_CONFIG, project=$ACTIVE_PROJECT"

# ═══════════════════════════════════════════════════════════════
# Section 2: 변수
# ═══════════════════════════════════════════════════════════════
JOB=gh-radar-ingestion
REGION=asia-northeast3
REPO=gh-radar
SHA=$(git rev-parse --short HEAD)
# REGION=asia-northeast3 → registry host resolves to asia-northeast3-docker.pkg.dev
REGISTRY="${REGION}-docker.pkg.dev/${EXPECTED_PROJECT}/${REPO}"
IMAGE="${REGISTRY}/ingestion:${SHA}"
IMAGE_LATEST="${REGISTRY}/ingestion:latest"

: "${SUPABASE_URL:?SUPABASE_URL must be set (export or source .env.deploy)}"

echo "✓ variables: SHA=$SHA, IMAGE=$IMAGE"

# ═══════════════════════════════════════════════════════════════
# Section 3: Build (amd64 강제, GIT_SHA 주입 — Phase 2 D-35 승계)
# ═══════════════════════════════════════════════════════════════
echo "▶ docker build..."
docker build \
  --platform=linux/amd64 \
  --build-arg "GIT_SHA=${SHA}" \
  -f workers/ingestion/Dockerfile \
  -t "$IMAGE" \
  -t "$IMAGE_LATEST" \
  .

# ═══════════════════════════════════════════════════════════════
# Section 4: Push
# ═══════════════════════════════════════════════════════════════
echo "▶ docker push..."
docker push "$IMAGE"
docker push "$IMAGE_LATEST"

# ═══════════════════════════════════════════════════════════════
# Section 5: Deploy Job (D-02, D-03, D-10, D-11)
#   delimiter `^@^` → SUPABASE_URL 등의 `:` 충돌 회피 (Pitfall 4)
# ═══════════════════════════════════════════════════════════════
echo "▶ deploying Cloud Run Job..."
gcloud run jobs deploy "$JOB" \
  --image="$IMAGE" \
  --region="$REGION" \
  --service-account="gh-radar-ingestion-sa@${EXPECTED_PROJECT}.iam.gserviceaccount.com" \
  --cpu=1 \
  --memory=512Mi \
  --task-timeout=120s \
  --max-retries=0 \
  --parallelism=1 \
  --tasks=1 \
  --set-env-vars="^@^SUPABASE_URL=${SUPABASE_URL}@KIS_BASE_URL=https://openapi.koreainvestment.com:9443@LOG_LEVEL=info@APP_VERSION=${SHA}" \
  --set-secrets="KIS_APP_KEY=gh-radar-kis-app-key:latest,KIS_APP_SECRET=gh-radar-kis-app-secret:latest,KIS_ACCOUNT_NUMBER=gh-radar-kis-account-number:latest,SUPABASE_SERVICE_ROLE_KEY=gh-radar-supabase-service-role:latest"

# ═══════════════════════════════════════════════════════════════
# Section 5.5: Scheduler SA → Job invoker (D-07; 리소스 단위 바인딩)
#   프로젝트 단위 바인딩 금지(Anti-Pattern) → Job 리소스에만 부여
# ═══════════════════════════════════════════════════════════════
gcloud run jobs add-iam-policy-binding "$JOB" \
  --region="$REGION" \
  --member="serviceAccount:gh-radar-scheduler-sa@${EXPECTED_PROJECT}.iam.gserviceaccount.com" \
  --role=roles/run.invoker >/dev/null
echo "✓ run.invoker bound: gh-radar-scheduler-sa → $JOB"

# ═══════════════════════════════════════════════════════════════
# Section 6: Scheduler create-or-update (D-02, D-06, D-08)
#   주의: --oauth-service-account-email 사용 (OIDC 금지, Pitfall 2)
# ═══════════════════════════════════════════════════════════════
JOB_URI="https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${EXPECTED_PROJECT}/jobs/${JOB}:run"
SCHED=gh-radar-ingestion-scheduler
SCHED_SA="gh-radar-scheduler-sa@${EXPECTED_PROJECT}.iam.gserviceaccount.com"

if gcloud scheduler jobs describe "$SCHED" --location="$REGION" >/dev/null 2>&1; then
  echo "▶ scheduler update..."
  gcloud scheduler jobs update http "$SCHED" \
    --location="$REGION" \
    --schedule="* 9-15 * * 1-5" \
    --time-zone="Asia/Seoul" \
    --uri="$JOB_URI" \
    --http-method=POST \
    --oauth-service-account-email="$SCHED_SA"
else
  echo "▶ scheduler create..."
  gcloud scheduler jobs create http "$SCHED" \
    --location="$REGION" \
    --schedule="* 9-15 * * 1-5" \
    --time-zone="Asia/Seoul" \
    --uri="$JOB_URI" \
    --http-method=POST \
    --oauth-service-account-email="$SCHED_SA"
fi

# ═══════════════════════════════════════════════════════════════
# Section 7: Smoke
# ═══════════════════════════════════════════════════════════════
echo ""
echo "✓ Deployed: Cloud Run Job $JOB @ $IMAGE"
echo ""

echo "▶ smoke tests..."
bash "$(dirname "$0")/smoke-ingestion.sh" "$JOB" "$REGION"

echo ""
echo "✅ deploy-ingestion.sh complete"
