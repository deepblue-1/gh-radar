#!/usr/bin/env bash
set -uo pipefail
# 주의: -e 는 끄고 각 invariant 를 개별 fail 추적 (smoke-master-sync.sh 패턴)

# ═══════════════════════════════════════════════════════════════
# Phase 10 Plan 08 — theme-sync 배포 invariants 검증 (master-sync smoke 복제)
#
# INV-1: Cloud Run Job 1회 execute --wait → exit 0 (첫 production 적재)
# INV-2: 최근 로그 "theme-sync cycle complete" 1건 이상
# INV-3: 최근 로그 "theme-sync failed" OR "401" 0건 (Scheduler OAuth/시크릿 정상)
# INV-4: Supabase themes count > 0  ← 핵심 성공 기준(네이버 ~265 + 알파 정치 테마 적재)
# INV-5: Scheduler ENABLED + schedule == "0 16 * * *"
# INV-6: Scheduler OAuth invoker (Pitfall 4 — OIDC 금지)
#
# DI-02 주의: curl -I 의 Content-Range 헤더 끝에 CR(\r) 이 붙어
#   `grep -oE '[0-9]+$'` 가 매치 실패할 수 있음 → `tr -d '\r'` 로 CR 제거 후 파싱.
# ═══════════════════════════════════════════════════════════════

JOB="${1:-gh-radar-theme-sync}"
REGION="${2:-asia-northeast3}"
PROJECT="${EXPECTED_PROJECT:-${GCP_PROJECT_ID:-gh-radar}}"
SCHEDULER_NAME="gh-radar-theme-sync-daily"

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
# INV-2: 최근 10분 로그에 "theme-sync cycle complete" 1건 이상
#   (skippedWrite/backoff 인 경우에도 cycle complete 로그는 안 남을 수 있으므로,
#    첫 실행은 빈 DB → 적재 → complete 로그 기대.)
# ─────────────────────────────────────────────────────────────
check "INV-2 logs: theme-sync cycle complete" bash -c "
  gcloud logging read '
    resource.type=\"cloud_run_job\"
    AND resource.labels.job_name=\"$JOB\"
    AND jsonPayload.msg=\"theme-sync cycle complete\"
  ' --project=\"$PROJECT\" --freshness=10m --limit=5 --format='value(jsonPayload.msg)' \
    | grep -q 'theme-sync cycle complete'
"

# ─────────────────────────────────────────────────────────────
# INV-3: 최근 10분 내 "theme-sync failed" OR "401" 0건
# ─────────────────────────────────────────────────────────────
check "INV-3 logs: no theme-sync failed / 401" bash -c "
  COUNT=\$(gcloud logging read '
    resource.type=\"cloud_run_job\"
    AND resource.labels.job_name=\"$JOB\"
    AND (jsonPayload.msg=\"theme-sync failed\" OR textPayload:\"401\")
  ' --project=\"$PROJECT\" --freshness=10m --limit=1 --format='value(timestamp)' | wc -l | tr -d ' ')
  [ \"\$COUNT\" -eq 0 ]
"

# ─────────────────────────────────────────────────────────────
# INV-4: Supabase themes count > 0  ← 핵심 성공 기준
#   Content-Range 헤더 파싱 (Prefer: count=exact, Range: 0-0)
#   DI-02: `tr -d '\r'` 로 CR 제거 후 `$`-anchored 숫자 추출.
# ─────────────────────────────────────────────────────────────
check "INV-4 Supabase themes count > 0" bash -c "
  : \${SUPABASE_URL:?SUPABASE_URL required}
  : \${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY required}
  RANGE_HEADER=\$(curl -fsS -I \"\${SUPABASE_URL}/rest/v1/themes?select=id\" \
    -H \"apikey: \$SUPABASE_SERVICE_ROLE_KEY\" \
    -H \"Authorization: Bearer \$SUPABASE_SERVICE_ROLE_KEY\" \
    -H \"Prefer: count=exact\" \
    -H \"Range: 0-0\" 2>/dev/null | tr -d '\r' | grep -i 'content-range')
  # Content-Range: 0-0/265  →  마지막 숫자가 총 개수
  TOTAL=\$(echo \"\$RANGE_HEADER\" | grep -oE '[0-9]+\$')
  echo \"themes count: \$TOTAL\"
  [ -n \"\$TOTAL\" ] && [ \"\$TOTAL\" -gt 0 ]
"

# ─────────────────────────────────────────────────────────────
# INV-5: Scheduler ENABLED + schedule == "0 16 * * *"
# ─────────────────────────────────────────────────────────────
check "INV-5 scheduler ENABLED + correct schedule" bash -c "
  STATE=\$(gcloud scheduler jobs describe $SCHEDULER_NAME --location=\"$REGION\" --project=\"$PROJECT\" --format='value(state)' 2>/dev/null)
  SCHEDULE=\$(gcloud scheduler jobs describe $SCHEDULER_NAME --location=\"$REGION\" --project=\"$PROJECT\" --format='value(schedule)' 2>/dev/null)
  [ \"\$STATE\" = ENABLED ] && [ \"\$SCHEDULE\" = '0 16 * * *' ]
"

# ─────────────────────────────────────────────────────────────
# INV-6: Scheduler OAuth invoker (Pitfall 4 — OIDC 금지)
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
