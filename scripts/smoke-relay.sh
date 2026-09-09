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
#   ③ **INV-9 는 `SMOKE_AUTH_TOKEN` 이 있어야 돈다.** 없으면 SKIP 이다(FAIL 아님).
#      server 의 주문 라우트는 16-16 에서 제거됐다 — 이 검사는 그 라우트가 아니라
#      **relay wss 주문 핸들러**의 도달성을 잰다. 프로브가 보내는 주문은 화이트리스트 밖
#      계좌번호 + 미해석 ISIN 조합이라 어떤 세션 상태에서도 게이트웨이로 나가지 않는다
#      (근거 3겹은 `ws_order_probe` 안의 프로브 주석에 적혀 있다).
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
# 주문 경로 프로브 (INV-9 / INV-10 — Phase 15 Plan 19 · INV-9 는 16-21 에서 재작성)
# ───────────────────────────────────────────────────────────────

# ★ `server_url()` 은 16-21 에서 삭제됐다. 유일한 소비자가 INV-9 의 옛 프로브였고,
#   주문이 server 를 거치지 않게 된 뒤로는 부를 곳이 없다 — 남겨 두면 다음 사람이
#   "주문 경로가 아직 server 를 지난다" 고 읽는다. `load_anon_key()` 는 INV-10b 가
#   여전히 쓰므로 그대로 둔다.

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

# INV-9 — **브라우저 → relay wss 주문 왕복 도달성**.
#
# ⚠️ 옛 검사(server 의 주문 라우트 → relay 내부 HTTP 주문 경로)는 **측정 대상 자체가
#    사라졌다.** 그 라우트는 16-16 에서 제거됐고(D-02), 주문은 이제 브라우저가 relay wss 로
#    직접 보낸다.
#    그래서 이 검사는 **relay 주문 핸들러**가 살아서 답하는지를 잰다.
#
# 판정표 (`order.result` 기준. 상태코드가 아니라 **응답의 존재와 내용**으로 가른다):
#
#   관측                                    판정        의미
#   ─────────────────────────────────────────────────────────────────────
#   order.result(status=rejected)           reachable   주문 핸들러가 살아서 답했다 ← 기대값
#   응답 없음(15초)                          unreachable 핸들러가 멎었거나 경로가 끊겼다
#   연결 실패 / 핸드셰이크 실패               unreachable relay 에 닿지 못했다
#   close 4401 (토큰 거부·인증 타임아웃)       inconclusive 토큰이 죽었다 — 주문 경로와 무관
#   state s=unauthorized (매핑 없음)         inconclusive allowlist 에서 끊겼다. 주문 경로 미도달
#
# 「확인하지 않았다」를 PASS 로 세지 않는다 — 그게 이 검사가 3갈래인 유일한 이유다.
ws_order_probe() {
  local dir js ws_module rc=0 token verdict=""
  token="${SMOKE_AUTH_TOKEN:-}"
  if [[ -z "$token" ]]; then printf 'inconclusive'; return 0; fi

  # `ws` 절대 경로 해석 — `ws_auth_probe()` 와 같은 함정, 같은 해법이다.
  ws_module="$(cd "$REPO_ROOT" && pnpm --filter @gh-radar/relay exec node -p "require.resolve('ws')" 2>/dev/null | tail -1)"
  if [[ -z "$ws_module" ]] || [[ ! -f "$ws_module" ]]; then
    echo "  (ws 모듈 해석 실패 — 'pnpm install' 이 선행돼야 합니다)" >&2
    printf 'inconclusive'; return 0
  fi

  dir="$(mktemp -d)"
  js="${dir}/ws-order-probe.cjs"
  cat > "$js" <<'WS_ORDER_PROBE_EOF'
/*
 * relay wss 주문 왕복 프로브 (INV-9).
 *
 * ★★ 실계좌에 주문이 나가지 않는 근거 — **3겹이다.** 다음 사람이 "실계좌에 주문이 나가나?"
 *    를 다시 묻지 않도록 여기에 적어 둔다. 셋 중 무엇이 먼저 걸리든 `dma_orders` insert
 *    **이전**, 게이트웨이 송신 **이전**에 끝난다 (relay/src/ws/order-handler.ts `handle`).
 *
 *    ① 게이트 ① — 활성 Ready 세션이 없으면(호가창을 열지 않은 프로브가 바로 이 경우다)
 *       세션 미준비로 거부된다. 프로브는 시세 구독을 하지 않으므로 대개 여기서 끝난다.
 *    ② 게이트 ② — 계좌번호 `0000000000` 은 **어떤 세션의 `allowedAccounts` 에도 없다.**
 *       원천이 게이트웨이가 에코한 계좌 목록이므로 인바운드 값으로 뚫을 수 없다 (T-16-01).
 *    ③ 게이트 ③-1 — ISIN `KR0000000000` 은 `SymbolMap` 이 풀지 못한다. 모르는 종목은
 *       지어내지 않고 거부한다 (D-28).
 *
 *    이 셋을 모두 통과하는 경우는 존재하지 않는다. 그래도 만에 하나 `rejected` 가 아닌
 *    `order.result` 가 오면 stderr 로 크게 경고한다 — 침묵하면 그게 사고다.
 *
 * 표준출력에는 판정 한 단어만 찍는다: reachable / unreachable / inconclusive.
 *
 * ★ 토큰은 **env 로만** 넘긴다 — argv 는 `ps` 로 같은 호스트의 다른 프로세스가 읽는다
 *   (GC-WR-11 / T-16-56). 토큰을 stdout·stderr 어디에도 싣지 않는다.
 */
const WebSocket = require(process.argv[3]);

const url = process.argv[2];
const token = process.env.SMOKE_TOKEN;
const RID = `smoke-${Date.now()}`;
/** `order.new` 송신 후 `order.result` 를 기다리는 상한. */
const ORDER_TIMEOUT_MS = 15_000;
/** 연결·인증까지 포함한 전체 상한. 어디서 멎어도 프로브가 매달리지 않게 한다. */
const TOTAL_TIMEOUT_MS = 30_000;

let settled = false;
let orderSent = false;
let orderTimer = null;

const ws = new WebSocket(url, { handshakeTimeout: 10_000 });
const totalTimer = setTimeout(() => finish("unreachable", "전체 시간 초과"), TOTAL_TIMEOUT_MS);

function finish(verdict, why) {
  if (settled) return;
  settled = true;
  clearTimeout(totalTimer);
  if (orderTimer !== null) clearTimeout(orderTimer);
  if (why) console.error(`  (INV-9: ${verdict} — ${why})`);
  try {
    ws.terminate();
  } catch {
    /* 이미 닫힌 소켓 */
  }
  console.log(verdict);
  process.exit(0);
}

function sendOrder() {
  if (orderSent) return;
  orderSent = true;
  ws.send(
    JSON.stringify({
      t: "order.new",
      rid: RID,
      // 위 ★★ 3겹 근거 참조. 이 조합은 어떤 세션 상태에서도 게이트웨이로 나갈 수 없다.
      accountNo: "0000000000",
      isin: "KR0000000000",
      exchange: "KRX",
      side: "B",
      qty: 1,
      price: 1,
    }),
  );
  orderTimer = setTimeout(() => finish("unreachable", "order.result 미수신"), ORDER_TIMEOUT_MS);
}

ws.on("open", () => {
  ws.send(JSON.stringify({ t: "auth", token }));
});

ws.on("message", (raw) => {
  let msg;
  try {
    msg = JSON.parse(String(raw));
  } catch {
    return; // 프로브가 모르는 프레임은 무시한다 — 판정 근거가 아니다.
  }

  if (msg.t === "state") {
    if (msg.s === "unauthorized") {
      finish("inconclusive", "dma_credentials 매핑 없음 — 주문 경로 미도달");
      return;
    }
    sendOrder();
    return;
  }

  if (msg.t === "order.result" && msg.rid === RID) {
    if (msg.status === "rejected") {
      finish("reachable", `거부 응답 수신: ${msg.message ?? ""}`);
      return;
    }
    // 여기 오면 안 된다. 3겹 게이트를 모두 통과했다는 뜻이므로 크게 남긴다.
    console.error(`  ⚠️ 예상 밖 order.result status=${msg.status} — 게이트 회귀 여부를 즉시 확인할 것`);
    finish("reachable", "rejected 가 아닌 응답");
  }
});

ws.on("close", (code) => {
  if (code === 4401) {
    finish("inconclusive", `close ${code} — 토큰 거부/인증 타임아웃`);
    return;
  }
  finish("unreachable", `응답 전 연결 종료 (close ${code})`);
});

ws.on("error", (err) => {
  finish("unreachable", String(err && err.message ? err.message : err));
});
WS_ORDER_PROBE_EOF

  # 토큰은 argv 가 아니라 env 로 넘긴다 (T-16-56). argv 는 `ps` 에 그대로 보인다.
  verdict="$(SMOKE_TOKEN="$token" node "$js" "wss://${HOST}/ws" "$ws_module")" || rc=$?
  rm -rf "$dir"
  # 프로브가 비정상 종료하면 판정을 지어내지 않는다. **덧붙이지 않고 덮어쓴다** —
  # 이어 붙이면 `reachableinconclusive` 같은 문자열이 되어 호출부 `case` 의 어느 갈래에도
  # 매치하지 않고 `*` 로 떨어진다. 즉 FAIL 이 조용히 SKIP 으로 강등된다 (T-16-57).
  if [[ "$rc" -ne 0 ]]; then verdict="inconclusive"; fi
  # 출력은 여기 한 곳뿐이다. 출력 지점이 둘이면 언젠가 다시 이어 붙는다.
  printf '%s' "$verdict"
  return 0
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
# INV-9 / INV-10 — 주문 경로 (Phase 15 Plan 19, RELAY-02 · INV-9 는 16-21 재작성)
# ───────────────────────────────────────────────────────────────

# INV-9: 브라우저 → relay wss 주문 왕복 도달성.
#   판정은 3갈래다. "확인 안 함"(SKIP)을 PASS 로 세면 주문 경로가 죽어도 스모크가
#   초록불로 남고, 반대로 FAIL 로 세면 토큰 없는 일상 실행이 상시 빨간불이 된다.
#   server URL 은 더 이상 보지 않는다 — 주문이 server 를 거치지 않기 때문이다 (16-16).
if [[ -z "${SMOKE_AUTH_TOKEN:-}" ]]; then
  skip "INV-9 브라우저 → relay wss 주문 왕복 도달성" "SMOKE_AUTH_TOKEN 미설정 — 로그인 토큰 필요"
else
  ORDER_PATH_VERDICT="$(ws_order_probe)"
  case "$ORDER_PATH_VERDICT" in
    reachable)
      check "INV-9 브라우저 → relay wss 주문 왕복 도달성" true
      ;;
    unreachable)
      check "INV-9 브라우저 → relay wss 주문 왕복 도달성 (order.result 미수신)" false
      ;;
    *)
      # 매핑(`dma_credentials` 행 0건)이나 토큰에서 끊기면 주문 핸들러까지 가지 않는다.
      # 도달성에 대해 **아무것도 알 수 없다** — 초록불로 위장하지 않는다.
      #
      # 관측 문자열 원문을 남긴다. 예상 밖 값이 이 갈래로 떨어지면 그것이 프로브의
      # 버그인지 진짜 inconclusive 인지 사후에 가릴 수 있어야 한다 (T-16-57).
      # ★ 판정 문자열만 싣는다 — 토큰은 프로브가 출력하지 않으므로 여기 실릴 수 없다.
      skip "INV-9 브라우저 → relay wss 주문 왕복 도달성" \
        "주문 핸들러 이전에서 종료(매핑/토큰) — 도달성 판정 불가 (관측: '${ORDER_PATH_VERDICT}')"
      ;;
  esac
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
