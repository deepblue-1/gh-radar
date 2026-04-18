#!/usr/bin/env bash
set -uo pipefail
# 주의: -e 는 끄고 각 invariant 를 개별 fail 추적 (smoke-news-sync.sh 패턴)

# ═══════════════════════════════════════════════════════════════
# Phase 08 Plan 06 — discussion-sync 배포 invariants 검증 (8 INV)
#
# INV-1: Cloud Run Job 존재
# INV-2: Cloud Scheduler 존재 + 단일 1h 스케줄 (CONTEXT D1)
# INV-3: Scheduler OAuth invoker 사용 (Pitfall 2 — OIDC 금지)
# INV-4: discussion-sync SA 가 BRIGHTDATA Secret accessor
# INV-5: server SA 가 BRIGHTDATA Secret accessor
# INV-6: 수동 Job 실행 → exit 0 (Bright Data 호출 + Supabase upsert)
# INV-7: GET /api/stocks/005930/discussions → 200 (PIVOT)
# INV-8: POST /api/stocks/005930/discussions/refresh → not 503 PROXY_UNAVAILABLE
# ═══════════════════════════════════════════════════════════════

JOB="${1:-gh-radar-discussion-sync}"
REGION="${2:-asia-northeast3}"
PROJECT="${EXPECTED_PROJECT:-${GCP_PROJECT_ID:-gh-radar}}"
SERVER_URL="${GH_RADAR_SERVER_URL:-https://gh-radar-server-1023658565518.asia-northeast3.run.app}"
STOCK_CODE="${STOCK_CODE:-005930}"
BRIGHTDATA_SECRET="gh-radar-brightdata-api-key"
SCHEDULER_NAME="gh-radar-discussion-sync-hourly"
DISCUSSION_SYNC_SA="gh-radar-discussion-sync-sa@${PROJECT}.iam.gserviceaccount.com"

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

echo "Smoke testing Job=$JOB Region=$REGION Project=$PROJECT Server=$SERVER_URL"
echo ""

# ─────────────────────────────────────────────────────────────
# INV-1: Cloud Run Job 존재
# ─────────────────────────────────────────────────────────────
check "INV-1 Cloud Run Job exists" \
  gcloud run jobs describe "$JOB" --region="$REGION" --project="$PROJECT"

# ─────────────────────────────────────────────────────────────
# INV-2: Scheduler 존재 + 단일 '0 * * * *' 스케줄 (CONTEXT D1)
# ─────────────────────────────────────────────────────────────
check "INV-2 Scheduler hourly schedule" bash -c "
  SCHED=\$(gcloud scheduler jobs describe $SCHEDULER_NAME --location=\"$REGION\" --project=\"$PROJECT\" --format='value(schedule)' 2>/dev/null)
  [ \"\$SCHED\" = '0 * * * *' ]
"

# ─────────────────────────────────────────────────────────────
# INV-3: Scheduler OAuth invoker (Pitfall 2)
# ─────────────────────────────────────────────────────────────
check "INV-3 Scheduler OAuth invoker (no OIDC)" bash -c "
  AUTH=\$(gcloud scheduler jobs describe $SCHEDULER_NAME --location=\"$REGION\" --project=\"$PROJECT\" --format='value(httpTarget.oauthToken.serviceAccountEmail)' 2>/dev/null)
  [[ \"\$AUTH\" == *'gh-radar-scheduler-sa'* ]]
"

# ─────────────────────────────────────────────────────────────
# INV-4: discussion-sync SA 가 BRIGHTDATA Secret accessor
# ─────────────────────────────────────────────────────────────
check "INV-4 discussion-sync-sa BRIGHTDATA accessor" bash -c "
  gcloud secrets get-iam-policy $BRIGHTDATA_SECRET --project=\"$PROJECT\" --format=json 2>/dev/null \
    | grep -q 'gh-radar-discussion-sync-sa'
"

# ─────────────────────────────────────────────────────────────
# INV-5: server SA 가 BRIGHTDATA Secret accessor
#   server SA 는 default compute SA 또는 gh-radar-server-sa — 둘 중 하나만 매치되면 OK
# ─────────────────────────────────────────────────────────────
check "INV-5 server-sa BRIGHTDATA accessor" bash -c "
  POLICY=\$(gcloud secrets get-iam-policy $BRIGHTDATA_SECRET --project=\"$PROJECT\" --format=json 2>/dev/null)
  echo \"\$POLICY\" | grep -qE 'gh-radar-server-sa|compute@developer.gserviceaccount.com'
"

# ─────────────────────────────────────────────────────────────
# INV-6: 수동 Job 실행 → exit 0
#   주의: 실제 Bright Data credit 소모 (~100~300 req).
#   POC §6 예산 tier 가 일간 소모량 수용 가능한지 사전 확인.
# ─────────────────────────────────────────────────────────────
check "INV-6 Job execute --wait exit 0" \
  gcloud run jobs execute "$JOB" --region="$REGION" --project="$PROJECT" --wait

# ─────────────────────────────────────────────────────────────
# INV-7: GET /api/stocks/:code/discussions → 200 (PIVOT)
# ─────────────────────────────────────────────────────────────
check "INV-7 GET /discussions returns 200" bash -c "
  HTTP=\$(curl -s -o /dev/null -w '%{http_code}' '${SERVER_URL}/api/stocks/${STOCK_CODE}/discussions?days=7&limit=5' || echo '000')
  [ \"\$HTTP\" = '200' ]
"

# ─────────────────────────────────────────────────────────────
# INV-8: POST /refresh → 200 또는 429 (쿨다운). 503 PROXY_UNAVAILABLE 이면 FAIL.
# ─────────────────────────────────────────────────────────────
check "INV-8 POST /refresh not 503" bash -c "
  HTTP=\$(curl -s -o /dev/null -w '%{http_code}' -X POST '${SERVER_URL}/api/stocks/${STOCK_CODE}/discussions/refresh' || echo '000')
  [ \"\$HTTP\" = '200' ] || [ \"\$HTTP\" = '429' ]
"

echo ""
echo "═══════════════════════════════════════"
echo "PASS: $PASS  FAIL: $FAIL"
if [[ $FAIL -gt 0 ]]; then
  echo "Failed: ${FAILED_INVS[*]}"
  exit 1
fi
echo "✅ All smoke invariants passed"
