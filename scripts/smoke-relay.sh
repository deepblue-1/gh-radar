#!/usr/bin/env bash
set -uo pipefail
# -e 끄고 개별 invariant 추적

# ═══════════════════════════════════════════════════════════════
# smoke-relay.sh
# Phase 15 (RELAY-03) — relay 배포 후 인프라 불변식 INV-1~8 검증
#
# Usage:
#   bash scripts/smoke-relay.sh                  # INV-1~8 전체
#   bash scripts/smoke-relay.sh --check-tls      # 인증서만 (익일 재확인용)
#   bash scripts/smoke-relay.sh --check-exposure # INV-7 만 (내부 포트 공인 차단)
#   bash scripts/smoke-relay.sh --check-isin     # stocks.isin 백필 검증 (15-10 이 채운다)
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
    # 15-10 (stocks.isin 백필) 이 이 분기를 채운다. 지금 실패로 세면 배포 검증이
    # 아직 존재하지 않는 데이터에 매달린다 — 안내만 하고 통과시킨다.
    echo "· --check-isin 미구현 — stocks.isin 백필(15-10) 완료 후 채웁니다."
    echo "  예정 검증: 주식(ETP 제외) 행의 isin null 카운트 == 0, isin 길이 12"
    exit 0
    ;;

  "") ;;

  *)
    echo "usage: bash scripts/smoke-relay.sh [--check-tls|--check-exposure|--check-isin]" >&2
    exit 1
    ;;
esac

# ───────────────────────────────────────────────────────────────
# INV-1~8
# ───────────────────────────────────────────────────────────────
echo "Smoke testing relay — INV-1~8"
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

echo ""
echo "참고 — 컨테이너 상태 (검증 항목 아님):"
gcloud compute ssh "$VM" --tunnel-through-iap --zone="$ZONE" \
  --command="docker ps --filter name=${CONTAINER} --format '  {{.Names}} {{.Status}}'; free -m | awk '/^Mem:/{printf \"  mem total=%s used=%s available=%s\n\", \$2, \$3, \$7}'" 2>/dev/null \
  || echo "  (조회 실패 — IAP SSH 권한 확인)"

summary
