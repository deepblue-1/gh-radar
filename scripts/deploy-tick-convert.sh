#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════
# deploy-tick-convert.sh
# Phase 37 D-02 · D-03 · D-04 · D-22 — 틱 격자 변환 Job 1 + Scheduler 2 + overrides 실행 권한 + 실패 알림 정책
#
# 배포는 메인 세션(37-16)만 — 서브에이전트에서 실행하지 않는다(분류기 차단 · 배포 경계).
#
# 선례 = scripts/deploy-limitup-sync.sh (Section 1~8 · deploy_job · create_or_update_scheduler · 알림 update-or-create).
# 차이 (37-18-PLAN / 37-RESEARCH Pattern 11):
#   - GCS 볼륨 읽기 전용 마운트(gen2) — gs://gh-trade-tick-archive → /mnt/tick, 워커 env TICK_ARCHIVE_DIR=/mnt/tick/raw
#     (버킷 접두 raw/<krx|nxt>/<YYYYMMDD>/ — gh-trade tick-archive 가 올린다 · 클래스 ARCHIVE)
#   - cpu 4 · memory 8Gi(Pitfall 5 — nightly 는 하루 전 종목을 메모리 압축 청크로 스테이징 · SC3 실측으로 줄인다)
#   - task-timeout 3600s 는 nightly 용 — nightly 는 TICK_NIGHTLY_BUDGET_MS(40분) 뒤 새 날짜를 시작하지 않는다(남은 날짜는
#     01:30 · 다음 밤이 잇는다). request 실행은 server 가 Job 실행 overrides `timeout: 1200s` 로 줄인다(37-07) — 37-04 의
#     running 회수 25분(= 1200s + 여유 5분)의 근거다.
#   - Scheduler 둘 — 23:30 · 01:30 KST 매일(Asia/Seoul). 이미지 CMD ["nightly"] 를 오버라이드 없이 돌린다.
#     23:30 = 업로드(D+1 22:00~23:14 KST · 10/30 실측) 뒤 · 01:30 = 23:30 실행이 예산으로 미룬 날짜 · 늦은 업로드를 잇는다.
#     주말 · 휴장일도 돈다 — 날짜 고르기가 평일 ∧ 휴장 아님만 고르고(catch-up 10일), 할 일이 없으면 purge 만 하고 끝난다.
#   - server 실행 SA(${PROJECT_NUMBER}-compute@developer.gserviceaccount.com — deploy-server.sh)에 이 Job 단위
#     roles/run.jobsExecutorWithOverrides(37-07 요청 변환이 containerOverrides[].args · timeout 을 바꿔 실행).
#     그 역할이 이 조직에서 없으면 roles/run.developer(Job 단위)로 바꾸고 경고한다(37-RESEARCH Assumptions A5).
#   - 실패 실행 알림 정책 gh-radar-tick-convert-failure — 종료 1 = 실패 종목 · 실패 날짜 · purge 실패 · 예외
#     (NO_RECORDS · NOT_UPLOADED · NO_OBJECTS · 미룬 날짜는 종료 0).
#   - --oauth-service-account-email 사용 (OIDC 금지 — Cloud Run Admin API 호출)
#   - VPC egress 없음 — nightly · request 는 GCS 마운트 · Supabase 만 쓴다(promote 의 tickgw 경로는 37-12 가 더한다).
#
# 필수 env: GCP_PROJECT_ID · SUPABASE_URL (없으면 시작부터 실패 — 라이브 Cloud Run env 에서 가져온다)
#           NOTIFICATION_CHANNEL_ID (없으면 마지막 알림 단계만 실패 — Job · Scheduler · 권한은 이미 반영됨)
# 선행: bash scripts/setup-tick-convert-iam.sh (SA · Secret accessor · 버킷 단위 objectViewer)
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
for SA in gh-radar-scheduler-sa gh-radar-tick-convert-sa; do
  SA_EMAIL="${SA}@${EXPECTED_PROJECT}.iam.gserviceaccount.com"
  if ! gcloud iam service-accounts describe "$SA_EMAIL" >/dev/null 2>&1; then
    echo "ERROR: SA '$SA' not found. Run: bash scripts/setup-tick-convert-iam.sh" >&2
    exit 1
  fi
done

# 선행 버킷 검증 — 볼륨 마운트 대상이 없으면 Job 이 첫 실행에서 실패한다
BUCKET="gh-trade-tick-archive"
if ! gcloud storage buckets describe "gs://${BUCKET}" >/dev/null 2>&1; then
  echo "ERROR: bucket 'gs://${BUCKET}' not found (gh-trade tick-archive 소유)" >&2
  exit 1
fi

echo "✓ gcloud guard + SA + bucket check"

# Section 2: 변수
REGION=asia-northeast3
REPO=gh-radar
SHA=$(git rev-parse --short HEAD)
REGISTRY="${REGION}-docker.pkg.dev/${EXPECTED_PROJECT}/${REPO}"
IMAGE="${REGISTRY}/tick-convert:${SHA}"
IMAGE_LATEST="${REGISTRY}/tick-convert:latest"
JOB="gh-radar-tick-convert"
SCHED="gh-radar-tick-convert-nightly"
SCHED_LATE="gh-radar-tick-convert-nightly-late"
CRON="30 23 * * *"
CRON_LATE="30 1 * * *"
PROJECT_NUMBER=$(gcloud projects describe "$EXPECTED_PROJECT" --format='value(projectNumber)')
SERVER_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

echo "✓ variables: SHA=$SHA, IMAGE=$IMAGE, SERVER_SA=$SERVER_SA"

# Section 3: Build (amd64 강제, GIT_SHA 주입) — 이미지 ENTRYPOINT ["node", "dist/index.js"] + CMD ["nightly"]
echo "▶ docker build..."
docker build \
  --platform=linux/amd64 \
  --build-arg "GIT_SHA=${SHA}" \
  -f workers/tick-convert/Dockerfile \
  -t "$IMAGE" \
  -t "$IMAGE_LATEST" \
  .

# Section 4: Push
echo "▶ docker push..."
docker push "$IMAGE"
docker push "$IMAGE_LATEST"

# Section 5: Deploy Cloud Run Job (GCS 볼륨 읽기 전용 마운트)
RUNTIME_SA="gh-radar-tick-convert-sa@${EXPECTED_PROJECT}.iam.gserviceaccount.com"
COMMON_ENV="^@^SUPABASE_URL=${SUPABASE_URL}@LOG_LEVEL=info@APP_VERSION=${SHA}@TICK_ARCHIVE_DIR=/mnt/tick/raw@TICK_KEEP_DAYS=90@TICK_CATCHUP_DAYS=10@TICK_UP_PCT=15@TICK_NIGHTLY_BUDGET_MS=2400000@NODE_OPTIONS=--disable-warning=ExperimentalWarning"
COMMON_SECRETS="SUPABASE_SERVICE_ROLE_KEY=gh-radar-supabase-service-role:latest"

deploy_job() {
  local job="$1"
  echo "▶ deploying Cloud Run Job: $job (cpu=4, memory=8Gi, timeout=3600s, volume gs://${BUCKET} → /mnt/tick ro)..."
  gcloud run jobs deploy "$job" \
    --image="$IMAGE" \
    --region="$REGION" \
    --service-account="$RUNTIME_SA" \
    --cpu=4 \
    --memory=8Gi \
    --task-timeout=3600s \
    --max-retries=0 \
    --parallelism=1 \
    --tasks=1 \
    --execution-environment=gen2 \
    --add-volume=name=tick,type=cloud-storage,bucket=gh-trade-tick-archive,readonly=true \
    --add-volume-mount=volume=tick,mount-path=/mnt/tick \
    --set-env-vars="${COMMON_ENV}" \
    --set-secrets="$COMMON_SECRETS"

  # Scheduler SA → Job invoker (리소스 단위 바인딩, 프로젝트 단위 금지)
  gcloud run jobs add-iam-policy-binding "$job" \
    --region="$REGION" \
    --member="serviceAccount:gh-radar-scheduler-sa@${EXPECTED_PROJECT}.iam.gserviceaccount.com" \
    --role=roles/run.invoker >/dev/null
  echo "✓ run.invoker bound: gh-radar-scheduler-sa → $job"
}

deploy_job "$JOB"

# Section 5b: server 실행 SA → 이 Job 단위 overrides 실행 권한(37-07 요청 변환 · D-03)
OVERRIDE_ROLE="roles/run.jobsExecutorWithOverrides"
if ! gcloud iam roles describe "$OVERRIDE_ROLE" >/dev/null 2>&1; then
  echo "⚠ WARN: $OVERRIDE_ROLE 를 찾지 못했다 — Job 단위 roles/run.developer 로 대신한다(A5 · 권한이 더 넓다 · 역할이 생기면 다시 돌린다)" >&2
  OVERRIDE_ROLE="roles/run.developer"
fi
gcloud run jobs add-iam-policy-binding "$JOB" \
  --region="$REGION" \
  --member="serviceAccount:${SERVER_SA}" \
  --role="$OVERRIDE_ROLE" >/dev/null
echo "✓ ${OVERRIDE_ROLE} bound: server SA → $JOB (Job 단위)"

# Section 6: Cloud Scheduler — 23:30 · 01:30 KST 매일
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

# cron "30 23 * * *" · "30 1 * * *" Asia/Seoul
create_or_update_scheduler "$SCHED" "$JOB" "$CRON"
create_or_update_scheduler "$SCHED_LATE" "$JOB" "$CRON_LATE"

# Section 7: Alert policy (idempotent — update-or-create)
ALERT_FILE="ops/alert-tick-convert-failure.yaml"
ALERT_NAME="gh-radar-tick-convert-failure"
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
echo "   Job:       $JOB (cpu 4 · 8Gi · task-timeout 3600s · gen2 · volume gs://${BUCKET} → /mnt/tick ro)"
echo "   Scheduler: $SCHED (cron '$CRON' Asia/Seoul) · $SCHED_LATE (cron '$CRON_LATE' Asia/Seoul)"
echo "   Overrides: ${OVERRIDE_ROLE} → $SERVER_SA (Job 단위)"
echo "   Alert:     $ALERT_NAME"
echo ""
echo "Next: bash scripts/smoke-tick-convert.sh <YYYYMMDD> [nightly|request <KRX|NXT>]"
