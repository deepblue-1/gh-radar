---
status: done
from: gh-trade
from_commit: ba00055f
from_branch: master
date: 2026-10-06
fbs_sync_marker: ea8d9171
done_commit: none   # 웹 무변경 — 확인만(기준 HEAD bee662e1)
---
<!-- radar-handoff.sh 가 이 파일을 복사해 이중 중괄호 토큰을 치환한다. 처리한 gh-radar 세션은 status 를 done 으로 바꾸고 done_commit 을 채워 커밋한다(경로 지정 add). -->

# gh-trade → gh-radar 인계 — 2026-10-06

## 바뀐 것

와이어 무변경 — MsgType 번호·StrategyEvent 필드·슬롯·`StockDMA.fbs` 는 그대로다. 바뀐 것은 자동매도(group 9) StrategyEvent 의 발행 시점과 값의 정확도다(quick-261006-nvg, gh-trade `ba00055f`).

1. kind 12 AutoSellModified 의 발행 시점 — 종전: 정정 전문 송신 성공 뒤 1건(새 번호를 몰라 `message` 빈 값, 거부돼도 남았다). 이제: 그 정정의 'M' 정정확인 때 1건.
   - `message` = 새 주문번호 10자리 숫자(못 읽으면 빈 값)
   - 정정 거부(R)·전송 불명('M' 이 안 오면)·사람이 낸 정정에는 kind 12 가 없다(거부는 종전대로 kind 8)
   - `cum_volume`·`gw_time_ms` = 확인 시점 값
   - 그 밖 필드 의미 무변: price 새 가격 · qty 정정(옮긴) 수량 · cond_threshold 원주문 가격 · cond_actual 원주문 잔량(송신 때 원장 잔량) · cond_metric Price · order_no 원주문 번호
   - 54 사유 줄 `자동매도 정정 | …` 은 종전대로 송신 때다
2. 함께 바뀐 서버 내부 — WR-05: 자동매도 주기 매도가 전용 송신 FIFO + 「번호 → 송신 순서」 짝짓기라, 같은 {수량, 가격} 상따 매도와 겹쳐도 kind 6 SellOrder 의 group 9 ↔ 4/5/6 표기가 정확해진다. IN-05: 한 Run 틱 사이 발동 → 복귀 → 재발동이면 kind 11 이 두 건이고 각자 자기 실측가·체결량·T0·발동 시각을 싣는다.

판정기가 걸린 파일:

- docs/features/order-log-progress.md

## gh-radar 가 할 일

생성물 재동기화·relay 파서·DB 마이그레이션 불필요(fbs·필드 무변). 웹만 확인한다.

- kind 12 를 「정정 확인」 으로 읽어도 되는지
- `message`(새 번호)를 문장에 쓸 수 있는지(종전에는 늘 비었다)
- 「정정 → 거부」 를 kind 12 + kind 8 쌍으로 그리던 곳이 있으면 이제 kind 8 단독이 된다
- kind 11 이 한 사이클에 두 건 올 수 있다(중복 제거가 seq 기준인지)

## 배포 순서 제약

gh-trade 서버 먼저 배포가 안전한가: 예(와이어 무변경, 채워진 message 는 무시해도 된다).

gh-radar 쪽 순서는 항상 DB → relay → webapp 이고, push 가 곧 webapp 프로덕션 배포다.

## 확인 방법

서버 배포 뒤 자동매도 정정이 난 날, 관찰자 저널 80 의 kind 12 행 `message` 가 10자리 숫자이고 서버 로그 `[AutoSell] 정정 확인 | … orgOrderNo=<원주문> → orderNo=<새 번호>` 의 새 번호와 같다. 804 로 거부된 원주문에는 kind 12 가 없고 kind 8 만 있다. gh-trade doctest `[autosell] modify kind 12 — 'M' 때 message 새 번호…` · `[autosell] event 발동 11 두 번 — …` 가 고정한다.

## 질문

없음(kind 12 시점 이동이 웹 문장 시제에 영향이 있으면 알려 달라).

## gh-radar 처리 (2026-10-06)

웹 변경 없음 — 네 가지 모두 현행 코드가 이미 맞다.

- kind 12 라벨은 「정정」(`strategy-event-labels.ts`) — 요청/확인 시제가 없어 「정정 확인」 으로 읽혀도 문장이 어긋나지 않는다.
- `message` 는 이미 문장에 쓴다 — `autoSellModifiedBody` 가 빈 값이 아니면 「새 번호 {message}」 를 원문 그대로 붙인다(`packages/shared/src/strategy-event-text.ts`).
- 「정정 → 거부」 를 kind 12 + kind 8 쌍으로 묶는 곳은 없다 — kind 8 은 단독 행 · 거부 집계(`order-log-feed.ts`)만 센다.
- 중복 제거 키는 `strategyEventKey` = gateway|journalEpoch|seq — 한 사이클의 kind 11 두 건은 seq 가 달라 둘 다 남는다.
