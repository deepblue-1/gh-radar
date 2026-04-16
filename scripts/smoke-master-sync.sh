#!/usr/bin/env bash
set -uo pipefail
# 주의: -e는 끄고 각 invariant를 개별 fail 추적 (smoke-ingestion.sh 패턴)

JOB="${1:-gh-radar-master-sync}"
REGION="${2:-asia-northeast3}"

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

echo "Smoke testing Job=$JOB Region=$REGION"
echo ""

# ─────────────────────────────────────────────────────────────
# INV-1: Job 실행 --wait exit 0 (백필 겸 첫 실행)
# ─────────────────────────────────────────────────────────────
check "INV-1 jobs execute --wait exit 0" \
  gcloud run jobs execute "$JOB" --region="$REGION" --wait

# ─────────────────────────────────────────────────────────────
# INV-2: 최근 5분 로그에 "master-sync cycle complete" 1건 이상
# ─────────────────────────────────────────────────────────────
check "INV-2 logs: master-sync cycle complete" bash -c "
  gcloud logging read '
    resource.type=\"cloud_run_job\"
    AND resource.labels.job_name=\"$JOB\"
    AND jsonPayload.msg=\"master-sync cycle complete\"
  ' --freshness=5m --limit=5 --format='value(jsonPayload.msg)' \
    | grep -q 'master-sync cycle complete'
"

# ─────────────────────────────────────────────────────────────
# INV-3: 최근 5분 내 "master-sync failed" OR "401" 0건
# ─────────────────────────────────────────────────────────────
check "INV-3 logs: no master-sync failed / 401" bash -c "
  COUNT=\$(gcloud logging read '
    resource.type=\"cloud_run_job\"
    AND resource.labels.job_name=\"$JOB\"
    AND (jsonPayload.msg=\"master-sync failed\" OR textPayload:\"401\")
  ' --freshness=5m --limit=1 --format='value(timestamp)' | wc -l | tr -d ' ')
  [ \"\$COUNT\" -eq 0 ]
"

# ─────────────────────────────────────────────────────────────
# INV-4: Supabase stocks count >= 2500
#   Content-Range 헤더 파싱 (Prefer: count=exact, Range: 0-0)
# ─────────────────────────────────────────────────────────────
check "INV-4 Supabase stocks count >= 2500" bash -c "
  : \${SUPABASE_URL:?SUPABASE_URL required}
  : \${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY required}
  RANGE_HEADER=\$(curl -fsS -I \"\${SUPABASE_URL}/rest/v1/stocks?select=code\" \
    -H \"apikey: \$SUPABASE_SERVICE_ROLE_KEY\" \
    -H \"Authorization: Bearer \$SUPABASE_SERVICE_ROLE_KEY\" \
    -H \"Prefer: count=exact\" \
    -H \"Range: 0-0\" 2>/dev/null | grep -i 'content-range')
  # Content-Range: 0-0/2771  →  마지막 숫자가 총 개수
  TOTAL=\$(echo \"\$RANGE_HEADER\" | grep -oE '[0-9]+$')
  echo \"stocks count: \$TOTAL\"
  [ -n \"\$TOTAL\" ] && [ \"\$TOTAL\" -ge 2500 ]
"

# ─────────────────────────────────────────────────────────────
# INV-5: Scheduler ENABLED + schedule == "10 8 * * 1-5"
# ─────────────────────────────────────────────────────────────
check "INV-5 scheduler ENABLED + correct schedule" bash -c "
  STATE=\$(gcloud scheduler jobs describe gh-radar-master-sync-scheduler --location=\"$REGION\" --format='value(state)' 2>/dev/null)
  SCHEDULE=\$(gcloud scheduler jobs describe gh-radar-master-sync-scheduler --location=\"$REGION\" --format='value(schedule)' 2>/dev/null)
  [ \"\$STATE\" = ENABLED ] && [ \"\$SCHEDULE\" = '10 8 * * 1-5' ]
"

# ─────────────────────────────────────────────────────────────
# INV-6: 005930 종목이 stocks 마스터에 존재 + name 에 "삼성전자" 포함
# ─────────────────────────────────────────────────────────────
check "INV-6 005930 삼성전자 exists in stocks" bash -c "
  : \${SUPABASE_URL:?SUPABASE_URL required}
  : \${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY required}
  RESULT=\$(curl -fsS \"\${SUPABASE_URL}/rest/v1/stocks?code=eq.005930&select=code,name\" \
    -H \"apikey: \$SUPABASE_SERVICE_ROLE_KEY\" \
    -H \"Authorization: Bearer \$SUPABASE_SERVICE_ROLE_KEY\" 2>/dev/null)
  echo \"\$RESULT\" | grep -q '삼성전자'
"

echo ""
echo "═══════════════════════════════════════"
echo "PASS: $PASS  FAIL: $FAIL"
if [[ $FAIL -gt 0 ]]; then
  echo "Failed: ${FAILED_INVS[*]}"
  exit 1
fi
echo "✅ All smoke invariants passed"
