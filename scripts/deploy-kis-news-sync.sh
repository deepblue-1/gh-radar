#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════
# Phase 41 Plan 02 — kis-news-sync(한투 뉴스·공시 수집기) Cloud Run Job + Scheduler 3개 배포 (deploy-news-sync.sh 꼴)
#
# 선행(41-09 — 사용자 `!`):
#   ! GCP_PROJECT_ID=gh-radar bash scripts/setup-kis-news-sync-iam.sh   (SA · Secret 껍데기 · Accessor 3건)
#   ! bash scripts/setup-kis-secrets.sh                                 (앱키 · 시크릿 값)
# 실행(메인 세션): GCP_PROJECT_ID=gh-radar SUPABASE_URL=… bash scripts/deploy-kis-news-sync.sh
# 점검만(GCP 접촉 0): bash scripts/deploy-kis-news-sync.sh --self-test
#
# 리소스:
#   - Cloud Run Job: gh-radar-kis-news-sync (asia-northeast3 · 1 vCPU · 512Mi · task-timeout 14h · retries 0 · 동시 1개)
#   - Image: asia-northeast3-docker.pkg.dev/<proj>/gh-radar/kis-news-sync:<sha>
#   - Scheduler (Asia/Seoul · KIS_SCHEDULERS 배열):
#       gh-radar-kis-news-sync-fast          "*/5 7-19 * * 1-5"     평일 07:00 ~ 19:55 5분마다 깨움
#       gh-radar-kis-news-sync-slow-weekday  "*/15 0-6,20-23 * * 1-5" 평일 그 밖 15분마다
#       gh-radar-kis-news-sync-slow-weekend  "*/15 * * * 0,6"       주말 15분마다
#
# 설계:
#   D-01 장중 내내 떠 있는 수집 = 장기 실행 Job + DB 임대(kis_news_lease_acquire · TTL 90초 · 30초 연장).
#        빠른 창에서 5분마다 깨워도 임대를 가진 실행이 살아 있으면 새 실행은 몇 초 만에 0 으로 끝난다.
#        실행이 죽으면 늦어도 다음 깨움(≤ 5분 + TTL)에서 다른 실행이 이어받는다.
#        `--max-retries=0` — 재시작은 Scheduler 깨움 + 임대가 맡는다. Job retry 는 같은 실행 안 즉시 재기동이라
#        크래시 루프 · 토큰 중복 발급(발급마다 알림톡)이 된다.
#        `--task-timeout=14h` — 빠른 창 13시간(07:00 ~ 20:00) + 여유. Cloud Run Job 상한은 168시간.
#   D-02 빠른 창 `07:00` ~ `20:00` KST(5분 깨움 · 루프 안 5초 주기) · 그 밖은 15분마다 느린 실행(되감기 + 대상 한 바퀴 후 종료).
#        모드는 Scheduler 가 넘기지 않는다 — 수집기가 KST 시각으로 스스로 판정한다(workers/kis-news-sync/src/pipeline/cadence.ts).
#        수동 강제: gcloud run jobs execute gh-radar-kis-news-sync --region=asia-northeast3 --update-env-vars=KIS_NEWS_MODE=fast|slow|probe
#
# 예산(CLAUDE.md 「공식 API 운영 기준」):
#   ① 공식 유량은 실전 REST 초당 20건 → 설계 상한 KIS_NEWS_MAX_RPS 기본 5(25%) · 15(75%) 초과는 이 스크립트가 거부한다.
#      평상시 실사용 ≈ 2.7/s.
#   공식 일일 한도는 공개된 값이 없다 — KIS_NEWS_DAILY_BUDGET=200000 은 폭주 방지용 자체 상한이다(80% warn · 초과 시 그 실행 종료).
#      카운터: api_usage service kis_news_title (KST 날짜 키) · 한도 의심 표시 kis_news_title_quota_strike.
#   ③ 호출량은 사용자 수와 독립 — 대상은 급등 상위 · 관심종목 · 조회 등록(상한 200)이고, server 는 한투를 부르지 않는다
#      (server 배포에 한투 Secret 을 붙이지 않는다 · scripts/deploy-server.sh 에 gh-radar-kis-app* 없음).
#   ④ 한도 소진 · 차단 신호면 그 실행만 중단, 재시도로 두드리지 않는다(수집기 몫 — 41-08 · 41-13).
#
# 고정 IP: 기본은 VPC 없이(home-sync 와 같음 · Supabase 직통). 한투가 Cloud Run 발신을 거부하면
#   KIS_NEWS_VPC_EGRESS=1 bash scripts/deploy-kis-news-sync.sh
#   로 gh-radar-vpc / gh-radar-subnet-an3 · --vpc-egress=all-traffic(Cloud NAT 고정 IP · intraday-sync 선례)로 바꾼다.
#
# 배포 시점 주의: 장중에 다시 배포해도 이미 도는 실행은 옛 이미지로 20:00 까지 간다(임대를 쥐고 있으므로 새 실행은 바로 끝남).
#   즉시 바꿔야 하면 도는 실행을 취소한다 — 다음 5분 깨움이 새 이미지로 임대를 넘겨받는다(TTL 90초 뒤):
#   gcloud run jobs executions list --job=gh-radar-kis-news-sync --region=asia-northeast3 --filter='status.completionTime=null'
#   gcloud run jobs executions cancel <execution> --region=asia-northeast3
#
# Scheduler 배열을 바꾸면 workers/kis-news-sync/tests/schedule.test.ts 를 먼저 돌린다
#   (그 테스트가 이 파일의 KIS_SCHEDULERS 를 직접 읽어 1주일 × 1440분 정합을 단언한다).
# Scheduler → Cloud Run Job 인증: --oauth-service-account-email 전용 (OIDC 금지).
# ═══════════════════════════════════════════════════════════════

# ═══════════════════════════════════════════════════════════════
# Section 0: 상수 · 배열 (--self-test 와 배포가 같이 쓴다)
# ═══════════════════════════════════════════════════════════════
JOB=gh-radar-kis-news-sync
REGION=asia-northeast3
REPO=gh-radar
KIS_SA_NAME=gh-radar-kis-news-sync-sa
SCHED_SA_NAME=gh-radar-scheduler-sa
KIS_APPKEY_SECRET=gh-radar-kis-appkey
KIS_APPSECRET_SECRET=gh-radar-kis-appsecret
SUPABASE_SECRET=gh-radar-supabase-service-role
VPC_NAME=gh-radar-vpc
SUBNET_NAME=gh-radar-subnet-an3
KIS_NEWS_MAX_RPS="${KIS_NEWS_MAX_RPS:-5}"
KIS_NEWS_VPC_EGRESS="${KIS_NEWS_VPC_EGRESS:-0}"

declare -a KIS_SCHEDULERS=(
  "gh-radar-kis-news-sync-fast|*/5 7-19 * * 1-5"
  "gh-radar-kis-news-sync-slow-weekday|*/15 0-6,20-23 * * 1-5"
  "gh-radar-kis-news-sync-slow-weekend|*/15 * * * 0,6"
)

# 초당 상한 — 정수 1 ~ 15 (공식 초당 20건의 75% 이하).
validate_rps() {
  if [[ ! "$KIS_NEWS_MAX_RPS" =~ ^[0-9]+$ ]] || (( KIS_NEWS_MAX_RPS < 1 || KIS_NEWS_MAX_RPS > 15 )); then
    echo "ERROR: KIS_NEWS_MAX_RPS='$KIS_NEWS_MAX_RPS' — 정수 1 ~ 15 만 허용(공식 초당 20건의 75% 이하 · 기본 5)" >&2
    return 1
  fi
}

# ═══════════════════════════════════════════════════════════════
# Section 0b: --self-test (GCP 접촉 0 — 배열 · 리터럴 · 상한만 본다)
# ═══════════════════════════════════════════════════════════════
self_test() {
  # macOS 기본 bash 3.2 에서도 돌게 연관 배열을 쓰지 않는다.
  local self="${BASH_SOURCE[0]}" entry name cron fails=0 seen=" "
  local -a fields=()

  if (( ${#KIS_SCHEDULERS[@]} != 3 )); then
    echo "FAIL: KIS_SCHEDULERS 원소가 3개가 아니다(${#KIS_SCHEDULERS[@]})" >&2
    fails=$((fails + 1))
  fi
  for entry in "${KIS_SCHEDULERS[@]}"; do
    if [[ "$entry" != *"|"* ]]; then
      echo "FAIL: '$entry' — 「이름|cron」 꼴이 아니다" >&2
      fails=$((fails + 1))
      continue
    fi
    name="${entry%%|*}"
    cron="${entry#*|}"
    if [[ ! "$name" =~ ^gh-radar-kis-news-sync-[a-z-]+$ ]]; then
      echo "FAIL: '$name' — 이름이 gh-radar-kis-news-sync-* 가 아니다" >&2
      fails=$((fails + 1))
    fi
    if [[ "$seen" == *" $name "* ]]; then
      echo "FAIL: '$name' — 이름 중복" >&2
      fails=$((fails + 1))
    fi
    seen="${seen}${name} "
    read -r -a fields <<< "$cron"
    if (( ${#fields[@]} != 5 )); then
      echo "FAIL: '$name' cron '$cron' — 필드가 5개가 아니다" >&2
      fails=$((fails + 1))
      continue
    fi
    local f
    for f in "${fields[@]}"; do
      if [[ ! "$f" =~ ^[0-9*,/-]+$ ]]; then
        echo "FAIL: '$name' cron 필드 '$f' — 허용 문자(숫자 * , / -) 밖" >&2
        fails=$((fails + 1))
      fi
    done
  done

  # 배포 명령의 리터럴 — 자기 자신의 검사 줄과 헷갈리지 않게 「들여쓴 플래그 + 줄 잇기」 꼴만 센다.
  if ! grep -Eq '^[[:space:]]+--task-timeout=14h[[:space:]]*\\$' "$self"; then
    echo "FAIL: 배포 명령에 --task-timeout=14h 줄이 없다" >&2
    fails=$((fails + 1))
  fi
  if ! grep -Eq '^[[:space:]]+--max-retries=0[[:space:]]*\\$' "$self"; then
    echo "FAIL: 배포 명령에 --max-retries=0 줄이 없다" >&2
    fails=$((fails + 1))
  fi
  if ! validate_rps; then
    fails=$((fails + 1))
  fi
  if [[ "$KIS_NEWS_VPC_EGRESS" != 0 && "$KIS_NEWS_VPC_EGRESS" != 1 ]]; then
    echo "FAIL: KIS_NEWS_VPC_EGRESS='$KIS_NEWS_VPC_EGRESS' — 0 또는 1 만" >&2
    fails=$((fails + 1))
  fi

  if (( fails > 0 )); then
    echo "SELF-TEST FAIL ($fails)" >&2
    return 1
  fi
  echo "SELF-TEST OK — schedulers=${#KIS_SCHEDULERS[@]} · task-timeout=14h · max-retries=0 · KIS_NEWS_MAX_RPS=${KIS_NEWS_MAX_RPS}"
}

case "${1:-}" in
  --self-test)
    self_test
    exit $?
    ;;
  -h | --help)
    echo "사용: GCP_PROJECT_ID=gh-radar SUPABASE_URL=… [KIS_NEWS_MAX_RPS=5] [KIS_NEWS_VPC_EGRESS=0|1] bash scripts/deploy-kis-news-sync.sh"
    echo "      bash scripts/deploy-kis-news-sync.sh --self-test   (GCP 접촉 0)"
    exit 0
    ;;
  "") ;;
  *)
    echo "ERROR: 알 수 없는 인자 '$1' (--self-test · --help)" >&2
    exit 1
    ;;
esac

validate_rps
if [[ "$KIS_NEWS_VPC_EGRESS" != 0 && "$KIS_NEWS_VPC_EGRESS" != 1 ]]; then
  echo "ERROR: KIS_NEWS_VPC_EGRESS='$KIS_NEWS_VPC_EGRESS' — 0 또는 1 만" >&2
  exit 1
fi

# ═══════════════════════════════════════════════════════════════
# Section 1: 가드 — gcloud configuration + 선행 SA · Secret(값 있는 버전) 확인
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

for SA in "$SCHED_SA_NAME" "$KIS_SA_NAME"; do
  SA_EMAIL="${SA}@${EXPECTED_PROJECT}.iam.gserviceaccount.com"
  if ! gcloud iam service-accounts describe "$SA_EMAIL" --project="$EXPECTED_PROJECT" >/dev/null 2>&1; then
    echo "ERROR: SA '$SA' not found. Run: ! GCP_PROJECT_ID=$EXPECTED_PROJECT bash scripts/setup-kis-news-sync-iam.sh" >&2
    exit 1
  fi
done

if ! gcloud secrets describe "$SUPABASE_SECRET" --project="$EXPECTED_PROJECT" >/dev/null 2>&1; then
  echo "ERROR: Secret '$SUPABASE_SECRET' not found" >&2
  exit 1
fi

# 한투 Secret 은 껍데기만으로는 부족하다 — ENABLED 버전이 1개 이상(값이 들어 있음)이어야 한다. 값은 읽지 않는다.
for SECRET in "$KIS_APPKEY_SECRET" "$KIS_APPSECRET_SECRET"; do
  if ! gcloud secrets describe "$SECRET" --project="$EXPECTED_PROJECT" >/dev/null 2>&1; then
    echo "ERROR: Secret '$SECRET' not found. Run: ! GCP_PROJECT_ID=$EXPECTED_PROJECT bash scripts/setup-kis-news-sync-iam.sh" >&2
    exit 1
  fi
  ENABLED_VER=$(gcloud secrets versions list "$SECRET" --project="$EXPECTED_PROJECT" \
    --filter='state=ENABLED' --limit=1 --format='value(name)' 2>/dev/null || true)
  if [[ -z "$ENABLED_VER" ]]; then
    echo "ERROR: Secret '$SECRET' 에 값(ENABLED 버전)이 없다 — setup-kis-secrets.sh 먼저: ! bash scripts/setup-kis-secrets.sh" >&2
    exit 1
  fi
done

echo "✓ gcloud guard + SA/Secret check"

# ═══════════════════════════════════════════════════════════════
# Section 2: 변수
# ═══════════════════════════════════════════════════════════════
SHA=$(git rev-parse --short HEAD)
REGISTRY="${REGION}-docker.pkg.dev/${EXPECTED_PROJECT}/${REPO}"
IMAGE="${REGISTRY}/kis-news-sync:${SHA}"
IMAGE_LATEST="${REGISTRY}/kis-news-sync:latest"
KIS_SA="${KIS_SA_NAME}@${EXPECTED_PROJECT}.iam.gserviceaccount.com"
SCHED_SA="${SCHED_SA_NAME}@${EXPECTED_PROJECT}.iam.gserviceaccount.com"

: "${SUPABASE_URL:?SUPABASE_URL must be set (export or source .env.deploy)}"

declare -a NET_FLAGS=()
if [[ "$KIS_NEWS_VPC_EGRESS" == 1 ]]; then
  NET_FLAGS=(--network="$VPC_NAME" --subnet="$SUBNET_NAME" --vpc-egress=all-traffic)
  echo "✓ VPC egress: $VPC_NAME / $SUBNET_NAME (all-traffic · Cloud NAT 고정 IP)"
fi

echo "✓ variables: SHA=$SHA, IMAGE=$IMAGE, KIS_NEWS_MAX_RPS=$KIS_NEWS_MAX_RPS"

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
# Section 4: Build (amd64 강제, GIT_SHA 주입) · Push
# ═══════════════════════════════════════════════════════════════
echo "▶ docker build..."
docker build \
  --platform=linux/amd64 \
  --build-arg "GIT_SHA=${SHA}" \
  -f workers/kis-news-sync/Dockerfile \
  -t "$IMAGE" \
  -t "$IMAGE_LATEST" \
  .

echo "▶ docker push..."
docker push "$IMAGE"
docker push "$IMAGE_LATEST"

# ═══════════════════════════════════════════════════════════════
# Section 5: Deploy Cloud Run Job
#   수집기 config.ts(41-06)가 읽는 env:
#     SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY · KIS_APPKEY · KIS_APPSECRET · KIS_BASE_URL · KIS_NEWS_MAX_RPS ·
#     KIS_NEWS_DAILY_BUDGET · KIS_NEWS_MODE(미설정 = auto) · KIS_NEWS_TARGET_CAP(미설정 = 450) · LOG_LEVEL · APP_VERSION
#   delimiter `^@^` → URL 의 `:` 충돌 회피
# ═══════════════════════════════════════════════════════════════
echo "▶ deploying Cloud Run Job..."
gcloud run jobs deploy "$JOB" \
  --image="$IMAGE" \
  --region="$REGION" \
  --service-account="$KIS_SA" \
  --cpu=1 \
  --memory=512Mi \
  --task-timeout=14h \
  --max-retries=0 \
  --parallelism=1 \
  --tasks=1 \
  ${NET_FLAGS[@]+"${NET_FLAGS[@]}"} \
  --set-env-vars="^@^SUPABASE_URL=${SUPABASE_URL}@KIS_BASE_URL=https://openapi.koreainvestment.com:9443@KIS_NEWS_MAX_RPS=${KIS_NEWS_MAX_RPS}@KIS_NEWS_DAILY_BUDGET=200000@LOG_LEVEL=info@APP_VERSION=${SHA}" \
  --set-secrets="SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SECRET}:latest,KIS_APPKEY=gh-radar-kis-appkey:latest,KIS_APPSECRET=gh-radar-kis-appsecret:latest" \
  --project="$EXPECTED_PROJECT"

# ═══════════════════════════════════════════════════════════════
# Section 6: Scheduler SA → Job invoker (리소스 단위 바인딩, 프로젝트 단위 금지)
# ═══════════════════════════════════════════════════════════════
gcloud run jobs add-iam-policy-binding "$JOB" \
  --region="$REGION" \
  --member="serviceAccount:${SCHED_SA}" \
  --role=roles/run.invoker \
  --project="$EXPECTED_PROJECT" >/dev/null
echo "✓ run.invoker bound: $SCHED_SA_NAME → $JOB"

# ═══════════════════════════════════════════════════════════════
# Section 7: Cloud Scheduler 3개 (create/update 멱등 · Asia/Seoul · OAuth)
#   세 Scheduler 모두 본문 없는 같은 jobs:run URI 를 호출한다 — 모드는 수집기가 KST 시각으로 판정.
# ═══════════════════════════════════════════════════════════════
JOB_INVOKE_URI="https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${EXPECTED_PROJECT}/jobs/${JOB}:run"

for entry in "${KIS_SCHEDULERS[@]}"; do
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
# Section 8: Smoke (probe 1회 · Job 설정 · Scheduler · 「probe ok」 로그)
# ═══════════════════════════════════════════════════════════════
echo ""
echo "✓ Deployed: Cloud Run Job $JOB @ $IMAGE"
echo "  Schedulers: gh-radar-kis-news-sync-fast + gh-radar-kis-news-sync-slow-weekday + gh-radar-kis-news-sync-slow-weekend"
echo ""

echo "▶ smoke tests..."
bash "$(dirname "$0")/smoke-kis-news-sync.sh" "$JOB" "$REGION"

echo ""
echo "✅ deploy-kis-news-sync.sh complete"
