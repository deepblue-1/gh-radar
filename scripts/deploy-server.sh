#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════
# Section 1: 가드 — gcloud configuration 검증 (D-36, D-39)
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
  echo "Hint: gcloud config configurations activate $EXPECTED_CONFIG" >&2
  exit 1
fi

if [[ "$ACTIVE_PROJECT" != "$EXPECTED_PROJECT" ]]; then
  echo "ERROR: active project is '$ACTIVE_PROJECT', expected '$EXPECTED_PROJECT'" >&2
  echo "Hint: gcloud config set project $EXPECTED_PROJECT" >&2
  exit 1
fi

echo "✓ gcloud guard: config=$ACTIVE_CONFIG, project=$ACTIVE_PROJECT"

# ═══════════════════════════════════════════════════════════════
# Section 2: 변수
# ═══════════════════════════════════════════════════════════════
SERVICE=gh-radar-server
REGION=asia-northeast3
REPO=gh-radar
SHA=$(git rev-parse --short HEAD)
REGISTRY="${REGION}-docker.pkg.dev/${EXPECTED_PROJECT}/${REPO}"
IMAGE="${REGISTRY}/server:${SHA}"
IMAGE_LATEST="${REGISTRY}/server:latest"

: "${SUPABASE_URL:?SUPABASE_URL must be set (export or .env.deploy)}"
: "${CORS_ALLOWED_ORIGINS:?CORS_ALLOWED_ORIGINS must be set}"

echo "✓ variables: SHA=$SHA, IMAGE=$IMAGE"

# ═══════════════════════════════════════════════════════════════
# Section 2.5: Kiwoom secret accessor 바인딩 (Phase 09.1 D-17 — server 측 ka10001 호출)
#   server 는 default compute SA 사용 → KIWOOM secret 에 accessor 바인딩 필요
#   주 바인딩은 scripts/setup-intraday-sync-iam.sh §9.4 가 담당. 여기는 안전망 (idempotent).
# ═══════════════════════════════════════════════════════════════
PROJECT_NUMBER=$(gcloud projects describe "$EXPECTED_PROJECT" --format='value(projectNumber)')
DEFAULT_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

for SECRET in gh-radar-kiwoom-appkey gh-radar-kiwoom-secretkey; do
  if gcloud secrets describe "$SECRET" >/dev/null 2>&1; then
    gcloud secrets add-iam-policy-binding "$SECRET" \
      --member="serviceAccount:${DEFAULT_SA}" \
      --role=roles/secretmanager.secretAccessor >/dev/null 2>&1 || true
  fi
done
echo "✓ Kiwoom secret accessor bound for server SA (idempotent)"

# Phase 07 Plan 06 — Naver secret accessor 바인딩 (server POST /refresh 경로용)
# 주의: 주 바인딩은 scripts/setup-news-sync-iam.sh 가 담당. 여기는 안전망 (idempotent).
for SECRET in NAVER_CLIENT_ID NAVER_CLIENT_SECRET; do
  if gcloud secrets describe "$SECRET" >/dev/null 2>&1; then
    gcloud secrets add-iam-policy-binding "$SECRET" \
      --member="serviceAccount:${DEFAULT_SA}" \
      --role=roles/secretmanager.secretAccessor >/dev/null 2>&1 || true
  fi
done
echo "✓ Naver secret accessor bound for server SA (idempotent)"

# Phase 08 Plan 06 + 08.1 Plan 04 — Bright Data + Anthropic secret accessor 바인딩
# 주 바인딩은 scripts/setup-discussion-sync-iam.sh 가 담당. 여기는 안전망 (idempotent).
for SECRET in gh-radar-brightdata-api-key gh-radar-anthropic-api-key; do
  if gcloud secrets describe "$SECRET" >/dev/null 2>&1; then
    gcloud secrets add-iam-policy-binding "$SECRET" \
      --member="serviceAccount:${DEFAULT_SA}" \
      --role=roles/secretmanager.secretAccessor >/dev/null 2>&1 || true
  fi
done
echo "✓ Bright Data + Anthropic secret accessor bound for server SA (idempotent)"

# 선행 Secret 검증 — 배포 전 필수 secret 존재 여부
for SECRET in gh-radar-anthropic-api-key; do
  if ! gcloud secrets describe "$SECRET" >/dev/null 2>&1; then
    echo "ERROR: Secret '$SECRET' not found. Run: bash scripts/setup-discussion-sync-iam.sh" >&2
    exit 1
  fi
done
echo "✓ Pre-deploy secret check"

# ═══════════════════════════════════════════════════════════════
# Section 3: Build (amd64 강제, GIT_SHA 주입)
# ═══════════════════════════════════════════════════════════════
echo "▶ docker build..."
docker build \
  --platform=linux/amd64 \
  --build-arg "GIT_SHA=${SHA}" \
  -f server/Dockerfile \
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
# Section 5: Deploy (D-28 프로파일 + RESEARCH Pitfall 4 delimiter)
# Phase 09.1 D-30: VPC connector 옵션 — server 도 Static IP 경유
# ═══════════════════════════════════════════════════════════════
VPC_NAME=gh-radar-vpc
SUBNET_NAME=gh-radar-subnet-an3

# VPC stack 존재 확인 (없으면 Wave 3 setup 미실행)
if ! gcloud compute networks describe "$VPC_NAME" >/dev/null 2>&1; then
  echo "ERROR: VPC '$VPC_NAME' not found. Run: bash scripts/setup-intraday-sync-iam.sh" >&2
  exit 1
fi

echo "▶ gcloud run deploy (VPC: $VPC_NAME)..."
gcloud run deploy "$SERVICE" \
  --image="$IMAGE" \
  --region="$REGION" \
  --platform=managed \
  --allow-unauthenticated \
  --port=8080 \
  --cpu=1 \
  --memory=512Mi \
  --concurrency=80 \
  --min-instances=1 \
  --max-instances=3 \
  --timeout=300s \
  --network="$VPC_NAME" \
  --subnet="$SUBNET_NAME" \
  --vpc-egress=all-traffic \
  --set-env-vars="^@^NODE_ENV=production@LOG_LEVEL=info@SUPABASE_URL=${SUPABASE_URL}@CORS_ALLOWED_ORIGINS=${CORS_ALLOWED_ORIGINS}@KIWOOM_BASE_URL=https://api.kiwoom.com@KIWOOM_TOKEN_TYPE=live@NAVER_BASE_URL=https://openapi.naver.com@NAVER_DAILY_BUDGET=24500@APP_VERSION=${SHA}" \
  --update-secrets="SUPABASE_SERVICE_ROLE_KEY=gh-radar-supabase-service-role:latest,KIWOOM_APPKEY=gh-radar-kiwoom-appkey:latest,KIWOOM_SECRETKEY=gh-radar-kiwoom-secretkey:latest,NAVER_CLIENT_ID=NAVER_CLIENT_ID:latest,NAVER_CLIENT_SECRET=NAVER_CLIENT_SECRET:latest,BRIGHTDATA_API_KEY=gh-radar-brightdata-api-key:latest,ANTHROPIC_API_KEY=gh-radar-anthropic-api-key:latest"

# ═══════════════════════════════════════════════════════════════
# Section 6: Smoke
# ═══════════════════════════════════════════════════════════════
URL=$(gcloud run services describe "$SERVICE" --region="$REGION" --format='value(status.url)')
echo ""
echo "✓ Deployed: $URL"
echo ""

echo "▶ smoke tests..."
bash "$(dirname "$0")/smoke-server.sh" "$URL"

echo ""
echo "✅ deploy-server.sh complete"
