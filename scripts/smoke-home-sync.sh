#!/usr/bin/env bash
set -uo pipefail
# 주의: -e 는 끄고 각 invariant 를 개별 fail 추적 (smoke-theme-sync.sh 패턴)

# ═══════════════════════════════════════════════════════════════
# Phase 13 Plan 06 — home-sync 배포 invariants 검증 (smoke-theme-sync.sh 복제)
#
# INV-1: Cloud Run Job 1회 execute --wait → exit 0 (첫 production 적재)
# INV-2: 최근 로그 "home-sync cycle complete" 1건 이상
# INV-3: 최근 로그 "home-sync failed" OR "401" 0건 (Scheduler OAuth/시크릿 정상)
# INV-4: Supabase home_theme_snapshots count (오늘 trade_date) >= 1
#          ← 핵심 성공 기준. 급등 없는 날에도 스냅샷 row 자체는 적재됨(payload themes/singles 빈 배열).
# INV-5: Scheduler ENABLED + schedule == "*/5 8-15 * * 1-5"
# INV-6: Scheduler OAuth invoker (Pitfall — OIDC 금지)
#
# DI-02 주의: curl -I 의 Content-Range 헤더 끝에 CR(\r) 이 붙어
#   `grep -oE '[0-9]+$'` 가 매치 실패할 수 있음 → `tr -d '\r'` 로 CR 제거 후 파싱.
# 로그 필드명은 jsonPayload.msg (raw pino — Cloud Run Job 은 msg 보존, Phase 10 lesson).
# ═══════════════════════════════════════════════════════════════

JOB="${1:-gh-radar-home-sync}"
REGION="${2:-asia-northeast3}"
PROJECT="${EXPECTED_PROJECT:-${GCP_PROJECT_ID:-gh-radar}}"
SCHEDULER_NAME="gh-radar-home-sync-cron"

PASS=0
FAIL=0
declare -a FAILED_INVS

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
# INV-1: Job 실행 --wait exit 0 (첫 production 적재 겸 검증)
# ─────────────────────────────────────────────────────────────
check "INV-1 jobs execute --wait exit 0" \
  gcloud run jobs execute "$JOB" --region="$REGION" --project="$PROJECT" --wait

# ─────────────────────────────────────────────────────────────
# INV-2: 최근 10분 로그에 "home-sync cycle complete" 1건 이상
#   Job 완료 직후 Cloud Logging ingestion 지연(~30-60s)이 있어 5회 × 15s 재시도로 lag 흡수.
# ─────────────────────────────────────────────────────────────
check "INV-2 logs: home-sync cycle complete" bash -c "
  for attempt in 1 2 3 4 5; do
    gcloud logging read '
      resource.type=\"cloud_run_job\"
      AND resource.labels.job_name=\"$JOB\"
      AND jsonPayload.msg=\"home-sync cycle complete\"
    ' --project=\"$PROJECT\" --freshness=10m --limit=5 --format='value(jsonPayload.msg)' \
      | grep -q 'home-sync cycle complete' && exit 0
    sleep 15
  done
  exit 1
"

# ─────────────────────────────────────────────────────────────
# INV-3: 최근 10분 내 "home-sync failed" OR "401" 0건
# ─────────────────────────────────────────────────────────────
check "INV-3 logs: no home-sync failed / 401" bash -c "
  COUNT=\$(gcloud logging read '
    resource.type=\"cloud_run_job\"
    AND resource.labels.job_name=\"$JOB\"
    AND (jsonPayload.msg=\"home-sync failed\" OR textPayload:\"401\")
  ' --project=\"$PROJECT\" --freshness=10m --limit=1 --format='value(timestamp)' | wc -l | tr -d ' ')
  [ \"\$COUNT\" -eq 0 ]
"

# ─────────────────────────────────────────────────────────────
# INV-4: Supabase home_theme_snapshots count (오늘 trade_date) >= 1  ← 핵심 성공 기준
#   Content-Range 헤더 파싱 (Prefer: count=exact, Range: 0-0)
#   DI-02: `tr -d '\r'` 로 CR 제거 후 `$`-anchored 숫자 추출.
#   trade_date=today(KST) 필터로 이번 배치 슬롯이 실제 append 됐는지 검증.
# ─────────────────────────────────────────────────────────────
check "INV-4 Supabase home_theme_snapshots (today) >= 1" bash -c "
  : \${SUPABASE_URL:?SUPABASE_URL required}
  : \${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY required}
  TODAY=\$(TZ=Asia/Seoul date +%Y-%m-%d)
  RANGE_HEADER=\$(curl -fsS -I \"\${SUPABASE_URL}/rest/v1/home_theme_snapshots?select=captured_at&trade_date=eq.\${TODAY}\" \
    -H \"apikey: \$SUPABASE_SERVICE_ROLE_KEY\" \
    -H \"Authorization: Bearer \$SUPABASE_SERVICE_ROLE_KEY\" \
    -H \"Prefer: count=exact\" \
    -H \"Range: 0-0\" 2>/dev/null | tr -d '\r' | grep -i 'content-range')
  # Content-Range: 0-0/3  →  마지막 숫자가 오늘 슬롯 총 개수
  TOTAL=\$(echo \"\$RANGE_HEADER\" | grep -oE '[0-9]+\$')
  echo \"home_theme_snapshots (today \$TODAY) count: \$TOTAL\"
  [ -n \"\$TOTAL\" ] && [ \"\$TOTAL\" -ge 1 ]
"

# ─────────────────────────────────────────────────────────────
# INV-5: Scheduler ENABLED + schedule == "*/5 8-15 * * 1-5"
# ─────────────────────────────────────────────────────────────
check "INV-5 scheduler ENABLED + correct schedule" bash -c "
  STATE=\$(gcloud scheduler jobs describe $SCHEDULER_NAME --location=\"$REGION\" --project=\"$PROJECT\" --format='value(state)' 2>/dev/null)
  SCHEDULE=\$(gcloud scheduler jobs describe $SCHEDULER_NAME --location=\"$REGION\" --project=\"$PROJECT\" --format='value(schedule)' 2>/dev/null)
  [ \"\$STATE\" = ENABLED ] && [ \"\$SCHEDULE\" = '*/5 8-15 * * 1-5' ]
"

# ─────────────────────────────────────────────────────────────
# INV-6: Scheduler OAuth invoker (Pitfall — OIDC 금지)
# ─────────────────────────────────────────────────────────────
check "INV-6 Scheduler OAuth invoker (no OIDC)" bash -c "
  AUTH=\$(gcloud scheduler jobs describe $SCHEDULER_NAME --location=\"$REGION\" --project=\"$PROJECT\" --format='value(httpTarget.oauthToken.serviceAccountEmail)' 2>/dev/null)
  [[ \"\$AUTH\" == *'gh-radar-scheduler-sa'* ]]
"

echo ""
echo "═══════════════════════════════════════"
echo "PASS: $PASS  FAIL: $FAIL"
if [[ $FAIL -gt 0 ]]; then
  echo "Failed: ${FAILED_INVS[*]}"
  exit 1
fi
echo "✅ All smoke invariants passed"
