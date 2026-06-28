#!/usr/bin/env bash
set -uo pipefail
# 주의: -e는 끄고 개별 invariant fail 추적 (Phase 11 동조 워커 선례 패턴)

# ═══════════════════════════════════════════════════════════════
# smoke-limit-up-sync.sh
# Phase 12 (LIMIT-01) — limit-up-sync 배포 후 검증 (INV-1~5)
#
# Usage:
#   bash scripts/smoke-limit-up-sync.sh                  # INV-1~5 전체
#   bash scripts/smoke-limit-up-sync.sh --check-scheduler # Scheduler ENABLED + cron
#
# INV-1: Job execute --wait exit 0
# INV-2: 로그 "limit-up-sync complete" 1건 이상 (jsonPayload.msg — Job 측)
# INV-3: 로그 "limit-up-sync failed" 0건
# INV-4: limit_up_events + limit_up_stock_stats 행수 > 0 (service_role REST count)
# INV-5: Scheduler ENABLED + cron '0 2 * * 2-6'
# ═══════════════════════════════════════════════════════════════

REGION=asia-northeast3
JOB=gh-radar-limit-up-sync
SCHED=gh-radar-limit-up-sync-nightly
SCHED_CRON='0 2 * * 2-6'

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

# ─── Flag dispatch ───
case "${1:-}" in
  --check-scheduler)
    check "INV-5 $SCHED ENABLED + cron '$SCHED_CRON'" bash -c "
      STATE=\$(gcloud scheduler jobs describe $SCHED --location=$REGION --format='value(state)' 2>/dev/null)
      SCHEDULE=\$(gcloud scheduler jobs describe $SCHED --location=$REGION --format='value(schedule)' 2>/dev/null)
      [ \"\$STATE\" = ENABLED ] && [ \"\$SCHEDULE\" = '$SCHED_CRON' ]
    "
    echo ""
    echo "PASS: $PASS  FAIL: $FAIL"
    [[ $FAIL -gt 0 ]] && exit 1 || exit 0
    ;;
esac

# ─── 기본 INV-1~5 ───
echo "Smoke testing limit-up-sync — INV-1~5"
echo ""

# INV-1: Job execute --wait exit 0
check "INV-1 Job execute --wait exit 0" \
  gcloud run jobs execute "$JOB" --region="$REGION" --wait

# INV-2: 최근 5분 로그에 "limit-up-sync complete" (또는 "rebuild_limit_up complete") 1건 이상
check "INV-2 logs: limit-up-sync complete" bash -c "
  gcloud logging read '
    resource.type=\"cloud_run_job\"
    AND resource.labels.job_name=\"$JOB\"
    AND (jsonPayload.msg=\"limit-up-sync complete\" OR jsonPayload.msg=\"rebuild_limit_up complete\")
  ' --freshness=5m --limit=5 --format='value(jsonPayload.msg)' \
    | grep -qE 'limit-up-sync complete|rebuild_limit_up complete'
"

# INV-3: 최근 5분 내 "limit-up-sync failed" 0건
check "INV-3 logs: no limit-up-sync failed" bash -c "
  COUNT=\$(gcloud logging read '
    resource.type=\"cloud_run_job\"
    AND resource.labels.job_name=\"$JOB\"
    AND jsonPayload.msg=\"limit-up-sync failed\"
  ' --freshness=5m --limit=1 --format='value(timestamp)' | wc -l | tr -d ' ')
  [ \"\$COUNT\" -eq 0 ]
"

# INV-4: limit_up_events + limit_up_stock_stats 행수 > 0 (service_role REST count=exact)
check "INV-4 limit_up_events row count > 0" bash -c "
  : \${SUPABASE_URL:?SUPABASE_URL required}
  : \${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY required}
  RANGE_HEADER=\$(curl -fsS -I \"\${SUPABASE_URL}/rest/v1/limit_up_events?select=code\" \
    -H \"apikey: \$SUPABASE_SERVICE_ROLE_KEY\" \
    -H \"Authorization: Bearer \$SUPABASE_SERVICE_ROLE_KEY\" \
    -H \"Prefer: count=exact\" -H \"Range: 0-0\" 2>/dev/null | grep -i 'content-range')
  TOTAL=\$(echo \"\$RANGE_HEADER\" | tr -d '\r' | grep -oE '[0-9]+\$')
  echo \"limit_up_events count: \$TOTAL\"
  [ -n \"\$TOTAL\" ] && [ \"\$TOTAL\" -gt 0 ]
"

check "INV-4 limit_up_stock_stats row count > 0" bash -c "
  RANGE_HEADER=\$(curl -fsS -I \"\${SUPABASE_URL}/rest/v1/limit_up_stock_stats?select=code\" \
    -H \"apikey: \$SUPABASE_SERVICE_ROLE_KEY\" \
    -H \"Authorization: Bearer \$SUPABASE_SERVICE_ROLE_KEY\" \
    -H \"Prefer: count=exact\" -H \"Range: 0-0\" 2>/dev/null | grep -i 'content-range')
  TOTAL=\$(echo \"\$RANGE_HEADER\" | tr -d '\r' | grep -oE '[0-9]+\$')
  echo \"limit_up_stock_stats count: \$TOTAL\"
  [ -n \"\$TOTAL\" ] && [ \"\$TOTAL\" -gt 0 ]
"

# INV-5: Scheduler ENABLED + cron
check "INV-5 $SCHED ENABLED + cron '$SCHED_CRON'" bash -c "
  STATE=\$(gcloud scheduler jobs describe $SCHED --location=$REGION --format='value(state)' 2>/dev/null)
  SCHEDULE=\$(gcloud scheduler jobs describe $SCHED --location=$REGION --format='value(schedule)' 2>/dev/null)
  [ \"\$STATE\" = ENABLED ] && [ \"\$SCHEDULE\" = '$SCHED_CRON' ]
"

echo ""
echo "═══════════════════════════════════════"
echo "PASS: $PASS  FAIL: $FAIL"
if [[ $FAIL -gt 0 ]]; then
  echo "Failed: ${FAILED_INVS[*]}"
  exit 1
fi
echo "✅ All smoke invariants passed"
