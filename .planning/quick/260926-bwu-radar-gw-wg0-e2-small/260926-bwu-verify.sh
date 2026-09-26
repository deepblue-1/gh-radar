#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# quick-260926-bwu 검증 하네스 — 읽기 전용 (VM·gcloud·ssh 호출 0)
#
#   bash 260926-bwu-verify.sh wg0      # startup.sh wg0.conf PostUp 부팅 모의 + 정적 게이트
#   bash 260926-bwu-verify.sh docs     # README · setup-relay-iam.sh 문서/생성 경로 게이트
#   bash 260926-bwu-verify.sh commit   # 코드 커밋 1건 · 경로 3개 · 미push · 공동저자 줄 없음
#   bash 260926-bwu-verify.sh all      # wg0 + docs (+ 커밋이 있으면 commit)
#
# wg0 부팅 모의: startup.sh 의 wg0.conf heredoc 을 뽑아 PostUp 을 wg-quick 처럼
#   한 줄씩 `(set -e; eval "$hook")` 로 돌린다. iptables 는 가짜 함수 — 부팅 직후처럼
#   DOCKER-USER 에 지울 규칙이 없다고 보고 `-D` 는 전부 실패, `-I` 는 성공시킨다.
#   wg·nft 는 no-op. 실제 wg-quick 은 PostUp 하나만 실패해도 wg0 를 지운다.
#   STARTUP=<경로> 로 대상 파일을 바꿀 수 있다(이 경우 git diff 게이트는 건너뛴다).
#   README=<경로> · IAM=<경로> 도 같은 방식으로 바꿀 수 있다(모의 편집 검증용).
#
# 실패는 FAIL 줄 + 마지막에 exit 1. 통과는 PASS 줄.
# ═══════════════════════════════════════════════════════════════
set -uo pipefail
ROOT="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
cd "$ROOT"

BASE_REF="${BASE_REF:-afe26e2}"          # 계획 시점 HEAD — 이후 커밋과 무관하게 조상으로 남는다
STARTUP_DEFAULT=infra/relay/startup.sh
STARTUP="${STARTUP:-$STARTUP_DEFAULT}"
README="${README:-infra/relay/README.md}"
IAM="${IAM:-scripts/setup-relay-iam.sh}"
TAG=quick-260926-bwu

fail=0
pass() { printf 'PASS  %s\n' "$1"; }
bad()  { printf 'FAIL  %s\n' "$1"; fail=1; }
eq()   { if [[ "$3" == "$2" ]]; then pass "$1 ($3)"; else bad "$1 — 기대 [$2] 실측 [$3]"; fi; }
ge1()  { if [[ "$2" -ge 1 ]]; then pass "$1 ($2)"; else bad "$1 — 기대 ≥1 실측 $2"; fi; }
cntF() { grep -cF -- "$1" "$2" || true; }
cntE() { grep -cE -- "$1" "$2" || true; }
# 헤딩 $1 줄부터 다음 `^## ` 직전까지 (다음 ## 헤딩 미포함)
section() { awk -v h="$1" 'index($0,h)==1{f=1;print;next} f&&/^## /{exit} f' "$README"; }
# 헤딩 $1 줄부터 다음 `^##` 또는 `^---$` 직전까지
subsection() { awk -v h="$1" 'index($0,h)==1{f=1;print;next} f&&(/^##/||/^---$/){exit} f' "$README"; }

sim_boot() (
  iptables() {
    case " $* " in
      *" -D "*) echo "iptables: Bad rule (does a matching rule exist in that chain?)" >&2; return 1 ;;
    esac
  }
  wg()  { :; }
  nft() { :; }
  n=0
  while IFS= read -r l; do
    h="${l#PostUp = }"; h="${h//%i/wg0}"; n=$((n + 1))
    if ! (set -e; eval "$h") 2>/dev/null; then echo "HOOK-FAIL $h"; exit 1; fi
  done < <(awk '/<<.WG0_CONF_EOF./{f=1;next} /^WG0_CONF_EOF$/{f=0} f' "$STARTUP" | grep '^PostUp = ')
  echo "OK $n"
)

do_wg0() {
  echo "── wg0 ($STARTUP)"
  if bash -n "$STARTUP"; then pass "bash -n"; else bad "bash -n"; fi
  eq "부팅 모의: PostUp 17개 전부 성공" "OK 17" "$(sim_boot)"
  eq "PostUp/PostDown iptables -D 총 줄 수" 14 "$(cntE '^Post(Up|Down) = iptables -D ' "$STARTUP")"
  eq "그중 오류 무시 꼬리로 끝나는 줄" 14 "$(cntE '^Post(Up|Down) = iptables -D .*2>/dev/null \|\| true$' "$STARTUP")"
  eq "PostUp iptables -I 는 꼬리 없이 -j ACCEPT 로 끝난다 (삽입 실패는 숨기지 않음)" 7 \
     "$(cntE '^PostUp = iptables -I .* -j ACCEPT$' "$STARTUP")"
  eq "PostDown nft 줄 불변" 1 "$(cntF 'PostDown = nft delete table inet wgfwd || true' "$STARTUP")"
  if [[ "$STARTUP" == "$STARTUP_DEFAULT" ]]; then
    local changed
    changed=$(git diff -U0 "$BASE_REF" -- "$STARTUP" | grep -E '^[-+]' | grep -vE '^(\+\+\+|---) ' | grep -vE '^\+#' | wc -l | tr -d ' ')
    eq "startup.sh 비주석 변경 = 559행 한 줄 (-1 +1)" 2 "$changed"
    ge1 "§8.5 주석 가드에 사건 태그" "$(cntF "$TAG" "$STARTUP")"
  fi
}

do_docs() {
  echo "── docs ($README · $IAM)"
  # §구성 개요
  eq "구성 개요 머신 타입 행 = e2-small" 1 \
     "$(cntF '| 머신 타입 | `e2-small` (2 vCPU 공유 / 2048 MB · 보장 0.5코어)' "$README")"
  eq "머신 타입 행에 2026-09-26 전환 표기" 1 \
     "$(grep -F '| 머신 타입 | `e2-small`' "$README" | grep -cF '2026-09-26 전환' || true)"
  # §메모리 예산
  eq "메모리 예산 헤딩 1개" 1 "$(cntE '^## 메모리 예산 ' "$README")"
  eq "메모리 예산 헤딩이 e2-small · 2048 MB" 1 \
     "$(grep -E '^## 메모리 예산 ' "$README" | grep -F 'e2-small' | grep -cF '2048 MB' || true)"
  local mem; mem=$(section '## 메모리 예산 ')
  eq "메모리 예산: 옛 조건부 전환 문단 제거" 0 "$(printf '%s\n' "$mem" | grep -cF '압박이 실측되면' || true)"
  eq "메모리 예산: 합계 행 여유 2048 기준" 1 "$(printf '%s\n' "$mem" | grep -cF '1350–1640' || true)"
  eq "메모리 예산: 전환 문단 선두" 1 "$(printf '%s\n' "$mem" | grep -cF '**2026-09-26 e2-small 전환.**' || true)"
  eq "메모리 예산: set-machine-type 절차 유지" 1 "$(printf '%s\n' "$mem" | grep -cF 'set-machine-type radar-gw' || true)"
  ge1 "메모리 예산: 20:00 KST 이후 명시" "$(printf '%s\n' "$mem" | grep -cF '20:00' || true)"
  ge1 "메모리 예산: 0.22코어 · 0.25코어 근거" "$(printf '%s\n' "$mem" | grep -F '0.22코어' | grep -cF '0.25코어' || true)"
  ge1 "메모리 예산: 재기동 후 wg-quick@wg0 확인" "$(printf '%s\n' "$mem" | grep -cF 'wg-quick@wg0' || true)"
  # 날짜 박힌 과거 실측 행 불변
  eq "2026-09-05 머신 타입 실측 행 불변" 1 "$(cntF '| 존 / 머신 타입 | `asia-northeast3-a` / `e2-micro` | 2026-09-05T13:45Z |' "$README")"
  eq "2026-09-06 free -m 실측 행 불변" 1 "$(cntF '**여유. e2-small 전환 불필요** | 2026-09-06 |' "$README")"
  eq "9/22 netcut 부하 실측 줄 불변" 1 "$(cntF 'e2-micro 보장 0.25코어의 ≈10%' "$README")"
  # 런북 §2 불릿 · DOCKER-USER 검증 주석
  eq "재부팅 런북 §2 불릿 = e2-small" 1 "$(grep -F '패키지 8종 설치' "$README" | grep -cF 'e2-small' || true)"
  eq "DOCKER-USER 검증 주석 = ACCEPT 일곱 줄" 1 "$(cntF 'ACCEPT 일곱 줄' "$README")"
  # 막힐 때 행
  local stuck; stuck=$(subsection '### 막힐 때')
  eq "막힐 때: 재부팅 후 wg0 부재 행" 1 "$(printf '%s\n' "$stuck" | grep -cF '| (A) VM 재부팅 후 `wg0` 자체가 없음' || true)"
  eq "막힐 때: 그 행의 칸 구분 파이프 3개 (셀 안 파이프 금지)" 3 \
     "$(printf '%s\n' "$stuck" | grep -F '| (A) VM 재부팅 후 `wg0` 자체가 없음' | tr -cd '|' | wc -c | tr -d ' ')"
  # 교보 절 사건 기록
  local inc_h='### 사건 기록 — 2026-09-26 재부팅 시 wg0 기동 실패'
  eq "사건 기록 헤딩 1개" 1 "$(cntF "$inc_h" "$README")"
  local l_kyobo l_inc l_d03
  l_kyobo=$(grep -nF '## 교보 SecuwaySSL VPN' "$README" | head -1 | cut -d: -f1)
  l_inc=$(grep -nF "$inc_h" "$README" | head -1 | cut -d: -f1)
  l_d03=$(grep -nF '## D-03 VPN 선검증 체크리스트' "$README" | head -1 | cut -d: -f1)
  if [[ -n "$l_inc" && "$l_kyobo" -lt "$l_inc" && "$l_inc" -lt "$l_d03" ]]; then
    pass "사건 기록이 교보 절 안 ($l_kyobo < $l_inc < $l_d03)"
  else
    bad "사건 기록 위치 — 교보 절($l_kyobo)과 D-03($l_d03) 사이여야 함, 실측 [$l_inc]"
  fi
  local inc; inc=$(subsection "$inc_h")
  for k in 'c6d1594' 'quick-260921-or9' "$TAG" '10.16.207.119' 'wg-quick@wg0' 'setup-relay-iam.sh' '20:00' '반영 대기' 'ACCEPT 7줄'; do
    ge1 "사건 기록에 [$k]" "$(printf '%s\n' "$inc" | grep -cF -- "$k" || true)"
  done
  # setup-relay-iam.sh
  if bash -n "$IAM"; then pass "bash -n $IAM"; else bad "bash -n $IAM"; fi
  eq "VM create --machine-type 플래그 1개" 1 "$(cntF '--machine-type=' "$IAM")"
  eq "그 플래그 = e2-small" 1 "$(cntF '--machine-type=e2-small' "$IAM")"
  eq "creating VM 안내문 = e2-small" 1 "$(grep -F 'creating VM' "$IAM" | grep -cF 'e2-small' || true)"
  ge1 "헤더 D-07 에 2026-09-26 전환 주석" "$(cntF '2026-09-26' "$IAM")"
}

do_commit() {
  echo "── commit"
  local shas n sha
  shas=$(git log origin/master..HEAD --format=%H --grep="$TAG" --grep='^fix(' --all-match)
  n=$(printf '%s' "$shas" | grep -c . || true)
  eq "미push 로컬 코드 커밋 (fix, $TAG) 개수" 1 "$n"
  [[ "$n" == 1 ]] || return 0
  sha="$shas"
  eq "커밋 경로 = 정확히 3개" \
     "infra/relay/README.md infra/relay/startup.sh scripts/setup-relay-iam.sh" \
     "$(git show --name-only --format= "$sha" | sort | tr '\n' ' ' | sed 's/ $//')"
  eq "공동 저자 줄 없음" 0 "$(git log -1 --format=%B "$sha" | grep -ci 'co-authored-by' || true)"
  eq "제목에 한글 요지" 1 "$(git log -1 --format=%s "$sha" | grep -cF 'wg0 부팅 실패 수정' || true)"
}

case "${1:-all}" in
  wg0)    do_wg0 ;;
  docs)   do_docs ;;
  commit) do_commit ;;
  all)    do_wg0; do_docs
          if [[ -n "$(git log origin/master..HEAD --format=%H --grep="$TAG" --grep='^fix(' --all-match)" ]]; then do_commit; fi ;;
  *)      echo "usage: $0 {wg0|docs|commit|all}" >&2; exit 2 ;;
esac

if [[ "$fail" == 0 ]]; then echo "ALL PASS"; else echo "SOME FAILED"; exit 1; fi
