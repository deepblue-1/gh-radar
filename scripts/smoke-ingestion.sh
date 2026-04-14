#!/usr/bin/env bash
set -uo pipefail
# 주의: -e는 끄고 각 invariant를 개별 fail 추적 (smoke-server.sh 패턴)

JOB="${1:-gh-radar-ingestion}"
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
# INV-1: Job 실행 --wait exit 0
# ─────────────────────────────────────────────────────────────
check "INV-1 jobs execute --wait exit 0" \
  gcloud run jobs execute "$JOB" --region="$REGION" --wait

# ─────────────────────────────────────────────────────────────
# INV-2: 최근 5분 로그에 "cycle complete" OR "non-trading day detected, exiting"
#   (D-13 휴장일 분기 허용)
# ─────────────────────────────────────────────────────────────
check "INV-2 logs: cycle complete OR non-trading day detected, exiting" bash -c "
  gcloud logging read '
    resource.type=\"cloud_run_job\"
    AND resource.labels.job_name=\"$JOB\"
    AND (jsonPayload.msg=\"cycle complete\" OR jsonPayload.msg=\"non-trading day detected, exiting\")
  ' --freshness=5m --limit=5 --format='value(jsonPayload.msg)' \
    | grep -Eq '(cycle complete|non-trading day detected, exiting)'
"

# ─────────────────────────────────────────────────────────────
# INV-3: 최근 5분 내 cycle failed / EGW00201 rate limit 0건
# ─────────────────────────────────────────────────────────────
check "INV-3 logs: no cycle failed / EGW00201" bash -c "
  COUNT=\$(gcloud logging read '
    resource.type=\"cloud_run_job\"
    AND resource.labels.job_name=\"$JOB\"
    AND (jsonPayload.msg=\"cycle failed\" OR textPayload:\"EGW00201\")
  ' --freshness=5m --limit=1 --format='value(timestamp)' | wc -l | tr -d ' ')
  [ \"\$COUNT\" -eq 0 ]
"

# ─────────────────────────────────────────────────────────────
# INV-4: Supabase stocks freshness (거래일 <120s) OR 휴장일 로그
#   service_role 사용 (RESEARCH Validation Architecture)
# ─────────────────────────────────────────────────────────────
check "INV-4 Supabase stocks freshness or holiday" bash -c "
  : \${SUPABASE_URL:?SUPABASE_URL required}
  : \${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY required}
  MAX_TS=\$(curl -fsS \"\${SUPABASE_URL}/rest/v1/stocks?select=updated_at&order=updated_at.desc&limit=1\" \
    -H \"apikey: \$SUPABASE_SERVICE_ROLE_KEY\" \
    -H \"Authorization: Bearer \$SUPABASE_SERVICE_ROLE_KEY\" 2>/dev/null | jq -r '.[0].updated_at')
  if [ -n \"\$MAX_TS\" ] && [ \"\$MAX_TS\" != null ]; then
    NOW=\$(date -u +%s)
    TS_EPOCH=\$(date -u -d \"\$MAX_TS\" +%s 2>/dev/null || date -u -jf '%Y-%m-%dT%H:%M:%S' \"\${MAX_TS%%.*}\" +%s 2>/dev/null || echo 0)
    AGE=\$(( NOW - TS_EPOCH ))
    [ \"\$AGE\" -lt 120 ] && exit 0
  fi
  # Fallback: 휴장일 로그가 있으면 통과
  gcloud logging read '
    resource.type=\"cloud_run_job\"
    AND resource.labels.job_name=\"$JOB\"
    AND jsonPayload.msg=\"non-trading day detected, exiting\"
  ' --freshness=10m --limit=1 --format='value(timestamp)' | grep -q .
"

# ─────────────────────────────────────────────────────────────
# INV-5: Scheduler state=ENABLED
# ─────────────────────────────────────────────────────────────
check "INV-5 scheduler ENABLED" bash -c "
  STATE=\$(gcloud scheduler jobs describe gh-radar-ingestion-scheduler --location=\"$REGION\" --format='value(state)' 2>/dev/null)
  [ \"\$STATE\" = ENABLED ]
"

echo ""
echo "═══════════════════════════════════════"
echo "PASS: $PASS  FAIL: $FAIL"
if [[ $FAIL -gt 0 ]]; then
  echo "Failed: ${FAILED_INVS[*]}"
  exit 1
fi
echo "✅ All smoke invariants passed"
