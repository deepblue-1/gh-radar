#!/usr/bin/env bash
set -uo pipefail
# -e 끄고 개별 invariant 추적

# ═══════════════════════════════════════════════════════════════
# smoke-intraday-sync.sh
# Phase 09.1 (DATA-02) — intraday-sync 배포 후 검증
#
# Usage:
#   bash scripts/smoke-intraday-sync.sh                 # INV-1~6 전체
#   bash scripts/smoke-intraday-sync.sh --check-scheduler
#   bash scripts/smoke-intraday-sync.sh --check-static-ip  # Cloud Run task 가 reserved IP 로 outbound
# ═══════════════════════════════════════════════════════════════

REGION=asia-northeast3
JOB=gh-radar-intraday-sync
SCHED=gh-radar-intraday-sync-cron

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

case "${1:-}" in
  --check-scheduler)
    check "Scheduler ENABLED + cron '* 9-15 * * 1-5' Asia/Seoul" bash -c "
      STATE=\$(gcloud scheduler jobs describe $SCHED --location=$REGION --format='value(state)' 2>/dev/null)
      SCHEDULE=\$(gcloud scheduler jobs describe $SCHED --location=$REGION --format='value(schedule)' 2>/dev/null)
      TZ=\$(gcloud scheduler jobs describe $SCHED --location=$REGION --format='value(timeZone)' 2>/dev/null)
      [ \"\$STATE\" = ENABLED ] && [ \"\$SCHEDULE\" = '* 9-15 * * 1-5' ] && [ \"\$TZ\" = 'Asia/Seoul' ]
    "
    echo ""
    echo "PASS: $PASS  FAIL: $FAIL"
    [[ $FAIL -gt 0 ]] && exit 1 || exit 0
    ;;

  --check-static-ip)
    echo "Checking Cloud Run task outbound IP matches reserved Static IP"
    check "Static IP exists" gcloud compute addresses describe gh-radar-static-ip --region="$REGION"
    check "intraday-sync Job 이 VPC 연결" bash -c "
      NETWORK=\$(gcloud run jobs describe $JOB --region=$REGION --format='value(spec.template.spec.template.spec.containers[0].vpcAccess.networkInterfaces[0].network)' 2>/dev/null)
      SUBNET=\$(gcloud run jobs describe $JOB --region=$REGION --format='value(spec.template.spec.template.spec.containers[0].vpcAccess.networkInterfaces[0].subnetwork)' 2>/dev/null)
      [ -n \"\$NETWORK\" ] && [ -n \"\$SUBNET\" ]
    "
    echo ""
    echo "PASS: $PASS  FAIL: $FAIL"
    echo ""
    echo "Manual verification — outbound IP echo:"
    echo "  gcloud run jobs execute $JOB --region=$REGION --update-env-vars=DEBUG_ECHO_IP=1 --wait"
    echo "  (worker 가 부팅 시 'GET https://api.ipify.org' 결과 로그 → 키움 등록 IP 와 일치 확인)"
    [[ $FAIL -gt 0 ]] && exit 1 || exit 0
    ;;
esac

# ─── 기본 INV-1~6 ───
echo "Smoke testing intraday-sync — INV-1~6"
echo ""

# INV-1: Job execute --wait exit 0
check "INV-1 Job execute --wait exit 0" \
  gcloud run jobs execute "$JOB" --region="$REGION" --wait

# INV-2: 최근 5분 로그에 "intraday cycle complete" 또는 "휴장일" 1건 이상
check "INV-2 logs: intraday cycle complete OR 휴장일" bash -c "
  gcloud logging read '
    resource.type=\"cloud_run_job\"
    AND resource.labels.job_name=\"$JOB\"
    AND (jsonPayload.msg=\"intraday cycle complete\" OR jsonPayload.msg=~\"휴장일\")
  ' --freshness=5m --limit=5 --format='value(jsonPayload.msg)' \
    | grep -qE 'intraday cycle complete|휴장일'
"

# INV-3: 최근 5분 "intraday-sync failed" / "키움 401" / "키움 429" 0건
check "INV-3 logs: no failures / 키움 401 / 키움 429" bash -c "
  COUNT=\$(gcloud logging read '
    resource.type=\"cloud_run_job\"
    AND resource.labels.job_name=\"$JOB\"
    AND (jsonPayload.msg=\"intraday-sync failed\" OR jsonPayload.err.message=~\"키움 401\" OR jsonPayload.err.message=~\"키움 429\")
  ' --freshness=5m --limit=1 --format='value(timestamp)' | wc -l | tr -d ' ')
  [ \"\$COUNT\" -eq 0 ]
"

# INV-4: Supabase stock_quotes 의 갱신 시각 5분 이내 row count >= 1500
check "INV-4 stock_quotes 5분 이내 갱신 row >= 1500" bash -c "
  : \${SUPABASE_URL:?SUPABASE_URL required}
  : \${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY required}
  THRESHOLD=\$(date -u -v-5M '+%Y-%m-%dT%H:%M:%S.000Z' 2>/dev/null || date -u -d '5 minutes ago' '+%Y-%m-%dT%H:%M:%S.000Z')
  RANGE_HEADER=\$(curl -fsS -I \"\${SUPABASE_URL}/rest/v1/stock_quotes?updated_at=gte.\${THRESHOLD}&select=code\" \
    -H \"apikey: \$SUPABASE_SERVICE_ROLE_KEY\" \
    -H \"Authorization: Bearer \$SUPABASE_SERVICE_ROLE_KEY\" \
    -H \"Prefer: count=exact\" \
    -H \"Range: 0-0\" 2>/dev/null | grep -i 'content-range')
  TOTAL=\$(echo \"\$RANGE_HEADER\" | grep -oE '[0-9]+\$')
  echo \"recent stock_quotes count: \$TOTAL\"
  [ -n \"\$TOTAL\" ] && [ \"\$TOTAL\" -ge 1500 ]
"

# INV-5: stock_daily_ohlcv 오늘자 row >= 1500
check "INV-5 stock_daily_ohlcv 오늘 row >= 1500" bash -c "
  TODAY=\$(date '+%Y-%m-%d')
  RANGE_HEADER=\$(curl -fsS -I \"\${SUPABASE_URL}/rest/v1/stock_daily_ohlcv?date=eq.\${TODAY}&select=code\" \
    -H \"apikey: \$SUPABASE_SERVICE_ROLE_KEY\" \
    -H \"Authorization: Bearer \$SUPABASE_SERVICE_ROLE_KEY\" \
    -H \"Prefer: count=exact\" \
    -H \"Range: 0-0\" 2>/dev/null | grep -i 'content-range')
  TOTAL=\$(echo \"\$RANGE_HEADER\" | grep -oE '[0-9]+\$')
  echo \"today ohlcv count: \$TOTAL\"
  [ -n \"\$TOTAL\" ] && [ \"\$TOTAL\" -ge 1500 ]
"

# INV-6: Scheduler ENABLED
check "INV-6 Scheduler ENABLED" bash -c "
  STATE=\$(gcloud scheduler jobs describe $SCHED --location=$REGION --format='value(state)' 2>/dev/null)
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
