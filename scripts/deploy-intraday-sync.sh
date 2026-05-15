#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════
# deploy-intraday-sync.sh
# Phase 09.1 (DATA-02) — Cloud Run Job + Scheduler + Alert 배포
#
# RESEARCH §4.5 — --network --subnet --vpc-egress=all-traffic 으로 Static IP 경유
# RESEARCH §9.4 — cron * 9-15 * * 1-5 Asia/Seoul, task-timeout 60s
# Phase 05.1 D-07 lesson — --oauth-service-account-email (OIDC 금지)
# ═══════════════════════════════════════════════════════════════

# Section 1: gcloud guard
EXPECTED_PROJECT="${GCP_PROJECT_ID:-}"
EXPECTED_CONFIG="gh-radar"

if [[ -z "$EXPECTED_PROJECT" ]]; then
  echo "ERROR: GCP_PROJECT_ID env var is required" >&2
  exit 1
fi
ACTIVE_CONFIG=$(gcloud config configurations list --filter='IS_ACTIVE=true' --format='value(name)')
ACTIVE_PROJECT=$(gcloud config get-value project 2>/dev/null || true)
if [[ "$ACTIVE_CONFIG" != "$EXPECTED_CONFIG" ]] || [[ "$ACTIVE_PROJECT" != "$EXPECTED_PROJECT" ]]; then
  echo "ERROR: gcloud config mismatch (config=$ACTIVE_CONFIG, project=$ACTIVE_PROJECT)" >&2
  exit 1
fi

# 선행 SA + VPC stack 검증
for SA in gh-radar-scheduler-sa gh-radar-intraday-sync-sa; do
  SA_EMAIL="${SA}@${EXPECTED_PROJECT}.iam.gserviceaccount.com"
  if ! gcloud iam service-accounts describe "$SA_EMAIL" >/dev/null 2>&1; then
    echo "ERROR: SA '$SA' not found. Run: bash scripts/setup-intraday-sync-iam.sh" >&2
    exit 1
  fi
done

REGION=asia-northeast3
VPC_NAME=gh-radar-vpc
SUBNET_NAME=gh-radar-subnet-an3
STATIC_IP_NAME=gh-radar-static-ip

if ! gcloud compute addresses describe "$STATIC_IP_NAME" --region="$REGION" >/dev/null 2>&1; then
  echo "ERROR: Static IP '$STATIC_IP_NAME' not found. Run: bash scripts/setup-intraday-sync-iam.sh" >&2
  exit 1
fi
STATIC_IP=$(gcloud compute addresses describe "$STATIC_IP_NAME" --region="$REGION" --format='value(address)')
echo "✓ guard + Static IP: $STATIC_IP"

# Section 2: 변수
JOB=gh-radar-intraday-sync
SCHED=gh-radar-intraday-sync-cron
REPO=gh-radar
SHA=$(git rev-parse --short HEAD)
REGISTRY="${REGION}-docker.pkg.dev/${EXPECTED_PROJECT}/${REPO}"
IMAGE="${REGISTRY}/intraday-sync:${SHA}"
IMAGE_LATEST="${REGISTRY}/intraday-sync:latest"
: "${SUPABASE_URL:?SUPABASE_URL must be set (export or .env.deploy)}"
echo "✓ variables: SHA=$SHA, IMAGE=$IMAGE"

# Section 3: Build (amd64 강제)
echo "▶ docker build..."
docker build \
  --platform=linux/amd64 \
  --build-arg "GIT_SHA=${SHA}" \
  -f workers/intraday-sync/Dockerfile \
  -t "$IMAGE" -t "$IMAGE_LATEST" .

# Section 4: Push
echo "▶ docker push..."
docker push "$IMAGE"
docker push "$IMAGE_LATEST"

# Section 5: Cloud Run Job 배포 (VPC connector)
RUNTIME_SA="gh-radar-intraday-sync-sa@${EXPECTED_PROJECT}.iam.gserviceaccount.com"
## MIN_EXPECTED_ROWS: 키움 ka10027 stex_tp="3" (통합) 실측 범위 — 장 마감 임박(KST 14:30~15:30)에는
##   거래 활동 자연 감소로 ~700~750 row 까지 떨어짐. 임계값 600 은 휴장+API 장애 동시(진짜 partial)
##   감지용 안전마진. 0 응답은 별도 휴장 가드(`if rows.length === 0`)가 처리하므로 600 < N < 700 구간은
##   정상 변동으로 통과시킨다.
## KIS 의 1,898 보다 적은 이유는 키움이 거래정지/관리 종목을 더 엄격히 제외하는 것으로 추정.
## 800 으로 하향하여 휴장일 (0 row) 가드만 유지하고, 정상 cycle 변동 (~900~1100) false positive 방지.
##
## KA10001_RATE_LIMIT: 키움 ka10001 실측 rate limit ≈ 5 req/s. 이전 24 는 RESEARCH §1.7 의
##   초기 추정값이었으나 hot set 200 종목 호출 시 ~30% (50~68건) 가 429 (Request failed with
##   status code 429) 반환 — 키움 throttle. 2026-05-15 KA10001_RATE_LIMIT=5 로 하향한 직후
##   cycle 부터 failed=0 / successful=203 안정. 5 req/s × 200 종목 ≈ 40s 처리 (cycle 60s 내).
COMMON_ENV="^@^SUPABASE_URL=${SUPABASE_URL}@KIWOOM_BASE_URL=https://api.kiwoom.com@KIWOOM_TOKEN_TYPE=live@LOG_LEVEL=info@APP_VERSION=${SHA}@MIN_EXPECTED_ROWS=600@HOT_SET_TOP_N=200@KA10001_RATE_LIMIT=5"
COMMON_SECRETS="KIWOOM_APPKEY=gh-radar-kiwoom-appkey:latest,KIWOOM_SECRETKEY=gh-radar-kiwoom-secretkey:latest,SUPABASE_SERVICE_ROLE_KEY=gh-radar-supabase-service-role:latest"

echo "▶ deploying Cloud Run Job: $JOB (VPC: $VPC_NAME, Static IP: $STATIC_IP)..."
gcloud run jobs deploy "$JOB" \
  --image="$IMAGE" \
  --region="$REGION" \
  --service-account="$RUNTIME_SA" \
  --cpu=1 \
  --memory=512Mi \
  --task-timeout=60s \
  --max-retries=0 \
  --parallelism=1 \
  --tasks=1 \
  --network="$VPC_NAME" \
  --subnet="$SUBNET_NAME" \
  --vpc-egress=all-traffic \
  --set-env-vars="$COMMON_ENV" \
  --set-secrets="$COMMON_SECRETS"

# Scheduler SA → Job invoker
gcloud run jobs add-iam-policy-binding "$JOB" \
  --region="$REGION" \
  --member="serviceAccount:gh-radar-scheduler-sa@${EXPECTED_PROJECT}.iam.gserviceaccount.com" \
  --role=roles/run.invoker >/dev/null
echo "✓ run.invoker bound: gh-radar-scheduler-sa → $JOB"

# Section 6: Cloud Scheduler (OAuth, NOT OIDC)
SCHED_SA="gh-radar-scheduler-sa@${EXPECTED_PROJECT}.iam.gserviceaccount.com"
URI="https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${EXPECTED_PROJECT}/jobs/${JOB}:run"

if gcloud scheduler jobs describe "$SCHED" --location="$REGION" >/dev/null 2>&1; then
  echo "▶ scheduler update: $SCHED..."
  gcloud scheduler jobs update http "$SCHED" \
    --location="$REGION" \
    --schedule="* 9-15 * * 1-5" \
    --time-zone="Asia/Seoul" \
    --uri="$URI" \
    --http-method=POST \
    --oauth-service-account-email="$SCHED_SA"
else
  echo "▶ scheduler create: $SCHED..."
  gcloud scheduler jobs create http "$SCHED" \
    --location="$REGION" \
    --schedule="* 9-15 * * 1-5" \
    --time-zone="Asia/Seoul" \
    --uri="$URI" \
    --http-method=POST \
    --oauth-service-account-email="$SCHED_SA"
fi
echo "✓ Scheduler ready: $SCHED (cron '* 9-15 * * 1-5' Asia/Seoul)"

# Section 7: Alert policy (idempotent — update-or-create)
ALERT_FILE="ops/alert-intraday-sync-failure.yaml"
if [[ -f "$ALERT_FILE" ]]; then
  : "${NOTIFICATION_CHANNEL_ID:?NOTIFICATION_CHANNEL_ID must be set for alert policy}"
  RESOLVED_YAML=$(mktemp)
  sed "s|\${NOTIFICATION_CHANNEL_ID}|${NOTIFICATION_CHANNEL_ID}|g" "$ALERT_FILE" > "$RESOLVED_YAML"

  EXISTING_POLICY=$(gcloud alpha monitoring policies list \
    --filter="displayName=gh-radar-intraday-sync-failure" \
    --format='value(name)' 2>/dev/null | head -1)

  if [[ -n "$EXISTING_POLICY" ]]; then
    echo "▶ updating alert policy: gh-radar-intraday-sync-failure..."
    gcloud alpha monitoring policies update "$EXISTING_POLICY" --policy-from-file="$RESOLVED_YAML" >/dev/null
  else
    echo "▶ creating alert policy: gh-radar-intraday-sync-failure..."
    gcloud alpha monitoring policies create --policy-from-file="$RESOLVED_YAML" >/dev/null
  fi
  rm -f "$RESOLVED_YAML"
  echo "✓ Alert policy ready"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "✅ Deployed @ $IMAGE"
echo "   Job:       $JOB"
echo "   Scheduler: $SCHED (cron '* 9-15 * * 1-5' Asia/Seoul)"
echo "   VPC:       $VPC_NAME / Static IP $STATIC_IP"
echo ""
echo "Next: bash scripts/smoke-intraday-sync.sh"
