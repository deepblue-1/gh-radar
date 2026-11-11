#!/usr/bin/env bash
set -uo pipefail
# 주의: -e 는 끄고 각 invariant 를 개별 fail 추적 (smoke-news-sync.sh 패턴)

# ═══════════════════════════════════════════════════════════════
# Phase 41 Plan 02 — kis-news-sync 스모크 (deploy-kis-news-sync.sh 끝에서 불린다 · 단독 실행도 가능)
#
#   bash scripts/smoke-kis-news-sync.sh [job] [region]
#
# INV-1 probe 실행 1회 — `KIS_NEWS_MODE=probe` 를 이 실행에만 덮어써 전체 최신 1쪽만 받아 들이고 끝난다
#       (Job 설정의 env 는 바꾸지 않는다 · 임대를 못 잡아도 토큰을 새로 받지 않는다 — 41-08).
# INV-2 Job 설정 — task timeout 50400s(14h) · max retries 0
# INV-3 Scheduler 3개 존재 · timeZone Asia/Seoul · 일정이 deploy-kis-news-sync.sh KIS_SCHEDULERS 와 같음
# INV-4 최근 15분 Cloud Logging 에 jsonPayload.msg="probe ok" 1건 이상
# 실패 수 > 0 이면 exit 1.
# ═══════════════════════════════════════════════════════════════

JOB="${1:-gh-radar-kis-news-sync}"
REGION="${2:-asia-northeast3}"
PROJECT="${GCP_PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || true)}"

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
check "INV-1 jobs execute (KIS_NEWS_MODE=probe) --wait exit 0" \
  gcloud run jobs execute "$JOB" --region="$REGION" --project="$PROJECT" \
    --update-env-vars=KIS_NEWS_MODE=probe --wait

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
# INV-3: Scheduler 3개 — 일정 · Asia/Seoul
# ─────────────────────────────────────────────────────────────
scheduler_ok() {
  local name="$1" want="$2" got tz
  got=$(gcloud scheduler jobs describe "$name" --location="$REGION" --project="$PROJECT" --format='value(schedule)' 2>/dev/null) || return 1
  tz=$(gcloud scheduler jobs describe "$name" --location="$REGION" --project="$PROJECT" --format='value(timeZone)' 2>/dev/null) || return 1
  [[ "$got" == "$want" && "$tz" == "Asia/Seoul" ]]
}
check "INV-3a scheduler fast (*/5 7-19 * * 1-5 · Asia/Seoul)" \
  scheduler_ok gh-radar-kis-news-sync-fast "*/5 7-19 * * 1-5"
check "INV-3b scheduler slow-weekday (*/15 0-6,20-23 * * 1-5 · Asia/Seoul)" \
  scheduler_ok gh-radar-kis-news-sync-slow-weekday "*/15 0-6,20-23 * * 1-5"
check "INV-3c scheduler slow-weekend (*/15 * * * 0,6 · Asia/Seoul)" \
  scheduler_ok gh-radar-kis-news-sync-slow-weekend "*/15 * * * 0,6"

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

echo ""
echo "Smoke result: PASS=$PASS FAIL=$FAIL"
if (( FAIL > 0 )); then
  for inv in "${FAILED_INVS[@]}"; do
    echo "  ✗ $inv"
  done
  echo "  힌트: 한투가 Cloud Run 발신을 거부하면(probe 실패 · 로그에 연결 거부/403) KIS_NEWS_VPC_EGRESS=1 로 다시 배포한다." >&2
  exit 1
fi
echo "✅ smoke-kis-news-sync.sh all PASS"
