#!/usr/bin/env bash
# quick-261009-c43 D-05 — smoke-limitup-sync.sh INV-2 폴링 스텁 검증(이 quick 의 검증 보조물 · 운영 스크립트 아님).
#
# 가짜 gcloud(호출 횟수를 파일로 세고 N번째 호출부터 타임스탬프 한 줄)를 PATH 앞에 두고, sleep 을 셸 함수로
# 무력화한 뒤, scripts/smoke-limitup-sync.sh 에서 log_filter · inv2_complete_log 두 함수만 sed 로 뽑아 source 한다.
#
# 케이스(기대):
#   N=3  → rc 0 · gcloud 3회 (3번째 조회에서 처음 보임)
#   N=99 → rc 1 · gcloud 9회 (끝까지 없음 — 10초 × 최대 9회)
#   N=1  → rc 0 · gcloud 1회 (즉시 성공 · 불필요한 sleep 없음)
#
# 실제 gcloud 를 부르지 않는다. 임시 디렉터리는 TMPDIR 아래에 남긴다(지우지 않는다).
set -uo pipefail

ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
SMOKE="$ROOT/scripts/smoke-limitup-sync.sh"
WORK=$(mktemp -d "${TMPDIR:-/tmp}/inv2-poll-check.XXXXXX")

cat > "$WORK/gcloud" <<'FAKE'
#!/usr/bin/env bash
c=$(cat "$FAKE_COUNT_FILE" 2>/dev/null || echo 0)
c=$((c + 1))
echo "$c" > "$FAKE_COUNT_FILE"
if [ "$c" -ge "$FAKE_FROM" ]; then
  echo "2026-10-09T12:20:00.000000Z"
fi
exit 0
FAKE
chmod +x "$WORK/gcloud"
export PATH="$WORK:$PATH"

SLEEPS=0
sleep() { SLEEPS=$((SLEEPS + 1)); }

JOB=gh-radar-limitup-sync
EXEC_NAME=gh-radar-limitup-sync-test
DETAIL=""

sed -n -e '/^log_filter() {/,/^}/p' -e '/^inv2_complete_log() {/,/^}/p' "$SMOKE" > "$WORK/funcs.sh"
# shellcheck disable=SC1091
source "$WORK/funcs.sh"

FAILS=0
run_case() {
  local from=$1 want_rc=$2 want_calls=$3
  export FAKE_FROM=$from
  export FAKE_COUNT_FILE="$WORK/count-$from"
  SLEEPS=0
  DETAIL=""
  inv2_complete_log
  local rc=$?
  local calls
  calls=$(cat "$FAKE_COUNT_FILE" 2>/dev/null || echo 0)
  local verdict=PASS
  if [ "$rc" -ne "$want_rc" ] || [ "$calls" -ne "$want_calls" ]; then
    verdict=FAIL
    FAILS=$((FAILS + 1))
  fi
  printf '%s  N=%-2s rc=%s(want %s) calls=%s(want %s) sleeps=%s  DETAIL=%s\n' \
    "$verdict" "$from" "$rc" "$want_rc" "$calls" "$want_calls" "$SLEEPS" "$DETAIL"
}

run_case 3 0 3
run_case 99 1 9
run_case 1 0 1

echo "workdir=$WORK"
if [ "$FAILS" -eq 0 ]; then
  echo "ALL PASS"
  exit 0
fi
echo "FAILED: $FAILS"
exit 1
