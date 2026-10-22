---
status: done
from: gh-trade
from_commit: 51dfc74c
from_branch: master
date: 2026-10-22
fbs_sync_marker: 9eb71e84
done_commit: none   # 할 일 없음 — relay·webapp 비생성 코드에 AccumChartResp/GetAccumChartReq 참조 0(webapp 매집 차트는 accum_flow DB 경로) · 재동기화는 다음 다른 이유 때 같이(기준 HEAD a6a055d8)
---
<!-- radar-handoff.sh 가 이 파일을 복사해 이중 중괄호 토큰을 치환한다. 처리한 gh-radar 세션은 status 를 done 으로 바꾸고 done_commit 을 채워 커밋한다(경로 지정 add). -->

# gh-trade → gh-radar 인계 — 2026-10-22

## 바뀐 것

MsgType 번호·필드·슬롯·의미 수준에서 무엇이 바뀌었는지 적는다(와이어 무변경이면 그렇게 적는다).

`table AccumChartResp`(90, 45 요청에 대한 응답) 끝에 `cycle_start_us: long` 하나를 append 했다(vtable 슬롯 20). 이 사이클 첫 팀 주문 시각(당일 µs)이고, 0 이면 모름이거나 이월 행이다. 기존 필드·MsgType·Envelope 슬롯은 그대로다.

매집감지 가격 차트에 등록 전부터 팀이 모으기 시작한 시점을 표시하려는 것이다. 88/89 AccumSignal·kind 16 저널·accum_flow export 는 바뀌지 않았다.

판정기가 걸린 파일:

- server/src/protocol/StockDMA.fbs

## gh-radar 가 할 일

생성물 재동기화(`RELAY=<gh-radar>/relay server/scripts/sync-relay-schema.sh`) 필요 여부 · relay 파서 · DB 마이그레이션 · 웹 중 무엇이 필요한지 적는다.

없다(FYI). 90 은 로그인 세션 연결 전용 요청-응답이라 relay·관찰자 경로가 읽지 않는다. relay 스키마 재동기화는 다음에 다른 이유로 할 때 같이 따라가면 되고, 지금 할 필요는 없다.

## 배포 순서 제약

gh-trade 서버 먼저 배포가 안전한가: 예 — gh-radar 쪽 변경이 없다.

gh-radar 쪽 순서는 항상 DB → relay → webapp 이고, push 가 곧 webapp 프로덕션 배포다.

## 확인 방법

처리 뒤 무엇을 보면 맞게 된 것인지(로그 줄·웹 화면·relay 응답) 적는다.

gh-radar 쪽에서 확인할 것은 없다. relay 를 재동기화하면 생성 코드 `AccumChartResp` 에 `CycleStartUs` 접근자가 하나 늘어나는지만 보면 된다.

## 질문

gh-radar 쪽에 묻고 싶은 것, 결정이 필요한 것을 적는다(없으면 「없음」).

없음
