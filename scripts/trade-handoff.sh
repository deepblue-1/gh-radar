#!/usr/bin/env bash
# trade-handoff.sh — gh-trade 작업 요청 노트 생성기 (gh-trade quick-261010-t4o 의 gh-radar 쪽 짝)
#
# 목적: gh-radar 가 gh-trade 에 바라는 일(서버 동작 · StockDMA.fbs 필드 · 주문로그 · 배포)을 **gh-trade 인박스 파일**로 전달한다.
#       파일이 정본이고 세션 메시지(SendMessage)는 보조 알림이다 — 세션이 죽어도 파일은 남고, 어느 gh-trade 세션이 집어도
#       처리할 수 있으며 처리 여부(status/done_commit)가 남는다. gh-trade `server/scripts/radar-handoff.sh` 의 거울이다.
# 사용법:
#   scripts/trade-handoff.sh <slug>                  # slug 는 ^[a-z0-9-]{1,40}$ (예: kind15-snap-len)
#   TRADE=<gh-trade 경로> scripts/trade-handoff.sh <slug>   # gh-trade 위치 지정 (자가 시험용)
#   생성물: <gh-trade>/docs/inbox/from-gh-radar/YYMMDD-<slug>.md — docs/inbox/trade-handoff-template.md 의 4토큰을 치환한 것.
# gh-trade 위치 규칙: 환경변수 TRADE 가 우선. 기본은 `git rev-parse --git-common-dir` 로 구한 **메인 체크아웃** 루트의 부모 + /gh-trade
#       — worktree 에서 돌려도 같은 형제 repo 를 가리킨다.
# 종료 코드: 0 = 생성 · 1 = gh-trade 디렉터리/템플릿 없음 · 대상 파일이 이미 있음(덮어쓰지 않는다) · 64 = 사용법(slug 불량).
# 커밋은 하지 않는다 — 노트 커밋은 처리하는 gh-trade 세션이 한다(경로 지정 add). 이 스크립트는 gh-radar 트리에 아무것도 쓰지 않는다.
# 왜 임시 파일 + mv 인가: 쓰다 만 노트가 남의 커밋에 휩쓸리지 않게 같은 디렉터리의 임시 파일에 다 쓴 뒤 mv 로 한 번에 놓는다
#       (같은 파일시스템이라 원자적).
# bash 3.2 호환(macOS 기본) — 연관 배열·mapfile 을 쓰지 않는다.

set -euo pipefail
# bash 5.2+ 는 패턴 치환의 replacement 에서 `&` 를 특수 취급한다 — 끈다(3.2 는 옵션이 없어 무시).
shopt -u patsub_replacement 2>/dev/null || true

usage() {
  echo "사용법: $0 <slug>      (slug: ^[a-z0-9-]{1,40}$, 예: kind15-snap-len)" >&2
  echo "  TRADE=<gh-trade 경로> 로 위치를 바꿀 수 있다 (기본: 메인 체크아웃의 형제 ../gh-trade)" >&2
}

# ① 인자 — slug 1개, 디렉터리 탈출·공백 차단
if [ $# -ne 1 ] || ! printf '%s' "$1" | grep -Eq '^[a-z0-9-]{1,40}$'; then
  usage
  exit 64
fi
SLUG="$1"

# ② 트리 루트 · 메인 체크아웃 루트 · gh-trade 위치
ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || { echo "git 저장소가 아니다" >&2; exit 1; }
cd "$ROOT"
# 반드시 cd "$ROOT" 뒤에 계산한다 — 메인 체크아웃에서는 --git-common-dir 가 상대경로(.git)로 나온다.
MAIN_ROOT=$(cd "$(git rev-parse --git-common-dir)/.." && pwd)
TRADE="${TRADE:-$(dirname "$MAIN_ROOT")/gh-trade}"
if [ ! -d "$TRADE" ]; then
  echo "gh-trade 디렉터리가 없다: $TRADE (TRADE=<경로> 로 지정할 수 있다)" >&2
  exit 1
fi

# ③ 템플릿 — 현재 트리 루트 기준
TEMPLATE="$ROOT/docs/inbox/trade-handoff-template.md"
if [ ! -f "$TEMPLATE" ]; then
  echo "템플릿이 없다: $TEMPLATE" >&2
  exit 1
fi

# ④ 값 수집
DATE=$(date +%Y-%m-%d)
YMD=$(date +%y%m%d)
FROM_COMMIT=$(git rev-parse --short HEAD)
FROM_BRANCH=$(git rev-parse --abbrev-ref HEAD)

# gh-radar 가 어느 gh-trade 정본까지 동기화돼 있는지 — relay 생성물 SYNC MARKER 의 server-repo-commit (CRLF 라 \r 제거 필수)
MARKER_FILE="$ROOT/relay/src/generated/StockDMA.fbs"
FBS_SYNC_MARKER=$(grep -m1 '^// server-repo-commit:' "$MARKER_FILE" 2>/dev/null | awk '{print $NF}' | tr -d '\r' || true)
[ -n "$FBS_SYNC_MARKER" ] || FBS_SYNC_MARKER="none"

# ⑤ 치환 — sed 가 아니라 bash 패턴 치환(경로·슬래시·개행이 들어가도 안전). $(cat) 이 끝 개행을 지우므로 쓸 때 printf '%s\n'.
CONTENT=$(cat "$TEMPLATE")
CONTENT=${CONTENT//"{{DATE}}"/$DATE}
CONTENT=${CONTENT//"{{FROM_COMMIT}}"/$FROM_COMMIT}
CONTENT=${CONTENT//"{{FROM_BRANCH}}"/$FROM_BRANCH}
CONTENT=${CONTENT//"{{FBS_SYNC_MARKER}}"/$FBS_SYNC_MARKER}

# ⑥ 대상 — 이미 있으면 덮어쓰지 않는다(임시 파일을 만들기 전에 검사)
INBOX="$TRADE/docs/inbox/from-gh-radar"
mkdir -p "$INBOX"
DEST="$INBOX/$YMD-$SLUG.md"
if [ -e "$DEST" ]; then
  echo "이미 있다: $DEST — 덮어쓰지 않는다 (다른 slug 를 쓰거나 기존 노트에 덧붙인다)" >&2
  exit 1
fi

# ⑦ 임시 파일 + mv
TMP="$INBOX/.$YMD-$SLUG.md.tmp.$$"
trap 'rm -f "$TMP"' EXIT
printf '%s\n' "$CONTENT" > "$TMP"
mv "$TMP" "$DEST"

# ⑧ 안내 — 커밋은 하지 않는다
echo "$DEST"
echo "다음: 본문의 TODO 를 채우고, ListAgents 로 gh-trade 세션을 찾아 이 경로를 SendMessage 로 보낸다. 커밋은 처리하는 gh-trade 세션이 한다(경로 지정 add)."
exit 0
