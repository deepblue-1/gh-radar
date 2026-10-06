#!/usr/bin/env bash
# secuway-connect 드라이런 테스트 (quick-261007-b9o).
# connect 를 source 한 뒤 경로 상수를 작업 디렉터리로 돌리고, 가짜 클라이언트와
# pgrep 스텁(가짜 sslvpn PID 파일)으로 fail-fast · inactive 캡처 · 비밀 미노출 ·
# 타임아웃 경로를 검증한다. VM·systemd 무접촉 — macOS 에서 돈다.
# 실행: bash infra/relay/secuway/tests/connect.test.sh
set -u
HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
C="$HERE/../secuway-connect"
WORK=$(mktemp -d)
cleanup() {
  local f
  for f in "$WORK"/*/sslvpn.pid "$WORK"/*/client.pid; do
    [[ -s "$f" ]] && kill "$(cat "$f")" 2>/dev/null
  done
  rm -rf "$WORK"
}
trap cleanup EXIT

CASE=init
fail() { echo "FAIL: $CASE — $*"; exit 1; }
expect() { [[ "$2" == "$3" ]] || fail "$1: expected $3, got $2"; }

# ── source 해도 main 이 돌지 않는다 ─────────────────────────────────
PROBE_OUT=$(source "$C" 2>&1; echo "rc=$?")
expect "source output" "$PROBE_OUT" "rc=0"
# shellcheck source=../secuway-connect
source "$C"
declare -F main >/dev/null || fail "main not defined after source"

# 가짜 sslvpn PID 파일이 있으면 그 내용을 출력
pgrep() { [[ -s "$D/sslvpn.pid" ]] && cat "$D/sslvpn.pid"; return 0; }

# make_client <case> <body> — stdin 두 줄을 읽기만 하고(출력 안 함) body 실행
make_client() {
  local f="$D/fake_client"
  {
    echo '#!/usr/bin/env bash'
    echo "DIR='$D'"
    echo 'echo $$ > "$DIR/client.pid"'
    echo 'read -r _u; read -r _p'
    printf '%s\n' "$1"
  } > "$f"
  chmod +x "$f"
  CLIENT="$f"
}

setup_case() {
  CASE=$1
  D="$WORK/$CASE"; mkdir -p "$D"
  SECUWAY_HOME="$D"
  CRED="$D/cred"; printf '%s\n' 'kyobo-user' 'PW-SENTINEL-9f3' > "$CRED"
  ERRF="$D/errf"
  CONF_GLOB="$D/conf.*"
  STARTUP_TIMEOUT_SEC=30
  TRACK_INTERVAL=0.2
}

run_main() { # → RC, ELAPSED, $D/err
  local t0 t1
  t0=$(date +%s)
  ( main ) 2> "$D/err"
  RC=$?
  t1=$(date +%s)
  ELAPSED=$(( t1 - t0 ))
  command sleep 0.3   # 리더(프로세스 치환)가 남은 줄을 다 쓰게 둔다
}

no_secrets() {
  local f
  for f in "$D/err" "$ERRF"; do
    [[ -e "$f" ]] || continue
    grep -qF 'PW-SENTINEL-9f3' "$f" && fail "password sentinel leaked into $(basename "$f")"
    grep -qF 'SECRET-KEY-SENTINEL' "$f" && fail "key sentinel leaked into $(basename "$f")"
  done
  return 0
}
has() { grep -qF -- "$1" "$D/err" || fail "stderr missing: $1 — got: $(cat "$D/err")"; }

# ── A: 10-07 사례 — 「이미 로그인」 fail-fast ────────────────────────
setup_case A-already-logged-in
make_client 'echo "Error: 이미 로그인한 사용자입니다."; exit 1'
run_main
expect "rc" "$RC" 1
(( ELAPSED <= 5 )) || fail "took ${ELAPSED}s (> 5s)"
has "Error: 이미 로그인한 사용자입니다."
has "client reported Error"
has "failing fast"
grep -qF "Error: 이미 로그인한 사용자입니다." "$ERRF" || fail "ERRF missing Error line"
[[ "$(stat -c %a "$ERRF" 2>/dev/null || stat -f %Lp "$ERRF")" == 600 ]] || fail "ERRF mode not 600"
no_secrets

# ── B: 다른 Error 도 같은 fail-fast (분류 없음) ─────────────────────
setup_case B-mac-mismatch
make_client 'printf "%s" "Error: 등록된 MAC값이 일치하지 않습니다"; exit 1'   # 개행 없는 마지막 줄
run_main
expect "rc" "$RC" 1
(( ELAPSED <= 5 )) || fail "took ${ELAPSED}s (> 5s)"
has "Error: 등록된 MAC값이 일치하지 않습니다"
has "failing fast"
no_secrets

# ── C: 정상 기동 + inactive 캡처 ────────────────────────────────────
setup_case C-up-capture
make_client '
conf=$(mktemp "$DIR/conf.XXXXXX")
printf "%s\n" "client" "dev tun" "<key>" "SECRET-KEY-SENTINEL" "</key>" "inactive 14400 1048576" "ping 10" > "$conf"
sleep 0.6
sleep 2.5 >/dev/null 2>&1 &
echo $! > "$DIR/sslvpn.pid"
sleep 0.6
rm -f "$conf"'
run_main
expect "rc" "$RC" 1
has "vendor openvpn option: inactive 14400 1048576"
has "tunnel up, tracking sslvpn pid"
has "exited — exiting so systemd restarts"
grep -q "not captured" "$D/err" && fail "should have captured"
expect "option lines" "$(grep -c 'vendor openvpn option' "$D/err")" 1
no_secrets

# ── D: 캡처 경합 실패 — 그래도 진행 ─────────────────────────────────
setup_case D-no-conf
make_client '
sleep 0.3
sleep 3 >/dev/null 2>&1 &
echo $! > "$DIR/sslvpn.pid"'
run_main
expect "rc" "$RC" 1
has "inactive line not captured (best-effort)"
has "tunnel up, tracking sslvpn pid"
no_secrets

# ── E: 무응답 — 타임아웃 ───────────────────────────────────────────
setup_case E-timeout
STARTUP_TIMEOUT_SEC=1
make_client 'sleep 3'
run_main
STARTUP_TIMEOUT_SEC=30
expect "rc" "$RC" 1
(( ELAPSED <= 3 )) || fail "took ${ELAPSED}s (> 3s)"
has "sslvpn did not come up within 1s"
no_secrets

echo "CONNECT TESTS ALL OK"
