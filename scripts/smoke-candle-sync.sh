#!/usr/bin/env bash
set -uo pipefail
# 주의: -e는 끄고 개별 invariant fail 추적 (master-sync 패턴)

# ═══════════════════════════════════════════════════════════════
# smoke-candle-sync.sh
# Phase 9 (DATA-01) — candle-sync 배포 후 검증 (INV-1~6 + --check-* 플래그)
#
# Usage:
#   bash scripts/smoke-candle-sync.sh                       # INV-1~6 전체
#   bash scripts/smoke-candle-sync.sh --check-backfill      # 백필 검증 (row >= 4M, 005930 >= 1500)
#   bash scripts/smoke-candle-sync.sh --check-coverage      # SC #5 결측 종목 (RESEARCH §6.1) < 5%
#   bash scripts/smoke-candle-sync.sh --check-completeness  # SC #5 결측 일자 (RESEARCH §6.2) <= 4
#   bash scripts/smoke-candle-sync.sh --check-scheduler     # Scheduler 2종 ENABLED + cron
# ═══════════════════════════════════════════════════════════════

REGION=asia-northeast3
DAILY_JOB=gh-radar-candle-sync-daily
RECOVER_JOB=gh-radar-candle-sync-recover
BACKFILL_JOB=gh-radar-candle-sync-backfill
EOD_SCHED=gh-radar-candle-sync-eod
RECOVER_SCHED=gh-radar-candle-sync-recover

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
  --check-backfill)
    echo "Checking backfill — row count >= 4M, 005930 >= 1500"
    check "row count >= 4M" bash -c "
      : \${SUPABASE_URL:?SUPABASE_URL required}
      : \${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY required}
      RANGE_HEADER=\$(curl -fsS -I \"\${SUPABASE_URL}/rest/v1/stock_daily_ohlcv?select=code\" \
        -H \"apikey: \$SUPABASE_SERVICE_ROLE_KEY\" \
        -H \"Authorization: Bearer \$SUPABASE_SERVICE_ROLE_KEY\" \
        -H \"Prefer: count=exact\" \
        -H \"Range: 0-0\" 2>/dev/null | grep -i 'content-range')
      TOTAL=\$(echo \"\$RANGE_HEADER\" | grep -oE '[0-9]+\$')
      echo \"row count: \$TOTAL\"
      [ -n \"\$TOTAL\" ] && [ \"\$TOTAL\" -ge 4000000 ]
    "
    check "005930 (삼성전자) row >= 1500" bash -c "
      RANGE_HEADER=\$(curl -fsS -I \"\${SUPABASE_URL}/rest/v1/stock_daily_ohlcv?code=eq.005930&select=date\" \
        -H \"apikey: \$SUPABASE_SERVICE_ROLE_KEY\" \
        -H \"Authorization: Bearer \$SUPABASE_SERVICE_ROLE_KEY\" \
        -H \"Prefer: count=exact\" \
        -H \"Range: 0-0\" 2>/dev/null | grep -i 'content-range')
      TOTAL=\$(echo \"\$RANGE_HEADER\" | grep -oE '[0-9]+\$')
      echo \"005930 row count: \$TOTAL\"
      [ -n \"\$TOTAL\" ] && [ \"\$TOTAL\" -ge 1500 ]
    "
    echo ""
    echo "PASS: $PASS  FAIL: $FAIL"
    [[ $FAIL -gt 0 ]] && exit 1 || exit 0
    ;;

  --check-coverage)
    echo "Checking SC #5 결측 종목 (RESEARCH §6.1) — active 의 < 5%"
    # Postgres SQL via Supabase RPC 또는 raw SQL (psql)
    check "결측 종목 < 5%" bash -c "
      : \${SUPABASE_DB_URL:?SUPABASE_DB_URL required for SQL check}
      OUT=\$(psql \"\$SUPABASE_DB_URL\" -At -c \"
        WITH active AS (SELECT code FROM stocks WHERE is_delisted = false),
        recent_coverage AS (
          SELECT DISTINCT code FROM stock_daily_ohlcv
          WHERE date >= CURRENT_DATE - INTERVAL '30 days'
        ),
        missing AS (
          SELECT a.code FROM active a
          LEFT JOIN recent_coverage rc ON a.code = rc.code
          WHERE rc.code IS NULL
        )
        SELECT
          ROUND(COUNT(*)::numeric / NULLIF((SELECT COUNT(*) FROM active),0) * 100, 2)
        FROM missing;
      \")
      echo \"missing_pct: \$OUT\"
      [ -n \"\$OUT\" ] && awk \"BEGIN{exit !(\$OUT < 5)}\"
    "
    echo ""
    echo "PASS: $PASS  FAIL: $FAIL"
    [[ $FAIL -gt 0 ]] && exit 1 || exit 0
    ;;

  --check-completeness)
    echo "Checking SC #5 결측 일자 (RESEARCH §6.2) — incomplete_count <= 4"
    check "결측 일자 <= 4 (월)" bash -c "
      : \${SUPABASE_DB_URL:?SUPABASE_DB_URL required}
      OUT=\$(psql \"\$SUPABASE_DB_URL\" -At -c \"
        WITH active_count AS (SELECT COUNT(*) AS n FROM stocks WHERE is_delisted = false),
        daily_rows AS (
          SELECT date, COUNT(*) AS row_count FROM stock_daily_ohlcv
          WHERE date >= CURRENT_DATE - INTERVAL '30 days'
          GROUP BY date
        )
        SELECT COUNT(*) FROM daily_rows dr
        CROSS JOIN active_count ac
        WHERE dr.row_count < ac.n * 0.9;
      \")
      echo \"incomplete_count: \$OUT\"
      [ -n \"\$OUT\" ] && [ \"\$OUT\" -le 4 ]
    "
    echo ""
    echo "PASS: $PASS  FAIL: $FAIL"
    [[ $FAIL -gt 0 ]] && exit 1 || exit 0
    ;;

  --check-scheduler)
    check "INV-6a $EOD_SCHED ENABLED + cron '30 17 * * 1-5'" bash -c "
      STATE=\$(gcloud scheduler jobs describe $EOD_SCHED --location=$REGION --format='value(state)' 2>/dev/null)
      SCHEDULE=\$(gcloud scheduler jobs describe $EOD_SCHED --location=$REGION --format='value(schedule)' 2>/dev/null)
      [ \"\$STATE\" = ENABLED ] && [ \"\$SCHEDULE\" = '30 17 * * 1-5' ]
    "
    check "INV-6b $RECOVER_SCHED ENABLED + cron '10 8 * * 1-5'" bash -c "
      STATE=\$(gcloud scheduler jobs describe $RECOVER_SCHED --location=$REGION --format='value(state)' 2>/dev/null)
      SCHEDULE=\$(gcloud scheduler jobs describe $RECOVER_SCHED --location=$REGION --format='value(schedule)' 2>/dev/null)
      [ \"\$STATE\" = ENABLED ] && [ \"\$SCHEDULE\" = '10 8 * * 1-5' ]
    "
    echo ""
    echo "PASS: $PASS  FAIL: $FAIL"
    [[ $FAIL -gt 0 ]] && exit 1 || exit 0
    ;;
esac

# ─── 기본 INV-1~6 ───
echo "Smoke testing candle-sync — INV-1~6"
echo ""

# INV-1: daily Job execute --wait exit 0
check "INV-1 daily Job execute --wait exit 0" \
  gcloud run jobs execute "$DAILY_JOB" --region="$REGION" --wait

# INV-2: 최근 5분 로그에 "runDaily complete" 또는 "KRX data not yet available" 1건 이상
check "INV-2 logs: runDaily complete OR KRX data not yet available" bash -c "
  gcloud logging read '
    resource.type=\"cloud_run_job\"
    AND resource.labels.job_name=\"$DAILY_JOB\"
    AND (jsonPayload.msg=\"runDaily complete\" OR jsonPayload.msg=\"KRX data not yet available\")
  ' --freshness=5m --limit=5 --format='value(jsonPayload.msg)' \
    | grep -qE 'runDaily complete|KRX data not yet available'
"

# INV-3: 최근 5분 내 "candle-sync failed" OR "KRX 401" 0건
check "INV-3 logs: no candle-sync failed / 401" bash -c "
  COUNT=\$(gcloud logging read '
    resource.type=\"cloud_run_job\"
    AND resource.labels.job_name=\"$DAILY_JOB\"
    AND (jsonPayload.msg=\"candle-sync failed\" OR textPayload:\"KRX 401\")
  ' --freshness=5m --limit=1 --format='value(timestamp)' | wc -l | tr -d ' ')
  [ \"\$COUNT\" -eq 0 ]
"

# INV-4: Supabase stock_daily_ohlcv 의 직전 영업일 row count > 활성 stocks × 0.9 (= ~2,520)
check "INV-4 stock_daily_ohlcv 직전 영업일 row count >= 2500" bash -c "
  : \${SUPABASE_URL:?SUPABASE_URL required}
  : \${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY required}
  # 직전 영업일 = 가장 최근의 distinct date
  LATEST=\$(curl -fsS \"\${SUPABASE_URL}/rest/v1/stock_daily_ohlcv?select=date&order=date.desc&limit=1\" \
    -H \"apikey: \$SUPABASE_SERVICE_ROLE_KEY\" \
    -H \"Authorization: Bearer \$SUPABASE_SERVICE_ROLE_KEY\" 2>/dev/null \
    | grep -oE '\"date\":\"[0-9-]+\"' | head -1 | grep -oE '[0-9-]+')
  [ -n \"\$LATEST\" ] || exit 1
  RANGE_HEADER=\$(curl -fsS -I \"\${SUPABASE_URL}/rest/v1/stock_daily_ohlcv?date=eq.\${LATEST}&select=code\" \
    -H \"apikey: \$SUPABASE_SERVICE_ROLE_KEY\" \
    -H \"Authorization: Bearer \$SUPABASE_SERVICE_ROLE_KEY\" \
    -H \"Prefer: count=exact\" -H \"Range: 0-0\" 2>/dev/null | grep -i 'content-range')
  TOTAL=\$(echo \"\$RANGE_HEADER\" | grep -oE '[0-9]+\$')
  echo \"date=\$LATEST count=\$TOTAL\"
  [ -n \"\$TOTAL\" ] && [ \"\$TOTAL\" -ge 2500 ]
"

# INV-5: 005930 (삼성전자) 가 stock_daily_ohlcv 에 존재 + 행 >= 100
check "INV-5 005930 (삼성전자) row >= 100" bash -c "
  RANGE_HEADER=\$(curl -fsS -I \"\${SUPABASE_URL}/rest/v1/stock_daily_ohlcv?code=eq.005930&select=date\" \
    -H \"apikey: \$SUPABASE_SERVICE_ROLE_KEY\" \
    -H \"Authorization: Bearer \$SUPABASE_SERVICE_ROLE_KEY\" \
    -H \"Prefer: count=exact\" -H \"Range: 0-0\" 2>/dev/null | grep -i 'content-range')
  TOTAL=\$(echo \"\$RANGE_HEADER\" | grep -oE '[0-9]+\$')
  echo \"005930 row count: \$TOTAL\"
  [ -n \"\$TOTAL\" ] && [ \"\$TOTAL\" -ge 100 ]
"

# INV-6: Scheduler 2종 ENABLED
check "INV-6 schedulers ENABLED" bash -c "
  S1=\$(gcloud scheduler jobs describe $EOD_SCHED --location=$REGION --format='value(state)' 2>/dev/null)
  S2=\$(gcloud scheduler jobs describe $RECOVER_SCHED --location=$REGION --format='value(state)' 2>/dev/null)
  [ \"\$S1\" = ENABLED ] && [ \"\$S2\" = ENABLED ]
"

echo ""
echo "═══════════════════════════════════════"
echo "PASS: $PASS  FAIL: $FAIL"
if [[ $FAIL -gt 0 ]]; then
  echo "Failed: ${FAILED_INVS[*]}"
  exit 1
fi
echo "✅ All smoke invariants passed"
