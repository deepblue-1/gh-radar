---
status: open
from: gh-trade
from_commit: 7917a6fe
from_branch: master
date: 2026-11-04
fbs_sync_marker: e96aef6e
done_commit:
---
<!-- radar-handoff.sh 가 이 파일을 복사해 이중 중괄호 토큰을 치환한다. 처리한 gh-radar 세션은 status 를 done 으로 바꾸고 done_commit 을 채워 커밋한다(경로 지정 add). -->

# gh-trade → gh-radar 인계 — 2026-11-04

## 바뀐 것

MsgType 번호·필드·슬롯·의미 수준에서 무엇이 바뀌었는지 적는다(와이어 무변경이면 그렇게 적는다).

**와이어 무변경** — MsgType·슬롯·필드·타입 그대로, `.fbs` 는 `//` 주석만 바뀌었다(gh-trade 81e06f92, quick-261104-d6w).

의미가 바뀐 곳은 90 AccumChartResp 둘:

- `orders[]` — 옛 「500만원 이상 팀 주문만」(Phase 39 D-20) → **금액 하한 없이 팀 주문 전부**. 상한 2,048 · 넘침 `dropped_orders` 는 그대로라 활발한 종목은 넘침이 잦아진다.
- `samples[]` — 옛 「등록 판정 주문부터」 → 등록 전 구간도 **이 사이클 첫 팀 주문부터** 10초 칸이 채워진다(발표 때 빈 칸만, 값 규칙은 등록 뒤 칸과 같음).

88·89·kind 16·accum_events·accum_flow(`teamflow_accum.py` `ORDER_MIN_KRW = 5_000_000`) 는 무변경.

판정기가 걸린 파일:

- server/src/protocol/StockDMA.fbs (주석만)
- server/docs/protocol.md (90 행 설명)

## gh-radar 가 할 일

생성물 재동기화(`RELAY=<gh-radar>/relay server/scripts/sync-relay-schema.sh`) 필요 여부 · relay 파서 · DB 마이그레이션 · 웹 중 무엇이 필요한지 적는다.

필수 작업 없음. relay 생성물 재동기화는 주석 차이뿐이라 선택(다음 동기화 때 함께). gh-radar 가 45/90 을 요청해 `orders[]` 를 「500만+」 로 가정하는 화면·문구가 있으면 그 문구만 고치면 된다.

## 배포 순서 제약

gh-trade 서버 먼저 배포가 안전한가: 예 — 와이어 무변경(서버 아직 미배포, 장 마감 뒤 예정)

gh-radar 쪽 순서는 항상 DB → relay → webapp 이고, push 가 곧 webapp 프로덕션 배포다.

## 확인 방법

처리 뒤 무엇을 보면 맞게 된 것인지(로그 줄·웹 화면·relay 응답) 적는다.

gh-trade 서버 배포 뒤 90 응답의 `orders[].krw` 에 500만 미만 값이 보이면 새 서버다.

## 질문

gh-radar 쪽에 묻고 싶은 것, 결정이 필요한 것을 적는다(없으면 「없음」).

없음
