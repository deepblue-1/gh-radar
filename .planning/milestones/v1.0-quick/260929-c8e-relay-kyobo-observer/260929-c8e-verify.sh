#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# quick-260929-c8e 정적 검증 하네스 (읽기 전용 — 파일을 고치지 않고 네트워크를 쓰지 않는다).
# 계획 단계에서 작성·접지했다. **실행자는 이 파일을 수정하지 않는다.** 게이트가 틀렸다고 판단되면
# 고치지 말고 SUMMARY 에 근거와 함께 적는다.
#
# 사용: bash 260929-c8e-verify.sh {relay|ops|commit|all}
#   relay   Task 1 결선 불변식(설정 · 결선 · 503 판정식 불변 · 푸시 인자 · 로그 태그 · 불변 파일)
#   ops     Task 2 배포/IAM 스크립트 · 비밀 생성 스크립트 · README
#   commit  c8e 커밋 규약(허용 경로 · 한글 · 공동 저자 없음 · 미push)
#
# 동작 테스트(vitest)는 여기 없다 — PLAN 의 <verify> 가 pnpm 으로 돌린다. 여기는 테스트로 잡기
# 어려운 **구조** 불변식만 본다.
# ═══════════════════════════════════════════════════════════════
set -uo pipefail

ROOT="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
cd "$ROOT" || exit 2

# 계획 시점 HEAD. c8e 커밋 범위의 기준점이다.
BASE=fb7c9b0f
QDIR=.planning/quick/260929-c8e-relay-kyobo-observer
FAILS=0

pass() { printf 'PASS  %s\n' "$1"; }
fail() { printf 'FAIL  %s\n' "$1"; FAILS=$((FAILS + 1)); }
check() {
  local label="$1"
  shift
  if "$@" >/dev/null 2>&1; then pass "$label"; else fail "$label"; fi
}

# TS 주석 줄 · 줄끝 `//` 주석을 걷어낸 코드만. (index.ts 문자열 안에는 `//` 가 없다 — 계획 시점 확인)
code_only() { sed -E 's#^[[:space:]]*(\*|/\*|//).*$##; s#[[:space:]]//.*$##' "$1"; }
count_code() { code_only "$2" | grep -c -- "$1" || true; }

relay() {
  echo "== relay (Task 1)"
  local c f logs tags
  check "R1 config.ts 가 추가 관찰자 env 3종을 읽는다" \
    bash -c 'grep -q DMA_KYOBO_HOST relay/src/config.ts && grep -q DMA_KYOBO_PORT relay/src/config.ts && grep -q DMA_OBSERVER_SECRET_KYOBO relay/src/config.ts'
  check "R2 config.ts 가 journalUpstreams 를 낸다" grep -q journalUpstreams relay/src/config.ts
  check "R3 index.ts 가 journalUpstreams 로 게이트웨이별 파이프라인을 만든다" grep -q journalUpstreams relay/src/index.ts

  c="$(count_code KYOBO relay/src/index.ts)"
  if [ "$c" = 0 ]; then pass "R4 index.ts 코드에 게이트웨이 키 리터럴 없음 (env 표에서만 온다)"; else fail "R4 index.ts 코드에 KYOBO 리터럴 ${c}건"; fi

  c="$(count_code deliverJournalState relay/src/index.ts)"
  if [ "$c" = 1 ]; then pass "R5 deliverJournalState 결선 1곳 — 주 게이트웨이 상태만 브라우저로"; else fail "R5 deliverJournalState 코드 ${c}건 (기대 1)"; fi

  c="$(count_code 'journalState:' relay/src/index.ts)"
  if [ "$c" = 1 ]; then pass "R6 fanout journalState 스냅샷 원천 1곳"; else fail "R6 journalState: 코드 ${c}건 (기대 1)"; fi

  check "R7 order-api 에 journalGateways 필드" grep -q journalGateways relay/src/order/order-api.ts
  check "R8 503 판정식 불변 — 추가 게이트웨이는 판정에 들어가지 않는다" \
    grep -qF 'const healthy = linkUp && sessionsOk && journalOk;' relay/src/order/order-api.ts
  check "R9 fanout.deliverJournalRows 가 선택 매핑 인자(JournalAccessView)를 받는다" \
    bash -c "grep -A3 -E '^[[:space:]]*deliverJournalRows\(' relay/src/ws/fanout.ts | grep -q '?: JournalAccessView'"

  for f in relay/src/journal/writer.ts relay/src/journal/access.ts; do
    logs="$(grep -cE 'logger\.(info|warn|error)\(' "$f" || true)"
    tags="$(grep -cE '(^|[{ ,])gateway: this\.#gateway' "$f" || true)"
    if [ "$tags" -ge "$logs" ]; then
      pass "R10 $(basename "$f") 로그 ${logs}건에 gateway 태그 ${tags}건"
    else
      fail "R10 $(basename "$f") 로그 ${logs}건 · gateway 태그 ${tags}건 (태그가 모자란다)"
    fi
  done

  check "R11 logger redact 에 DMA_OBSERVER_SECRET_KYOBO" grep -qF '"*.DMA_OBSERVER_SECRET_KYOBO"' relay/src/logger.ts
  check "R12 불변 파일(status · observer · session-manager · shared relay.ts) 작업트리 변경 없음" \
    git diff --quiet HEAD -- relay/src/journal/status.ts relay/src/journal/observer.ts relay/src/dma/session-manager.ts packages/shared/src/relay.ts
  check "R13 새 설정 테스트 파일 relay/tests/config-upstreams.test.ts" test -f relay/tests/config-upstreams.test.ts
  check "R14 부팅 테스트가 추가 게이트웨이 env 를 다룬다" grep -q DMA_KYOBO_HOST relay/tests/journal-boot.test.ts
  check "R15 healthz 단위 테스트가 journalGateways 를 다룬다" grep -q journalGateways relay/tests/order-api.test.ts
  check "R16 푸시 테스트가 추가 게이트웨이 매핑을 다룬다" grep -q KYOBO relay/tests/journal-push.test.ts

  c="$(git grep -l '10\.16\.207' -- relay | wc -l | tr -d ' ')"
  if [ "$c" = 0 ]; then pass "R17 relay 소스·테스트에 교보 실주소 리터럴 없음 (D-27)"; else fail "R17 relay 에 10.16.207 리터럴 파일 ${c}개"; fi
}

ops() {
  echo "== ops (Task 2)"
  local D=scripts/deploy-relay.sh S=scripts/setup-relay-iam.sh H="$QDIR/260929-c8e-kyobo-secret.sh" R=infra/relay/README.md
  local c k h

  check "O1 bash -n deploy-relay.sh" bash -n "$D"
  check "O2 bash -n setup-relay-iam.sh" bash -n "$S"
  check "O3 bash -n 비밀 생성 스크립트" bash -n "$H"
  check "O4 원격 본문(REMOTE_BODY heredoc) 문법" \
    bash -c "sed -n '/^REMOTE_BODY=/,/^REMOTE_BODY_EOF\$/p' '$D' | sed '1d;\$d' | bash -n"

  # O5 resolve_kyobo_host 동작 — 함수만 떼어 격리 실행한다. 주소는 TEST-NET(192.0.2.x) 뿐이다.
  if bash -c '
      set -u
      src="$(sed -n "/^resolve_kyobo_host()/,/^}/p" "$1")"
      [ -n "$src" ] || { echo "resolve_kyobo_host() 없음"; exit 3; }
      eval "$src"
      t() {
        DMA_KYOBO_HOST_INJECTED="$1"; CURRENT_KYOBO_HOST="$2"; KYOBO_HOST=__unset__; KYOBO_HOST_SOURCE=""
        resolve_kyobo_host
        [ "$KYOBO_HOST" = "$3" ] || { echo "inj=$1 cur=$2 got=$KYOBO_HOST want=$3"; exit 1; }
        [ -n "$KYOBO_HOST_SOURCE" ] || { echo "inj=$1 cur=$2 출처 문구 없음"; exit 1; }
      }
      t "" "" ""
      t "" 192.0.2.9 192.0.2.9
      t 192.0.2.7 192.0.2.9 192.0.2.7
      t 192.0.2.7 "" 192.0.2.7
      t off 192.0.2.9 ""
      t off "" ""
    ' _ "$D"; then
    pass "O5 resolve_kyobo_host 우선순위 (명시 > 실행 중 보존 > 없음 · off = 명시 해제)"
  else
    fail "O5 resolve_kyobo_host 우선순위"
  fi

  check "O6 치명 비밀 4종 루프 줄 불변 — KYOBO 비밀은 치명 루프 밖" \
    grep -qxF 'for SECRET_NAME in gh-radar-supabase-service-role gh-radar-dma-cred-key gh-radar-relay-order-secret gh-radar-dma-observer-secret; do' "$D"
  c="$(grep -c 'gh-radar-dma-observer-secret-kyobo' "$D" || true)"
  if [ "$c" -ge 3 ]; then pass "O7 deploy 가 KYOBO 비밀을 ${c}곳에서 다룬다 (헤더 · 사전 점검 · VM fetch)"; else fail "O7 KYOBO 비밀 언급 ${c}건 (기대 ≥3)"; fi
  check "O8 VM 의 KYOBO 비밀 fetch 는 비치명 (|| true)" grep -qE 'fetch_secret gh-radar-dma-observer-secret-kyobo.*\|\| true' "$D"
  check "O9 env-file 에 DMA_OBSERVER_SECRET_KYOBO 줄" grep -q 'DMA_OBSERVER_SECRET_KYOBO=' "$D"
  check "O10 REMOTE_HEAD 가 DMA_KYOBO_HOST · DMA_KYOBO_PORT 를 넘긴다" \
    bash -c "grep -q 'DMA_KYOBO_HOST=%q' '$D' && grep -q 'DMA_KYOBO_PORT=%q' '$D'"
  check "O11 read_live_env 일반화 + read_live_dma_host 유지 (T-16-14 한 벌)" \
    bash -c "grep -q '^read_live_env()' '$D' && grep -q '^read_live_dma_host()' '$D'"
  c="$(cat "$D" "$S" | grep -c '10\.16\.207' || true)"
  if [ "$c" = 0 ]; then pass "O12 배포 · IAM 스크립트에 교보 실주소 기본값 없음 (D-27 — 주소는 배포 시 주입)"; else fail "O12 스크립트에 10.16.207 ${c}건"; fi
  check "O13 setup-relay-iam.sh Section 4 루프에 KYOBO 비밀" \
    grep -qE '^for SECRET_NAME in .*gh-radar-dma-observer-secret-kyobo.*; do$' "$S"

  c="$(grep -c '^### 다중 게이트웨이 관찰자' "$R" || true)"
  if [ "$c" = 1 ]; then pass "O14 README 「다중 게이트웨이 관찰자」 절 1개"; else fail "O14 README 새 절 ${c}개 (기대 1)"; fi
  # 새 절 본문만 (다음 ## / ### 제목 전까지 — #### 하위 제목은 포함). 교보 절에 이미 있는 낱말이 거짓 PASS 를 만들지 않게.
  local SEC
  SEC="$(awk '/^### 다중 게이트웨이 관찰자/{f=1; print; next} f && /^###? /{exit} f {print}' "$R")"
  for k in 'DMA_KYOBO_HOST=off' 'journalGateways' 'gh-radar-dma-observer-secret-kyobo' '260929-c8e-kyobo-secret.sh' \
           '4시간' '데스크톱' 'dma_account_access' 'DMA_OBSERVER_SECRET_KYOBO' 'dma_user_id' 'rejected'; do
    if printf '%s\n' "$SEC" | grep -qF -- "$k"; then pass "O15 새 절에 「${k}」"; else fail "O15 새 절에 「${k}」 없음"; fi
  done
  check "O16 README Secret 상태 표에 KYOBO 행" grep -qE '^\| `gh-radar-dma-observer-secret-kyobo` \|' "$R"
  for h in '## Secret 4종 값 주입' \
           '### 관찰자 비밀 (`gh-radar-dma-observer-secret` ↔ 게이트웨이 `config/observer.toml`)' \
           '## 교보 SecuwaySSL VPN — 상시 DMA 터널' \
           '### 사건 기록 — 2026-09-26 재부팅 시 wg0 기동 실패'; do
    check "O17 기존 제목 보존: $h" grep -qxF -- "$h" "$R"
  done
}

commit() {
  echo "== commit"
  local n bad pushed h
  n="$(git log --format=%s "$BASE"..HEAD | grep -cE '^(feat|test)\(quick-260929-c8e\)' || true)"
  if [ "$n" -ge 3 ]; then pass "C1 feat/test 커밋 ${n}건 (기대 ≥3: test RED · feat relay · feat ops)"; else fail "C1 feat/test 커밋 ${n}건 (기대 ≥3)"; fi

  bad="$(git log --format= --name-only --grep='quick-260929-c8e' "$BASE"..HEAD | sed '/^$/d' | sort -u \
    | grep -vxE 'relay/src/(config|index|logger)\.ts|relay/src/order/order-api\.ts|relay/src/ws/fanout\.ts|relay/src/journal/(writer|access)\.ts|relay/tests/(journal-boot|order-api|journal-push|config-upstreams)\.test\.ts|scripts/(deploy-relay|setup-relay-iam)\.sh|infra/relay/README\.md|\.planning/.*' || true)"
  if [ -z "$bad" ]; then pass "C2 c8e 커밋은 허용 경로만 건드린다 (webapp · shared · supabase · startup.sh · Caddyfile 0)"; else fail "C2 허용 밖 경로: $(echo "$bad" | tr '\n' ' ')"; fi

  n="$(git log --format=%B --grep='quick-260929-c8e' "$BASE"..HEAD | grep -ci 'co-authored-by' || true)"
  if [ "$n" = 0 ]; then pass "C3 공동 저자 줄 없음"; else fail "C3 Co-Authored-By ${n}줄"; fi

  if git log --format=%s --grep='quick-260929-c8e' "$BASE"..HEAD \
      | perl -CSD -ne '$bad++ unless /\p{Hangul}/; END { exit($bad ? 1 : 0) }'; then
    pass "C4 c8e 커밋 제목 전부 한글 포함"
  else
    fail "C4 한글 없는 c8e 커밋 제목"
  fi

  pushed=0
  for h in $(git log --format=%H --grep='quick-260929-c8e' "$BASE"..HEAD); do
    if [ -n "$(git branch -r --contains "$h" 2>/dev/null)" ]; then pushed=$((pushed + 1)); fi
  done
  if [ "$pushed" = 0 ]; then pass "C5 push 안 됨"; else fail "C5 원격에 올라간 c8e 커밋 ${pushed}건"; fi
}

case "${1:-all}" in
  relay) relay ;;
  ops) ops ;;
  commit) commit ;;
  all) relay; ops; commit ;;
  *)
    echo "usage: $0 {relay|ops|commit|all}" >&2
    exit 2
    ;;
esac

if [ "$FAILS" -eq 0 ]; then
  echo "ALL PASS"
else
  echo "FAILED: $FAILS"
  exit 1
fi
