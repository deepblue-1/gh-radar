#!/usr/bin/env bash
set -uo pipefail
# -e 끄고 개별 invariant 추적

# ═══════════════════════════════════════════════════════════════
# smoke-relay.sh
# Phase 15 (RELAY-02 / RELAY-03) — relay 배포 후 인프라 불변식 INV-1~10 검증
#
# Usage:
#   bash scripts/smoke-relay.sh                  # INV-1~10 전체
#   bash scripts/smoke-relay.sh --check-tls      # 인증서만 (익일 재확인용)
#   bash scripts/smoke-relay.sh --check-exposure # INV-7 만 (내부 포트 공인 차단)
#   bash scripts/smoke-relay.sh --check-isin     # stocks.isin 백필 커버리지 (ISIN-1~3)
#
# 특이사항 2가지:
#   ① **INV-7 은 "실패해야 PASS"** 다. `nc` 가 성공하면 내부 포트가 공인망에 뚫린 것이므로
#      FAIL 이다. 부정을 `bash -c '! nc -z ...'` 로 명시한다 (T-15-12).
#   ② **INV-4 는 SKIP 될 수 있다.** openconnect 는 자동 기동을 등록하지 않은 수동 유닛이라
#      장중 외에는 내려가 있는 것이 정상이다. 미기동을 FAIL 로 세면 스모크가 상시 빨간불이 된다.
# ═══════════════════════════════════════════════════════════════

VM=radar-gw
ZONE=asia-northeast3-a
REGION=asia-northeast3
VPC=gh-radar-vpc
EXT_IP_NAME=gh-radar-relay-ip
HOST=dma.jx1.io
CONTAINER=gh-radar-relay
UPTIME_CHECK=gh-radar-relay-healthz
ALERT_POLICY=gh-radar-relay-down
ORDER_API_PORT=8091
DMA_PORT=9100
VPN_UNIT=openconnect@kb

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

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

# SKIP 은 FAIL 과 별개로 센다 — "확인하지 않았다" 와 "틀렸다" 는 다른 사실이다.
skip() {
  local name="$1" reason="$2"
  echo "  $name ... SKIP ($reason)"
  SKIP=$((SKIP + 1))
  SKIPPED_INVS+=("$name")
}

summary() {
  echo ""
  echo "═══════════════════════════════════════"
  echo "PASS: $PASS  FAIL: $FAIL  SKIP: $SKIP"
  if [[ ${SKIP} -gt 0 ]]; then
    echo "Skipped: ${SKIPPED_INVS[*]}"
  fi
  if [[ $FAIL -gt 0 ]]; then
    echo "Failed: ${FAILED_INVS[*]}"
    exit 1
  fi
  echo "✅ All smoke invariants passed"
  exit 0
}

# ───────────────────────────────────────────────────────────────
# 공용 프로브
# ───────────────────────────────────────────────────────────────

# 공인 IP 는 **예약 주소**에서 읽는다. VM 이 교체돼도 예약 주소가 정본이기 때문.
public_ip() {
  gcloud compute addresses describe "$EXT_IP_NAME" --region="$REGION" \
    --format='value(address)' 2>/dev/null
}

# 인증서 검사: issuer 가 Let's Encrypt 이고 notAfter 가 미래여야 한다.
# `-checkend 0` 은 "지금 기준 만료되지 않았으면 0" 이다.
tls_probe() {
  local pem
  pem="$(mktemp)"
  # shellcheck disable=SC2064
  trap "rm -f '$pem'" RETURN
  echo | openssl s_client -connect "${HOST}:443" -servername "$HOST" 2>/dev/null \
    | openssl x509 -outform pem > "$pem" 2>/dev/null || return 1
  [[ -s "$pem" ]] || return 1
  openssl x509 -in "$pem" -noout -issuer 2>/dev/null | grep -qi "Let's Encrypt" || return 1
  openssl x509 -in "$pem" -noout -checkend 0 >/dev/null 2>&1 || return 1
  openssl x509 -in "$pem" -noout -enddate
}

# 공개 헬스: 200 이고 본문에 식별자(accountNo·userId)가 없어야 한다 (T-15-22).
health_probe() {
  local body
  body="$(curl -sf --max-time 10 "https://${HOST}/healthz")" || return 1
  echo "$body" | grep -qE '"(accountNo|userId|account_no|user_id)"' && return 1
  echo "$body" | grep -q '"status"' || return 1
  echo "$body"
}

# 포트가 공인망에서 **닫혀 있는가**. 닫혀 있으면 0(PASS), 열려 있으면 1(FAIL).
#
# `nc -z -w3` 을 그냥 부르면 안 되는 이유: 방화벽이 SYN 을 DROP(거부 응답 없음)하면
# macOS 의 nc 는 `-w` 를 커넥트 단계에 적용하지 않고 OS 기본 TCP 타임아웃(실측 75초)까지
# 매달린다. 포트 2개면 스모크가 2분 반을 서 있는다. 바깥에서 8초로 자른다 —
# **8초 동안 SYN-ACK 도 RST 도 오지 않았다는 것 자체가 "닫힘" 의 증거**다.
port_closed() {
  local ip="$1" port="$2" out rc waited=0
  out="$(mktemp)"
  {
    bash -c '! nc -z -w3 "$1" "$2"' _ "$ip" "$port" >/dev/null 2>&1
    printf '%s' "$?" > "$out"
  } &
  local job_pid=$!
  while [[ ! -s "$out" ]] && [[ "$waited" -lt 8 ]]; do
    sleep 1
    waited=$((waited + 1))
  done
  if [[ -s "$out" ]]; then
    rc="$(cat "$out")"
  else
    rc=0
    pkill -P "$job_pid" >/dev/null 2>&1 || true
    kill -TERM "$job_pid" >/dev/null 2>&1 || true
  fi
  wait "$job_pid" >/dev/null 2>&1 || true
  rm -f "$out"
  return "$rc"
}

# wss 인증 왕복. relay 워크스페이스의 `ws` 를 그대로 쓴다.
#   ① 잘못된 토큰 → close 4401
#   ② 5초 무전송  → close 4401 (authTimer)
ws_auth_probe() {
  local dir js ws_module rc=0

  # `ws` 의 절대 경로를 먼저 구한다. CommonJS 의 `require("ws")` 는 **cwd 가 아니라
  # 스크립트 파일이 있는 디렉터리**부터 node_modules 를 거슬러 올라간다 — 프로브를
  # /tmp 에 두고 `pnpm --filter ... exec node <파일>` 로 돌리면 pnpm 이 cwd 를
  # relay/ 로 바꿔도 MODULE_NOT_FOUND 로 죽는다. 경로를 인자로 넘겨 그 함정을 없앤다.
  ws_module="$(cd "$REPO_ROOT" && pnpm --filter @gh-radar/relay exec node -p "require.resolve('ws')" 2>/dev/null | tail -1)"
  if [[ -z "$ws_module" ]] || [[ ! -f "$ws_module" ]]; then
    echo "ws 모듈 해석 실패 — 'pnpm install' 이 선행돼야 합니다." >&2
    return 1
  fi

  dir="$(mktemp -d)"
  js="${dir}/ws-auth-probe.cjs"
  cat > "$js" <<'WS_PROBE_EOF'
const WebSocket = require(process.argv[3]);

const url = process.argv[2];
const EXPECTED_CLOSE = 4401;

/** 소켓을 하나 열고 close 코드를 돌려준다. sendBad=true 면 쓰레기 토큰을 먼저 보낸다. */
function closeCode(sendBad) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, { handshakeTimeout: 10_000 });
    // authTimer(5초) 보다 넉넉해야 ② 경로가 타임아웃으로 오판되지 않는다.
    const deadline = setTimeout(() => {
      ws.terminate();
      reject(new Error("probe timeout"));
    }, 20_000);
    ws.on("open", () => {
      if (sendBad) ws.send(JSON.stringify({ t: "auth", token: "smoke-invalid-token" }));
    });
    ws.on("close", (code) => {
      clearTimeout(deadline);
      resolve(code);
    });
    ws.on("error", (err) => {
      clearTimeout(deadline);
      reject(err);
    });
  });
}

(async () => {
  const badToken = await closeCode(true);
  if (badToken !== EXPECTED_CLOSE) throw new Error(`bad token close=${badToken}`);
  const silence = await closeCode(false);
  if (silence !== EXPECTED_CLOSE) throw new Error(`silence close=${silence}`);
  console.log(`ok: bad-token=${badToken} silence=${silence}`);
})().catch((err) => {
  console.error(String(err && err.message ? err.message : err));
  process.exit(1);
});
WS_PROBE_EOF

  node "$js" "wss://${HOST}/ws" "$ws_module" || rc=$?
  rm -rf "$dir"
  return "$rc"
}

# VPN 유닛 상태(IAP SSH 1회). 결과는 active / inactive / failed / unknown.
vpn_state() {
  gcloud compute ssh "$VM" --tunnel-through-iap --zone="$ZONE" \
    --command="systemctl is-active ${VPN_UNIT} 2>/dev/null || true" 2>/dev/null \
    | tr -d '\r' | tail -1
}

# ───────────────────────────────────────────────────────────────
# Supabase 프로브 (--check-isin 전용)
#
# 조회는 **Supabase REST** 로 한다 — `smoke-master-sync.sh` INV-4 가 쓰는 방식이고,
# psql 접속정보(SUPABASE_DB_URL)는 이 저장소 어디에도 없기 때문이다.
# ───────────────────────────────────────────────────────────────

# .env 파일에서 KEY=value 한 줄의 값만 뽑는다 (CR·감싸는 큰따옴표 제거).
env_from_file() {
  local key="$1" file="$2" v
  [[ -f "$file" ]] || return 1
  v="$(grep -E "^${key}=" "$file" | head -1 | cut -d= -f2- | tr -d '\r')"
  v="${v%\"}"; v="${v#\"}"
  [[ -n "$v" ]] || return 1
  printf '%s' "$v"
}

# 자격증명 해석 순서: 환경변수 → workers/master-sync/.env (마스터 동기화의 정본).
# 이미 저장소에 있는 값을 쓴다 — 실행자에게 다시 묻지 않는다.
load_supabase_env() {
  local envf="${REPO_ROOT}/workers/master-sync/.env"
  if [[ -z "${SUPABASE_URL:-}" ]]; then
    SUPABASE_URL="$(env_from_file SUPABASE_URL "$envf" || true)"
  fi
  if [[ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
    SUPABASE_SERVICE_ROLE_KEY="$(env_from_file SUPABASE_SERVICE_ROLE_KEY "$envf" || true)"
  fi
  if [[ -z "${SUPABASE_URL:-}" ]] || [[ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
    echo "ERROR: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 를 찾지 못했습니다." >&2
    echo "  해결 ①: export SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=..." >&2
    echo "  해결 ②: ${envf} 에 두 값을 둡니다 (master-sync 워커가 쓰는 파일)." >&2
    return 1
  fi
}

# PostgREST GET. 추가 인자는 그대로 curl 로 넘긴다 — 필터는 --data-urlencode 로 붙인다.
supa_get() {
  local path="$1"; shift
  curl -fsS -G "${SUPABASE_URL}/rest/v1/${path}" \
    -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
    "$@"
}

# exact count 만 뽑는다. Content-Range 는 행이 있으면 "0-0/2749", 없으면 "*/0" 이라
# 슬래시 뒤만 취하면 두 형태 모두 총 개수가 된다. 본문은 버린다(Range: 0-0).
supa_count() {
  local path="$1"; shift
  local hdr
  hdr="$(curl -fsS -G -o /dev/null -D - "${SUPABASE_URL}/rest/v1/${path}" \
    -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Prefer: count=exact" -H "Range: 0-0" "$@" 2>/dev/null \
    | grep -i '^content-range:' | tr -d '\r')" || return 1
  [[ -n "$hdr" ]] || return 1
  printf '%s' "${hdr##*/}"
}

# 게이트웨이 대상 = **활성 주권**. ETF/ETN/ELW 는 제외한다 —
# KRX 가 ETP 매매정보에 표준코드를 주지 않아 isin 이 구조적으로 NULL 이고(Pitfall 13),
# 애초에 DMA 구독·주문 대상도 아니다. 여기에 ETP 를 넣으면 게이트가 영구히 빨간불이 된다.
ACTIVE_STOCK_FILTERS=(
  --data-urlencode "security_group=eq.주권"
  --data-urlencode "is_delisted=eq.false"
)

# ISIN-1: 컬럼이 실재하고 REST 로 **선택된다**. 없으면 PostgREST 가 400 → curl -f 가 실패.
#
# CHECK 제약(stocks_isin_len) 의 존재 자체는 여기서 프로브하지 않는다:
#   확인하려면 제약을 위반하는 쓰기를 production 에 날려야 하는데, 제약이 없다면
#   그 쓰기가 곧 우리가 막으려던 오염이 된다. 15-09 가 일회용 컨테이너에서 6자 코드
#   거부를 이미 실증했고, 데이터 수준의 상시 감시는 아래 ISIN-3 이 맡는다.
isin_column_present() {
  local body
  body="$(supa_get "stocks?select=code,isin&limit=1")" || return 1
  echo "$body" | grep -q '"isin"'
}

# ───────────────────────────────────────────────────────────────
# 주문 경로 프로브 (INV-9 / INV-10 — Phase 15 Plan 19)
# ───────────────────────────────────────────────────────────────

# Cloud Run 서비스 URL. 명시 env 가 우선, 없으면 배포된 서비스에서 읽는다.
server_url() {
  if [[ -n "${SERVER_URL:-}" ]]; then printf '%s' "$SERVER_URL"; return 0; fi
  gcloud run services describe gh-radar-server --region="$REGION" \
    --format='value(status.url)' 2>/dev/null
}

# anon key 해석: 환경변수 → webapp/.env.local (E2E/dev 용으로 이미 있는 값).
# 서비스롤과 달리 anon 은 **공개 키**다 — 없으면 검사를 건너뛸 뿐 실패로 세지 않는다.
load_anon_key() {
  if [[ -n "${SUPABASE_ANON_KEY:-}" ]]; then return 0; fi
  if [[ -n "${NEXT_PUBLIC_SUPABASE_ANON_KEY:-}" ]]; then
    SUPABASE_ANON_KEY="$NEXT_PUBLIC_SUPABASE_ANON_KEY"; return 0
  fi
  SUPABASE_ANON_KEY="$(env_from_file NEXT_PUBLIC_SUPABASE_ANON_KEY "${REPO_ROOT}/webapp/.env.local" || true)"
  [[ -n "${SUPABASE_ANON_KEY:-}" ]]
}

# INV-9 — **Cloud Run → Direct VPC Egress → VM 8091 도달성**.
#
# VM 내부 포트는 정의상 바깥에서 두드릴 수 없으므로(INV-7 이 그것을 지킨다), 도달성은
# **server 를 통해 간접으로** 잰다. 인증 토큰으로 주문을 한 건 던지고 **503 이 아닌지**만 본다:
#
#   503 RELAY_UNAVAILABLE  = relay env 미주입 이거나 방화벽/경로 문제  → FAIL
#   409 SESSION_NOT_READY  = 도달했고 relay 가 "세션 없음" 이라 답했다 → PASS
#   403 / 400 / 200        = 역시 도달했다는 뜻                        → PASS
#
# 세션(호가창)을 열지 않은 상태의 기대값은 409 다. 주문은 **나가지 않는다** — relay 가
# 세션 부재로 조립 전에 끊기 때문이다. 그래서 이 검사는 실계좌에 안전하다.
order_path_reachable() {
  local url token code
  url="$(server_url)"; token="${SMOKE_AUTH_TOKEN:-}"
  [[ -n "$url" ]] || return 1
  [[ -n "$token" ]] || return 1
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 -X POST \
    -H "Authorization: Bearer ${token}" \
    -H 'content-type: application/json' \
    -d '{"code":"005930","accountNo":"0","exchange":"KRX","side":"B","orderType":"N","qty":1,"price":1}' \
    "${url}/api/orders")"
  echo "  (POST /api/orders → HTTP ${code})"
  # 401 은 토큰이 죽은 것이지 relay 도달성의 답이 아니다 — 판정 불가로 실패 처리한다.
  case "$code" in
    503|502|401|000) return 1 ;;
    *) return 0 ;;
  esac
}

# INV-10 — `dma_orders` 접근 경계 (T-15-01).
#   ① service_role 은 읽힌다 (테이블이 실재하고 감사 기록이 가능하다)
#   ② anon 은 **거부돼야 한다**. 마이그레이션이 `REVOKE ... FROM anon, authenticated` 를
#      명시했으므로 PostgREST 가 권한 오류를 낸다 — RLS 정책 0개인 테이블이 빈 배열 200 을
#      돌려주는 흔한 함정과 구별되는 지점이다. 200 이 오면 회귀다.
dma_orders_service_role_ok() {
  supa_count "dma_orders?select=id" >/dev/null
}

dma_orders_anon_denied() {
  local code
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 \
    "${SUPABASE_URL}/rest/v1/dma_orders?select=id&limit=1" \
    -H "apikey: ${SUPABASE_ANON_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_ANON_KEY}")"
  echo "  (anon → HTTP ${code})"
  [[ "$code" != "200" ]]
}

# ───────────────────────────────────────────────────────────────
# 서브커맨드
# ───────────────────────────────────────────────────────────────
case "${1:-}" in
  --check-tls)
    echo "Checking TLS certificate — https://${HOST}"
    check "TLS issuer=Let's Encrypt + notAfter 미래" tls_probe
    check "공개 /healthz 200 + 식별자 미포함" health_probe
    echo ""
    echo "인증서 상세:"
    tls_probe || true
    summary
    ;;

  --check-exposure)
    echo "Checking internal port exposure — 실패해야 PASS"
    PUBLIC_IP="$(public_ip)"
    if [[ -z "$PUBLIC_IP" ]]; then
      echo "ERROR: 공인 고정 IP(${EXT_IP_NAME}) 조회 실패" >&2
      exit 1
    fi
    echo "  target: $PUBLIC_IP"
    check "INV-7 ${ORDER_API_PORT} 공인 차단" port_closed "$PUBLIC_IP" "$ORDER_API_PORT"
    check "INV-7 ${DMA_PORT} 공인 차단" port_closed "$PUBLIC_IP" "$DMA_PORT"
    summary
    ;;

  --check-isin)
    echo "Checking stocks.isin 백필 커버리지 — ISIN-1~3 (D-28 / RESEARCH A9)"
    load_supabase_env || exit 1
    echo ""

    check "ISIN-1 stocks.isin 컬럼 존재 + REST 노출" isin_column_present

    # ISIN-2: 활성 주권의 isin NULL 카운트가 0. NULL 인 종목은 구독도 주문도 불가하므로
    #         이 커버리지가 곧 DMA 기능 범위다 (T-15-35).
    ACTIVE_TOTAL="$(supa_count "stocks?select=code" "${ACTIVE_STOCK_FILTERS[@]}")"
    ACTIVE_NULL="$(supa_count "stocks?select=code" "${ACTIVE_STOCK_FILTERS[@]}" \
      --data-urlencode "isin=is.null")"
    echo "  활성 주식(주권·미상장폐지) ${ACTIVE_TOTAL:-?} 종목 / isin NULL ${ACTIVE_NULL:-?} 종목"
    check "ISIN-2 활성 주식 isin NULL 0건" test "${ACTIVE_NULL:-x}" -eq 0
    if [[ "${ACTIVE_NULL:-0}" != "0" ]]; then
      # CSV 로 받는다 — 행마다 줄바꿈이 붙어 sed/awk 로 JSON 을 쪼갤 필요가 없다.
      echo "  NULL 잔존 상위 5종목 (code,name):"
      supa_get "stocks?select=code,name&order=code" "${ACTIVE_STOCK_FILTERS[@]}" \
        --data-urlencode "isin=is.null" --data-urlencode "limit=5" \
        -H "Accept: text/csv" | sed 's/^/    /'
      echo "" # PostgREST CSV 는 마지막 줄에 개행이 없다 — 다음 검사 줄이 붙지 않게 끊는다
    fi

    # ISIN-3a: 길이 12 무결성. DB CHECK 가 있으므로 이론상 0 이지만, 제약이 사라지는
    #          회귀를 데이터 쪽에서 감지한다. `_` 12개 LIKE 는 "정확히 12자" 를 뜻하고
    #          NULL 은 NOT LIKE 결과가 NULL 이라 자동으로 빠진다.
    LEN_BAD="$(supa_count "stocks?select=code" \
      --data-urlencode "isin=not.like.____________")"
    check "ISIN-3a isin 길이 12 무결성 (이탈 ${LEN_BAD:-?} 행)" test "${LEN_BAD:-x}" -eq 0

    # ISIN-3b: ISO 6166 형태. map.ts 의 정규식 가드와 같은 형태를 DB 쪽에서 재확인한다.
    #          6자 단축코드 혼입은 3a 에서, 12자지만 형태가 깨진 값은 여기서 걸린다.
    FORM_BAD="$(supa_count "stocks?select=code" \
      --data-urlencode 'isin=not.match.^[A-Z]{2}[A-Z0-9]{10}$')"
    check "ISIN-3b isin 형태 무결성 (이탈 ${FORM_BAD:-?} 행)" test "${FORM_BAD:-x}" -eq 0

    summary
    ;;

  "") ;;

  *)
    echo "usage: bash scripts/smoke-relay.sh [--check-tls|--check-exposure|--check-isin]" >&2
    exit 1
    ;;
esac

# ───────────────────────────────────────────────────────────────
# INV-1~10
# ───────────────────────────────────────────────────────────────
echo "Smoke testing relay — INV-1~10"
echo ""

# INV-1: VM RUNNING
check "INV-1 VM ${VM} RUNNING" bash -c '
  STATUS=$(gcloud compute instances describe "$1" --zone="$2" --format="value(status)" 2>/dev/null)
  [ "$STATUS" = RUNNING ]
' _ "$VM" "$ZONE"

# INV-2: 방화벽이 정확히 3규칙 + 이름 일치 (포트 80 규칙이 생기면 여기서 깨진다)
check "INV-2 방화벽 3규칙 (${VPC})" bash -c '
  RULES=$(gcloud compute firewall-rules list --filter="network=$1" --format="value(name)" 2>/dev/null | sort | tr "\n" " ")
  [ "$RULES" = "relay-allow-https relay-allow-iap-ssh relay-allow-internal-order " ]
' _ "$VPC"

# INV-3: 예약 고정 IP 가 실제로 VM 에 결선돼 있는가
check "INV-3 고정 IP ${EXT_IP_NAME} → ${VM} 결선" bash -c '
  RESERVED=$(gcloud compute addresses describe "$1" --region="$2" --format="value(address)" 2>/dev/null)
  ATTACHED=$(gcloud compute instances describe "$3" --zone="$4" \
    --format="value(networkInterfaces[0].accessConfigs[0].natIP)" 2>/dev/null)
  [ -n "$RESERVED" ] && [ "$RESERVED" = "$ATTACHED" ]
' _ "$EXT_IP_NAME" "$REGION" "$VM" "$ZONE"

# INV-4: VPN 터널 + split-tunnel 유지.
#   openconnect 는 수동 유닛이라 내려가 있는 것이 기본 상태다 → 그때는 SKIP.
VPN_STATE="$(vpn_state)"
if [[ "$VPN_STATE" == "active" ]]; then
  check "INV-4 tun0 활성 + 기본 경로 ens4 유지" bash -c '
    OUT=$(gcloud compute ssh "$1" --tunnel-through-iap --zone="$2" --command="
      ip -br addr show tun0 2>/dev/null | tr -s \" \";
      echo \"---\";
      ip route show default 2>/dev/null
    " 2>/dev/null)
    echo "$OUT" | grep -qE "tun0[[:space:]]+U" || exit 1
    echo "$OUT" | sed -n "/^---$/,\$p" | grep -q "dev ens4" || exit 1
  ' _ "$VM" "$ZONE"
else
  skip "INV-4 VPN 터널 + split-tunnel" "${VPN_UNIT}=${VPN_STATE:-unknown} — 수동 유닛이라 장중 외 정상"
fi

# INV-5: 공개 헬스 200 + 유효 TLS
check "INV-5a 공개 /healthz 200 + 식별자 미포함" health_probe
check "INV-5b TLS issuer=Let's Encrypt + notAfter 미래" tls_probe

# INV-6: wss 인증 왕복 — 잘못된 토큰 4401 / 5초 무전송 4401
check "INV-6 wss 인증 왕복 (4401 × 2)" ws_auth_probe

# INV-7: 내부 포트가 공인망에서 닫힘 — **nc 가 실패해야 PASS**
PUBLIC_IP="$(public_ip)"
if [[ -z "$PUBLIC_IP" ]]; then
  echo "  INV-7 ... FAIL (공인 고정 IP 조회 실패)"
  FAIL=$((FAIL + 1))
  FAILED_INVS+=("INV-7 공인 IP 조회")
else
  check "INV-7a ${ORDER_API_PORT} 공인 차단 (nc 실패해야 PASS)" port_closed "$PUBLIC_IP" "$ORDER_API_PORT"
  check "INV-7b ${DMA_PORT} 공인 차단 (nc 실패해야 PASS)" port_closed "$PUBLIC_IP" "$DMA_PORT"
fi

# INV-8: 알림 정책 1건 + 채널 결선 + uptime check 존재
check "INV-8 알림 정책 ${ALERT_POLICY} + 채널 + uptime check" bash -c '
  POLICIES=$(gcloud alpha monitoring policies list --filter="displayName=$1" --format="value(name)" 2>/dev/null)
  COUNT=$(echo "$POLICIES" | grep -c . )
  [ "$COUNT" -eq 1 ] || exit 1
  CHANNELS=$(gcloud alpha monitoring policies describe "$(echo "$POLICIES" | head -1)" \
    --format="value(notificationChannels)" 2>/dev/null)
  [ -n "$CHANNELS" ] || exit 1
  UPTIME=$(gcloud monitoring uptime list-configs --filter="displayName=$2" --format="value(name)" 2>/dev/null | head -1)
  [ -n "$UPTIME" ]
' _ "$ALERT_POLICY" "$UPTIME_CHECK"

# ───────────────────────────────────────────────────────────────
# INV-9 / INV-10 — 주문 경로 (Phase 15 Plan 19, RELAY-02)
# ───────────────────────────────────────────────────────────────

# INV-9: Cloud Run → VM 내부 포트 도달성. 토큰이 없으면 판정할 수 없으므로 SKIP 이다 —
#        "확인 안 함" 을 PASS 로 세면 주문이 죽어도 스모크가 초록불로 남는다.
if [[ -z "${SMOKE_AUTH_TOKEN:-}" ]]; then
  skip "INV-9 Cloud Run → VM ${ORDER_API_PORT} 도달성" "SMOKE_AUTH_TOKEN 미설정 — 로그인 토큰 필요"
elif [[ -z "$(server_url)" ]]; then
  skip "INV-9 Cloud Run → VM ${ORDER_API_PORT} 도달성" "server URL 조회 실패"
else
  check "INV-9 Cloud Run → VM ${ORDER_API_PORT} 도달성 (503 아니면 PASS)" order_path_reachable
fi

# INV-10: dma_orders 접근 경계. service_role 로는 읽히고 anon 으로는 막혀야 한다.
if load_supabase_env >/dev/null 2>&1; then
  check "INV-10a dma_orders service_role 조회" dma_orders_service_role_ok
  if load_anon_key; then
    check "INV-10b dma_orders anon 차단 (200 이면 RLS 회귀)" dma_orders_anon_denied
  else
    skip "INV-10b dma_orders anon 차단" "anon key 미해석 — webapp/.env.local 부재"
  fi
else
  skip "INV-10 dma_orders 접근 경계" "SUPABASE_URL / SERVICE_ROLE_KEY 미해석"
fi

echo ""
echo "참고 — 컨테이너 상태 (검증 항목 아님):"
gcloud compute ssh "$VM" --tunnel-through-iap --zone="$ZONE" \
  --command="docker ps --filter name=${CONTAINER} --format '  {{.Names}} {{.Status}}'; free -m | awk '/^Mem:/{printf \"  mem total=%s used=%s available=%s\n\", \$2, \$3, \$7}'" 2>/dev/null \
  || echo "  (조회 실패 — IAP SSH 권한 확인)"

summary
