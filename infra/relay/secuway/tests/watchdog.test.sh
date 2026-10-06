#!/usr/bin/env bash
# secuway-watchdog 드라이런 테스트 (quick-261007-b9o).
# 워치독을 source 한 뒤 probe/systemctl/logger/sleep/active_age_sec/keepalive
# (케이스 8 은 timeout/ping)를 스텁해 결정 흐름만 검증한다. VM·systemd·네트워크
# 무접촉 — macOS 에서 돈다. 실행: bash infra/relay/secuway/tests/watchdog.test.sh
set -u
HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
W="$HERE/../secuway-watchdog"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

fail() { echo "FAIL: $CASE — $*"; exit 1; }

# ── 공통 스텁 (호출 기록은 파일 — 서브셸에서도 남는다) ──────────────
D="$WORK/init"; mkdir -p "$D"
PROBE_SEQ=(); ACTIVE_SEQ=(); FAILED_SEQ=(); AGE=600; PING_OUT=""

pop() { # pop <arrayname> → 첫 원소 반환값(없으면 1)
  local -n q=$1
  local r=${q[0]:-1}
  q=("${q[@]:1}")
  return "$r"
}
systemctl() {
  echo "systemctl $*" >> "$D/calls"
  case "$1" in
    is-active) pop ACTIVE_SEQ ;;
    is-failed) pop FAILED_SEQ ;;
    show) echo "exit-code" ;;
    restart|reset-failed|start) return 0 ;;
    *) return 1 ;;
  esac
}
logger() {
  [[ "$1" == "-t" && "$2" == "secuway-watchdog" ]] || { echo "bad logger args: $*" >> "$D/log"; return 0; }
  shift 2
  echo "$*" >> "$D/log"
}
sleep() { echo "$*" >> "$D/sleep"; }

reset_case() {
  CASE=$1
  D="$WORK/$CASE"; mkdir -p "$D"
  : > "$D/calls"; : > "$D/log"; : > "$D/sleep"
  PROBE_SEQ=(); ACTIVE_SEQ=(); FAILED_SEQ=(); AGE=600
  RECOVER_STAMP="$D/stamp"
}
calls()   { grep -cxF -- "$1" "$D/calls" || true; }
logn()    { grep -c . "$D/log" || true; }
loghas()  { grep -F -- "$1" "$D/log" | grep -qF -- "$2"; }
sleepn()  { grep -c . "$D/sleep" || true; }
expect()  { [[ "$2" == "$3" ]] || fail "$1: expected $3, got $2"; }

# ── 케이스 9: source 해도 main 이 돌지 않는다 ───────────────────────
reset_case c9-source
# shellcheck source=../secuway-watchdog
source "$W"
expect "source side-effect calls" "$(grep -c . "$D/calls" || true)" 0
expect "source side-effect log" "$(logn)" 0
expect "source side-effect sleep" "$(sleepn)" 0
declare -F main >/dev/null || fail "main not defined after source"

# source 뒤 덮어쓰는 스텁
probe() { echo probe >> "$D/calls"; pop PROBE_SEQ; }
keepalive() { echo keepalive >> "$D/calls"; return 0; }
active_age_sec() { echo "$AGE"; }

# ── 케이스 1: 정상 ────────────────────────────────────────────────
reset_case c1-healthy
ACTIVE_SEQ=(0); PROBE_SEQ=(0)
main; expect "rc" $? 0
expect "probe" "$(calls probe)" 1
expect "keepalive" "$(calls keepalive)" 1
expect "restart" "$(calls "systemctl restart securwayssl.service")" 0
expect "reset-failed" "$(calls "systemctl reset-failed securwayssl.service")" 0
expect "log lines" "$(logn)" 0
expect "sleep" "$(sleepn)" 0

# ── 케이스 2: 10-07 사례 — 1회 실패 후 회복 ─────────────────────────
reset_case c2-blip
ACTIVE_SEQ=(0); PROBE_SEQ=(1 0)
main; expect "rc" $? 0
expect "probe" "$(calls probe)" 2
expect "restart" "$(calls "systemctl restart securwayssl.service")" 0
expect "keepalive" "$(calls keepalive)" 1
expect "log lines" "$(logn)" 2
expect "probe1 fail log" "$(grep -cF 'probe 1/4 10.16.207.119:22 failed' "$D/log")" 1
loghas "recovered on probe 2/4" "no restart" || fail "recovered log"
expect "sleep" "$(sleepn)" 1
expect "sleep arg" "$(cat "$D/sleep")" 5

# ── 케이스 3: 진짜 단절 — 1회 재시작 ────────────────────────────────
reset_case c3-down
ACTIVE_SEQ=(0 0); PROBE_SEQ=(1 1 1 1); AGE=600
main; expect "rc" $? 0
expect "probe" "$(calls probe)" 4
expect "sleep" "$(sleepn)" 3
expect "sleep args" "$(sort -u "$D/sleep")" 5
expect "restart" "$(calls "systemctl restart securwayssl.service")" 1
expect "keepalive" "$(calls keepalive)" 0
expect "fail logs" "$(grep -cE '^probe [1-4]/4 10\.16\.207\.119:22 failed' "$D/log")" 4
loghas "all 4 probes failed" "restarting securwayssl" || fail "restart log"
expect "log lines" "$(logn)" 5

# ── 케이스 4: 결정 시점에 이미 비활성 ───────────────────────────────
reset_case c4-noLongerActive
ACTIVE_SEQ=(0 1); PROBE_SEQ=(1 1 1 1)
main; expect "rc" $? 0
expect "restart" "$(calls "systemctl restart securwayssl.service")" 0
loghas "all 4 probes failed" "no longer active" || fail "no longer active log"
loghas "no longer active" "skip" || fail "skip log"

# ── 케이스 5: 유예 (active 20초) ────────────────────────────────────
reset_case c5-grace
ACTIVE_SEQ=(0 0); PROBE_SEQ=(1 1 1 1); AGE=20
main; expect "rc" $? 0
expect "restart" "$(calls "systemctl restart securwayssl.service")" 0
loghas "all 4 probes failed" "grace" || fail "grace log"
loghas "grace" "skip" || fail "grace skip log"

# ── 케이스 6: failed 회수 → 곧바로 재실행은 대기 ────────────────────
reset_case c6-failed
ACTIVE_SEQ=(1); FAILED_SEQ=(0)
main; expect "rc" $? 0
expect "reset-failed" "$(calls "systemctl reset-failed securwayssl.service")" 1
expect "start" "$(calls "systemctl start securwayssl.service")" 1
expect "probe" "$(calls probe)" 0
[[ -s "$RECOVER_STAMP" ]] || fail "stamp not written"
grep -qF "reset-failed + start" "$D/log" || fail "recover log"
: > "$D/calls"; : > "$D/log"
ACTIVE_SEQ=(1); FAILED_SEQ=(0)
main; expect "rc" $? 0
expect "2nd reset-failed" "$(calls "systemctl reset-failed securwayssl.service")" 0
expect "2nd start" "$(calls "systemctl start securwayssl.service")" 0
expect "2nd restart" "$(calls "systemctl restart securwayssl.service")" 0
loghas "last recovery" "wait" || fail "wait log"

# ── 케이스 7: 사람이 stop (inactive) — 무접촉 ───────────────────────
reset_case c7-inactive
ACTIVE_SEQ=(1); FAILED_SEQ=(1)
main; expect "rc" $? 0
expect "probe" "$(calls probe)" 0
expect "keepalive" "$(calls keepalive)" 0
expect "mutating systemctl" "$(grep -cE '^systemctl (restart|start|reset-failed|stop)' "$D/calls" || true)" 0
expect "log lines" "$(logn)" 0
[[ -e "$RECOVER_STAMP" ]] && fail "stamp written for inactive"

# ── 케이스 8: 실제 keepalive (timeout/ping 만 스텁) ─────────────────
reset_case c8-keepalive
source "$W"            # 원래 keepalive 를 되살린다
RECOVER_STAMP="$D/stamp"
timeout() { shift; "$@"; }
ping() { echo "ping $*" >> "$D/calls"; [[ -n "$PING_OUT" ]] && printf '%s\n' "$PING_OUT"; return 0; }
PING_OUT=$'--- 10.16.207.119 ping statistics ---\n120 packets transmitted, 118 received, 1.66667% packet loss, time 23900ms'
keepalive; expect "rc" $? 0
expect "healthy log lines" "$(logn)" 0
grep -qF -- "-c 120 -s 1200 -i 0.2 -W 1 10.16.207.119" "$D/calls" || fail "ping args: $(cat "$D/calls")"
PING_OUT=$'--- 10.16.207.119 ping statistics ---\n120 packets transmitted, 10 received, 91.6667% packet loss, time 23900ms'
keepalive; expect "rc" $? 0
expect "low log lines" "$(logn)" 1
grep -qF "keepalive ping 10/120 replies" "$D/log" || fail "low-reply log"
: > "$D/log"
PING_OUT=""
keepalive; expect "rc" $? 0
expect "empty log lines" "$(logn)" 1
grep -qF "keepalive ping" "$D/log" || fail "empty-output log"

echo "WATCHDOG TESTS ALL OK"
