#!/usr/bin/env bash
set -uo pipefail
# 주의: -e는 끄고 각 invariant를 개별 fail 추적 (smoke-master-sync.sh 패턴)

JOB="${1:-gh-radar-news-sync}"
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
# INV-1: Job 실행 --wait exit 0 (일회성 invocation)
# ─────────────────────────────────────────────────────────────
check "INV-1 jobs execute --wait exit 0" \
  gcloud run jobs execute "$JOB" --region="$REGION" --wait

# ─────────────────────────────────────────────────────────────
# INV-2: Job describe — exists
# ─────────────────────────────────────────────────────────────
check "INV-2 jobs describe" \
  gcloud run jobs describe "$JOB" --region="$REGION"

# ─────────────────────────────────────────────────────────────
# INV-3a: Scheduler intraday schedule === '*/15 9-15 * * 1-5'
# ─────────────────────────────────────────────────────────────
check "INV-3a scheduler intraday schedule" bash -c "
  SCHEDULE=\$(gcloud scheduler jobs describe gh-radar-news-sync-intraday --location=\"$REGION\" --format='value(schedule)' 2>/dev/null)
  [ \"\$SCHEDULE\" = '*/15 9-15 * * 1-5' ]
"

# ─────────────────────────────────────────────────────────────
# INV-3b: Scheduler offhours schedule === '0 */2 * * *'
# ─────────────────────────────────────────────────────────────
check "INV-3b scheduler offhours schedule" bash -c "
  SCHEDULE=\$(gcloud scheduler jobs describe gh-radar-news-sync-offhours --location=\"$REGION\" --format='value(schedule)' 2>/dev/null)
  [ \"\$SCHEDULE\" = '0 */2 * * *' ]
"

# ─────────────────────────────────────────────────────────────
# INV-3c: 두 scheduler 모두 ENABLED
# ─────────────────────────────────────────────────────────────
check "INV-3c both schedulers ENABLED" bash -c "
  S1=\$(gcloud scheduler jobs describe gh-radar-news-sync-intraday --location=\"$REGION\" --format='value(state)' 2>/dev/null)
  S2=\$(gcloud scheduler jobs describe gh-radar-news-sync-offhours --location=\"$REGION\" --format='value(state)' 2>/dev/null)
  [ \"\$S1\" = 'ENABLED' ] && [ \"\$S2\" = 'ENABLED' ]
"

# ─────────────────────────────────────────────────────────────
# INV-4: news-sync cycle complete 로그 1건 이상 (최근 5분)
# ─────────────────────────────────────────────────────────────
check "INV-4 logs: news-sync cycle complete" bash -c "
  gcloud logging read '
    resource.type=\"cloud_run_job\"
    AND resource.labels.job_name=\"$JOB\"
    AND jsonPayload.msg=\"news-sync cycle complete\"
  ' --freshness=5m --limit=5 --format='value(jsonPayload.msg)' \
    | grep -q 'news-sync cycle complete'
"

# ─────────────────────────────────────────────────────────────
# INV-5: news_articles row 존재 (최근 24h 내 upsert — targets 가 비어있으면 0 일 수도 있음)
# ─────────────────────────────────────────────────────────────
check "INV-5 Supabase news_articles row exists (>=0, sanity)" bash -c "
  : \${SUPABASE_URL:?SUPABASE_URL required}
  : \${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY required}
  RANGE_HEADER=\$(curl -fsS -I \"\${SUPABASE_URL}/rest/v1/news_articles?select=id\" \
    -H \"apikey: \$SUPABASE_SERVICE_ROLE_KEY\" \
    -H \"Authorization: Bearer \$SUPABASE_SERVICE_ROLE_KEY\" \
    -H \"Prefer: count=exact\" \
    -H \"Range: 0-0\" 2>/dev/null | grep -i 'content-range' | tr -d '\r')
  TOTAL=\$(echo \"\$RANGE_HEADER\" | grep -oE '[0-9]+\$')
  echo \"news_articles total: \$TOTAL\"
  [ -n \"\$TOTAL\" ] && [ \"\$TOTAL\" -ge 0 ]
"

# ─────────────────────────────────────────────────────────────
# INV-6: api_usage row 존재 — service='naver_search_news' + today KST, count > 0
#        (첫 cycle 이후에만 true. INV-1 이 선행되므로 KST 기준 오늘자 row 가 생겨야 함)
# ─────────────────────────────────────────────────────────────
check "INV-6 api_usage count > 0 (naver_search_news, KST today)" bash -c "
  : \${SUPABASE_URL:?SUPABASE_URL required}
  : \${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY required}
  KST_DATE=\$(TZ='Asia/Seoul' date +%Y-%m-%d)
  RESULT=\$(curl -fsS \"\${SUPABASE_URL}/rest/v1/api_usage?service=eq.naver_search_news&usage_date=eq.\${KST_DATE}&select=count\" \
    -H \"apikey: \$SUPABASE_SERVICE_ROLE_KEY\" \
    -H \"Authorization: Bearer \$SUPABASE_SERVICE_ROLE_KEY\" 2>/dev/null)
  echo \"api_usage today: \$RESULT\"
  COUNT=\$(echo \"\$RESULT\" | grep -oE '\"count\":[0-9]+' | grep -oE '[0-9]+' | head -1)
  [ -n \"\$COUNT\" ] && [ \"\$COUNT\" -gt 0 ]
"

echo ""
echo "═══════════════════════════════════════"
echo "PASS: $PASS  FAIL: $FAIL"
if [[ $FAIL -gt 0 ]]; then
  echo "Failed: ${FAILED_INVS[*]}"
  exit 1
fi
echo "✅ All smoke invariants passed"
