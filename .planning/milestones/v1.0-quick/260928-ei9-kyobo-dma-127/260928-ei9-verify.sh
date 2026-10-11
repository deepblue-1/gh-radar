#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# quick-260928-ei9 검증 하네스 — 읽기 전용 (VM·gcloud·ssh·sudo 호출 0)
#
#   bash 260928-ei9-verify.sh rules    # startup.sh §8 교보 .127 대칭 + wg0.conf PostUp 부팅 모의
#   bash 260928-ei9-verify.sh docs     # README · securwayssl.service 헤더 · watchdog 불변
#   bash 260928-ei9-verify.sh commit   # 코드 커밋 1건 · 경로 3개 · 공동저자 줄 없음
#   bash 260928-ei9-verify.sh all      # rules + docs (+ 커밋이 있으면 commit)
#
# 부팅 모의는 quick-260926-bwu 하네스의 sim_boot 를 그대로 옮겼다: wg0.conf heredoc 의
#   PostUp 을 wg-quick 처럼 한 줄씩 `(set -e; eval)` 로 돌리고, 부팅 직후처럼 iptables -D 는
#   전부 실패 · -I 는 성공시킨다. PostUp 하나만 실패해도 wg-quick 은 wg0 를 지운다.
# 대칭 게이트: 기준 커밋(BASE_REF) 대비 비주석 변경은 「2원소 교보 세트 5줄 → 3원소」 +
#   「.119 iptables 6줄의 .127 거울」 뿐이어야 한다 (KB tun0 · 10.41.1.x 규칙 불변).
# STARTUP= · README= · UNIT= 로 대상 파일을 바꿀 수 있다(모의 편집 검증용). 기준은 항상 BASE_REF.
# 실패는 FAIL 줄 + 마지막에 exit 1. 통과는 PASS 줄.
# ═══════════════════════════════════════════════════════════════
set -uo pipefail
ROOT="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
cd "$ROOT"

BASE_REF="${BASE_REF:-136d4d87}"        # 계획 시점 HEAD — 이후 커밋과 무관하게 조상으로 남는다
S_DEF=infra/relay/startup.sh
R_DEF=infra/relay/README.md
U_DEF=infra/relay/secuway/securwayssl.service
WD=infra/relay/secuway/secuway-watchdog
STARTUP="${STARTUP:-$S_DEF}"
README="${README:-$R_DEF}"
UNIT="${UNIT:-$U_DEF}"
TAG=quick-260928-ei9
K3='{ 10.16.207.112, 10.16.207.119, 10.16.207.127 }'
K2='{ 10.16.207.112, 10.16.207.119 }'

fail=0
pass() { printf 'PASS  %s\n' "$1"; }
bad()  { printf 'FAIL  %s\n' "$1"; fail=1; }
eq()   { if [[ "$3" == "$2" ]]; then pass "$1 ($3)"; else bad "$1 — 기대 [$2] 실측 [$3]"; fi; }
ge1()  { if [[ "$2" -ge 1 ]]; then pass "$1 ($2)"; else bad "$1 — 기대 ≥1 실측 $2"; fi; }
cntF() { grep -cF -- "$1" "$2" || true; }
cntE() { grep -cE -- "$1" "$2" || true; }
body() { grep -v '^[[:space:]]*#' "$STARTUP"; }                 # 비주석 줄
# 헤딩 $1 줄부터 다음 `^##` 또는 `^---$` 직전까지 ($2 = 파일)
subsec() { awk -v h="$1" 'index($0,h)==1{f=1;print;next} f&&(/^##/||/^---$/){exit} f' "$2"; }
BASE_TMP="$(mktemp -d)"; trap 'rm -rf "$BASE_TMP"' EXIT
git show "$BASE_REF:$S_DEF" >"$BASE_TMP/startup.sh"
git show "$BASE_REF:$R_DEF" >"$BASE_TMP/README.md"
git show "$BASE_REF:$U_DEF" >"$BASE_TMP/unit"

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

do_rules() {
  echo "── rules ($STARTUP)"
  if bash -n "$STARTUP"; then pass "bash -n"; else bad "bash -n"; fi
  eq "부팅 모의: PostUp 21개 전부 성공 (기존 17 + .127 4)" "OK 21" "$(sim_boot)"
  eq "PostUp/PostDown iptables -D 총 줄 수 (9 + 9)" 18 "$(cntE '^Post(Up|Down) = iptables -D ' "$STARTUP")"
  eq "그중 오류 무시 꼬리로 끝나는 줄" 18 "$(cntE '^Post(Up|Down) = iptables -D .*2>/dev/null \|\| true$' "$STARTUP")"
  eq "PostUp iptables -I 는 꼬리 없이 -j ACCEPT 로 끝난다" 9 "$(cntE '^PostUp = iptables -I .* -j ACCEPT$' "$STARTUP")"
  eq "PostDown nft 줄 불변" 1 "$(cntF 'PostDown = nft delete table inet wgfwd || true' "$STARTUP")"
  eq "비주석 .119 줄 수 불변" 11 "$(body | grep -c '10\.16\.207\.119' || true)"
  eq "비주석 .127 줄 수 = .119 와 같음" 11 "$(body | grep -c '10\.16\.207\.127' || true)"
  eq "nft 3원소 세트 (MSS 2 · accept 1 · established 1 · masquerade 1)" 5 "$(cntF "$K3" "$STARTUP")"
  eq "2원소 세트 잔존" 0 "$(cntF "$K2" "$STARTUP")"
  local a b
  a=$(body | grep '10\.16\.207\.119' | grep -v '10\.16\.207\.127' | sed 's/10\.16\.207\.119/10.16.207.127/g')
  b=$(body | grep '10\.16\.207\.127' | grep -v '10\.16\.207\.119')
  if [[ -n "$b" && "$a" == "$b" ]]; then
    pass ".127 iptables 줄 = .119 줄의 정확한 거울 (순서 포함, $(printf '%s\n' "$b" | grep -c .)줄)"
  else
    bad ".127 iptables 줄이 .119 줄의 거울이 아니다"; diff <(printf '%s\n' "$a") <(printf '%s\n' "$b") | sed 's/^/      /'
  fi
  # 기준 대비 비주석 변경 범위
  local d rm add
  d=$(diff -U0 "$BASE_TMP/startup.sh" "$STARTUP" | grep -E '^[-+]' | grep -vE '^(\+\+\+|---) ')
  rm=$(printf '%s\n' "$d" | grep '^-' | grep -v '^-[[:space:]]*#' || true)
  add=$(printf '%s\n' "$d" | grep '^+' | grep -v '^+[[:space:]]*#' || true)
  eq "기준 대비 비주석 삭제 줄 = 2원소 세트 5줄뿐" "5 5" \
     "$(printf '%s\n' "$rm" | grep -c . || true) $(printf '%s\n' "$rm" | grep -cF "$K2" || true)"
  eq "기준 대비 비주석 추가 줄 = .127 포함 11줄뿐" "11 11" \
     "$(printf '%s\n' "$add" | grep -c . || true) $(printf '%s\n' "$add" | grep -c '10\.16\.207\.127' || true)"
  ge1 "§8 주석에 태그 $TAG" "$(cntF "$TAG" "$STARTUP")"
  eq "§8 헤더 주석 AllowedIPs 문구 = 세 /32" 1 "$(cntF 'AllowedIPs 에 세 /32 를 더해야 한다' "$STARTUP")"
}

do_docs() {
  echo "── docs ($README · $UNIT)"
  local row; row=$(grep -F '| 도달 대상 |' "$README")
  eq "도달 대상 행 1개" 1 "$(printf '%s\n' "$row" | grep -c . || true)"
  eq "도달 대상 행에 10.16.207.127" 1 "$(printf '%s\n' "$row" | grep -cF '10.16.207.127' || true)"
  eq "도달 대상 행 = 로그인 응답 라우트 표기" 1 "$(printf '%s\n' "$row" | grep -cF '로그인 응답' || true)"
  eq "도달 대상 행에 옛 푸시 표기 없음" 0 "$(printf '%s\n' "$row" | grep -cF '서버 푸시' || true)"
  eq "도달 대상 행 칸 구분 파이프 3개 (셀 안 파이프 금지)" 3 "$(printf '%s' "$row" | tr -cd '|' | wc -c | tr -d ' ')"
  eq "도달성 루프 = 세 호스트" 1 "$(cntF 'for h in 10.16.207.112 10.16.207.119 10.16.207.127; do' "$README")"
  eq "옛 두 호스트 루프 잔존" 0 "$(cntF 'for h in 10.16.207.112 10.16.207.119; do' "$README")"
  eq "DOCKER-USER 검증 주석 = ACCEPT 아홉 줄" 1 "$(cntF 'ACCEPT 아홉 줄이 있어야 한다' "$README")"
  eq "옛 일곱 줄 주석 잔존" 0 "$(cntF 'ACCEPT 일곱 줄' "$README")"
  eq "아홉 줄 주석이 교보 3호스트 · 응답 3 을 나열" 1 \
     "$(grep -F 'ACCEPT 아홉 줄' "$README" | grep -F '112·119·127' | grep -cF '교보 응답 3' || true)"
  # 추가 절차 소절
  local add_h='### DMA 서버 추가 절차' inc_h='### 사건 기록 — 2026-09-26 재부팅 시 wg0 기동 실패'
  eq "추가 절차 소절 헤딩 1개" 1 "$(grep -c "^$add_h" "$README" || true)"
  local l_k l_a l_i
  l_k=$(grep -nF '## 교보 SecuwaySSL VPN' "$README" | head -1 | cut -d: -f1)
  l_a=$(grep -n "^$add_h" "$README" | head -1 | cut -d: -f1)
  l_i=$(grep -nF "$inc_h" "$README" | head -1 | cut -d: -f1)
  if [[ -n "$l_a" && -n "$l_k" && -n "$l_i" && "$l_k" -lt "$l_a" && "$l_a" -lt "$l_i" ]]; then
    pass "추가 절차 소절이 교보 절 안 · 사건 기록 앞 ($l_k < $l_a < $l_i)"
  else
    bad "추가 절차 소절 위치 — 교보 절($l_k)과 사건 기록($l_i) 사이여야 함, 실측 [$l_a]"
  fi
  local sub; sub=$(subsec "$add_h" "$README")
  for k in '로그인 응답' 'systemctl restart securwayssl.service' 'ACL' 'nft -f' 'DOCKER-USER' \
           'startup-script' 'AllowedIPs' 'wg-quick down' 'syncconf' "$TAG"; do
    ge1 "추가 절차에 [$k]" "$(printf '%s\n' "$sub" | grep -cF -- "$k" || true)"
  done
  # 역사 기록 불변
  if [[ "$(subsec "$inc_h" "$README")" == "$(subsec "$inc_h" "$BASE_TMP/README.md")" ]]; then
    pass "2026-09-26 사건 기록 소절 바이트 불변"
  else
    bad "2026-09-26 사건 기록 소절이 바뀌었다 (역사 기록은 고치지 않는다)"
  fi
  # securwayssl.service — 헤더 주석만
  ge1 "unit 헤더에 .127" "$(cntF '10.16.207.112/.119/.127' "$UNIT")"
  ge1 "unit 헤더에 태그 $TAG" "$(cntF "$TAG" "$UNIT")"
  ge1 "unit 헤더에 재접속 시에만 갱신 문구 (systemctl restart securwayssl)" \
      "$(grep '^#' "$UNIT" | grep -cF 'systemctl restart securwayssl' || true)"
  if diff -q <(grep -v '^#' "$BASE_TMP/unit") <(grep -v '^#' "$UNIT") >/dev/null; then
    pass "unit 비주석 본문 바이트 불변"
  else
    bad "unit 비주석 본문이 바뀌었다 (주석만 고친다)"
  fi
  # 건드리지 않는 자산
  if git diff --quiet "$BASE_REF" -- "$WD"; then pass "secuway-watchdog 불변"; else bad "secuway-watchdog 가 바뀌었다"; fi
  eq "watchdog HOST = .112 유지" 1 "$(cntF 'HOST=10.16.207.112' "$WD")"
}

do_commit() {
  echo "── commit"
  local shas n sha
  shas=$(git log "$BASE_REF"..HEAD --format=%H --grep="$TAG" --grep='^feat(' --all-match)
  n=$(printf '%s' "$shas" | grep -c . || true)
  eq "코드 커밋 (feat, $TAG) 개수" 1 "$n"
  [[ "$n" == 1 ]] || return 0
  sha="$shas"
  eq "커밋 경로 = 정확히 3개" \
     "infra/relay/README.md infra/relay/secuway/securwayssl.service infra/relay/startup.sh" \
     "$(git show --name-only --format= "$sha" | sort | tr '\n' ' ' | sed 's/ $//')"
  eq "공동 저자 줄 없음" 0 "$(git log -1 --format=%B "$sha" | grep -ci 'co-authored-by' || true)"
  eq "제목에 10.16.207.127" 1 "$(git log -1 --format=%s "$sha" | grep -cF '10.16.207.127' || true)"
}

case "${1:-all}" in
  rules)  do_rules ;;
  docs)   do_docs ;;
  commit) do_commit ;;
  all)    do_rules; do_docs
          if [[ -n "$(git log "$BASE_REF"..HEAD --format=%H --grep="$TAG" --grep='^feat(' --all-match)" ]]; then do_commit; fi ;;
  *)      echo "usage: $0 {rules|docs|commit|all}" >&2; exit 2 ;;
esac

if [[ "$fail" == 0 ]]; then echo "ALL PASS"; else echo "SOME FAILED"; exit 1; fi
