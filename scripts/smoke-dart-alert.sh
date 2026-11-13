#!/usr/bin/env bash
set -uo pipefail
# 주의: -e 는 끄고 각 invariant 를 개별 fail 추적 (smoke-kis-news-sync.sh 패턴)

# ═══════════════════════════════════════════════════════════════
# Phase 43 Plan 07 — dart-alert 스모크 (deploy-dart-alert.sh 끝에서 불린다 · 단독 실행도 가능)
#
#   bash scripts/smoke-dart-alert.sh [job] [region]
#
# INV-1 probe 실행 1회 — `DART_ALERT_MODE=probe` 를 이 실행에만 덮어써 키 2 로 거래소 수시공시 1쪽 1회 · 키 2 카운터
#       (Job 설정의 env 는 바꾸지 않는다 · 임대 없이 · 넣기 · 송신 0 — 43-05 · 261113-rn7). 호출 1건은 api_usage
#       `opendart_list_k2` 에 센다.
# INV-2 Job 설정 — task timeout 50400s(14h) · max retries 0
# INV-2b Job 컨테이너 env 에 OPENDART_API_KEY_2 가 Secret gh-radar-opendart-key-2 로 붙어 있다(값은 읽지 않고 이름 · Secret
#       참조만 · v1 · v2 모양 둘 다 — 261113-rn7 U-2 · 키 2 없이 배포되면 수집기가 설정 오류로 시작하지 않는다)
# INV-3 Scheduler gh-radar-dart-alert-wake 존재 · timeZone Asia/Seoul · 일정이 deploy-dart-alert.sh WAKE_SCHEDULE 과 같음
# INV-3b Scheduler 상태 ENABLED — PAUSED 는 실패다(깨움 0 = 실행 · 로그 · 단체방 글 · 메일 전부 0 · 리뷰 CR-50).
#       첫 배포 날(--scheduler-paused 로 막 만든 날)만 DART_SMOKE_ALLOW_PAUSED=1 로 통과(배포 스크립트가 넘긴다).
# INV-3c 깨움이 실제로 Job 을 띄울 수 있다 — Scheduler 대상 URI = 이 Job 의 :run · OAuth SA = gh-radar-scheduler-sa ·
#       Job IAM 에 그 SA 의 roles/run.invoker 바인딩(유실되면 깨움이 403 으로 실패 · 리뷰 CR-50)
#       실행 이름을 받아(--async) 끝날 때까지(최대 5분) 지켜보고, 성공 · 실패와 상관없이 그 이름을 화면에 남긴다(리뷰 IN-57).
# INV-4 INV-1 의 그 실행(labels."run.googleapis.com/execution_name")이 남긴 jsonPayload.msg="probe ok" 1건 이상
#       (15분 안의 앞선 probe 로그로 통과하지 않게)
# INV-5 알림 정책 deploy-dart-alert.sh ALERT_POLICY_NAMES 3개(실행 실패 · error 로그 · 깨움 실패) 존재
# INV-6 Job env SUPABASE_URL 이 배포 값(DART_SMOKE_SUPABASE_URL — 배포 스크립트가 넘김)과 같고, 그 URL 로
#       `dart-alert-report.sh check` 의 db(운영 수치 RPC — URL · 서비스롤 키 · 마이그레이션) · migration(p_since)이 통과
#       (INV-1 probe 는 OpenDART 만 부르고 임대 · 넣기 · 장애 RPC 를 하나도 안 불러, DB 가 깨져도 통과한다 — 리뷰 WR-52)
# INV-7 같은 check 의 telegram — getMe · getChatMember 로 토큰이 살아 있고 봇이 방에서 글을 쓸 수 있다(글 0)
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
DEPLOY_SCRIPT="$(dirname "$0")/deploy-dart-alert.sh"
REPORT_SCRIPT="$(dirname "$0")/dart-alert-report.sh"

# Scheduler 이름 · 기대 일정은 배포 스크립트의 상수 두 줄에서 읽는다(두 곳에 리터럴을 두지 않는다).
SCHEDULER_NAME="$(sed -nE 's/^WAKE_SCHEDULER=([a-z0-9-]+)$/\1/p' "$DEPLOY_SCRIPT" 2>/dev/null | head -1)"
SCHEDULER_NAME="${SCHEDULER_NAME:-gh-radar-dart-alert-wake}"
WANT_SCHEDULE="$(sed -nE 's/^WAKE_SCHEDULE="([^"]+)"$/\1/p' "$DEPLOY_SCRIPT" 2>/dev/null | head -1)"
# 알림 정책 이름도 배포 스크립트 배열에서 읽는다(「declare -a ALERT_POLICY_NAMES=(」 ~ 「)」 사이 따옴표 값).
declare -a WANT_POLICIES=()
while IFS= read -r p; do
  [[ -n "$p" ]] && WANT_POLICIES+=("$p")
done < <(awk '/^declare -a ALERT_POLICY_NAMES=\(/{f=1; next} f && /^\)/{f=0} f' "$DEPLOY_SCRIPT" 2>/dev/null | sed -nE 's/^[[:space:]]*"([^"]+)"[[:space:]]*$/\1/p')
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
# INV-1: probe 실행 1회 — 이름을 받아 완료(성공 1)까지 지켜본다(5초 간격 · 최대 5분)
# ─────────────────────────────────────────────────────────────
PROBE_EXEC=""
probe_run() {
  local out tries=0 st done_at ok failed
  out=$(gcloud run jobs execute "$JOB" --region="$REGION" --project="$PROJECT" \
    --update-env-vars=DART_ALERT_MODE=probe --async --format='value(metadata.name)' 2>&1) || return 1
  # --format 출력(이름 한 줄)이 없으면 진행 문구 「Execution [이름] …」 에서 꺼낸다
  PROBE_EXEC=$(printf '%s\n' "$out" | grep -E '^[a-z0-9][a-z0-9-]*$' | head -1)
  if [[ -z "$PROBE_EXEC" ]]; then
    PROBE_EXEC=$(printf '%s\n' "$out" | sed -nE 's/.*Execution \[([a-z0-9-]+)\].*/\1/p' | head -1)
  fi
  [[ -n "$PROBE_EXEC" ]] || return 1
  while (( tries < 60 )); do
    tries=$((tries + 1))
    # csv(쉼표) — 실행 중이면 완료 시각이 비어도 칸 자리가 유지된다
    st=$(gcloud run jobs executions describe "$PROBE_EXEC" --region="$REGION" --project="$PROJECT" \
      --format='csv[no-heading](status.completionTime,status.succeededCount,status.failedCount)' 2>/dev/null || true)
    IFS=, read -r done_at ok failed <<< "$st"
    if [[ -n "$done_at" ]]; then
      [[ "${ok:-0}" == 1 && "${failed:-0}" =~ ^0?$ ]]
      return
    fi
    sleep 5
  done
  return 1
}
check "INV-1 jobs execute (DART_ALERT_MODE=probe) → 완료 · 성공 1" probe_run
echo "      (probe 실행: ${PROBE_EXEC:-이름 못 받음} — 실패면: gcloud run jobs executions describe ${PROBE_EXEC:-<이름>} --region=$REGION --project=$PROJECT)"

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
# INV-2b: 컨테이너 env OPENDART_API_KEY_2 → Secret gh-radar-opendart-key-2 (값 없음 — 이름 · 참조만)
#   v1(knative): env[].valueFrom.secretKeyRef.name · v2: env[].valueSource.secretKeyRef.secret
# ─────────────────────────────────────────────────────────────
job_key2_bound() {
  gcloud run jobs describe "$JOB" --region="$REGION" --project="$PROJECT" --format=json     | node -e '
      let s = "";
      process.stdin.on("data", (d) => (s += d)).on("end", () => {
        const j = JSON.parse(s);
        const v1 = j?.spec?.template?.spec?.template?.spec?.containers ?? [];
        const v2 = j?.template?.template?.containers ?? [];
        const envs = [...v1, ...v2].flatMap((c) => c?.env ?? []);
        const ok = envs.some((e) => {
          if (e?.name !== "OPENDART_API_KEY_2") return false;
          const ref = e.valueFrom?.secretKeyRef?.name ?? e.valueSource?.secretKeyRef?.secret ?? "";
          return String(ref).split("/").pop() === "gh-radar-opendart-key-2";
        });
        process.exit(ok ? 0 : 1);
      });
    '
}
check "INV-2b job env OPENDART_API_KEY_2 → Secret gh-radar-opendart-key-2" job_key2_bound

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
check "INV-3 scheduler $SCHEDULER_NAME (${WANT_SCHEDULE:-일정 못 읽음} · Asia/Seoul)" scheduler_ok

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
# INV-4: INV-1 실행의 로그에 「probe ok」 1건 이상 (로그 수집 지연 — 15초 간격 5회까지)
# ─────────────────────────────────────────────────────────────
probe_logged() {
  local attempt
  [[ -n "$PROBE_EXEC" ]] || return 1
  for attempt in 1 2 3 4 5; do
    if gcloud logging read "
        resource.type=\"cloud_run_job\"
        AND resource.labels.job_name=\"$JOB\"
        AND labels.\"run.googleapis.com/execution_name\"=\"$PROBE_EXEC\"
        AND jsonPayload.msg=\"probe ok\"
      " --project="$PROJECT" --freshness=15m --limit=5 --format='value(jsonPayload.msg)' 2>/dev/null \
      | grep -q 'probe ok'; then
      return 0
    fi
    [[ "$attempt" -lt 5 ]] && sleep 15
  done
  return 1
}
check "INV-4 logs: probe ok (INV-1 실행 ${PROBE_EXEC:-?})" probe_logged

# ─────────────────────────────────────────────────────────────
# INV-6 · INV-7: Job env SUPABASE_URL · 읽기 전용 점검(dart-alert-report.sh check — DB · 마이그레이션 · 텔레그램, 글 0)
#   check 결과 줄에는 비밀이 없어 그대로 보여 준다(어느 항목이 깨졌는지 보이게).
# ─────────────────────────────────────────────────────────────
JOB_SB_URL="$(gcloud run jobs describe "$JOB" --region="$REGION" --project="$PROJECT" --format=json 2>/dev/null \
  | node -e '
    let s = "";
    process.stdin.on("data", (d) => (s += d)).on("end", () => {
      try {
        const j = JSON.parse(s);
        const c = j?.spec?.template?.spec?.template?.spec?.containers?.[0] ?? j?.template?.template?.containers?.[0] ?? {};
        const e = (c.env ?? []).find((x) => x.name === "SUPABASE_URL");
        console.log(e?.value ?? "");
      } catch {
        console.log("");
      }
    });
  ' 2>/dev/null || true)"
supabase_url_ok() {
  [[ -n "$JOB_SB_URL" ]] || return 1
  [[ -z "${DART_SMOKE_SUPABASE_URL:-}" || "${JOB_SB_URL%/}" == "${DART_SMOKE_SUPABASE_URL%/}" ]]
}
check "INV-6a job env SUPABASE_URL$([[ -n "${DART_SMOKE_SUPABASE_URL:-}" ]] && echo ' = 배포 값')" supabase_url_ok

RUNTIME_CHECK=""
if [[ -n "$JOB_SB_URL" ]]; then
  RUNTIME_CHECK="$(SUPABASE_URL="$JOB_SB_URL" GCP_PROJECT_ID="$PROJECT" bash "$REPORT_SCRIPT" check 2>&1 || true)"
fi
printf '%s\n' "$RUNTIME_CHECK" | grep -E '^(OK|FAIL|WARN) ' | sed 's/^/      /'
runtime_db_ok() {
  printf '%s\n' "$RUNTIME_CHECK" | grep -q '^OK db ' && ! printf '%s\n' "$RUNTIME_CHECK" | grep -q '^FAIL migration '
}
runtime_telegram_ok() {
  printf '%s\n' "$RUNTIME_CHECK" | grep -q '^OK telegram '
}
check "INV-6b db RPC · 마이그레이션(dart-alert-report.sh check)" runtime_db_ok
check "INV-7 telegram 토큰 · 봇이 방에서 글쓰기 가능(getMe · getChatMember · 글 0)" runtime_telegram_ok

# ─────────────────────────────────────────────────────────────
# INV-5: 알림 정책 3개(배포 스크립트 ALERT_POLICY_NAMES)
# ─────────────────────────────────────────────────────────────
# 정확히 1개 — 0 이면 없음, 2개 이상이면 메일이 겹치고 배포는 첫 정책만 갱신한다(리뷰 WR-53). 조회 오류도 실패.
policy_exists() {
  local name="$1" got
  got=$(gcloud alpha monitoring policies list --project="$PROJECT" \
    --filter="displayName=\"${name}\"" --format='value(name)' 2>/dev/null) || return 1
  [[ "$(printf '%s\n' "$got" | grep -c .)" == 1 ]]
}
policy_count_ok() {
  (( ${#WANT_POLICIES[@]} == 3 ))
}
check "INV-5 alert policy names from deploy script (3개 · 읽은 수 ${#WANT_POLICIES[@]})" policy_count_ok
for p in ${WANT_POLICIES[@]+"${WANT_POLICIES[@]}"}; do
  check "INV-5 alert policy $p (정확히 1개)" policy_exists "$p"
done

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
