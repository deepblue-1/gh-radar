#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════
# Phase 07 Plan 06 — news-sync Cloud Run Job + 2-Scheduler 배포
#
# 선행: scripts/setup-news-sync-iam.sh (SA + Secret + Accessor 5건)
#
# 리소스:
#   - Cloud Run Job: gh-radar-news-sync (asia-northeast3, 512Mi, 600s, retries=1)
#   - Image: asia-northeast3-docker.pkg.dev/<proj>/gh-radar/news-sync:<sha>
#   - Scheduler 1: gh-radar-news-sync-morning     "*/3 8-9 * * 1-5"      (평일 08:00~09:57 3분)
#   - Scheduler 2: gh-radar-news-sync-morning-10h "0-30/3,45 10 * * 1-5" (평일 10:00~10:30 3분 + 10:45)
#   - Scheduler 3: gh-radar-news-sync-intraday    "*/15 11-15 * * 1-5"   (평일 11:00~15:45 15분)
#   - Scheduler 4: gh-radar-news-sync-offhours    "0 */2 * * *"          (장외, 2h 주기 KST)
#
# Scheduler → Cloud Run Job 인증: --oauth-service-account-email 전용 (OIDC 금지, Pitfall 2).
# ═══════════════════════════════════════════════════════════════

# ═══════════════════════════════════════════════════════════════
# Section 1: 가드 — gcloud configuration + 선행 SA 존재 확인
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

# 선행 SA 검증 — setup-news-sync-iam.sh 가 먼저 실행되어야 함
for SA in gh-radar-scheduler-sa gh-radar-news-sync-sa; do
  SA_EMAIL="${SA}@${EXPECTED_PROJECT}.iam.gserviceaccount.com"
  if ! gcloud iam service-accounts describe "$SA_EMAIL" --project="$EXPECTED_PROJECT" >/dev/null 2>&1; then
    echo "ERROR: SA '$SA' not found. Run: bash scripts/setup-news-sync-iam.sh" >&2
    exit 1
  fi
done

# 선행 Secret 검증 — plan-spec 명은 gh-radar-naver-client-id/gh-radar-naver-client-secret,
# 실 등록명은 NAVER_CLIENT_ID/NAVER_CLIENT_SECRET (D1). 현재 운영명 사용.
for SECRET in gh-radar-supabase-service-role NAVER_CLIENT_ID NAVER_CLIENT_SECRET; do
  if ! gcloud secrets describe "$SECRET" --project="$EXPECTED_PROJECT" >/dev/null 2>&1; then
    echo "ERROR: Secret '$SECRET' not found. Run: bash scripts/setup-news-sync-iam.sh" >&2
    exit 1
  fi
done

echo "✓ gcloud guard + SA/Secret check"

# ═══════════════════════════════════════════════════════════════
# Section 2: 변수
# ═══════════════════════════════════════════════════════════════
JOB=gh-radar-news-sync
REGION=asia-northeast3
REPO=gh-radar
SHA=$(git rev-parse --short HEAD)
REGISTRY="${REGION}-docker.pkg.dev/${EXPECTED_PROJECT}/${REPO}"
IMAGE="${REGISTRY}/news-sync:${SHA}"
IMAGE_LATEST="${REGISTRY}/news-sync:latest"

: "${SUPABASE_URL:?SUPABASE_URL must be set (export or source .env.deploy)}"

# Naver secret 이름 변수 — plan-spec 명(gh-radar-naver-client-id/gh-radar-naver-client-secret)
# 대신 프로젝트에 이미 등록된 축약명 NAVER_CLIENT_ID/NAVER_CLIENT_SECRET 사용 (D1).
NAVER_ID_SECRET="NAVER_CLIENT_ID"
NAVER_SECRET_SECRET="NAVER_CLIENT_SECRET"

echo "✓ variables: SHA=$SHA, IMAGE=$IMAGE"

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
  -f workers/news-sync/Dockerfile \
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
#   worker config.ts 가 읽는 env:
#     SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NAVER_CLIENT_ID, NAVER_CLIENT_SECRET,
#     NAVER_BASE_URL, NEWS_SYNC_DAILY_BUDGET, NEWS_SYNC_CONCURRENCY, LOG_LEVEL, APP_VERSION
#   (plan 은 NAVER_DAILY_BUDGET 이라 표기했으나 worker 코드는 NEWS_SYNC_DAILY_BUDGET —
#    실 코드 기준으로 세팅. plan-intent 일관성을 위해 NAVER_DAILY_BUDGET 도 함께 세팅)
#   delimiter `^@^` → URL 의 `:` 충돌 회피
# ═══════════════════════════════════════════════════════════════
echo "▶ deploying Cloud Run Job..."
gcloud run jobs deploy "$JOB" \
  --image="$IMAGE" \
  --region="$REGION" \
  --service-account="gh-radar-news-sync-sa@${EXPECTED_PROJECT}.iam.gserviceaccount.com" \
  --cpu=1 \
  --memory=512Mi \
  --task-timeout=600 \
  --max-retries=1 \
  --parallelism=1 \
  --tasks=1 \
  --set-env-vars="^@^SUPABASE_URL=${SUPABASE_URL}@NAVER_BASE_URL=https://openapi.naver.com@NAVER_DAILY_BUDGET=24500@NEWS_SYNC_DAILY_BUDGET=24500@NEWS_SYNC_CONCURRENCY=3@LOG_LEVEL=info@APP_VERSION=${SHA}" \
  --set-secrets="SUPABASE_SERVICE_ROLE_KEY=gh-radar-supabase-service-role:latest,NAVER_CLIENT_ID=${NAVER_ID_SECRET}:latest,NAVER_CLIENT_SECRET=${NAVER_SECRET_SECRET}:latest" \
  --project="$EXPECTED_PROJECT"

# ═══════════════════════════════════════════════════════════════
# Section 7: Scheduler SA → Job invoker (리소스 단위 바인딩, 프로젝트 단위 금지)
# ═══════════════════════════════════════════════════════════════
gcloud run jobs add-iam-policy-binding "$JOB" \
  --region="$REGION" \
  --member="serviceAccount:gh-radar-scheduler-sa@${EXPECTED_PROJECT}.iam.gserviceaccount.com" \
  --role=roles/run.invoker \
  --project="$EXPECTED_PROJECT" >/dev/null
echo "✓ run.invoker bound: gh-radar-scheduler-sa → $JOB"

# ═══════════════════════════════════════════════════════════════
# Section 8: Cloud Scheduler — 아침장 3분(morning · morning-10h) + 장중 15분(intraday) + offhours
#   주의: --oauth-service-account-email 사용 (OIDC 금지, Pitfall 2)
#         time-zone Asia/Seoul
#
#   아침장 3분 주기 (quick-260915-boq):
#   - 운영 근거(CLAUDE.md 크롤링 5원칙 대비): 2026-09-15 사용자 명시 승인. 호출량은 사용자 수가
#     아니라 고정 대상 집합(top_movers 상위 100 + watchlists)에 비례하는 서버측 배치이며,
#     사용자 클릭 on-demand 호출은 없다.
#   - 예산 실측: 회당 104~152 호출(targets 104), 장중 평일 실행 32회 → 76회(+44),
#     일 추정 ≈9.9K (offhours 12회 포함) < NEWS_SYNC_DAILY_BUDGET 24,500.
#     실행 시간 18~43s(3분 주기 대비 충분), 겹쳐도 upsert ignoreDuplicates + atomic incr_api_usage 로 안전.
#   - 장중 잡 3개는 시 범위 8-9 / 10 / 11-15 가 서로소라 서로 같은 분에 발화하지 않는다.
#   - 순서 중요: 새 아침 잡을 먼저 만들고 기존 intraday 를 나중에 좁혀야 적용 중 공백이 없다.
#   - 알고 남겨 둔 기존 중복: offhours `0 */2` 가 08:00·10:00·12:00·14:00 에 장중 잡과
#     같은 분에 발화한다(offhours 불변 결정 — 2번째 실행은 inserted≈0, 호출 ≈+100).
# ═══════════════════════════════════════════════════════════════
JOB_INVOKE_URI="https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${EXPECTED_PROJECT}/jobs/${JOB}:run"
SCHED_SA="gh-radar-scheduler-sa@${EXPECTED_PROJECT}.iam.gserviceaccount.com"

declare -a NEWS_SCHEDULERS=(
  "gh-radar-news-sync-morning|*/3 8-9 * * 1-5"
  "gh-radar-news-sync-morning-10h|0-30/3,45 10 * * 1-5"
  "gh-radar-news-sync-intraday|*/15 11-15 * * 1-5"
  "gh-radar-news-sync-offhours|0 */2 * * *"
)

for entry in "${NEWS_SCHEDULERS[@]}"; do
  SCHEDULER_NAME="${entry%%|*}"
  SCHEDULE="${entry#*|}"
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
done

# ═══════════════════════════════════════════════════════════════
# Section 9: Smoke
# ═══════════════════════════════════════════════════════════════
echo ""
echo "✓ Deployed: Cloud Run Job $JOB @ $IMAGE"
echo "  Schedulers: gh-radar-news-sync-morning + gh-radar-news-sync-morning-10h + gh-radar-news-sync-intraday + gh-radar-news-sync-offhours"
echo ""

echo "▶ smoke tests..."
bash "$(dirname "$0")/smoke-news-sync.sh" "$JOB" "$REGION"

echo ""
echo "✅ deploy-news-sync.sh complete"
