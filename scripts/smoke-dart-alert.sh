#!/usr/bin/env bash
set -uo pipefail
# 주의: -e 는 끄고 각 invariant 를 개별 fail 추적 (smoke-kis-news-sync.sh 패턴)

# ═══════════════════════════════════════════════════════════════
# Phase 43 Plan 07 — dart-alert 스모크 (deploy-dart-alert.sh 끝에서 불린다 · 단독 실행도 가능)
#
#   bash scripts/smoke-dart-alert.sh [job] [region]
#
# INV-1 probe 실행 1회 — `DART_ALERT_MODE=probe` 를 이 실행에만 덮어써 공개매수 1쪽을 1회 조회하고 끝난다
#       (Job 설정의 env 는 바꾸지 않는다 · 임대 없이 · 넣기 · 송신 0 — 43-05). 호출 1건은 api_usage 에 센다.
# INV-2 Job 설정 — task timeout 50400s(14h) · max retries 0
# INV-3 Scheduler gh-radar-dart-alert-wake 존재 · timeZone Asia/Seoul · 일정이 deploy-dart-alert.sh DART_SCHEDULERS 와 같음
#       (멈춤 상태는 실패로 보지 않는다 — 첫 배포 날 --scheduler-paused · 상태만 알려 준다)
# INV-4 최근 15분 Cloud Logging 에 이 Job 의 jsonPayload.msg="probe ok" 1건 이상
# INV-5 알림 정책 gh-radar-dart-alert-failure · gh-radar-dart-alert-error-log 존재
# 실패 수 > 0 이면 exit 1.
# ═══════════════════════════════════════════════════════════════

case "${1:-}" in
  -h | --help)
    echo "사용: bash scripts/smoke-dart-alert.sh [job=gh-radar-dart-alert] [region=asia-northeast3]   (GCP_PROJECT_ID 또는 gcloud 기본 프로젝트)"
    exit 0
    ;;
esac

JOB="${1:-gh-radar-dart-alert}"
REGION="${2:-asia-northeast3}"
PROJECT="${GCP_PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || true)}"
SCHEDULER_NAME=gh-radar-dart-alert-wake
DEPLOY_SCRIPT="$(dirname "$0")/deploy-dart-alert.sh"

# 기대 일정은 배포 스크립트의 배열에서 읽는다(두 곳에 리터럴을 두지 않는다).
WANT_SCHEDULE="$(grep -oE "\"${SCHEDULER_NAME}\\|[^\"]+\"" "$DEPLOY_SCRIPT" 2>/dev/null | head -1 | sed -E "s/^\"${SCHEDULER_NAME}\\|//; s/\"\$//")"

PASS=0
FAIL=0
declare -a FAILED_INVS=()

check() {
  local name="$1"; shift
  echo -n "  $name ... "
  if "$@" >/dev/null 2>&1; then
    echo "PASS"
    PASS=$((PASS + 1))
  else
    echo "FAIL"
    FAIL=$((FAIL + 1))
    FAILED_INVS+=("$name")
  fi
}

echo "Smoke testing Job=$JOB Region=$REGION Project=$PROJECT"
echo ""

# ─────────────────────────────────────────────────────────────
# INV-1: probe 실행 --wait exit 0
# ─────────────────────────────────────────────────────────────
check "INV-1 jobs execute (DART_ALERT_MODE=probe) --wait exit 0" \
  gcloud run jobs execute "$JOB" --region="$REGION" --project="$PROJECT" \
    --update-env-vars=DART_ALERT_MODE=probe --wait

# ─────────────────────────────────────────────────────────────
# INV-2: Job 설정 — taskTimeout 50400s · maxRetries 0
#   gcloud 는 v1(knative) 꼴로 내보낸다 — 0 인 정수 필드는 JSON 에서 빠질 수 있어 「없음」 도 0 으로 본다.
# ─────────────────────────────────────────────────────────────
job_config_ok() {
  gcloud run jobs describe "$JOB" --region="$REGION" --project="$PROJECT" --format=json \
    | node -e '
      let s = "";
      process.stdin.on("data", (d) => (s += d)).on("end", () => {
        const j = JSON.parse(s);
        const v1 = j?.spec?.template?.spec?.template?.spec ?? {};
        const v2 = j?.template?.template ?? {};
        const timeout = String(v1.timeoutSeconds ?? v2.timeout ?? "").replace(/s$/, "");
        const retries = v1.maxRetries ?? v2.maxRetries ?? 0;
        process.exit(timeout === "50400" && Number(retries) === 0 ? 0 : 1);
      });
    '
}
check "INV-2 job taskTimeout 50400s · maxRetries 0" job_config_ok

# ─────────────────────────────────────────────────────────────
# INV-3: Scheduler 1개 — 일정 · Asia/Seoul
# ─────────────────────────────────────────────────────────────
scheduler_ok() {
  local got tz
  [[ -n "$WANT_SCHEDULE" ]] || return 1
  got=$(gcloud scheduler jobs describe "$SCHEDULER_NAME" --location="$REGION" --project="$PROJECT" --format='value(schedule)' 2>/dev/null) || return 1
  tz=$(gcloud scheduler jobs describe "$SCHEDULER_NAME" --location="$REGION" --project="$PROJECT" --format='value(timeZone)' 2>/dev/null) || return 1
  [[ "$got" == "$WANT_SCHEDULE" && "$tz" == "Asia/Seoul" ]]
}
check "INV-3 scheduler $SCHEDULER_NAME (${WANT_SCHEDULE:-배열 못 읽음} · Asia/Seoul)" scheduler_ok
SCHED_STATE=$(gcloud scheduler jobs describe "$SCHEDULER_NAME" --location="$REGION" --project="$PROJECT" --format='value(state)' 2>/dev/null || true)
echo "      (scheduler 상태: ${SCHED_STATE:-알 수 없음} — PAUSED 면 첫 배포 날 절차의 seed → resume 을 마저 한다)"

# ─────────────────────────────────────────────────────────────
# INV-4: 최근 15분 로그에 「probe ok」 1건 이상 (로그 수집 지연 — 15초 간격 5회까지)
# ─────────────────────────────────────────────────────────────
probe_logged() {
  local attempt
  for attempt in 1 2 3 4 5; do
    if gcloud logging read "
        resource.type=\"cloud_run_job\"
        AND resource.labels.job_name=\"$JOB\"
        AND jsonPayload.msg=\"probe ok\"
      " --project="$PROJECT" --freshness=15m --limit=5 --format='value(jsonPayload.msg)' 2>/dev/null \
      | grep -q 'probe ok'; then
      return 0
    fi
    [[ "$attempt" -lt 5 ]] && sleep 15
  done
  return 1
}
check "INV-4 logs: probe ok (최근 15분)" probe_logged

# ─────────────────────────────────────────────────────────────
# INV-5: 알림 정책 2개 존재
# ─────────────────────────────────────────────────────────────
policy_exists() {
  local name="$1" got
  got=$(gcloud alpha monitoring policies list --project="$PROJECT" \
    --filter="displayName=${name}" --format='value(name)' 2>/dev/null | head -1)
  [[ -n "$got" ]]
}
check "INV-5a alert policy gh-radar-dart-alert-failure" policy_exists gh-radar-dart-alert-failure
check "INV-5b alert policy gh-radar-dart-alert-error-log" policy_exists gh-radar-dart-alert-error-log

echo ""
echo "Smoke result: PASS=$PASS FAIL=$FAIL"
if (( FAIL > 0 )); then
  for inv in "${FAILED_INVS[@]}"; do
    echo "  ✗ $inv"
  done
  echo "  힌트: probe 실패면 로그의 reason(probe_failed · budget_at_start)과 err 를 본다. OpenDART 012(허용 안 된 IP)면" >&2
  echo "        DART_ALERT_VPC_EGRESS=1 로 다시 배포한다. 020(한도)이면 수동 실행으로 두드리지 않는다." >&2
  exit 1
fi
echo "✅ smoke-dart-alert.sh all PASS"
