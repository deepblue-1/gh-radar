#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# 260929-sar-verify.sh — quick-260929-sar 구조·동작 게이트 (계획 시점 작성 · 실행자는 수정하지 않는다)
#
#   bash .planning/quick/260929-sar-kyobo-observer-alert/260929-sar-verify.sh [ops|static|commit|all]
#
#   ops    — scripts/deploy-relay.sh --alert-only 를 **가짜 gcloud · 가짜 curl** 로 돌려 KYOBO 감시 동기화를 잰다.
#            실제 gcloud · 실제 네트워크는 절대 부르지 않는다(PATH 앞에 스텁 · 모르는 호출은 UNEXPECTED + 97).
#   static — yaml 2종 · deploy-relay.sh 호출 위치 · smoke 참고 줄 · README · relay-operations 문구.
#   commit — BASE 이후 quick-260929-sar 커밋이 허용 파일만 건드렸는지 · Co-Authored-By 없음.
#
# 기준 커밋 BASE = 계획 시점 HEAD. 읽기 전용이다(임시 디렉터리만 쓴다).
# ═══════════════════════════════════════════════════════════════
set -uo pipefail

BASE=6fbcea79bc0f7556c8e591520fb677cfcd9957c6
ROOT="${SAR_ROOT:-$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)}"
cd "$ROOT" || exit 2
MODE="${1:-all}"

KB_CHECK_NAME=gh-radar-relay-healthz
KB_CHECK_FULL=projects/gh-radar/uptimeCheckConfigs/gh-radar-relay-healthz-WsIStDFOShs
KB_CHECK_ID=gh-radar-relay-healthz-WsIStDFOShs
KB_POLICY=gh-radar-relay-down
KY_CHECK_NAME=gh-radar-kyobo-observer-healthz
KY_CHECK_FULL=projects/gh-radar/uptimeCheckConfigs/gh-radar-kyobo-observer-healthz-FAKEID
KY_CHECK_ID=gh-radar-kyobo-observer-healthz-FAKEID
KY_POLICY=gh-radar-kyobo-observer-down
KY_FILE=ops/alert-kyobo-observer-down.yaml
CHANNEL_ID=14409521670382124894

PASS=0
FAIL=0
ok() { echo "PASS $1"; PASS=$((PASS + 1)); }
ng() { echo "FAIL $1${2:+ — $2}"; FAIL=$((FAIL + 1)); }
t() { local id="$1"; shift; if "$@" >/dev/null 2>&1; then ok "$id"; else ng "$id"; fi; }

TMP_ALL="$(mktemp -d "${TMPDIR:-/tmp}/sar-verify.XXXXXX")"
trap 'rm -rf "$TMP_ALL"' EXIT

# ───────────────────────────────────────────────────────────────
# 픽스처 — /healthz 본문
# ───────────────────────────────────────────────────────────────
FX_PRESENT="$TMP_ALL/present.json"
FX_PRESENT_503="$TMP_ALL/present-503.json"
FX_ABSENT="$TMP_ALL/absent.json"
FX_ABSENT_EMPTY_MAP="$TMP_ALL/absent-empty-map.json"
FX_EMPTY="$TMP_ALL/empty.txt"
printf '%s' '{"status":"ok","vpn":true,"dma":true,"version":"4c143596","sessionCount":1,"everReadyCount":1,"stalledCount":0,"journal":{"state":"live","lastSeq":2473,"headSeq":2473,"lagSeq":0,"disconnectedSec":null,"lastAppliedAgeSec":14351,"seqRegressions":0,"lastSeqRegressionAgeSec":null},"journalGateways":{"KYOBO":{"state":"live","lastSeq":null,"headSeq":0,"lagSeq":null,"disconnectedSec":null,"lastAppliedAgeSec":null,"seqRegressions":0,"lastSeqRegressionAgeSec":null,"alerting":false}}}' > "$FX_PRESENT"
printf '%s' '{"status":"degraded","vpn":true,"dma":true,"version":"4c143596","sessionCount":1,"everReadyCount":1,"stalledCount":0,"journal":{"state":"connecting","lastSeq":2473,"headSeq":2473,"lagSeq":0,"disconnectedSec":400,"lastAppliedAgeSec":14351,"seqRegressions":0,"lastSeqRegressionAgeSec":null},"journalGateways":{"KYOBO":{"state":"live","lastSeq":null,"headSeq":0,"lagSeq":null,"disconnectedSec":null,"lastAppliedAgeSec":null,"seqRegressions":0,"lastSeqRegressionAgeSec":null,"alerting":false}}}' > "$FX_PRESENT_503"
printf '%s' '{"status":"ok","vpn":true,"dma":true,"version":"4c143596","sessionCount":0,"everReadyCount":0,"stalledCount":0,"journal":{"state":"live","lastSeq":2473,"headSeq":2473,"lagSeq":0,"disconnectedSec":null,"lastAppliedAgeSec":10,"seqRegressions":0,"lastSeqRegressionAgeSec":null}}' > "$FX_ABSENT"
printf '%s' '{"status":"ok","vpn":true,"dma":true,"version":"4c143596","sessionCount":0,"everReadyCount":0,"stalledCount":0,"journalGateways":{}}' > "$FX_ABSENT_EMPTY_MAP"
: > "$FX_EMPTY"

# ───────────────────────────────────────────────────────────────
# 스텁 — 가짜 gcloud · 가짜 curl
# ───────────────────────────────────────────────────────────────
write_stubs() {
  local BIN="$1"
  cat > "$BIN/gcloud" <<'STUB_GCLOUD'
#!/usr/bin/env bash
S="$FAKE_STATE"; L="$FAKE_LOG"; O="$FAKE_OUT"
first_pos() { local skip="$1"; shift; local i=0 a; for a in "$@"; do i=$((i + 1)); [[ $i -le $skip ]] && continue; [[ "$a" == -* ]] && continue; echo "$a"; return; done; }
filter_name() { local a; for a in "$@"; do case "$a" in --filter=displayName=*) echo "${a#--filter=displayName=}" ;; esac; done; }
policy_file() { local a; for a in "$@"; do case "$a" in --policy-from-file=*) echo "${a#--policy-from-file=}" ;; esac; done; }
yaml_dn() { sed -n 's/^displayName:[[:space:]]*//p' "$1" | head -1 | tr -d "\"'"; }
rm_state() { local dir="$1" key="$2" f c; for f in "$dir"/*; do [[ -f "$f" ]] || continue; c="$(cat "$f")"; if [[ "$c" == "$key" || "${c##*/}" == "$key" ]]; then rm -f "$f"; fi; done; }
case "$1 $2" in
  "config configurations") echo gh-radar; exit 0 ;;
  "config get-value") echo gh-radar; exit 0 ;;
esac
case "$1 $2 $3" in
  "monitoring uptime list-configs")
    n="$(filter_name "$@")"; [[ -n "$n" && -f "$S/uptime/$n" ]] && cat "$S/uptime/$n"; exit 0 ;;
  "monitoring uptime create")
    n="$(first_pos 3 "$@")"; echo "UPTIME_CREATE $*" >> "$L"
    if [[ -n "${FAKE_FAIL_UPTIME_CREATE:-}" && "$FAKE_FAIL_UPTIME_CREATE" == "$n" ]]; then echo "ERROR: (gcloud.monitoring.uptime.create) fake failure" >&2; exit 1; fi
    echo "projects/gh-radar/uptimeCheckConfigs/${n}-FAKEID" > "$S/uptime/$n"; exit 0 ;;
  "monitoring uptime update")
    echo "UPTIME_UPDATE $*" >> "$L"; exit 0 ;;
  "monitoring uptime delete")
    n="$(first_pos 3 "$@")"; echo "UPTIME_DELETE $*" >> "$L"; rm_state "$S/uptime" "$n"; exit 0 ;;
esac
case "$1 $2 $3 $4" in
  "alpha monitoring policies list")
    n="$(filter_name "$@")"; [[ -n "$n" && -f "$S/policy/$n" ]] && cat "$S/policy/$n"; exit 0 ;;
  "alpha monitoring policies create")
    f="$(policy_file "$@")"; dn="$(yaml_dn "$f")"; echo "POLICY_CREATE $dn" >> "$L"
    cp "$f" "$O/policy-$dn.yaml"; echo "projects/gh-radar/alertPolicies/${dn}-PID" > "$S/policy/$dn"; exit 0 ;;
  "alpha monitoring policies update")
    n="$(first_pos 4 "$@")"; f="$(policy_file "$@")"; dn="$(yaml_dn "$f")"; echo "POLICY_UPDATE $dn $n" >> "$L"
    cp "$f" "$O/policy-$dn.yaml"; exit 0 ;;
  "alpha monitoring policies delete")
    n="$(first_pos 4 "$@")"; echo "POLICY_DELETE $*" >> "$L"; rm_state "$S/policy" "$n"; exit 0 ;;
esac
echo "UNEXPECTED gcloud $*" >> "$L"
exit 97
STUB_GCLOUD
  cat > "$BIN/curl" <<'STUB_CURL'
#!/usr/bin/env bash
L="$FAKE_LOG"
fail_flag=0
for a in "$@"; do
  case "$a" in --fail|--fail-with-body) fail_flag=1 ;; --*) ;; -*f*) fail_flag=1 ;; esac
done
for a in "$@"; do
  case "$a" in
    *"/healthz"*)
      echo "CURL $*" >> "$L"
      if [[ "${FAKE_CURL_RC:-0}" != 0 ]]; then exit "$FAKE_CURL_RC"; fi
      if [[ "$fail_flag" == 1 && "${FAKE_HTTP_STATUS:-200}" -ge 400 ]]; then exit 22; fi
      cat "$FAKE_HEALTHZ"; exit 0 ;;
  esac
done
echo "UNEXPECTED curl $*" >> "$L"
exit 97
STUB_CURL
  chmod +x "$BIN/gcloud" "$BIN/curl"
}

# run_case <fixture> <http_status> <curl_rc> <fail_create_name> <seed...>
run_case() {
  local fx="$1" http="$2" crc="$3" failc="$4"; shift 4
  CASE_DIR="$(mktemp -d "$TMP_ALL/case.XXXXXX")"
  mkdir -p "$CASE_DIR/bin" "$CASE_DIR/state/uptime" "$CASE_DIR/state/policy" "$CASE_DIR/out"
  write_stubs "$CASE_DIR/bin"
  local s
  for s in "$@"; do
    case "$s" in
      kb_uptime) echo "$KB_CHECK_FULL" > "$CASE_DIR/state/uptime/$KB_CHECK_NAME" ;;
      kb_policy) echo "projects/gh-radar/alertPolicies/7995724305267722560" > "$CASE_DIR/state/policy/$KB_POLICY" ;;
      ky_uptime) echo "$KY_CHECK_FULL" > "$CASE_DIR/state/uptime/$KY_CHECK_NAME" ;;
      ky_policy) echo "projects/gh-radar/alertPolicies/${KY_POLICY}-PID" > "$CASE_DIR/state/policy/$KY_POLICY" ;;
    esac
  done
  : > "$CASE_DIR/log"
  (
    cd "$ROOT" && env -u DMA_HOST -u DMA_KYOBO_HOST -u SUPABASE_URL \
      PATH="$CASE_DIR/bin:$PATH" \
      FAKE_STATE="$CASE_DIR/state" FAKE_LOG="$CASE_DIR/log" FAKE_OUT="$CASE_DIR/out" \
      FAKE_HEALTHZ="$fx" FAKE_HTTP_STATUS="$http" FAKE_CURL_RC="$crc" FAKE_FAIL_UPTIME_CREATE="$failc" \
      GCP_PROJECT_ID=gh-radar NOTIFICATION_CHANNEL_ID="$CHANNEL_ID" \
      bash scripts/deploy-relay.sh --alert-only
  ) > "$CASE_DIR/stdout" 2>&1
  CASE_RC=$?
}

LOGF() { echo "$CASE_DIR/log"; }
has() { grep -qF -- "$1" "$CASE_DIR/log"; }
hasnt() { ! grep -qF -- "$1" "$CASE_DIR/log"; }
line_of() { grep -nF -- "$1" "$CASE_DIR/log" | head -1 | cut -d: -f1; }
before() { local a b; a="$(line_of "$1")"; b="$(line_of "$2")"; [[ -n "$a" && -n "$b" && "$a" -lt "$b" ]]; }
out_has() { grep -qF -- "$1" "$CASE_DIR/stdout"; }
no_unexpected() { ! grep -q '^UNEXPECTED' "$CASE_DIR/log"; }
dump_case() {
  echo "    ── rc=$CASE_RC · 가짜 호출 로그:"; sed 's/^/    | /' "$CASE_DIR/log" | tail -20
  echo "    ── stdout/stderr 끝 15줄:"; tail -15 "$CASE_DIR/stdout" | sed 's/^/    > /'
}
# 한 케이스의 단언 묶음 — 하나라도 틀리면 FAIL + 덤프
expect() {
  local id="$1"; shift
  local desc bad=""
  while [[ $# -gt 0 ]]; do
    desc="$1"; shift
    if ! eval "$1" >/dev/null 2>&1; then bad="${bad}${bad:+ · }${desc}"; fi
    shift
  done
  if [[ -z "$bad" ]]; then ok "$id"; else ng "$id" "$bad"; dump_case; fi
}

KB_CAP() { echo "$CASE_DIR/out/policy-$KB_POLICY.yaml"; }
KY_CAP() { echo "$CASE_DIR/out/policy-$KY_POLICY.yaml"; }
count_in() { grep -cF -- "$2" "$1" 2>/dev/null || true; }

# ───────────────────────────────────────────────────────────────
# ops — 동작
# ───────────────────────────────────────────────────────────────
mode_ops() {
  local UC="UPTIME_CREATE monitoring uptime create $KY_CHECK_NAME"

  # O1 KYOBO 키 있음 · 감시 없음 → KB 정책 check_id 한정(먼저) → KYOBO 체크 생성 → KYOBO 정책 생성
  run_case "$FX_PRESENT" 200 0 "" kb_uptime kb_policy
  local ucl; ucl="$(grep -F -- "$UC" "$CASE_DIR/log" | head -1)"
  expect "O1 키 있음 · 신규 → KB 정책 한정 후 KYOBO 체크 · 정책 생성" \
    "rc 0" '[[ $CASE_RC -eq 0 ]]' \
    "KB 정책 update" 'has "POLICY_UPDATE $KB_POLICY"' \
    "KB 정책 check_id 2곳" '[[ "$(count_in "$(KB_CAP)" "metric.label.check_id = \"$KB_CHECK_ID\"")" -eq 2 ]]' \
    "KB 정책 채널" 'grep -qF "projects/gh-radar/notificationChannels/$CHANNEL_ID" "$(KB_CAP)"' \
    "KB 정책 치환 잔여 없음" '! grep -qF "\${" "$(KB_CAP)"' \
    "KYOBO 체크 create" 'has "$UC"' \
    "matcher-type" '[[ "$ucl" == *"--matcher-type=matches-json-path"* ]]' \
    "json-path" '[[ "$ucl" == *"--json-path=\$.journalGateways.KYOBO.alerting"* ]]' \
    "json-path-matcher-type" '[[ "$ucl" == *"--json-path-matcher-type=exact-match"* ]]' \
    "matcher-content" '[[ "$ucl" == *"--matcher-content=false"* ]]' \
    "status-classes 2xx,5xx" '[[ "$ucl" == *"--status-classes=2xx,5xx"* ]]' \
    "period 1" '[[ "$ucl" == *"--period=1"* ]]' \
    "timeout 10" '[[ "$ucl" == *"--timeout=10"* ]]' \
    "validate-ssl" '[[ "$ucl" == *"--validate-ssl=true"* ]]' \
    "protocol https" '[[ "$ucl" == *"--protocol=https"* ]]' \
    "path /healthz" '[[ "$ucl" == *"--path=/healthz"* ]]' \
    "host 라벨" '[[ "$ucl" == *"host=dma.jx1.io"* ]]' \
    "KYOBO 정책 create" 'has "POLICY_CREATE $KY_POLICY"' \
    "KYOBO 정책 check_id 2곳" '[[ "$(count_in "$(KY_CAP)" "metric.label.check_id = \"$KY_CHECK_ID\"")" -eq 2 ]]' \
    "KYOBO 정책 채널" 'grep -qF "projects/gh-radar/notificationChannels/$CHANNEL_ID" "$(KY_CAP)"' \
    "KYOBO 정책 치환 잔여 없음" '! grep -qF "\${" "$(KY_CAP)"' \
    "순서 KB정책 < KYOBO체크" 'before "POLICY_UPDATE $KB_POLICY" "$UC"' \
    "순서 KYOBO체크 < KYOBO정책" 'before "$UC" "POLICY_CREATE $KY_POLICY"' \
    "KB 체크 무수정" '! grep -qE "^UPTIME_(CREATE|UPDATE|DELETE) .*$KB_CHECK_NAME" "$CASE_DIR/log"' \
    "삭제 없음" 'hasnt "_DELETE "' \
    "UNEXPECTED 없음" 'no_unexpected'

  # O2 KB 503(본문 JSON) 이어도 키가 있으면 있음 — curl 에 -f 를 쓰면 여기서 틀린다
  run_case "$FX_PRESENT_503" 503 0 "" kb_uptime kb_policy
  expect "O2 503 본문에도 키 있음 → KYOBO 체크 생성 (curl -f 금지)" \
    "rc 0" '[[ $CASE_RC -eq 0 ]]' \
    "KYOBO 체크 create" 'has "$UC"' \
    "KYOBO 정책 create" 'has "POLICY_CREATE $KY_POLICY"' \
    "UNEXPECTED 없음" 'no_unexpected'

  # O3 키 있음 · 감시 이미 있음 → update 경로(생성 없음)
  run_case "$FX_PRESENT" 200 0 "" kb_uptime kb_policy ky_uptime ky_policy
  local uul; uul="$(grep -F -- "UPTIME_UPDATE monitoring uptime update $KY_CHECK_FULL" "$CASE_DIR/log" | head -1)"
  expect "O3 키 있음 · 기존 → KYOBO 체크 update · 정책 update" \
    "rc 0" '[[ $CASE_RC -eq 0 ]]' \
    "KYOBO 체크 update" '[[ -n "$uul" ]]' \
    "set-status-classes 2xx,5xx" '[[ "$uul" == *"--set-status-classes=2xx,5xx"* ]]' \
    "update matcher-type" '[[ "$uul" == *"--matcher-type=matches-json-path"* ]]' \
    "update json-path" '[[ "$uul" == *"--json-path=\$.journalGateways.KYOBO.alerting"* ]]' \
    "update matcher-content" '[[ "$uul" == *"--matcher-content=false"* ]]' \
    "KYOBO 정책 update" 'has "POLICY_UPDATE $KY_POLICY"' \
    "KYOBO 정책 check_id 2곳" '[[ "$(count_in "$(KY_CAP)" "metric.label.check_id = \"$KY_CHECK_ID\"")" -eq 2 ]]' \
    "생성 없음" 'hasnt "_CREATE "' \
    "삭제 없음" 'hasnt "_DELETE "' \
    "UNEXPECTED 없음" 'no_unexpected'

  # O4 키 없음 · 감시 있음 → 정책 삭제 후 체크 삭제 (--quiet)
  run_case "$FX_ABSENT" 200 0 "" kb_uptime kb_policy ky_uptime ky_policy
  expect "O4 키 없음 · 기존 → KYOBO 정책 삭제 → 체크 삭제" \
    "rc 0" '[[ $CASE_RC -eq 0 ]]' \
    "KB 정책은 여전히 update" 'has "POLICY_UPDATE $KB_POLICY"' \
    "KYOBO 정책 delete" 'grep -qE "^POLICY_DELETE .*${KY_POLICY}-PID" "$CASE_DIR/log"' \
    "KYOBO 체크 delete" 'grep -qE "^UPTIME_DELETE .*${KY_CHECK_NAME}" "$CASE_DIR/log"' \
    "순서 정책 삭제 < 체크 삭제" 'before "POLICY_DELETE" "UPTIME_DELETE"' \
    "delete --quiet" '! grep -E "_DELETE " "$CASE_DIR/log" | grep -qv -- "--quiet"' \
    "KB 것은 안 지움" '! grep -E "_DELETE " "$CASE_DIR/log" | grep -qE "$KB_CHECK_NAME|7995724305267722560"' \
    "상태 파일 제거" '[[ ! -f "$CASE_DIR/state/uptime/$KY_CHECK_NAME" && ! -f "$CASE_DIR/state/policy/$KY_POLICY" ]]' \
    "생성 없음" 'hasnt "_CREATE "' \
    "UNEXPECTED 없음" 'no_unexpected'

  # O5 키 없음(빈 맵) · 감시 없음 → KYOBO 변경 0
  run_case "$FX_ABSENT_EMPTY_MAP" 200 0 "" kb_uptime kb_policy
  expect "O5 키 없음 · 감시 없음 → KYOBO 변경 없음" \
    "rc 0" '[[ $CASE_RC -eq 0 ]]' \
    "KYOBO 호출 없음" '! grep -qE "^(UPTIME_[A-Z]+|POLICY_[A-Z]+) .*(kyobo|KYOBO)" "$CASE_DIR/log"' \
    "UNEXPECTED 없음" 'no_unexpected'

  # O6 판정 불가(502 · 빈 본문) · 감시 있음 → 그대로 둔다
  run_case "$FX_EMPTY" 502 0 "" kb_uptime kb_policy ky_uptime ky_policy
  expect "O6 healthz 502 빈 본문 → 판정 불가 · 기존 KYOBO 감시 유지" \
    "rc 0" '[[ $CASE_RC -eq 0 ]]' \
    "KYOBO 변경 없음" '! grep -qE "^(UPTIME_[A-Z]+|POLICY_[A-Z]+) .*(kyobo|KYOBO)" "$CASE_DIR/log"' \
    "경고 줄" 'out_has "KYOBO 감시" && out_has "유지"' \
    "UNEXPECTED 없음" 'no_unexpected'

  # O7 판정 불가(curl 타임아웃) · 감시 없음 → 만들지 않는다
  run_case "$FX_EMPTY" 200 28 "" kb_uptime kb_policy
  expect "O7 curl 실패 → 판정 불가 · KYOBO 생성 없음" \
    "rc 0" '[[ $CASE_RC -eq 0 ]]' \
    "KYOBO 생성 없음" 'hasnt "$UC"' \
    "UNEXPECTED 없음" 'no_unexpected'

  # O8 KB 체크 ID 해석 불가 → KB 정책 미적용 → --alert-only 실패 · KYOBO 생성 금지(오염 방지)
  run_case "$FX_PRESENT" 200 0 "" kb_policy
  expect "O8 KB 체크 없음 → KB 정책 미적용 · KYOBO 생성 금지 · 비0 종료" \
    "rc ≠ 0" '[[ $CASE_RC -ne 0 ]]' \
    "KB 정책 update 없음" 'hasnt "POLICY_UPDATE $KB_POLICY"' \
    "KB 정책 create 없음" 'hasnt "POLICY_CREATE $KB_POLICY"' \
    "KYOBO 생성 없음" 'hasnt "$UC"' \
    "UNEXPECTED 없음" 'no_unexpected'

  # O9 KYOBO 체크 생성 실패 → 통제된 실패(set -e 즉사 아님) · KYOBO 정책 생성 없음
  run_case "$FX_PRESENT" 200 0 "$KY_CHECK_NAME" kb_uptime kb_policy
  expect "O9 KYOBO 체크 create 실패 → 「KYOBO 감시 실패」 출력 후 비0 · 정책 없음" \
    "rc ≠ 0" '[[ $CASE_RC -ne 0 ]]' \
    "KB 정책은 적용됨" 'has "POLICY_UPDATE $KB_POLICY"' \
    "통제된 실패 문구" 'out_has "KYOBO 감시 실패"' \
    "KYOBO 정책 생성 없음" 'hasnt "POLICY_CREATE $KY_POLICY"' \
    "UNEXPECTED 없음" 'no_unexpected'
}

# ───────────────────────────────────────────────────────────────
# static — 파일 구조
# ───────────────────────────────────────────────────────────────
mode_static() {
  t "S1a bash -n deploy-relay.sh" bash -n scripts/deploy-relay.sh
  t "S1b bash -n smoke-relay.sh" bash -n scripts/smoke-relay.sh

  # S2 KB 정책 — check_id 한정 줄만 더했다(그 밖의 yaml 값 · documentation 은 BASE 와 같다)
  t "S2 KB 정책: 두 조건 모두 check_id 한정 · 나머지는 BASE 와 동일(documentation 포함)" ruby -ryaml -e '
    base = YAML.load(`git show '"$BASE"':ops/alert-relay-down.yaml`)
    cur = YAML.load_file("ops/alert-relay-down.yaml")
    ph = %q{metric.label.check_id = "${UPTIME_CHECK_ID}"}
    exit 1 unless cur["conditions"].all? { |c| c["conditionThreshold"]["filter"].include?(ph) }
    norm = ->(y) { y = Marshal.load(Marshal.dump(y)); y["conditions"].each { |c| f = c["conditionThreshold"]["filter"]; c["conditionThreshold"]["filter"] = f.gsub(/\s*AND\s+metric\.label\.check_id = "\$\{UPTIME_CHECK_ID\}"/, "").split.join(" ") }; y }
    exit(norm.(cur) == norm.(base) ? 0 : 1)'
  t "S2b KB 정책 자리표시자 = 채널 · 체크 ID 둘뿐" bash -c '[ "$(grep -o "\${[A-Z_]*}" ops/alert-relay-down.yaml | sort -u | tr "\n" " ")" = "\${NOTIFICATION_CHANNEL_ID} \${UPTIME_CHECK_ID} " ]'

  # S3 KYOBO 정책 yaml
  t "S3 KYOBO 정책 yaml 구조(2조건 AND · check_id · 싱가포르 · 120s/300s · 문서 ≤ 9500B)" ruby -ryaml -e '
    y = YAML.load_file("'"$KY_FILE"'")
    c = y["conditions"] || []
    ph = %q{metric.label.check_id = "${UPTIME_CHECK_ID}"}
    good = y["displayName"] == "'"$KY_POLICY"'" && y["combiner"] == "AND" && y["enabled"] == true && c.size == 2 &&
      c.all? { |x| t = x["conditionThreshold"]; f = t["filter"]; a = (t["aggregations"] || [])[0] || {}
        f.include?(%q{metric.type = "monitoring.googleapis.com/uptime_check/check_passed"}) &&
        f.include?(%q{resource.label.host = "dma.jx1.io"}) && f.include?(ph) &&
        t["comparison"] == "COMPARISON_LT" && t["thresholdValue"].to_f == 0.9 && t["duration"] == "300s" &&
        a["alignmentPeriod"] == "120s" && a["perSeriesAligner"] == "ALIGN_FRACTION_TRUE" && a["crossSeriesReducer"] == "REDUCE_MEAN" } &&
      c.count { |x| x["conditionThreshold"]["filter"].include?(%q{metric.label.checker_location = "apac-singapore"}) } == 1 &&
      y["notificationChannels"] == ["${NOTIFICATION_CHANNEL_ID}"] &&
      y.dig("alertStrategy", "autoClose") == "1800s" &&
      y.dig("documentation", "content").to_s.bytesize.between?(1, 9500) &&
      y.dig("documentation", "content").to_s.include?("journalGateways.KYOBO")
    exit(good ? 0 : 1)'
  t "S3b KYOBO 정책 자리표시자 = 채널 · 체크 ID 둘뿐" bash -c '[ "$(grep -o "\${[A-Z_]*}" "$1" | sort -u | tr "\n" " ")" = "\${NOTIFICATION_CHANNEL_ID} \${UPTIME_CHECK_ID} " ]' _ "$KY_FILE"

  # S4 deploy-relay.sh 결선
  local D=scripts/deploy-relay.sh
  t "S4a KYOBO 이름 3종 정의" bash -c 'grep -qE "^KYOBO_UPTIME_CHECK=gh-radar-kyobo-observer-healthz$" "$1" && grep -qE "^KYOBO_ALERT_POLICY=gh-radar-kyobo-observer-down$" "$1" && grep -qE "^KYOBO_ALERT_FILE=\"?ops/alert-kyobo-observer-down.yaml\"?$" "$1"' _ "$D"
  t "S4b sync_kyobo_monitoring 정의 1 · 호출 ≥ 3" bash -c '[ "$(grep -cE "^sync_kyobo_monitoring\(\) \{" "$1")" -eq 1 ] && [ "$(grep -v "^[[:space:]]*#" "$1" | grep -E "(^|[[:space:];&|])sync_kyobo_monitoring([[:space:]]|$)" | grep -vc "()")" -ge 3 ]' _ "$D"
  t "S4c Section 6: 마지막 apply_alert_policy 호출 < 마지막 sync 호출" bash -c '
    a=$(grep -nE "^[[:space:]]*apply_alert_policy[[:space:]]*$" "$1" | tail -1 | cut -d: -f1)
    s=$(grep -nE "^[[:space:]]*sync_kyobo_monitoring([[:space:]]|$)" "$1" | tail -1 | cut -d: -f1)
    [ -n "$a" ] && [ -n "$s" ] && [ "$a" -lt "$s" ]' _ "$D"
  t "S4d rollback 종료 블록 안에 sync 호출" awk '
    /^if \[\[ "\$MODE" == rollback \]\]; then$/ { inb = 1; hs = 0; hr = 0; next }
    inb && /sync_kyobo_monitoring/ { hs = 1 }
    inb && /Rolled back/ { hr = 1 }
    inb && /^fi$/ { if (hs && hr) found = 1; inb = 0 }
    END { exit(found ? 0 : 1) }' "$D"
  t "S4e sync 함수 본문에 exit 없음(비치명)" awk '
    /^sync_kyobo_monitoring\(\) \{/ { inb = 1; next }
    inb && /^\}/ { inb = 0 }
    inb && !/^[[:space:]]*#/ && /(^|[^_a-zA-Z])exit([[:space:]]|$)/ { bad = 1 }
    END { exit(bad ? 1 : 0) }' "$D"
  t "S4f delete 대상은 KYOBO_ 변수뿐" bash -c '! grep -v "^[[:space:]]*#" "$1" | grep -E "(uptime|policies) delete" | grep -qvE "(uptime|policies) delete \"\\\$\{?KYOBO_[A-Z_]+\}?\""' _ "$D"
  t "S4g 최종 요약에 KYOBO 감시 줄" bash -c 'sed -n "/✅ Deployed @/,\$p" "$1" | grep -qF "KYOBO 감시:"' _ "$D"
  t "S4h --alert-only 안내 문구 갱신(KB uptime check · KYOBO)" bash -c 'grep -F -- "--alert-only:" "$1" | grep -q KYOBO' _ "$D"

  # S5 smoke — 판정 항목이 아니라 참고 줄(비치명) · INV-8 블록 불변
  local SM=scripts/smoke-relay.sh
  t "S5a smoke KYOBO 이름 정의" bash -c 'grep -qE "^KYOBO_UPTIME_CHECK=gh-radar-kyobo-observer-healthz$" "$1" && grep -qE "^KYOBO_ALERT_POLICY=gh-radar-kyobo-observer-down$" "$1"' _ "$SM"
  t "S5b smoke 에 KYOBO check 판정 추가 없음" bash -c '[ "$(grep -cE "^[[:space:]]*(check|skip) .*KYOBO" "$1")" -eq 0 ]' _ "$SM"
  t "S5c smoke 참고 줄이 마지막 summary 앞" bash -c '
    k=$(grep -nF "참고 — KYOBO 관찰자 감시" "$1" | head -1 | cut -d: -f1)
    s=$(grep -nE "^summary$" "$1" | tail -1 | cut -d: -f1)
    [ -n "$k" ] && [ -n "$s" ] && [ "$k" -lt "$s" ]' _ "$SM"
  t "S5d smoke INV-8 블록 BASE 와 동일" bash -c '
    ext() { sed -n "/^# INV-8:/,/^'"'"' _ \"\$ALERT_POLICY\" \"\$UPTIME_CHECK\"$/p"; }
    [ -n "$(ext < "$1")" ] && [ "$(git show '"$BASE"':scripts/smoke-relay.sh | ext)" = "$(ext < "$1")" ]' _ "$SM"

  # S6 README
  local R=infra/relay/README.md
  t "S6a README #### KYOBO 끊김 알림 절" grep -qE "^#### KYOBO 끊김 알림" "$R"
  t "S6b README 옛 한계 문장 제거" bash -c '! grep -qF "장중 KYOBO 끊김을 알리는 경로가 없다" "$1"' _ "$R"
  t "S6c README 핵심어 9종" bash -c 'for k in gh-radar-kyobo-observer-healthz gh-radar-kyobo-observer-down "\$.journalGateways.KYOBO.alerting" check_id 2xx 5xx --alert-only 180 ops/alert-kyobo-observer-down.yaml; do grep -qF -- "$k" "$1" || { echo "missing $k"; exit 1; }; done' _ "$R"
  t "S6d README 교보 실주소 등장 횟수 불변" bash -c '[ "$(grep -o "10\.16\.207\.127" "$1" | wc -l)" = "$(git show '"$BASE"':infra/relay/README.md | grep -o "10\.16\.207\.127" | wc -l)" ]' _ "$R"

  # S7 relay-operations — --alert-only 설명이 KYOBO 감시 동기화를 말한다
  t "S7 relay-operations --alert-only 설명 갱신" bash -c 'grep -A1 -F -- "--alert-only" docs/relay-operations.md | grep -q KYOBO'
}

# ───────────────────────────────────────────────────────────────
# commit — 커밋 위생
# ───────────────────────────────────────────────────────────────
mode_commit() {
  local SHAS
  SHAS="$(git log --format=%H --grep='quick-260929-sar' "$BASE"..HEAD)"
  t "C1 quick-260929-sar 커밋 ≥ 1" test -n "$SHAS"
  local files bad=""
  files="$(for s in $SHAS; do git show --name-only --format= "$s"; done | sort -u)"
  while IFS= read -r f; do
    [[ -z "$f" ]] && continue
    case "$f" in
      scripts/deploy-relay.sh|scripts/smoke-relay.sh|ops/alert-relay-down.yaml|ops/alert-kyobo-observer-down.yaml|infra/relay/README.md|docs/relay-operations.md) ;;
      .planning/quick/260929-sar-kyobo-observer-alert/*|.planning/STATE.md) ;;
      *) bad="$bad $f" ;;
    esac
  done <<< "$files"
  if [[ -z "$bad" ]]; then ok "C2 허용 파일만 변경"; else ng "C2 허용 파일만 변경" "밖:$bad"; fi
  t "C3 Co-Authored-By 없음" bash -c '! for s in $1; do git log -1 --format=%B "$s"; done | grep -qi "co-authored-by"' _ "$SHAS"
  t "C4 제목 접두어 feat|fix|docs(quick-260929-sar):" bash -c '! for s in $1; do git log -1 --format=%s "$s"; done | grep -vqE "^(feat|fix|docs)\(quick-260929-sar\): "' _ "$SHAS"
}

case "$MODE" in
  ops) mode_ops ;;
  static) mode_static ;;
  commit) mode_commit ;;
  all) mode_ops; mode_static; mode_commit ;;
  *) echo "usage: $0 [ops|static|commit|all]" >&2; exit 2 ;;
esac

echo ""
echo "═══ $MODE: PASS $PASS · FAIL $FAIL"
if [[ $FAIL -eq 0 ]]; then echo "ALL PASS"; exit 0; fi
exit 1
