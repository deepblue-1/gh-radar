---
status: done
from: gh-trade
from_commit: b5a4a6ee
from_branch: master
date: 2026-10-12
fbs_sync_marker: e5b4fbca
done_commit: e14695c2
---
<!-- radar-handoff.sh 가 이 파일을 복사해 이중 중괄호 토큰을 치환한다. 처리한 gh-radar 세션은 status 를 done 으로 바꾸고 done_commit 을 채워 커밋한다(경로 지정 add). -->

# gh-trade → gh-radar 인계 — 2026-10-12

## 바뀐 것

MsgType 번호·필드·슬롯·의미 수준에서 무엇이 바뀌었는지 적는다(와이어 무변경이면 그렇게 적는다).

**와이어 무변경, 의미 변경.** 상따(LimitChaser) 후매수 「최대」 횟수 제한을 폐지했다(gh-trade quick-261012-ow7, 사용자 결정 「전부 무제한」).

- 서버는 이제 `post_buy_reentry`(C→S, vtable 120)를 **읽지 않는다**. 수동 후매수 재진입·후매수 ☐자동·줄매수 ☐자동 재체크가 모두 횟수 제한 없이 돈다.
- `post_buy_reentry_left`(S→C, vtable 128)는 서버가 더 채우지 않는다 — 에코에서 늘 0. 두 필드는 `.fbs` 주석에 `(deprecated)` 표시만 했고 필드·순서·타입·vtable 은 그대로다(생성 코드 무변경).
- 「후매수 소진」(PostBuyExhausted)·「줄매수 자동 — 재진입 0 → 자동 재체크 안 함」(AddBuyAutoEnd) 통지가 더는 나오지 않는다(enum 값은 남김). 후매수 재진입·줄매수 자동 재체크 사유 줄에서 「잔여 k회」「남은 재진입 N」 꼬리가 빠졌다.
- C# 클라 상따창·기본값 창에서 「최대 []회」 칸을 지웠다. 클라는 구 서버 호환으로 `post_buy_reentry = 255` 를 보낸다.
- 덤(와이어 무관): C# 체크박스 문구 「버스트 해제」 → 「버스트 취소」.

판정기가 걸린 파일:

- server/src/protocol/StockDMA.fbs

## gh-radar 가 할 일

생성물 재동기화(`RELAY=<gh-radar>/relay server/scripts/sync-relay-schema.sh`) 필요 여부 · relay 파서 · DB 마이그레이션 · 웹 중 무엇이 필요한지 적는다.

- 스키마 재동기화 불필요(주석만 바뀜 — 원하면 다음 sync 때 같이).
- 웹 `webapp/src/components/trading/lc/lc-fields.ts`: 후매수 「최대」 칸(`lc-post-buy-reentry`, 「최대 N회 · 남은 N회」 표시)과 줄매수 ☐자동 힌트의 「횟수는 후매수 「최대」 칸을 같이 써요」 문구를 지우거나 「무제한」 으로 고치는 것을 권한다. 웹이 아무 값을 보내도 서버는 무시하므로 급하지 않다(구 서버 호환이 필요하면 255 를 보내면 사실상 무제한).
- 「버스트 해제」 표기를 C# 과 맞추려면 「버스트 취소」 로(선택).
- relay 파서·DB 마이그레이션 없음.

## 배포 순서 제약

gh-trade 서버 먼저 배포가 안전한가: 예 — 와이어 무변경이고 서버가 칸 값을 무시할 뿐이라 어느 순서든 안전하다.

gh-radar 쪽 순서는 항상 DB → relay → webapp 이고, push 가 곧 webapp 프로덕션 배포다.

## 확인 방법

처리 뒤 무엇을 보면 맞게 된 것인지(로그 줄·웹 화면·relay 응답) 적는다.

서버 배포 뒤 상따 로그에 「후매수 소진」이 더는 안 찍히고, 후매수 재진입 줄이 `[LimitChaser] 후매수 재진입 isin=… 발동잔량 재계산 — 미체결 0 · 보유 0` 꼴(잔여 없음)인지. 웹에서 「최대」 칸을 지웠다면 상따 카드에 칸이 없는지.

## 질문

gh-radar 쪽에 묻고 싶은 것, 결정이 필요한 것을 적는다(없으면 「없음」).

없음
