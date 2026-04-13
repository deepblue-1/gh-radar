#!/usr/bin/env bash
set -uo pipefail
# 주의: -e는 끄고 각 invariant를 개별 fail 추적 (모두 실행 후 집계)

URL="${1:-${SMOKE_URL:-}}"
if [[ -z "$URL" ]]; then
  echo "Usage: smoke-server.sh <URL>" >&2
  exit 2
fi

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

echo "Smoke testing $URL"
echo ""

# INV-1: /api/health → 200 + {status:'ok', timestamp:string, version:string}
check "INV-1 /api/health status=ok" bash -c "curl -fsS '$URL/api/health' | jq -e '.status==\"ok\" and (.timestamp|type==\"string\") and (.version|type==\"string\")'"

# INV-2: /api/scanner → array, 각 원소에 upperLimitProximity:number
check "INV-2 /api/scanner upperLimitProximity" bash -c "curl -fsS '$URL/api/scanner?limit=5' | jq -e 'type==\"array\" and length>0 and (.[0].upperLimitProximity|type==\"number\")'"

# INV-3: /api/stocks/005930 → code="005930"
check "INV-3 /api/stocks/005930" bash -c "curl -fsS '$URL/api/stocks/005930' | jq -e '.code==\"005930\"'"

# INV-4: /api/stocks/000000 → 404 + STOCK_NOT_FOUND
check "INV-4 /api/stocks/000000 → 404" bash -c "
  body=\$(curl -s -o /dev/null -w '%{http_code}' '$URL/api/stocks/000000')
  [ \"\$body\" = '404' ] && curl -s '$URL/api/stocks/000000' | jq -e '.error.code==\"STOCK_NOT_FOUND\"'
"

# INV-5: /api/stocks/search?q=삼성 → length<=20 and length>0
check "INV-5 /api/stocks/search?q=삼성" bash -c "curl -fsS '$URL/api/stocks/search?q=%EC%82%BC%EC%84%B1' | jq -e 'type==\"array\" and length<=20 and length>0'"

# INV-6: CORS preflight 허용 origin → 200/204
check "INV-6 CORS preflight (허용)" bash -c "
  code=\$(curl -s -o /dev/null -w '%{http_code}' -X OPTIONS \\
    -H 'Origin: https://gh-radar.vercel.app' \\
    -H 'Access-Control-Request-Method: GET' \\
    '$URL/api/scanner')
  [ \"\$code\" = '200' ] || [ \"\$code\" = '204' ]
"

# INV-7: CORS preflight 비허용 origin → ACAO 헤더 부재
check "INV-7 CORS preflight (거부)" bash -c "
  ! curl -s -X OPTIONS -H 'Origin: https://evil.example.com' -H 'Access-Control-Request-Method: GET' -D - -o /dev/null '$URL/api/scanner' | grep -qi '^access-control-allow-origin:'
"

# INV-8: rate limit — 201 req → 마지막은 429
check "INV-8 rate limit 201 req → 429" bash -c "
  last=\$(for i in \$(seq 1 201); do curl -s -o /dev/null -w '%{http_code}\n' '$URL/api/health'; done | tail -1)
  [ \"\$last\" = '429' ]
"

# INV-9: X-Request-Id 헤더 항상 존재
check "INV-9 X-Request-Id 헤더" bash -c "curl -fsS -D - '$URL/api/health' -o /dev/null | grep -qi '^x-request-id:'"

echo ""
echo "═══════════════════════════════════════"
echo "PASS: $PASS  FAIL: $FAIL"
if [[ $FAIL -gt 0 ]]; then
  echo "Failed: ${FAILED_INVS[*]}"
  exit 1
fi
echo "✅ All smoke invariants passed"
