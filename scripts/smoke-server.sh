#!/usr/bin/env bash
set -uo pipefail
# 주의: -e는 끄고 각 invariant를 개별 fail 추적 (모두 실행 후 집계)

URL="${1:-${SMOKE_URL:-}}"
if [[ -z "$URL" ]]; then
  echo "Usage: smoke-server.sh <URL>" >&2
  exit 2
fi

SERVICE=gh-radar-server
REGION=asia-northeast3

PASS=0
FAIL=0
SKIP=0
declare -a FAILED_INVS
declare -a SKIPPED_INVS

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

# SKIP 은 FAIL 과 별개로 센다 — "확인하지 않았다" 와 "틀렸다" 는 다른 사실이다
# (smoke-relay.sh 와 같은 규약).
skip() {
  local name="$1" reason="$2"
  echo "  $name ... SKIP ($reason)"
  SKIP=$((SKIP + 1))
  SKIPPED_INVS+=("$name")
}

echo "Smoke testing $URL"
echo ""

# INV-1: /api/health → 200 + {status:'ok', timestamp:string, version:string}
check "INV-1 /api/health status=ok" bash -c "curl -fsS '$URL/api/health' | jq -e '.status==\"ok\" and (.timestamp|type==\"string\") and (.version|type==\"string\")'"

# INV-2: /api/scanner → array, 각 원소에 upperLimitProximity:number
check "INV-2 /api/scanner upperLimitProximity" bash -c "curl -fsS '$URL/api/scanner?limit=5' | jq -e 'type==\"array\" and length>0 and (.[0].upperLimitProximity|type==\"number\")'"

# INV-3: scanner 첫 종목 code 로 /api/stocks/:code 호출 → code 일치 (데이터 독립)
check "INV-3 /api/stocks/:code (scanner 연동)" bash -c "
  code=\$(curl -fsS '$URL/api/scanner?limit=1' | jq -r '.[0].code')
  [ -n \"\$code\" ] && [ \"\$code\" != 'null' ] && \
    curl -fsS \"$URL/api/stocks/\$code\" | jq -e \".code==\\\"\$code\\\"\"
"

# INV-4: /api/stocks/000000 → 404 + STOCK_NOT_FOUND
check "INV-4 /api/stocks/000000 → 404" bash -c "
  body=\$(curl -s -o /dev/null -w '%{http_code}' '$URL/api/stocks/000000')
  [ \"\$body\" = '404' ] && curl -s '$URL/api/stocks/000000' | jq -e '.error.code==\"STOCK_NOT_FOUND\"'
"

# INV-5: scanner 첫 종목 name 첫 글자로 search → length>=1 (데이터 독립)
check "INV-5 /api/stocks/search (scanner 연동)" bash -c "
  name=\$(curl -fsS '$URL/api/scanner?limit=1' | jq -r '.[0].name')
  q=\$(printf %s \"\$name\" | cut -c1-1)
  enc=\$(printf %s \"\$q\" | jq -sRr @uri)
  curl -fsS \"$URL/api/stocks/search?q=\$enc\" | jq -e 'type==\"array\" and length<=20 and length>=1'
"

# INV-6: CORS preflight 허용 origin → 200/204
check "INV-6 CORS preflight (허용)" bash -c "
  code=\$(curl -s -o /dev/null -w '%{http_code}' -X OPTIONS \\
    -H 'Origin: https://gh-radar-webapp.vercel.app' \\
    -H 'Access-Control-Request-Method: GET' \\
    '$URL/api/scanner')
  [ \"\$code\" = '200' ] || [ \"\$code\" = '204' ]
"

# INV-7: CORS preflight 비허용 origin → ACAO 헤더 부재
check "INV-7 CORS preflight (거부)" bash -c "
  ! curl -s -X OPTIONS -H 'Origin: https://evil.example.com' -H 'Access-Control-Request-Method: GET' -D - -o /dev/null '$URL/api/scanner' | grep -qi '^access-control-allow-origin:'
"

# INV-8: rate limit — /api/scanner 240 req 병렬(20 동시) → 429 최소 1건.
#   순차 curl 은 왕복 지연으로 분당 한도(200/min)에 도달 못해 환경 의존 flaky 였음
#   (요청당 ~0.4s → 분당 ~135req). 병렬로 윈도우 내 한도 초과를 보장.
check "INV-8 rate limit 240 req(병렬) → 429 발생" bash -c "
  codes=\$(seq 1 240 | xargs -P 20 -I{} curl -s -o /dev/null -w '%{http_code}\n' --max-time 8 '$URL/api/scanner')
  echo \"\$codes\" | grep -q '^429\$'
"

# INV-9: X-Request-Id 헤더 항상 존재
check "INV-9 X-Request-Id 헤더" bash -c "curl -fsS -D - '$URL/api/health' -o /dev/null | grep -qi '^x-request-id:'"

# ───────────────────────────────────────────────────────────────
# Phase 15 Plan 19 — DMA 주문 라우트 (RELAY-02, D-08)
#
# ⚠️ **여기서 기대하는 정답은 401 이다.** 200 이 아니다.
#    이 두 검사는 "주문이 된다" 가 아니라 "라우트가 결선됐고 그 앞에 `requireAuth()` 가
#    서 있다" 를 본다. 미인증 200 이면 누구나 주문을 낼 수 있다는 뜻이고, 404 면
#    라우터가 아예 안 붙은 것이다 — 둘 다 FAIL 이어야 한다 (T-15-03).
#    실주문 왕복은 스모크가 할 일이 아니다(실계좌 사고). 로컬 mock 검증이 맡는다.
# ───────────────────────────────────────────────────────────────

# INV-10: POST /api/orders 미인증 → 401 (라우트 존재 + 인증 관문)
check "INV-10 POST /api/orders 미인증 → 401" bash -c "
  code=\$(curl -s -o /dev/null -w '%{http_code}' -X POST \\
    -H 'content-type: application/json' \\
    -d '{\"code\":\"005930\",\"accountNo\":\"0\",\"exchange\":\"KRX\",\"side\":\"B\",\"orderType\":\"N\",\"qty\":1,\"price\":1}' \\
    '$URL/api/orders')
  [ \"\$code\" = '401' ]
"

# INV-11: GET /api/orders 미인증 → 401 (목록 복원 경로도 같은 관문 뒤에 있다, D-24)
check "INV-11 GET /api/orders 미인증 → 401" bash -c "
  code=\$(curl -s -o /dev/null -w '%{http_code}' '$URL/api/orders')
  [ \"\$code\" = '401' ]
"

# INV-12: Cloud Run 리비전에 relay 결선 env 가 실재하는가 (T-15-55).
#   `--set-env-vars` 전량 치환으로 RELAY_INTERNAL_URL 이 사라지면 서버는 정상 기동하고
#   **주문만** 503 이 된다 — 헬스체크로는 절대 안 잡히는 고장이다. 이름만 읽는다(값 X).
if ! command -v gcloud >/dev/null 2>&1; then
  skip "INV-12 relay env 결선" "gcloud 미설치 — 로컬 실행"
else
  ENV_NAMES=$(gcloud run services describe "$SERVICE" --region="$REGION" \
    --format='value(spec.template.spec.containers[0].env[].name)' 2>/dev/null | tr ';' '\n' | sed '/^$/d')
  if [[ -z "$ENV_NAMES" ]]; then
    skip "INV-12 relay env 결선" "서비스 조회 실패 — 배포 환경 밖"
  else
    check "INV-12a RELAY_INTERNAL_URL env 존재" bash -c "printf '%s\n' \"\$1\" | grep -qx RELAY_INTERNAL_URL" _ "$ENV_NAMES"
    check "INV-12b RELAY_ORDER_SECRET secret 바인딩" bash -c "printf '%s\n' \"\$1\" | grep -qx RELAY_ORDER_SECRET" _ "$ENV_NAMES"
    check "INV-12c 기존 env 잔존 (SUPABASE_URL·ANTHROPIC_API_KEY·DISCUSSION_CLASSIFY_ENABLED)" bash -c "
      printf '%s\n' \"\$1\" | grep -qx SUPABASE_URL &&
      printf '%s\n' \"\$1\" | grep -qx ANTHROPIC_API_KEY &&
      printf '%s\n' \"\$1\" | grep -qx DISCUSSION_CLASSIFY_ENABLED
    " _ "$ENV_NAMES"
  fi
fi

echo ""
echo "═══════════════════════════════════════"
echo "PASS: $PASS  FAIL: $FAIL  SKIP: $SKIP"
if [[ $SKIP -gt 0 ]]; then
  echo "Skipped: ${SKIPPED_INVS[*]}"
fi
if [[ $FAIL -gt 0 ]]; then
  echo "Failed: ${FAILED_INVS[*]}"
  exit 1
fi
echo "✅ All smoke invariants passed"
