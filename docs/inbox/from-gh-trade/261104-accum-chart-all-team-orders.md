---
status: open
from: gh-trade
from_commit: 1627736b
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

88·89·kind 16·accum_events 는 무변경.

**accum_flow(limitup_accum_flow) `payload.orders` 도 같이 바뀐다**(gh-trade 1627736b, 사용자 결정 2026-11-04):

- 옛 「500만원 이상 ∪ `first=1`」 → **팀 주문 전부**(금액 하한 없음). 키·열 구성(`t_ms`·`side`·`qty`·`val`·`px`·`pieces`·`first`)과 `first` 뜻(사이클 창마다 첫 팀 매수)은 그대로, `ORDER_MIN_KRW` 상수는 지웠다. schema_version 무변경.
- 원 개수가 늘어 payload 가 커진다(0/0 단독 소액 주문까지 — 활발한 종목은 수천 건 가능). 119 분석기 배포 전이라 아직 export 에는 반영 안 됐다.

판정기가 걸린 파일:

- server/src/protocol/StockDMA.fbs (주석만)
- server/docs/protocol.md (90 행 설명)

## gh-radar 가 할 일

생성물 재동기화(`RELAY=<gh-radar>/relay server/scripts/sync-relay-schema.sh`) 필요 여부 · relay 파서 · DB 마이그레이션 · 웹 중 무엇이 필요한지 적는다.

- relay 생성물 재동기화: 주석 차이뿐이라 선택(다음 동기화 때 함께).
- 웹 문구: 「500만원 이상 팀 주문」 을 쓰는 곳 — `webapp/src/components/analytics/accum-detail.tsx:409`(차트 안내)·`:67` 주석, `webapp/src/lib/accum-report.ts:574`·`:598`(본문 문구)·`:569` 주석 → 「팀 주문 전부(크기 = 금액) + 사이클마다 첫 팀 매수」 로.
- 원 수 증가 대비: accum 차트 SVG 원 그리기 비용·payload 크기(행당 바이트)·적재 한도가 있으면 확인. 필요하면 화면에서 작은 원을 줄이거나 묶는 건 gh-radar 판단.
- 옛 export 행(500만+ 만 실린 날)은 재생성 전까지 그대로 — 섞여 보여도 정상.

## 배포 순서 제약

gh-trade 서버 먼저 배포가 안전한가: 예 — 와이어 무변경(서버 아직 미배포, 장 마감 뒤 예정)

gh-radar 쪽 순서는 항상 DB → relay → webapp 이고, push 가 곧 webapp 프로덕션 배포다.

## 확인 방법

처리 뒤 무엇을 보면 맞게 된 것인지(로그 줄·웹 화면·relay 응답) 적는다.

gh-trade 서버 배포 뒤 90 응답의 `orders[].krw` 에 500만 미만 값이 보이면 새 서버다. accum_flow 는 119 분석기 배포 뒤 그날 export 행의 `payload.orders.val` 에 500만 미만이 `first=0` 으로 섞이면 새 배치다.

## 질문

gh-radar 쪽에 묻고 싶은 것, 결정이 필요한 것을 적는다(없으면 「없음」).

없음
