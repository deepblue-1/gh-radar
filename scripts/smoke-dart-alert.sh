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
# INV-3b Scheduler 상태 ENABLED — PAUSED 는 실패다(깨움 0 = 실행 · 로그 · 단체방 글 · 메일 전부 0 · 리뷰 CR-50).
#       첫 배포 날(--scheduler-paused 로 막 만든 날)만 DART_SMOKE_ALLOW_PAUSED=1 로 통과(배포 스크립트가 넘긴다).
# INV-3c 깨움이 실제로 Job 을 띄울 수 있다 — Scheduler 대상 URI = 이 Job 의 :run · OAuth SA = gh-radar-scheduler-sa ·
#       Job IAM 에 그 SA 의 roles/run.invoker 바인딩(유실되면 깨움이 403 으로 실패 · 리뷰 CR-50)
# INV-4 최근 15분 Cloud Logging 에 이 Job 의 jsonPayload.msg="probe ok" 1건 이상
# INV-5 알림 정책 deploy-dart-alert.sh ALERT_POLICY_NAMES 4개(실행 실패 · error 로그 · 깨움 실패 · 깨움 없음) 존재
#       + 로그 기반 지표 dart_alert_wake_starts(깨움 없음 정책이 읽음) 존재
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
# 알림 정책 이름도 배포 스크립트 배열에서 읽는다(「declare -a ALERT_POLICY_NAMES=(」 ~ 「)」 사이 따옴표 값).
declare -a WANT_POLICIES=()
while IFS= read -r p; do
  [[ -n "$p" ]] && WANT_POLICIES+=("$p")
done < <(awk '/^declare -a ALERT_POLICY_NAMES=\(/{f=1; next} f && /^\)/{f=0} f' "$DEPLOY_SCRIPT" 2>/dev/null | sed -nE 's/^[[:space:]]*"([^"]+)"[[:space:]]*$/\1/p')
WAKE_METRIC_NAME=dart_alert_wake_starts
SCHED_SA_EMAIL="gh-radar-scheduler-sa@${PROJECT}.iam.gserviceaccount.com"
WANT_URI="https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${PROJECT}/jobs/${JOB}:run"

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
# INV-3: Scheduler 1개 — 일정 · Asia/Seoul · 상태 · 대상 · OAuth SA (describe 1회 → 「|」 구분 5칸 · 빈 칸도 자리 유지)
# ─────────────────────────────────────────────────────────────
SCHED_FIELDS="$(gcloud scheduler jobs describe "$SCHEDULER_NAME" --location="$REGION" --project="$PROJECT" --format=json 2>/dev/null \
  | node -e '
    let s = "";
    process.stdin.on("data", (d) => (s += d)).on("end", () => {
      try {
        const j = JSON.parse(s);
        const t = j.httpTarget ?? {};
        console.log([j.schedule, j.timeZone, j.state, t.uri, t.oauthToken?.serviceAccountEmail].map((v) => String(v ?? "").replace(/[|\n]/g, " ")).join("|"));
      } catch {
        process.exit(1);
      }
    });
  ' 2>/dev/null || true)"
IFS='|' read -r SCHED_GOT SCHED_TZ SCHED_STATE SCHED_URI SCHED_OAUTH <<< "$SCHED_FIELDS"

scheduler_ok() {
  [[ -n "$WANT_SCHEDULE" && "$SCHED_GOT" == "$WANT_SCHEDULE" && "$SCHED_TZ" == "Asia/Seoul" ]]
}
check "INV-3 scheduler $SCHEDULER_NAME (${WANT_SCHEDULE:-배열 못 읽음} · Asia/Seoul)" scheduler_ok

scheduler_enabled() {
  [[ "$SCHED_STATE" == ENABLED || ( "$SCHED_STATE" == PAUSED && "${DART_SMOKE_ALLOW_PAUSED:-0}" == 1 ) ]]
}
check "INV-3b scheduler state ENABLED (지금 ${SCHED_STATE:-알 수 없음}$([[ "${DART_SMOKE_ALLOW_PAUSED:-0}" == 1 ]] && echo ' · 첫 배포 날 PAUSED 허용'))" scheduler_enabled
if [[ "$SCHED_STATE" == PAUSED ]]; then
  echo "      PAUSED — 깨움이 없다. 첫 배포 날이면 seed → 「seed done」 → resume 을 마저 한다:"
  echo "        gcloud scheduler jobs resume $SCHEDULER_NAME --location=$REGION --project=$PROJECT"
fi

invoker_bound() {
  [[ "$SCHED_URI" == "$WANT_URI" && "$SCHED_OAUTH" == "$SCHED_SA_EMAIL" ]] || return 1
  gcloud run jobs get-iam-policy "$JOB" --region="$REGION" --project="$PROJECT" --format=json 2>/dev/null \
    | node -e '
      const member = process.argv[1];
      let s = "";
      process.stdin.on("data", (d) => (s += d)).on("end", () => {
        const j = JSON.parse(s);
        const ok = (j.bindings ?? []).some((b) => b.role === "roles/run.invoker" && (b.members ?? []).includes(member));
        process.exit(ok ? 0 : 1);
      });
    ' "serviceAccount:${SCHED_SA_EMAIL}"
}
check "INV-3c scheduler → job :run · OAuth gh-radar-scheduler-sa · run.invoker 바인딩" invoker_bound

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
# INV-5: 알림 정책 4개(배포 스크립트 ALERT_POLICY_NAMES) · 로그 기반 지표 존재
# ─────────────────────────────────────────────────────────────
policy_exists() {
  local name="$1" got
  got=$(gcloud alpha monitoring policies list --project="$PROJECT" \
    --filter="displayName=${name}" --format='value(name)' 2>/dev/null | head -1)
  [[ -n "$got" ]]
}
policy_count_ok() {
  (( ${#WANT_POLICIES[@]} == 4 ))
}
check "INV-5 alert policy names from deploy script (4개 · 읽은 수 ${#WANT_POLICIES[@]})" policy_count_ok
for p in ${WANT_POLICIES[@]+"${WANT_POLICIES[@]}"}; do
  check "INV-5 alert policy $p" policy_exists "$p"
done
metric_exists() {
  gcloud logging metrics describe "$WAKE_METRIC_NAME" --project="$PROJECT" --format='value(filter)' 2>/dev/null \
    | grep -qF 'jsonPayload.msg="dart-alert start"'
}
check "INV-5m log-based metric $WAKE_METRIC_NAME (dart-alert start)" metric_exists

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
