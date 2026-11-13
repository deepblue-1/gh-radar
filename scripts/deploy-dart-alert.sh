#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════
# Phase 43 Plan 07 — dart-alert(공개매수 · 주요사항 · 거래소 수시공시 · 임원 거래계획 공시 텔레그램 알림) Cloud Run Job + Scheduler 1개 +
#   이메일 알림 정책 2개 배포 (deploy-kis-news-sync.sh 꼴 · 알림 정책은 deploy-limitup-sync.sh Section 7 꼴)
#
# 선행(사용자 `!` — 비밀 · IAM 쓰기는 사용자 터미널에서만):
#   ! GCP_PROJECT_ID=gh-radar bash scripts/setup-dart-alert-iam.sh   (SA · Secret 껍데기 3개 · Accessor 4건)
#   ! bash scripts/setup-dart-alert-secrets.sh                       (OpenDART 키 · 봇 토큰 · 방 id 값)
#   supabase db push --linked --yes                                  (dart_alert 마이그레이션 — 워커보다 먼저 · 스모크 INV-6b 가 확인)
# 스모크가 실패하면 Job 은 이미 새 이미지 · env 다 — 끝에 직전 이미지로 되돌리는 명령을 찍는다(리뷰 WR-52).
# 실행(메인 세션): GCP_PROJECT_ID=gh-radar SUPABASE_URL=… bash scripts/deploy-dart-alert.sh [--scheduler-paused]
# 점검만(GCP 접촉 0): bash scripts/deploy-dart-alert.sh --self-test
#
# 리소스:
#   - Cloud Run Job: gh-radar-dart-alert (asia-northeast3 · 1 vCPU · 512Mi · task-timeout 14h · retries 0 · 동시 1개)
#   - Image: asia-northeast3-docker.pkg.dev/<proj>/gh-radar/dart-alert:<sha>
#   - Scheduler (Asia/Seoul · 상수 WAKE_SCHEDULER · WAKE_SCHEDULE — 하나뿐):
#       gh-radar-dart-alert-wake  "*/5 7-19 * * 1-5"  평일 07:00 ~ 19:55 5분마다 깨움 · 밤 · 주말 깨움 0
#   - 알림 정책(운영자 이메일 · D-16):
#       gh-radar-dart-alert-failure          Job 실행 실패 수 > 0 (설정 오류 · 020 · 키 오류 · 예외 · 메모리 부족)
#       gh-radar-dart-alert-error-log        이 Job 의 error 로그 일치 (장애 열림 · 텔레그램 실패 · 방 이동 · 120초 미송신 —
#                                            종료 0 으로 계속 도는 동안의 문제)
#       gh-radar-dart-alert-scheduler-error  깨움(Scheduler) 호출 실패 로그 (run.invoker 유실 403 · Job 없음 404 — 리뷰 CR-50)
#     (「깨움 없음」 정책 — 평일 창 안 30분 실행 시작 0건 — 은 2026-11-13 사용자 결정으로 뺐다. 깨움이 멈춤 · 삭제 상태인지는
#      배포 · 스모크 INV-3 가 ENABLED 를 확인한다.)
#
# 설계:
#   D-10 바퀴 간격: 평일 07:00 ~ 09:00 5초 · 09:00 ~ 20:00 10초(시작 대 시작) · 한 바퀴 = 공개매수(D004) 1회 + 주요사항보고서(B001) 1회 ·
#        거래소 수시공시(I001)는 30초 · 임원ㆍ주요주주 거래계획(D005)은 60초 칸(07:00 기준)마다 1회(261113-iez).
#   D-11 창: 평일 07:00 이상 20:00 미만만 수집 · 휴장일 달력 없음(평일 공휴일도 돈다).
#        모드는 Scheduler 가 넘기지 않는다 — 수집기가 KST 시각으로 스스로 판정한다(workers/dart-alert/src/cadence.ts).
#   임대: 창 안에서 5분마다 깨워도 임대(dart_alert_lease_acquire · TTL 90초 · 30초 연장)를 가진 실행이 살아 있으면
#        새 실행은 몇 초 만에 0 으로 끝난다. 실행이 죽으면 늦어도 다음 깨움(≤ 5분 + TTL)에서 다른 실행이 이어받는다.
#   `--max-retries=0` — 재시작은 Scheduler 깨움 + 임대가 맡는다. Job 재시도는 같은 실행 안 즉시 재기동이라
#        한도 신호(020) 뒤 두드림 · 장애 글 반복이 된다(CLAUDE.md 「공식 API 운영 기준」 ④).
#   `--task-timeout=14h` — 창 13시간(07:00 ~ 20:00) + 여유. Cloud Run Job 상한은 168시간.
#
# 예산(CLAUDE.md 「공식 API 운영 기준」):
#   공식 일일 한도 20,000 → 설계 상한 DART_ALERT_DAILY_BUDGET 기본 15,000(75%) · 1 ~ 15,000 밖이면 이 스크립트가 거부한다.
#   평일 사용 ≈ 13,140(5,400 × 2 + 1,560 + 780 · 66%) + I001 추가 쪽 약 400 ~ 800 · 최악 14,700 · 남는 몫은 추가 쪽 · 한도 의심 뒤 탐침.
#   카운터: api_usage service opendart_list (KST 날짜 키) · 한도 의심 표시 opendart_list_quota_strike.
#   호출량은 사용자 수와 독립 — server · webapp 은 OpenDART 를 부르지 않는다.
#
# 고정 IP: 기본은 VPC 없이(Supabase 직통). OpenDART 가 012(허용 안 된 IP)를 돌려주면
#   DART_ALERT_VPC_EGRESS=1 bash scripts/deploy-dart-alert.sh
#   로 gh-radar-vpc / gh-radar-subnet-an3 · --vpc-egress=all-traffic(Cloud NAT 고정 IP · kis-news-sync 선례)로 바꾼다.
#
# 배포 시점 주의: 장중에 다시 배포해도 이미 도는 실행은 옛 이미지로 20:00 까지 간다(임대를 쥐고 있으므로 새 실행은 바로 끝남).
#   즉시 바꿔야 하면 도는 실행을 취소한다 — 다음 5분 깨움이 새 이미지로 임대를 넘겨받는다(TTL 90초 뒤):
#     gcloud run jobs executions list --job=gh-radar-dart-alert --region=asia-northeast3 --filter='status.completionTime=null'
#     gcloud run jobs executions cancel <실행 이름> --region=asia-northeast3
#   그 사이에 올라온 건은 「(늦은 알림)」 으로 나가고, 인계가 5분을 넘으면 단체방에 「멈췄습니다」 · 「다시 동작」 두 글이 붙는다.
#   → 평일 20:00 뒤 · 07:00 전 배포를 권장한다.
#   새 감시 대상을 처음 싣는 배포(261113-iez — I001 · D005)는 평일 20:00 뒤 · 07:00 전에 하고, 장중에 도는 실행을 취소해 바로
#   바꾸지 않는다 — 새 감시 대상은 DB last_ok 가 없어 시작 점검이 「멈췄습니다」 · 「다시 동작」 짝 글을 내고 그날 앞선
#   I001 · D005 건이 「(늦은 알림)」 으로 한꺼번에 나간다.
#
# 첫 배포 날(창 안에서 처음 배포할 때 — 그날 이미 올라온 건이 한꺼번에 나가지 않게):
#   1. GCP_PROJECT_ID=gh-radar SUPABASE_URL=… bash scripts/deploy-dart-alert.sh --scheduler-paused
#   2. seed 실행을 --wait 없이 시작한다 — 그날 이미 올라온 건을 알림 없이 채운 뒤 같은 실행이 20:00 까지 수집을 이어 간다
#      (빈틈이 없어 가짜 「멈췄습니다」 · 「다시 동작」 짝 글과 「(늦은 알림)」 이 나가지 않는다 · 43-05 · 43-06):
#        gcloud run jobs execute gh-radar-dart-alert --region=asia-northeast3 --update-env-vars=DART_ALERT_MODE=seed
#   3. Cloud Logging 에서 「seed done」 확인:
#        gcloud logging read 'resource.type="cloud_run_job" AND resource.labels.job_name="gh-radar-dart-alert" AND jsonPayload.msg="seed done"' --freshness=30m --limit=5
#   4. gcloud scheduler jobs resume gh-radar-dart-alert-wake --location=asia-northeast3
#      (깨움 실행은 임대가 잡혀 있어 바로 끝나고, seed 실행이 죽으면 다음 깨움이 인계한다)
#   창 밖(20:00 뒤 · 07:00 전 · 주말) 첫 배포는 --scheduler-paused 없이 그냥 배포하면 된다.
#   --scheduler-paused 는 Scheduler 를 **처음 만들 때만** 멈춘다(리뷰 CR-50). 이미 있는 Scheduler 가 ENABLED 면 이 플래그를
#   거부하고 아무것도 바꾸지 않은 채 끝난다 — 운영 중 재배포로 살아 있는 깨움을 멈추지 않게. 이미 PAUSED 면 그대로 둔다.
#   resume 을 빠뜨리면 메일이 오지 않는다 — 지금 도는 실행이 죽으면 이어받을 실행이 없으니 resume 을 꼭 확인한다.
#
# 수동 모드 실행(Job 설정의 env 는 바꾸지 않고 그 실행에만 덮어쓴다):
#   gcloud run jobs execute gh-radar-dart-alert --region=asia-northeast3 --update-env-vars=DART_ALERT_MODE=probe --wait
#   gcloud run jobs execute gh-radar-dart-alert --region=asia-northeast3 --update-env-vars=DART_ALERT_MODE=test-send --wait
#   (seed 는 위 「첫 배포 날」 처럼 --wait 없이 — 같은 실행이 20:00 까지 이어 간다)
#
# 쉼표가 든 env 값(DART_ALERT_B001_KINDS — 주요사항보고서 허용 종류명 목록)은 gcloud 구분자를 바꿔 넣는다:
#   gcloud run jobs update gh-radar-dart-alert --region=asia-northeast3 \
#     --update-env-vars='^@^DART_ALERT_B001_KINDS=유상증자결정,유무상증자결정,회사합병결정,회사분할합병결정,자기주식취득결정,주식교환ㆍ이전결정'
#   주의: 이 스크립트의 배포는 --set-env-vars 라 Job env 를 통째로 바꾼다 — 위처럼 따로 넣은 값은 다음 배포에서 사라진다.
#   값을 유지하려면 배포 때 같은 이름의 env 로 넘긴다(아래 Section 5 가 그대로 싣는다):
#     DART_ALERT_B001_KINDS='유상증자결정,…' DART_ALERT_B001_CORRECTIONS=exclude GCP_PROJECT_ID=gh-radar SUPABASE_URL=… bash scripts/deploy-dart-alert.sh
#   주의: 기본값은 6종(위 예시)이다 — 옛 4종 목록을 복사해 넣으면 자기주식취득결정 · 주식교환ㆍ이전결정이 빠진다.
#
# Scheduler 일정을 바꾸면 workers/dart-alert/tests/schedule.test.ts 를 먼저 돌린다
#   (그 테스트가 이 파일의 WAKE_SCHEDULER · WAKE_SCHEDULE 두 줄을 직접 읽어 1주일 × 1440분 정합을 단언한다).
# Scheduler → Cloud Run Job 인증: --oauth-service-account-email 전용 (OIDC 금지).
# 알림 채널: NOTIFICATION_CHANNEL_ID(id 또는 projects/…/notificationChannels/… 전체 이름)를 안 주면
#   기존 limitup 알림 정책(gh-radar-limitup-sync-failure)의 첫 채널을 쓴다.
# ═══════════════════════════════════════════════════════════════

# ═══════════════════════════════════════════════════════════════
# Section 0: 상수 · 배열 (--self-test 와 배포가 같이 쓴다)
# ═══════════════════════════════════════════════════════════════
JOB=gh-radar-dart-alert
REGION=asia-northeast3
REPO=gh-radar
DART_SA_NAME=gh-radar-dart-alert-sa
SCHED_SA_NAME=gh-radar-scheduler-sa
DART_KEY_SECRET=gh-radar-opendart-key
DART_KEY2_SECRET=gh-radar-opendart-key-2
TG_TOKEN_SECRET=gh-radar-telegram-bot-token
TG_CHAT_SECRET=gh-radar-telegram-chat-id
SUPABASE_SECRET=gh-radar-supabase-service-role
VPC_NAME=gh-radar-vpc
SUBNET_NAME=gh-radar-subnet-an3
DART_ALERT_DAILY_BUDGET="${DART_ALERT_DAILY_BUDGET:-15000}"
DART_ALERT_VPC_EGRESS="${DART_ALERT_VPC_EGRESS:-0}"
DART_ALERT_B001_KINDS="${DART_ALERT_B001_KINDS:-}"
DART_ALERT_B001_CORRECTIONS="${DART_ALERT_B001_CORRECTIONS:-}"
LIMITUP_POLICY_NAME=gh-radar-limitup-sync-failure

# 깨움 Scheduler 하나 — schedule.test.ts · smoke-dart-alert.sh 가 이 두 줄을 그대로 읽는다(원소 1개로 잠긴 배열 대신 · 리뷰 IN-59)
WAKE_SCHEDULER=gh-radar-dart-alert-wake
WAKE_SCHEDULE="*/5 7-19 * * 1-5"

# 알림 정책 — 파일과 표시 이름은 같은 순서(smoke-dart-alert.sh INV-5 가 이 배열을 읽는다)
declare -a ALERT_POLICY_FILES=(
  "ops/alert-dart-alert-failure.yaml"
  "ops/alert-dart-alert-error-log.yaml"
  "ops/alert-dart-alert-scheduler-error.yaml"
)
declare -a ALERT_POLICY_NAMES=(
  "gh-radar-dart-alert-failure"
  "gh-radar-dart-alert-error-log"
  "gh-radar-dart-alert-scheduler-error"
)

# 하루 예산 — 정수 1 ~ 15,000 (공식 20,000/일의 75% 이하 · 기본 15,000 · config.ts DART_DAILY_BUDGET_LIMIT 와 같다).
validate_budget() {
  if [[ ! "$DART_ALERT_DAILY_BUDGET" =~ ^[0-9]+$ ]] || (( 10#$DART_ALERT_DAILY_BUDGET < 1 || 10#$DART_ALERT_DAILY_BUDGET > 15000 )); then
    echo "ERROR: DART_ALERT_DAILY_BUDGET='$DART_ALERT_DAILY_BUDGET' — 정수 1 ~ 15000 만 허용(공식 20,000/일의 75% 이하 · 기본 15000)" >&2
    return 1
  fi
}

# 선택 env 검사 — 구분자 `@` 와 겹치지 않게 · 정정 포함 여부는 include|exclude 만(config.ts 와 같은 계약).
validate_optional_env() {
  if [[ "$DART_ALERT_VPC_EGRESS" != 0 && "$DART_ALERT_VPC_EGRESS" != 1 ]]; then
    echo "ERROR: DART_ALERT_VPC_EGRESS='$DART_ALERT_VPC_EGRESS' — 0 또는 1 만" >&2
    return 1
  fi
  if [[ "$DART_ALERT_B001_KINDS" == *"@"* ]]; then
    echo "ERROR: DART_ALERT_B001_KINDS 에 '@' 가 있다 — env 구분자와 겹친다" >&2
    return 1
  fi
  if [[ -n "$DART_ALERT_B001_CORRECTIONS" && "$DART_ALERT_B001_CORRECTIONS" != include && "$DART_ALERT_B001_CORRECTIONS" != exclude ]]; then
    echo "ERROR: DART_ALERT_B001_CORRECTIONS='$DART_ALERT_B001_CORRECTIONS' — include 또는 exclude 만" >&2
    return 1
  fi
}

# ═══════════════════════════════════════════════════════════════
# Section 0b: --self-test (GCP 접촉 0 — 배열 · 리터럴 · 상한 · 정책 파일만 본다)
# ═══════════════════════════════════════════════════════════════
self_test() {
  # macOS 기본 bash 3.2 에서도 돌게 연관 배열을 쓰지 않는다.
  local self="${BASH_SOURCE[0]}" root fails=0 i f
  local -a fields=()
  root="$(cd "$(dirname "$self")/.." && pwd)"

  if [[ "$WAKE_SCHEDULER" != "gh-radar-dart-alert-wake" ]]; then
    echo "FAIL: WAKE_SCHEDULER '$WAKE_SCHEDULER' — gh-radar-dart-alert-wake 가 아니다" >&2
    fails=$((fails + 1))
  fi
  if [[ "$WAKE_SCHEDULE" != "*/5 7-19 * * 1-5" ]]; then
    echo "FAIL: WAKE_SCHEDULE '$WAKE_SCHEDULE' — '*/5 7-19 * * 1-5' 가 아니다(D-11 창 · schedule.test.ts 먼저)" >&2
    fails=$((fails + 1))
  fi
  read -r -a fields <<< "$WAKE_SCHEDULE"
  if (( ${#fields[@]} != 5 )); then
    echo "FAIL: WAKE_SCHEDULE '$WAKE_SCHEDULE' — 필드가 5개가 아니다" >&2
    fails=$((fails + 1))
  fi

  # 배포 명령의 리터럴 — 자기 자신의 검사 줄과 헷갈리지 않게 「들여쓴 플래그 + 줄 잇기」 꼴만 센다.
  for f in '--task-timeout=14h' '--max-retries=0' '--parallelism=1'; do
    if ! grep -Eq "^[[:space:]]+${f}[[:space:]]*\\\\\$" "$self"; then
      echo "FAIL: 배포 명령에 ${f} 줄이 없다" >&2
      fails=$((fails + 1))
    fi
  done
  if ! grep -Eq '^[[:space:]]+(if ! )?gcloud scheduler jobs pause ' "$self"; then
    echo "FAIL: --scheduler-paused 처리(gcloud scheduler jobs pause) 줄이 없다" >&2
    fails=$((fails + 1))
  fi
  # 멈춘 채 만들기는 곧 울리지 않는 임시 일정으로 만든 뒤 멈춘다(리뷰 WR-50 — 만든 직후 깨움 경합)
  if ! grep -Eq '^[[:space:]]+--schedule="0 0 1 1 \*"[[:space:]]*\\$' "$self"; then
    echo "FAIL: --scheduler-paused 생성 경로에 임시 일정(0 0 1 1 *) 줄이 없다" >&2
    fails=$((fails + 1))
  fi
  # set -x · set -ex · set -o xtrace · BASH_XTRACEFD= 모두(리뷰 IN-56)
  if grep -Eq '^[[:space:]]*set[[:space:]]+(-[a-zA-Z]*x|-o[[:space:]]+xtrace)|^[[:space:]]*(export[[:space:]]+)?BASH_XTRACEFD=' "$self"; then
    echo "FAIL: 셸 추적 모드 줄이 있다(비밀 · 명령이 화면에 찍힌다)" >&2
    fails=$((fails + 1))
  fi

  # 예산 검사 — 지금 값은 통과하고, 15001 · 0 · 숫자 아님은 거부해야 한다.
  if ! validate_budget; then
    fails=$((fails + 1))
  fi
  local bad
  for bad in 15001 0 abc; do
    if ( DART_ALERT_DAILY_BUDGET="$bad"; validate_budget ) 2>/dev/null; then
      echo "FAIL: 예산 검사가 '$bad' 를 거부하지 않는다" >&2
      fails=$((fails + 1))
    fi
  done
  if ! validate_optional_env; then
    fails=$((fails + 1))
  fi

  # 알림 정책 파일 — 셋 다 있고 · Job 이름과 채널 자리가 들어 있다(실행 실패 · error 로그 · 깨움 실패 — 리뷰 CR-50).
  if (( ${#ALERT_POLICY_FILES[@]} != 3 || ${#ALERT_POLICY_NAMES[@]} != 3 )); then
    echo "FAIL: 알림 정책 파일 · 이름이 3개씩이 아니다(${#ALERT_POLICY_FILES[@]} · ${#ALERT_POLICY_NAMES[@]})" >&2
    fails=$((fails + 1))
  fi
  for i in "${!ALERT_POLICY_FILES[@]}"; do
    f="$root/${ALERT_POLICY_FILES[$i]}"
    if [[ ! -f "$f" ]]; then
      echo "FAIL: 알림 정책 파일 없음: ${ALERT_POLICY_FILES[$i]}" >&2
      fails=$((fails + 1))
      continue
    fi
    if ! grep -q 'gh-radar-dart-alert' "$f"; then
      echo "FAIL: ${ALERT_POLICY_FILES[$i]} 에 gh-radar-dart-alert 가 없다" >&2
      fails=$((fails + 1))
    fi
    if ! grep -qF '${NOTIFICATION_CHANNEL_ID}' "$f"; then
      echo "FAIL: ${ALERT_POLICY_FILES[$i]} 에 \${NOTIFICATION_CHANNEL_ID} 자리가 없다" >&2
      fails=$((fails + 1))
    fi
    if ! grep -q "^displayName: ${ALERT_POLICY_NAMES[$i]}\$" "$f"; then
      echo "FAIL: ${ALERT_POLICY_FILES[$i]} 의 displayName 이 ${ALERT_POLICY_NAMES[$i]} 가 아니다" >&2
      fails=$((fails + 1))
    fi
  done

  if (( fails > 0 )); then
    echo "SELF-TEST FAIL ($fails)" >&2
    return 1
  fi
  echo "SELF-TEST OK — scheduler=${WAKE_SCHEDULER} (${WAKE_SCHEDULE}) · task-timeout=14h · max-retries=0 · parallelism=1 · DART_ALERT_DAILY_BUDGET=${DART_ALERT_DAILY_BUDGET} (15001 거부) · alert policies=${#ALERT_POLICY_FILES[@]}"
}

usage() {
  echo "사용: GCP_PROJECT_ID=gh-radar SUPABASE_URL=… [DART_ALERT_DAILY_BUDGET=15000] [DART_ALERT_VPC_EGRESS=0|1] [NOTIFICATION_CHANNEL_ID=…]"
  echo "        bash scripts/deploy-dart-alert.sh [--scheduler-paused]"
  echo "      bash scripts/deploy-dart-alert.sh --self-test   (GCP 접촉 0)"
  echo "  --scheduler-paused  Scheduler 를 처음 만들 때 멈춘 채로 둔다(창 안 첫 배포 — seed 실행 → seed done → resume · 머리 주석)."
  echo "                      이미 있는 ENABLED Scheduler 에는 거부한다(운영 중 깨움을 멈추지 않는다)."
}

SCHEDULER_PAUSED=0
for arg in "$@"; do
  case "$arg" in
    --self-test)
      self_test
      exit $?
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    --scheduler-paused)
      SCHEDULER_PAUSED=1
      ;;
    *)
      echo "ERROR: 알 수 없는 인자 '$arg' (--self-test · --help · --scheduler-paused)" >&2
      exit 1
      ;;
  esac
done

validate_budget
validate_optional_env

# ═══════════════════════════════════════════════════════════════
# Section 1: 가드 — gcloud configuration + 선행 SA · Secret(값 있는 버전) 확인
# ═══════════════════════════════════════════════════════════════
EXPECTED_PROJECT="${GCP_PROJECT_ID:-}"
EXPECTED_CONFIG="gh-radar"

if [[ -z "$EXPECTED_PROJECT" ]]; then
  echo "ERROR: GCP_PROJECT_ID env var is required" >&2
  exit 1
fi
: "${SUPABASE_URL:?SUPABASE_URL must be set (export or source .env.deploy)}"

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

for SA in "$SCHED_SA_NAME" "$DART_SA_NAME"; do
  SA_EMAIL="${SA}@${EXPECTED_PROJECT}.iam.gserviceaccount.com"
  if ! gcloud iam service-accounts describe "$SA_EMAIL" --project="$EXPECTED_PROJECT" >/dev/null 2>&1; then
    if [[ "$SA" == "$SCHED_SA_NAME" ]]; then
      # setup-dart-alert-iam.sh 는 수집기 SA 만 만든다 — Scheduler SA 는 여러 워커의 Scheduler 가 함께 쓰는 기존 SA 다(리뷰 IN-58)
      echo "ERROR: Scheduler SA '$SA' 가 없다 — 다른 워커(kis-news-sync · master-sync 등)의 Scheduler 도 함께 쓰는 기존 SA 라" >&2
      echo "       이 저장소 스크립트는 만들지 않는다(setup-dart-alert-iam.sh 로는 안 생긴다). 다른 Scheduler 도 깨졌는지 먼저 본다." >&2
      echo "       다시 만들려면(사용자 터미널): ! gcloud iam service-accounts create $SA --display-name='gh-radar Cloud Scheduler invoker' --project=$EXPECTED_PROJECT" >&2
      echo "       그 뒤 각 워커의 deploy 스크립트를 다시 실행해 Job 마다 run.invoker 를 다시 묶는다." >&2
    else
      echo "ERROR: SA '$SA' not found. Run: ! GCP_PROJECT_ID=$EXPECTED_PROJECT bash scripts/setup-dart-alert-iam.sh" >&2
    fi
    exit 1
  fi
done

# 두 번째 OpenDART 키(261113-rn7 U-2) — 공시 알림은 키 2개로만 돈다(한 키 대체 없음). 없거나 비었으면 전용 안내로 멈춘다.
dart_key2_missing() {
  echo "ERROR: 두 번째 OpenDART 키 Secret '$DART_KEY2_SECRET' 가 없다(또는 값이 비었다) — 공시 알림은 이제 키 2개로만 돈다." >&2
  echo "       사용자 터미널에서 ① ! GCP_PROJECT_ID=$EXPECTED_PROJECT bash scripts/setup-dart-alert-iam.sh" >&2
  echo "       ② ~/.config/gh-radar/dart-alert.env 에 OPENDART_API_KEY_2= 줄을 넣고 ! bash scripts/setup-dart-alert-secrets.sh 뒤 다시 배포" >&2
  exit 1
}

# Secret 은 껍데기만으로는 부족하다 — ENABLED 버전이 1개 이상(값이 들어 있음)이어야 한다. 값은 읽지 않는다.
for SECRET in "$DART_KEY_SECRET" "$DART_KEY2_SECRET" "$TG_TOKEN_SECRET" "$TG_CHAT_SECRET" "$SUPABASE_SECRET"; do
  if ! gcloud secrets describe "$SECRET" --project="$EXPECTED_PROJECT" >/dev/null 2>&1; then
    [[ "$SECRET" == "$DART_KEY2_SECRET" ]] && dart_key2_missing
    echo "ERROR: Secret '$SECRET' not found. Run: ! GCP_PROJECT_ID=$EXPECTED_PROJECT bash scripts/setup-dart-alert-iam.sh" >&2
    exit 1
  fi
  ENABLED_VER=$(gcloud secrets versions list "$SECRET" --project="$EXPECTED_PROJECT" \
    --filter='state=ENABLED' --limit=1 --format='value(name)' 2>/dev/null || true)
  if [[ -z "$ENABLED_VER" ]]; then
    [[ "$SECRET" == "$DART_KEY2_SECRET" ]] && dart_key2_missing
    echo "ERROR: Secret '$SECRET' 에 값(ENABLED 버전)이 없다 — 먼저: ! bash scripts/setup-dart-alert-secrets.sh" >&2
    exit 1
  fi
done

# 알림 채널 — 안 주면 기존 limitup 정책의 첫 채널(운영자 이메일)을 쓴다. 배포 전에 정해 두어 중간 실패를 막는다.
NOTIFICATION_CHANNEL_ID="${NOTIFICATION_CHANNEL_ID:-}"
if [[ -z "$NOTIFICATION_CHANNEL_ID" ]]; then
  NOTIFICATION_CHANNEL_ID=$(gcloud alpha monitoring policies list --project="$EXPECTED_PROJECT" \
    --filter="displayName=${LIMITUP_POLICY_NAME}" \
    --format='value(notificationChannels[0])' 2>/dev/null | head -1 || true)
  if [[ -z "$NOTIFICATION_CHANNEL_ID" ]]; then
    echo "ERROR: NOTIFICATION_CHANNEL_ID 가 비었고 ${LIMITUP_POLICY_NAME} 정책에서도 채널을 찾지 못했다 — NOTIFICATION_CHANNEL_ID=<id> 로 다시 실행" >&2
    exit 1
  fi
  echo "✓ 알림 채널: ${LIMITUP_POLICY_NAME} 정책의 채널을 쓴다 ($NOTIFICATION_CHANNEL_ID)"
fi
for f in "${ALERT_POLICY_FILES[@]}"; do
  if [[ ! -f "$f" ]]; then
    echo "ERROR: alert policy file '$f' not found (저장소 루트에서 실행)" >&2
    exit 1
  fi
done

# --scheduler-paused 는 Scheduler 를 처음 만들 때만 — 이미 있는 ENABLED Scheduler 를 멈추지 않는다(리뷰 CR-50).
#   빌드 · 배포 전에 거부해 아무것도 바뀌지 않게 한다. 이미 PAUSED 면(첫 배포 날 절차를 다시 돌림) 그대로 둔다.
SCHED_STATE_BEFORE=""
if [[ "$SCHEDULER_PAUSED" == 1 ]]; then
  SCHED_STATE_BEFORE=$(gcloud scheduler jobs describe "${WAKE_SCHEDULER}" --location="$REGION" \
    --project="$EXPECTED_PROJECT" --format='value(state)' 2>/dev/null || true)
  if [[ -n "$SCHED_STATE_BEFORE" && "$SCHED_STATE_BEFORE" != PAUSED ]]; then
    echo "ERROR: ${WAKE_SCHEDULER} 가 이미 있고 상태가 ${SCHED_STATE_BEFORE} 다 — --scheduler-paused 는 Scheduler 를 처음 만들 때만 쓴다" >&2
    echo "       (운영 중 깨움을 멈추지 않으려고 아무것도 바꾸지 않고 멈춘다). 플래그 없이 다시 실행한다." >&2
    exit 1
  fi
fi

echo "✓ gcloud guard + SA/Secret/채널 check"

# ═══════════════════════════════════════════════════════════════
# Section 2: 변수
# ═══════════════════════════════════════════════════════════════
SHA=$(git rev-parse --short HEAD)
# 이미지 태그 · APP_VERSION 은 HEAD SHA 인데 docker build 는 작업 트리를 쓴다(리뷰 WR-51). 빌드 입력(workers/dart-alert/Dockerfile 의
#   COPY 경로 — 추적 안 된 파일 포함)이 HEAD 와 다르면 커밋에 없는 코드가 「dart-alert:<깨끗한 sha>」 로 나가므로 막는다.
#   일부러 그대로 올리려면 ALLOW_DIRTY=1 — 태그 · APP_VERSION 에 -dirty-<epoch초> 를 붙인다(deploy-tick-convert.sh 와 같은 꼴).
BUILD_PATHS=(package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json workers/dart-alert)
if [[ -n "$(git status --porcelain -- "${BUILD_PATHS[@]}")" ]]; then
  if [[ "${ALLOW_DIRTY:-0}" == "1" ]]; then
    SHA="${SHA}-dirty-$(date +%s)"
    echo "⚠ 빌드 입력이 HEAD 와 다르다 — ALLOW_DIRTY=1 · 태그 ${SHA}"
  else
    git status --short -- "${BUILD_PATHS[@]}" >&2
    echo "ERROR: 빌드 입력(${BUILD_PATHS[*]})에 커밋 안 된 변경이 있다 — 커밋하거나 깨끗한 worktree 에서 배포 (그대로 올리려면 ALLOW_DIRTY=1 · 태그 -dirty-<epoch초>)" >&2
    exit 1
  fi
fi
REGISTRY="${REGION}-docker.pkg.dev/${EXPECTED_PROJECT}/${REPO}"
IMAGE="${REGISTRY}/dart-alert:${SHA}"
IMAGE_LATEST="${REGISTRY}/dart-alert:latest"
DART_SA="${DART_SA_NAME}@${EXPECTED_PROJECT}.iam.gserviceaccount.com"
SCHED_SA="${SCHED_SA_NAME}@${EXPECTED_PROJECT}.iam.gserviceaccount.com"

declare -a NET_FLAGS=()
if [[ "$DART_ALERT_VPC_EGRESS" == 1 ]]; then
  NET_FLAGS=(--network="$VPC_NAME" --subnet="$SUBNET_NAME" --vpc-egress=all-traffic)
  echo "✓ VPC egress: $VPC_NAME / $SUBNET_NAME (all-traffic · Cloud NAT 고정 IP)"
fi

# Job env — 모드(DART_ALERT_MODE)는 넣지 않는다(기본 auto · 수동 모드는 실행에만 덮어쓴다).
# 구분자 `^@^` → URL 의 `:` · 종류 목록의 `,` 충돌 회피
ENV_VARS="^@^SUPABASE_URL=${SUPABASE_URL}@DART_ALERT_DAILY_BUDGET=${DART_ALERT_DAILY_BUDGET}@APP_VERSION=${SHA}@LOG_LEVEL=info"
if [[ -n "$DART_ALERT_B001_KINDS" ]]; then
  ENV_VARS="${ENV_VARS}@DART_ALERT_B001_KINDS=${DART_ALERT_B001_KINDS}"
fi
if [[ -n "$DART_ALERT_B001_CORRECTIONS" ]]; then
  ENV_VARS="${ENV_VARS}@DART_ALERT_B001_CORRECTIONS=${DART_ALERT_B001_CORRECTIONS}"
fi

echo "✓ variables: SHA=$SHA, IMAGE=$IMAGE, DART_ALERT_DAILY_BUDGET=$DART_ALERT_DAILY_BUDGET"

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
  -f workers/dart-alert/Dockerfile \
  -t "$IMAGE" \
  -t "$IMAGE_LATEST" \
  .

echo "▶ docker push..."
docker push "$IMAGE"
docker push "$IMAGE_LATEST"

# ═══════════════════════════════════════════════════════════════
# Section 5: Deploy Cloud Run Job
#   수집기 config.ts(43-03)가 읽는 env:
#     비밀 — SUPABASE_SERVICE_ROLE_KEY · OPENDART_API_KEY · OPENDART_API_KEY_2 · TELEGRAM_BOT_TOKEN · TELEGRAM_CHAT_ID
#            (Secret :latest — 실행 시작 때 1번 읽음 · 키 2 = 261113-rn7)
#     설정 — SUPABASE_URL · DART_ALERT_DAILY_BUDGET · APP_VERSION · LOG_LEVEL ·
#            DART_ALERT_B001_KINDS · DART_ALERT_B001_CORRECTIONS(선택 — 미설정이면 config.ts 기본값) ·
#            DART_ALERT_MODE(미설정 = auto)
# ═══════════════════════════════════════════════════════════════
# 되돌리기용 — 지금 Job 의 이미지(처음 배포면 비어 있다 · 리뷰 WR-52). 스모크가 실패하면 이 이름으로 되돌리는 명령을 안내한다.
PREV_IMAGE=$(gcloud run jobs describe "$JOB" --region="$REGION" --project="$EXPECTED_PROJECT" \
  --format='value(spec.template.spec.template.spec.containers[0].image)' 2>/dev/null || true)
echo "  직전 이미지: ${PREV_IMAGE:-없음(처음 배포)}"

echo "▶ deploying Cloud Run Job..."
gcloud run jobs deploy "$JOB" \
  --image="$IMAGE" \
  --region="$REGION" \
  --service-account="$DART_SA" \
  --cpu=1 \
  --memory=512Mi \
  --task-timeout=14h \
  --max-retries=0 \
  --parallelism=1 \
  --tasks=1 \
  ${NET_FLAGS[@]+"${NET_FLAGS[@]}"} \
  --set-env-vars="$ENV_VARS" \
  --set-secrets="SUPABASE_SERVICE_ROLE_KEY=gh-radar-supabase-service-role:latest,OPENDART_API_KEY=gh-radar-opendart-key:latest,OPENDART_API_KEY_2=gh-radar-opendart-key-2:latest,TELEGRAM_BOT_TOKEN=gh-radar-telegram-bot-token:latest,TELEGRAM_CHAT_ID=gh-radar-telegram-chat-id:latest" \
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
# Section 7: Cloud Scheduler 1개 (create/update 멱등 · Asia/Seoul · OAuth)
#   본문 없는 jobs:run URI 를 호출한다 — 모드는 수집기가 KST 시각으로 판정.
# ═══════════════════════════════════════════════════════════════
JOB_INVOKE_URI="https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${EXPECTED_PROJECT}/jobs/${JOB}:run"

SMOKE_ALLOW_PAUSED=0
SCHEDULER_NAME="$WAKE_SCHEDULER"
SCHEDULE="$WAKE_SCHEDULE"
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
elif [[ "$SCHEDULER_PAUSED" != 1 ]]; then
  echo "▶ scheduler create: $SCHEDULER_NAME (schedule: $SCHEDULE)"
  gcloud scheduler jobs create http "$SCHEDULER_NAME" \
    --location="$REGION" \
    --schedule="$SCHEDULE" \
    --time-zone="Asia/Seoul" \
    --uri="$JOB_INVOKE_URI" \
    --http-method=POST \
    --oauth-service-account-email="$SCHED_SA" \
    --project="$EXPECTED_PROJECT"
else
  # 멈춤은 이번에 만든 Scheduler 에만 — 이미 있던 Scheduler 는 이 배포가 멈추지도 재개하지도 않는다(리뷰 CR-50).
  # create 는 ENABLED 로 만든다 — 진짜 일정으로 만들고 pause 를 따로 부르면 그 사이 5분 경계(예: 09:05:00)에 깨움이 나가거나
  # pause 가 일시 오류로 실패해 seed 없는 첫 auto 실행이 그날 공시를 「(늦은 알림)」 으로 쏟는다(리뷰 WR-50).
  # 그래서 곧 울리지 않는 일정(1월 1일 0시 KST — 울려도 창 밖이라 수집기가 바로 0 으로 끝남)으로 만들고 → 멈추고 →
  # 진짜 일정으로 갱신한다(update 는 상태를 바꾸지 않는다 — 아래에서 PAUSED 를 다시 확인한다).
  echo "▶ scheduler create (paused): $SCHEDULER_NAME (임시 일정 0 0 1 1 * → 멈춤 → $SCHEDULE)"
  gcloud scheduler jobs create http "$SCHEDULER_NAME" \
    --location="$REGION" \
    --schedule="0 0 1 1 *" \
    --time-zone="Asia/Seoul" \
    --uri="$JOB_INVOKE_URI" \
    --http-method=POST \
    --oauth-service-account-email="$SCHED_SA" \
    --project="$EXPECTED_PROJECT"
  if ! gcloud scheduler jobs pause "$SCHEDULER_NAME" \
    --location="$REGION" \
    --project="$EXPECTED_PROJECT" >/dev/null; then
    echo "ERROR: $SCHEDULER_NAME 멈춤 실패 — 지금은 임시 일정(1월 1일 0시)이라 깨우지 않는다. 다음 순서로 마저 한다:" >&2
    echo "  gcloud scheduler jobs pause $SCHEDULER_NAME --location=$REGION --project=$EXPECTED_PROJECT" >&2
    echo "  그 뒤 이 스크립트를 --scheduler-paused 로 다시 실행(이미 PAUSED 면 그대로 두고 진짜 일정으로 바꾼다)" >&2
    exit 1
  fi
  echo "⏸ scheduler paused: $SCHEDULER_NAME"
  gcloud scheduler jobs update http "$SCHEDULER_NAME" \
    --location="$REGION" \
    --schedule="$SCHEDULE" \
    --time-zone="Asia/Seoul" \
    --uri="$JOB_INVOKE_URI" \
    --http-method=POST \
    --oauth-service-account-email="$SCHED_SA" \
    --project="$EXPECTED_PROJECT"
  if [[ "$(gcloud scheduler jobs describe "$SCHEDULER_NAME" --location="$REGION" --project="$EXPECTED_PROJECT" \
    --format='value(state)' 2>/dev/null || true)" != PAUSED ]]; then
    # 방금 만든 Scheduler 라 다시 멈춰도 운영 깨움을 끊지 않는다
    echo "⚠ 일정 갱신 뒤 $SCHEDULER_NAME 가 PAUSED 가 아니다 — 다시 멈춘다" >&2
    gcloud scheduler jobs pause "$SCHEDULER_NAME" --location="$REGION" --project="$EXPECTED_PROJECT" >/dev/null
  fi
fi
STATE=$(gcloud scheduler jobs describe "$SCHEDULER_NAME" --location="$REGION" --project="$EXPECTED_PROJECT" \
  --format='value(state)' 2>/dev/null || true)
if [[ "$STATE" == "PAUSED" ]]; then
  if [[ "$SCHEDULER_PAUSED" == 1 ]]; then
    # 첫 배포 날 절차 — 스모크는 이 실행에서만 PAUSED 를 통과로 본다(seed → resume 은 아래 「다음 할 일」)
    SMOKE_ALLOW_PAUSED=1
  else
    echo "⚠ scheduler $SCHEDULER_NAME 가 멈춤(PAUSED) 상태다 — 이 배포는 재개하지 않는다(스모크 INV-3b 가 실패한다)." >&2
    echo "  재개: gcloud scheduler jobs resume $SCHEDULER_NAME --location=$REGION --project=$EXPECTED_PROJECT" >&2
  fi
elif [[ "$SCHEDULER_PAUSED" == 1 ]]; then
  echo "⚠ scheduler $SCHEDULER_NAME 는 이미 있던 ${STATE:-상태 모름} Scheduler 라 멈추지 않았다(--scheduler-paused 는 처음 만들 때만)." >&2
fi

# ═══════════════════════════════════════════════════════════════
# Section 8: 알림 정책 3개 (update-or-create 멱등 · deploy-limitup-sync.sh Section 7 꼴)
# ═══════════════════════════════════════════════════════════════
# gcloud monitoring 은 notificationChannels 에 full resource name 을 요구 — ID 만 주어지면 정규화.
CHANNEL_RESOURCE="$NOTIFICATION_CHANNEL_ID"
case "$CHANNEL_RESOURCE" in
  projects/*) ;;
  *) CHANNEL_RESOURCE="projects/${EXPECTED_PROJECT}/notificationChannels/${NOTIFICATION_CHANNEL_ID}" ;;
esac

# 정책 create/update 가 실패해 set -e 로 끝나도 임시 YAML(채널 이름만 — 비밀 아님)이 $TMPDIR 에 쌓이지 않게(리뷰 IN-56)
RESOLVED_YAML=""
trap 'rm -f "${RESOLVED_YAML:-}"' EXIT
for i in "${!ALERT_POLICY_FILES[@]}"; do
  ALERT_FILE="${ALERT_POLICY_FILES[$i]}"
  ALERT_NAME="${ALERT_POLICY_NAMES[$i]}"
  RESOLVED_YAML=$(mktemp)
  sed "s|\${NOTIFICATION_CHANNEL_ID}|${CHANNEL_RESOURCE}|g" "$ALERT_FILE" > "$RESOLVED_YAML"

  # 조회 오류(인증 만료 · 네트워크 · API)를 「없음」 으로 삼키면 같은 이름 정책이 하나 더 생긴다 — 멈춘다(리뷰 WR-53).
  if ! EXISTING_POLICIES=$(gcloud alpha monitoring policies list --project="$EXPECTED_PROJECT" \
    --filter="displayName=\"${ALERT_NAME}\"" \
    --format='value(name)'); then
    rm -f "$RESOLVED_YAML"
    echo "ERROR: 알림 정책 ${ALERT_NAME} 조회 실패 — 중복 생성을 막으려고 멈춘다(gcloud 인증 · 네트워크 확인 뒤 다시)" >&2
    exit 1
  fi
  POLICY_COUNT=$(printf '%s\n' "$EXISTING_POLICIES" | grep -c . || true)
  if (( POLICY_COUNT > 1 )); then
    rm -f "$RESOLVED_YAML"
    echo "ERROR: ${ALERT_NAME} 정책이 ${POLICY_COUNT}개다 — 하나만 남기고 지운 뒤 다시(메일이 겹친다):" >&2
    printf '  %s\n' $EXISTING_POLICIES >&2
    echo "  지우기: gcloud alpha monitoring policies delete <이름> --project=$EXPECTED_PROJECT" >&2
    exit 1
  fi
  EXISTING_POLICY="$EXISTING_POLICIES"

  if [[ -n "$EXISTING_POLICY" ]]; then
    echo "▶ updating alert policy: ${ALERT_NAME}..."
    gcloud alpha monitoring policies update "$EXISTING_POLICY" --policy-from-file="$RESOLVED_YAML" \
      --project="$EXPECTED_PROJECT" >/dev/null
  else
    echo "▶ creating alert policy: ${ALERT_NAME}..."
    gcloud alpha monitoring policies create --policy-from-file="$RESOLVED_YAML" \
      --project="$EXPECTED_PROJECT" >/dev/null
  fi
  rm -f "$RESOLVED_YAML"
  echo "✓ Alert policy ready: ${ALERT_NAME}"
done

# ═══════════════════════════════════════════════════════════════
# Section 9: Smoke (probe 1회 · Job 설정 · Scheduler 상태 · 바인딩 · 「probe ok」 로그 · 알림 정책 3개)
# ═══════════════════════════════════════════════════════════════
echo ""
echo "✓ Deployed: Cloud Run Job $JOB @ $IMAGE"
echo "  Scheduler: ${WAKE_SCHEDULER} ($([[ "$SMOKE_ALLOW_PAUSED" == 1 ]] && echo 멈춤 || echo 동작))"
echo "  Alert policies: ${ALERT_POLICY_NAMES[*]}"
echo ""

if [[ "$SMOKE_ALLOW_PAUSED" == 1 ]]; then
  echo "다음 할 일(첫 배포 날 · 머리 주석 「첫 배포 날」 — resume 을 빠뜨려도 메일이 오지 않는다):"
  echo "  1. gcloud run jobs execute $JOB --region=$REGION --update-env-vars=DART_ALERT_MODE=seed   (--wait 없이)"
  echo "  2. Cloud Logging 에서 「seed done」 확인"
  echo "  3. gcloud scheduler jobs resume ${WAKE_SCHEDULER} --location=$REGION"
fi

echo "▶ smoke tests..."
# PAUSED 는 스모크 실패다(INV-3b) — 이 배포가 --scheduler-paused 로 멈춘 첫 배포 날만 통과로 본다(리뷰 CR-50).
if ! DART_SMOKE_ALLOW_PAUSED="$SMOKE_ALLOW_PAUSED" DART_SMOKE_SUPABASE_URL="$SUPABASE_URL" GCP_PROJECT_ID="$EXPECTED_PROJECT" \
  bash "$(dirname "$0")/smoke-dart-alert.sh" "$JOB" "$REGION"; then
  echo "" >&2
  echo "ERROR: 스모크 실패 — Job 은 이미 새 이미지($IMAGE) · 새 env 로 바뀌었다(다음 깨움부터 새 설정으로 돈다)." >&2
  if [[ -n "$PREV_IMAGE" ]]; then
    echo "  이미지만 되돌리기: gcloud run jobs update $JOB --image=$PREV_IMAGE --region=$REGION --project=$EXPECTED_PROJECT" >&2
  else
    echo "  처음 배포라 되돌릴 이미지가 없다 — 원인을 고친 뒤 다시 배포한다." >&2
  fi
  echo "  env(SUPABASE_URL 오타 등)가 원인이면 이미지 되돌리기로는 안 풀린다 — 올바른 값으로 다시 배포한다." >&2
  echo "  마이그레이션 미적용(INV-6b · FAIL migration)이면 supabase db push --linked --yes 뒤 스모크만 다시: bash scripts/smoke-dart-alert.sh" >&2
  exit 1
fi

echo ""
echo "✅ deploy-dart-alert.sh complete"
