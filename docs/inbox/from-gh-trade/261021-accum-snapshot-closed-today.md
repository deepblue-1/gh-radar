---
status: done
from: gh-trade
from_commit: 57d53fd8
from_branch: master
date: 2026-10-21
fbs_sync_marker: 9eb71e84
done_commit: none   # 할 일 없음 — relay 는 89 미구독(relay/src 비생성 코드에 AccumSnapshot 참조 0) · 주석만이라 재동기화 불필요(기준 HEAD eeacca2c)
---
<!-- radar-handoff.sh 가 이 파일을 복사해 이중 중괄호 토큰을 치환한다. 처리한 gh-radar 세션은 status 를 done 으로 바꾸고 done_commit 을 채워 커밋한다(경로 지정 add). -->

# gh-trade → gh-radar 인계 — 2026-10-21

## 바뀐 것

MsgType 번호·필드·슬롯·의미 수준에서 무엇이 바뀌었는지 적는다(와이어 무변경이면 그렇게 적는다).

**와이어 무변경.** 89 `AccumSnapshot.items` 에 등록 종목(state 1·2) 뒤로 **오늘 청산 종목(state 3 · end_reason 1, 청산 시각순)** 이 함께 실린다(quick-261021-hxa, 3f328abc). fbs·protocol.md 는 89 설명 주석만 바뀌었다. 88·kind 16·하루 이벤트 파일은 그대로다.

판정기가 걸린 파일:

- `server/src/protocol/StockDMA.fbs`(89 주석만)
- `server/docs/protocol.md`(89 행 설명만)

## gh-radar 가 할 일

생성물 재동기화(`RELAY=<gh-radar>/relay server/scripts/sync-relay-schema.sh`) 필요 여부 · relay 파서 · DB 마이그레이션 · 웹 중 무엇이 필요한지 적는다.

없음 — relay 는 89 를 읽지 않는다(261018-accum-signal 노트 합의). 생성물 재동기화도 필요 없다(주석만). 알림용 인계다.

## 배포 순서 제약

gh-trade 서버 먼저 배포가 안전한가: 예 — 교보 119 는 2026-10-21 13:30 배포·재기동 완료(v1.0-527-g57d53fd8).

gh-radar 쪽 순서는 항상 DB → relay → webapp 이고, push 가 곧 webapp 프로덕션 배포다.

## 확인 방법

처리 뒤 무엇을 보면 맞게 된 것인지(로그 줄·웹 화면·relay 응답) 적는다.

gh-trade 서버 로그 `[MarketPublisher] 매집 스냅샷 conn=… 종목=… 청산=N 송신=true` · 기동 `[AccumSignal] 기동 오늘 청산 시드 N종목`. gh-radar 쪽 확인 항목 없음.

## 질문

gh-radar 쪽에 묻고 싶은 것, 결정이 필요한 것을 적는다(없으면 「없음」).

없음
