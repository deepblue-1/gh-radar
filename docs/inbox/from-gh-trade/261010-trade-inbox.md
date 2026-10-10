---
status: done
from: gh-trade
from_commit: 3a6cfd79
from_branch: master
date: 2026-10-10
fbs_sync_marker: 88fc746d
done_commit: 3a0870ee
---
<!-- radar-handoff.sh 가 이 파일을 복사해 이중 중괄호 토큰을 치환한다. 처리한 gh-radar 세션은 status 를 done 으로 바꾸고 done_commit 을 채워 커밋한다(경로 지정 add). -->

# gh-trade → gh-radar 인계 — 2026-10-10 · 역방향 인박스(gh-radar → gh-trade 작업 요청) gh-radar 쪽 짝 설치 요청

## 바뀐 것

**와이어 무변경** — `StockDMA.fbs`·relay·DB 모두 그대로다. 절차 문서만 바뀌었다(gh-trade quick-261010-t4o, 커밋 0f3a8225·28788cc7·7f96b2fe, master 3a6cfd79 에 병합·push 됨).

사용자 지시(2026-10-10): 지금까지 gh-trade → gh-radar 로만 있던 파일 기반 인계(이 인박스, ⑥)를 **반대 방향으로도** 쓸 수 있게 한다. gh-radar 세션이 gh-trade 에 바라는 일(서버 동작 · StockDMA.fbs 필드 · 주문로그 · 배포)을 **gh-trade 인박스 파일**로 요청하고, gh-trade 세션은 세션·작업 시작 때 그 노트부터 읽는다. 파일이 정본, SendMessage 는 보조 — 이 인박스와 같은 원칙이다.

gh-trade 쪽은 이미 끝났다:

- `gh-trade/docs/inbox/from-gh-radar/README.md` — 노트 형식의 **gh-trade 쪽 정본**(이 디렉터리 README 의 거울). 프론트매터 7키 `status · from: gh-radar · from_commit · from_branch · date · fbs_sync_marker · done_commit`, 본문 5절 `요청 내용 · gh-trade 가 할 일 · 배포 순서 제약 · 확인 방법 · 질문`.
- gh-trade 루트 `CLAUDE.md` 「작업 규칙」 — 「gh-radar 작업 요청 수신」 불릿(세션·작업 시작 때 `status: open` 노트부터 읽는다 → 처리하면 `status: done`·`done_commit` → 경로 지정 커밋).
- `gh-trade/docs/ops/workflow.md` ⑦ — 전문(두 층 · 키 · 처리 규칙 · gh-radar 쪽 짝 · 한계).

판정기가 걸린 파일:

- (판정기 0건 — 수동 인계)

## gh-radar 가 할 일

gh-radar 저장소에 **세 가지**를 만든다(⑥ 의 `radar-handoff.sh`·템플릿·CLAUDE.md 불릿의 거울). 아래에 완성본을 넣었으니 그대로 놓으면 된다 — 셋 다 gh-radar GSD(`/gsd-quick` 등) 안에서, 경로 지정 add 로 한 커밋.

1. **생성기 `scripts/trade-handoff.sh`** (아래 ① 전문, `chmod +x`). gh-trade `server/scripts/radar-handoff.sh` 와 같은 구조다 — 환경변수 `TRADE` 우선, 기본은 메인 체크아웃의 형제 `../gh-trade`; 템플릿을 읽어 4토큰(`{{DATE}}`·`{{FROM_COMMIT}}`·`{{FROM_BRANCH}}`·`{{FBS_SYNC_MARKER}}`) 치환; `<gh-trade>/docs/inbox/from-gh-radar/YYMMDD-<slug>.md` 에 임시 파일 + `mv`; 이미 있으면 exit 1; 커밋 안 함. `fbs_sync_marker` 는 `relay/src/generated/StockDMA.fbs` SYNC MARKER 의 `server-repo-commit`(CRLF 라 `\r` 제거) — gh-trade 가 "gh-radar 는 어느 정본까지 와 있나" 를 바로 알게. gh-trade 쪽에서 가짜 저장소로 자가 시험 통과(정상 생성 0 · 중복 1 · slug 불량 64).
2. **템플릿 `docs/inbox/trade-handoff-template.md`** (아래 ② 전문). 위치는 gh-radar 에 `docs/ops/` 가 없어 `docs/inbox/` 로 두었다 — 다른 곳이 낫다면 옮기고 스크립트 ③ 의 `TEMPLATE=` 한 줄만 맞춘다. **프론트매터 7키는 gh-trade README 와 같아야 한다**(바뀌면 양쪽을 함께 고친다).
3. **gh-radar `CLAUDE.md` 「gh-trade 인박스」 절에 불릿 하나** (아래 ③). 기존 절(읽는 쪽 규칙) 바로 아래에 쓰는 쪽 규칙을 붙인다.

### ① `scripts/trade-handoff.sh`

```bash
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
```

### ② `docs/inbox/trade-handoff-template.md`

````markdown
---
status: open
from: gh-radar
from_commit: {{FROM_COMMIT}}
from_branch: {{FROM_BRANCH}}
date: {{DATE}}
fbs_sync_marker: {{FBS_SYNC_MARKER}}
done_commit:
---
<!-- trade-handoff.sh 가 이 파일을 복사해 이중 중괄호 토큰을 치환한다. 처리한 gh-trade 세션은 status 를 done 으로 바꾸고 done_commit 을 채워 커밋한다(경로 지정 add). -->

# gh-radar → gh-trade 작업 요청 — {{DATE}}

## 요청 내용

무엇이 왜 필요한가 — 서버 동작 · StockDMA.fbs 필드 · 주문로그 · 배포. 웹·relay 의 어느 화면·경로가 막혀 있는지 적는다.

TODO: 요청 내용을 적는다.

## gh-trade 가 할 일

서버 코드 · .fbs(→ `sync-client-schema.sh`·`sync-relay-schema.sh`) · 문서 · 배포 중 무엇이 필요한지 적는다.

TODO: gh-trade 가 할 일을 적는다.

## 배포 순서 제약

gh-radar 먼저 배포가 안전한가: TODO

gh-trade 는 cloud-verify.sh 게이트 뒤 deploy.sh <broker> <env> 로 KB 120·121·교보 119 를 장 마감 뒤 배포한다.

## 확인 방법

처리 뒤 무엇을 보면 맞게 된 것인지(서버 로그 줄 · relay 응답 · 웹 화면) 적는다.

TODO: 확인 방법을 적는다.

## 질문

gh-trade 쪽에 묻고 싶은 것, 결정이 필요한 것을 적는다(없으면 「없음」).

TODO: 질문을 적는다.
````

### ③ gh-radar `CLAUDE.md` 「gh-trade 인박스」 절에 추가할 불릿

```markdown
- **gh-trade 에 일을 요청할 때**(서버 동작 · StockDMA.fbs 필드 · 주문로그 · 배포): `scripts/trade-handoff.sh <slug>` 가 `<gh-trade>/docs/inbox/from-gh-radar/YYMMDD-<slug>.md` 를 만든다 → 본문 TODO 를 채운다 → ListAgents 로 찾은 gh-trade 세션에 경로를 SendMessage(보조 — 파일이 정본). 노트 커밋은 처리하는 gh-trade 세션이 한다. 형식 정본은 gh-trade `docs/inbox/from-gh-radar/README.md`, 전문은 gh-trade `docs/ops/workflow.md` ⑦.
```

## 배포 순서 제약

gh-trade 서버 먼저 배포가 안전한가: **해당 없음** — 서버·relay·웹 코드 무변경, 절차 문서·스크립트만.

gh-radar 쪽 순서는 항상 DB → relay → webapp 이고, push 가 곧 webapp 프로덕션 배포다(이번 건은 webapp 산출물에 영향 없음 — `scripts/`·`docs/`·`CLAUDE.md` 뿐).

## 확인 방법

- gh-radar 루트에서 `TRADE=/tmp/trade-selftest bash scripts/trade-handoff.sh selftest` → `/tmp/trade-selftest/docs/inbox/from-gh-radar/<YYMMDD>-selftest.md` 가 생기고 프론트매터 `from: gh-radar`·`fbs_sync_marker` 가 relay 생성물 마커(지금 88fc746d)와 같다. 한 번 더 돌리면 `이미 있다` exit 1. 끝나면 `/tmp/trade-selftest` 삭제.
- 실전 첫 사용: 실제 요청이 생기면 `scripts/trade-handoff.sh <slug>` → `gh-trade/docs/inbox/from-gh-radar/` 에 노트 → gh-trade 세션(ListAgents 의 `gh-trade-*`)에 경로 SendMessage. gh-trade 세션이 처리하고 `status: done` 으로 바꿔 커밋한다.

## 질문

- 템플릿 위치 `docs/inbox/trade-handoff-template.md` 가 gh-radar 관례에 맞는지 — 다른 곳이면 옮기고 스크립트 `TEMPLATE=` 만 바꾸면 된다. 그 외 「없음」.
