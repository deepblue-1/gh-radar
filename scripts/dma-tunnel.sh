#!/usr/bin/env bash
set -uo pipefail

# ═══════════════════════════════════════════════════════════════
# dma-tunnel.sh (macOS)
# 개발기에서 KB DMA 게이트웨이(10.41.1.120:9100)에 **주소 그대로** 붙기 위한 터널.
#
# 경로: 로컬 lo0 별칭 10.41.1.120 → ssh -L → IAP → radar-gw → tun0 → 게이트웨이
#
#   왜 127.0.0.1 이 아니라 별칭인가 — 소비자(gh-trade WinForms `settings.ini` 의
#   `[DMA] Host=10.41.1.120`, relay 의 `DMA_HOST`)의 설정을 하나도 바꾸지 않기 위해서다.
#   목적지 주소를 보존하면 "터널을 켰다/껐다" 만으로 직결과 동치가 된다.
#
#   왜 KB VPN 을 직접 쓰지 않는가 — radar-gw 가 이미 VPN 을 상시 물고 있다
#   (`openconnect@kb` = active + enabled). 개발기마다 VPN 을 올리는 대신 그 세션을 빌린다.
#
# ⚠️ 이 터널 너머는 **실계좌가 걸린 실 게이트웨이**다 (infra/relay/README.md §실서버 라이브 상태).
#    이 스크립트는 **TCP 도달성 확인까지만** 한다 — 로그인·주문 프레임을 절대 보내지 않는다 (D-27).
#
# 사용법:
#   bash scripts/dma-tunnel.sh              # 터널 개설 후 Ctrl+C 까지 유지
#   bash scripts/dma-tunnel.sh --check      # 아무것도 바꾸지 않고 선행 점검만
#   bash scripts/dma-tunnel.sh --stop       # 이전 실행이 남긴 별칭·프로세스 정리
#   bash scripts/dma-tunnel.sh --verbose    # ssh 로그를 콘솔로
#
# 종료 코드: 0 성공 / 1 인자 오류 / 2 선행 점검 실패 / 3 로컬 KB VPN 충돌 /
#            4 별칭 추가 실패 / 5 재연결 상한 도달
#
# Windows 판은 scripts/dma-tunnel.ps1 (동일 계약, IAP 경유 방식만 2단으로 다름).
# ═══════════════════════════════════════════════════════════════

VM=radar-gw
ZONE=asia-northeast3-a
PROJECT=gh-radar
GW_ADDR=10.41.1.120
GW_PORT=9100
FORWARD_SPEC="${GW_ADDR}:${GW_PORT}:${GW_ADDR}:${GW_PORT}"
HEALTH_URL=https://dma.jx1.io/healthz
MAX_RECONNECT=5

STATE_FILE=/tmp/gh-radar-dma-tunnel.state
LOG_FILE=/tmp/gh-radar-dma-tunnel.log

MODE=run
VERBOSE=0
ALIAS_ADDED=0
SSH_PID=""
CLEANED=0

PASS=0
FAIL=0
declare -a FAILED_CHECKS=()

# ───────────────────────────────────────────────────────────────
# 인자
# ───────────────────────────────────────────────────────────────

while [[ $# -gt 0 ]]; do
  case "$1" in
    --check)   MODE=check ;;
    --stop)    MODE=stop ;;
    --verbose) VERBOSE=1 ;;
    *)
      echo "usage: bash scripts/dma-tunnel.sh [--check|--stop] [--verbose]" >&2
      exit 1
      ;;
  esac
  shift
done

# ───────────────────────────────────────────────────────────────
# 보고 도구 (smoke-relay.sh 관용구)
# ───────────────────────────────────────────────────────────────

check() {
  local name="$1"; shift
  echo -n "  $name ... "
  if "$@" >/dev/null 2>&1; then
    echo "PASS"; PASS=$((PASS + 1)); return 0
  fi
  echo "FAIL"; FAIL=$((FAIL + 1)); FAILED_CHECKS+=("$name"); return 1
}

warn() { echo "  $1 ... WARN ($2)"; }
info() { echo "$*"; }

# ───────────────────────────────────────────────────────────────
# 선행 점검 P1~P7
# ───────────────────────────────────────────────────────────────

p1_gcloud()  { command -v gcloud; }
p2_account() { [[ -n "$(gcloud auth list --filter=status:ACTIVE --format='value(account)' 2>/dev/null)" ]]; }
p3_ssh()     { command -v ssh; }
p4_vm()      {
  [[ "$(gcloud compute instances describe "$VM" --zone="$ZONE" --project="$PROJECT" \
        --format='value(status)' 2>/dev/null)" == "RUNNING" ]]
}
# VM 쪽 VPN 이 죽어 있으면 터널을 열어도 게이트웨이에 닿지 않는다 → 경고가 아니라 실패다.
#
# `-f` 를 쓰지 않는 이유: relay 의 DMA 세션이 degraded 면 /healthz 는 **503 과 함께**
# 본문을 돌려준다. 우리가 볼 것은 `vpn` 한 필드뿐이고 relay 의 세션 상태는 터널과 무관하다.
# `-f` 를 쓰면 503 에서 본문을 버려 「VPN 이 죽었다」로 오판한다.
p5_vm_vpn()  { curl -s --max-time 10 "$HEALTH_URL" 2>/dev/null | grep -q '"vpn":true'; }

# 로컬에서 10.41.1.* 를 가진 인터페이스를 모은다.
# 출력 한 줄 = "<iface> <addr> <host|net>" (host = netmask 0xffffffff)
kb_local_addrs() {
  /sbin/ifconfig -a 2>/dev/null | awk '
    /^[a-zA-Z0-9_]+:/ { iface = substr($1, 1, length($1) - 1); next }
    $1 == "inet" && $2 ~ /^10\.41\.1\./ {
      print iface, $2, ($0 ~ /netmask 0xffffffff/ ? "host" : "net")
    }'
}

# 우리 별칭의 소유권 표식: lo0 위의 10.41.1.120. VPN 은 절대 lo0 에 주소를 얹지 않고,
# 게이트웨이 **자신의** 주소가 로컬 인터페이스에 붙는 경우도 우리 말고 없다.
#
# 넷마스크는 표식에 넣지 않는다 — macOS 는 lo0 별칭에 클래스풀 마스크(`0xff000000`)를 찍어도
# 실제로는 호스트 경로(`10.41.1.120 ... UH lo0`) 하나만 깐다 (2026-09-09 실측).
# 표시값으로 소유권을 판정하면 우리가 만든 별칭을 남의 것으로 오판해 정리에서 빠뜨린다.
own_alias_present() { /sbin/ifconfig lo0 2>/dev/null | grep -q "inet ${GW_ADDR} "; }

# 우리 것을 뺀 나머지 10.41.1.* 주소 = KB VPN 직결 상태
foreign_kb_addrs() { kb_local_addrs | awk -v a="$GW_ADDR" '!($1 == "lo0" && $2 == a)'; }

p6_no_conflict() { [[ -z "$(foreign_kb_addrs)" ]]; }

# ───────────────────────────────────────────────────────────────
# 상태 파일 · 정리
# ───────────────────────────────────────────────────────────────

write_state() {
  cat > "$STATE_FILE" <<EOF
ALIAS_ADDED=${ALIAS_ADDED}
IFACE=lo0
SSH_PID=${SSH_PID}
IAP_PID=
STARTED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
EOF
}

kill_tunnel_pid() {
  local pid="$1"
  [[ -z "$pid" ]] && return 0
  # gcloud compute ssh 는 파이썬 래퍼가 ssh 를 자식으로 띄운다.
  # 부모만 죽이면 ssh 가 고아로 남아 포트를 계속 잡는다 → 자식부터 죽인다.
  pkill -P "$pid" 2>/dev/null || true
  kill "$pid" 2>/dev/null || true
}

# 상태 파일이 없어도(창을 강제 종료한 경우) 포워딩 스펙으로 잔존 프로세스를 찾는다.
# 이 스펙은 이 스크립트 밖에서 쓸 일이 없을 만큼 고유하다.
kill_orphans() {
  local pids
  pids=$(pgrep -f "$FORWARD_SPEC" 2>/dev/null | grep -v "^$$\$" || true)
  for p in $pids; do
    pkill -P "$p" 2>/dev/null || true
    kill "$p" 2>/dev/null || true
  done
}

remove_alias() {
  sudo /sbin/ifconfig lo0 -alias "$GW_ADDR" 2>/dev/null || true
}

cleanup() {
  [[ $CLEANED -eq 1 ]] && return 0
  CLEANED=1
  echo ""
  info "정리 중..."
  kill_tunnel_pid "$SSH_PID"
  kill_orphans
  if [[ $ALIAS_ADDED -eq 1 ]]; then
    remove_alias
    info "  lo0 별칭 ${GW_ADDR} 제거"
  fi
  rm -f "$STATE_FILE"
  info "  완료"
}

# ───────────────────────────────────────────────────────────────
# --stop
# ───────────────────────────────────────────────────────────────

do_stop() {
  local found=0
  if [[ -f "$STATE_FILE" ]]; then
    # shellcheck disable=SC1090
    source "$STATE_FILE"
    kill_tunnel_pid "${SSH_PID:-}"
    found=1
  fi
  if [[ -n "$(pgrep -f "$FORWARD_SPEC" 2>/dev/null | grep -v "^$$\$" || true)" ]]; then
    kill_orphans
    found=1
  fi
  # 상태 파일이 없어도 소유권 표식이 맞으면 우리 잔여물이다.
  if own_alias_present; then
    remove_alias
    info "lo0 별칭 ${GW_ADDR} 제거"
    found=1
  fi
  rm -f "$STATE_FILE"
  if [[ $found -eq 0 ]]; then
    info "정리할 잔여물 없음"
  else
    info "정리 완료"
  fi
  exit 0
}

# ───────────────────────────────────────────────────────────────
# 배너
# ───────────────────────────────────────────────────────────────

banner() {
  echo "═══════════════════════════════════════════════════════════"
  echo " DMA 터널 (macOS) — ${GW_ADDR}:${GW_PORT} ← radar-gw(IAP) ← 이 기기"
  echo "═══════════════════════════════════════════════════════════"
  echo " ⚠️  이 터널 너머는 실계좌가 걸린 실 게이트웨이다."
  echo "     이 스크립트는 TCP 도달성 확인까지만 한다 — 로그인·주문은 하지 않는다."
  echo ""
}

# ───────────────────────────────────────────────────────────────
# 선행 점검 실행
# ───────────────────────────────────────────────────────────────

# $1 = "all" (--check: 전 항목 평가) | "strict" (정상 실행: 첫 하드 실패에서 중단)
run_preflight() {
  local mode="$1" rc=0

  echo "선행 점검"
  check "P1 gcloud 존재" p1_gcloud || rc=2
  [[ $mode == strict && $rc -ne 0 ]] && return $rc
  check "P2 활성 인증 계정" p2_account || rc=2
  [[ $mode == strict && $rc -ne 0 ]] && return $rc
  check "P3 ssh 클라이언트" p3_ssh || rc=2
  [[ $mode == strict && $rc -ne 0 ]] && return $rc
  check "P4 VM RUNNING" p4_vm || rc=2
  [[ $mode == strict && $rc -ne 0 ]] && return $rc
  check "P5 VM 쪽 VPN 활성" p5_vm_vpn || rc=2
  [[ $mode == strict && $rc -ne 0 ]] && return $rc

  if check "P6 로컬 KB VPN 충돌 없음" p6_no_conflict; then
    :
  else
    echo ""
    echo "  ↳ 이미 KB VPN 으로 직결돼 있어 터널이 불필요하고 라우팅이 겹칩니다."
    foreign_kb_addrs | while read -r line; do echo "     관측: $line"; done
    echo "     VPN 을 내리고 다시 실행하세요."
    echo ""
    rc=3
  fi
  [[ $mode == strict && $rc -ne 0 ]] && return $rc

  # 대화형 sudo 는 가능하므로 FAIL 이 아니라 WARN 이다.
  if sudo -n true 2>/dev/null; then
    check "P7 sudo 권한" true
  else
    warn "P7 sudo 권한" "비밀번호 입력이 필요합니다 — 별칭 추가 시 물어봅니다"
  fi

  return $rc
}

summary() {
  echo ""
  echo "═══════════════════════════════════════"
  echo "PASS: $PASS  FAIL: $FAIL"
  [[ $FAIL -gt 0 ]] && echo "Failed: ${FAILED_CHECKS[*]}"
  return 0
}

# ───────────────────────────────────────────────────────────────
# 별칭 · 터널
# ───────────────────────────────────────────────────────────────

add_alias() {
  if own_alias_present; then
    # 소유권 표식이 맞는 별칭이 이미 있다 = 이전 실행의 잔여물이다.
    # 우리가 만든 것과 구조적으로 구별되지 않으므로 정리 대상으로 이어받는다.
    ALIAS_ADDED=1
    info "lo0 별칭 ${GW_ADDR} 이미 존재 (이전 실행 잔여물로 간주 — 종료 시 함께 정리)"
    return 0
  fi
  info "lo0 별칭 ${GW_ADDR}/32 추가 (sudo 필요)"
  # `netmask` 키워드를 반드시 붙인다. BSD ifconfig 는 주소 뒤의 위치 인자를 **목적지 주소**로
  # 읽으므로 `alias <addr> 255.255.255.255` 는 마스크가 아니라 dest 로 먹는다 (2026-09-09 실측).
  if ! sudo /sbin/ifconfig lo0 alias "$GW_ADDR" netmask 255.255.255.255; then
    echo "ERROR: 별칭 추가 실패" >&2
    return 1
  fi
  # 명령이 성공한 순간부터 정리 대상이다 — 아래 확인이 실패해도 잔여물을 남기지 않는다.
  ALIAS_ADDED=1
  own_alias_present || { echo "ERROR: 별칭 추가 후 확인 실패" >&2; return 1; }
  return 0
}

start_tunnel() {
  # -f 는 쓰지 않는다 — 데몬화하면 PID 추적과 정리가 불가능해진다.
  if [[ $VERBOSE -eq 1 ]]; then
    gcloud compute ssh "$VM" --tunnel-through-iap --zone="$ZONE" --project="$PROJECT" \
      -- -N -L "$FORWARD_SPEC" \
      -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -o ServerAliveCountMax=3 &
  else
    gcloud compute ssh "$VM" --tunnel-through-iap --zone="$ZONE" --project="$PROJECT" \
      -- -N -L "$FORWARD_SPEC" \
      -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -o ServerAliveCountMax=3 \
      >>"$LOG_FILE" 2>&1 &
  fi
  SSH_PID=$!
}

# 게이트웨이까지의 도달성 = TCP connect 후 즉시 close. 프레임을 보내지 않는다 (D-27).
wait_until_reachable() {
  local i
  for i in $(seq 1 30); do
    if nc -z -w 3 "$GW_ADDR" "$GW_PORT" >/dev/null 2>&1; then return 0; fi
    kill -0 "$SSH_PID" 2>/dev/null || return 1
    sleep 1
  done
  return 1
}

# ───────────────────────────────────────────────────────────────
# main
# ───────────────────────────────────────────────────────────────

if [[ $MODE == stop ]]; then
  do_stop
fi

banner

if [[ $MODE == check ]]; then
  run_preflight all
  rc=$?
  summary
  if [[ $rc -eq 0 ]]; then
    echo "선행 점검 통과 — 'bash scripts/dma-tunnel.sh' 로 터널을 열 수 있습니다."
  fi
  # --check 는 아무것도 바꾸지 않는다: 별칭도 만들지 않고 ssh 도 띄우지 않는다.
  exit $rc
fi

run_preflight strict
rc=$?
if [[ $rc -ne 0 ]]; then
  summary
  exit $rc
fi
echo ""

trap cleanup INT TERM EXIT

add_alias || exit 4
write_state

info "터널 기동 중..."
start_tunnel
write_state

if ! wait_until_reachable; then
  echo "ERROR: ${GW_ADDR}:${GW_PORT} 에 도달하지 못했습니다. 로그: $LOG_FILE" >&2
  [[ $VERBOSE -eq 0 ]] && tail -n 20 "$LOG_FILE" 2>/dev/null
  exit 2
fi

echo ""
echo "✅ 터널 개설 완료 — ${GW_ADDR}:${GW_PORT} 로 직접 접속하세요 (설정 변경 불필요)."
echo "   로그: $LOG_FILE"
echo "   Ctrl+C 로 종료하면 별칭까지 정리합니다."
echo ""

# 재연결 루프: 연결이 60초 이상 유지되면 카운터를 리셋한다
# (장시간 세션에서 상한이 누적 소진되지 않게).
attempt=0
while true; do
  connected_at=$(date +%s)
  wait "$SSH_PID" 2>/dev/null
  lived=$(( $(date +%s) - connected_at ))
  [[ $CLEANED -eq 1 ]] && exit 0
  [[ $lived -ge 60 ]] && attempt=0
  attempt=$((attempt + 1))
  if [[ $attempt -gt $MAX_RECONNECT ]]; then
    echo "ERROR: 재연결 상한(${MAX_RECONNECT}회) 도달 — 종료합니다." >&2
    exit 5
  fi
  backoff=$((2 ** attempt))
  echo "⚠ 터널이 끊겼습니다. ${backoff}초 후 재연결 (${attempt}/${MAX_RECONNECT})"
  sleep "$backoff"
  start_tunnel
  write_state
done
