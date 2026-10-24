---
status: open
from: gh-trade
from_commit: 53e05292
from_branch: worktree-agent-a9ab4e63c8e6266eb
date: 2026-10-23
fbs_sync_marker: 07a34fe8
done_commit:
---
<!-- radar-handoff.sh 가 이 파일을 복사해 이중 중괄호 토큰을 치환한다. 처리한 gh-radar 세션은 status 를 done 으로 바꾸고 done_commit 을 채워 커밋한다(경로 지정 add). -->

# gh-trade → gh-radar 인계 — 2026-10-23 (**보류 기록** — 개장차익 origin, Phase 38 D-06)

> **지금 처리할 일은 없다.** 사용자 결정(Phase 38 D-06)으로 gh-radar 인계는 개장차익 전략의 **실운용 성과가 확인된 뒤** 한다.
> 이 노트는 그때까지 gh-radar 가 모르는 origin 코드를 보게 된다는 사실을 남기는 보류 기록이다 — SendMessage 는 보내지 않았다.

## 바뀐 것

MsgType 번호·필드·슬롯·의미 수준에서 무엇이 바뀌었는지 적는다(와이어 무변경이면 그렇게 적는다).

- **새 origin `OpenArb` = `IStrategy::Type` 정수 5** (Phase 38 — `ExpireCancel`(4) 뒤 말미 append, 기존 0~4 는 한 값도 안 밀렸다).
  `OriginName(5)` = `"OpenArb"` 라 51 OrderResp `origin` 과 관찰자 주문 저널(80)의 origin 문자열에 `"OpenArb"` 가 보이기 시작한다(개장차익 주문이 실제로 나갈 때부터 — 38-05 이후).
- MsgType **46 SetOpenArbReq · 47 GetOpenArbReq · 91 SetOpenArbResp · 92 OpenArbJudgement** 와 테이블 `SetOpenArb`·`OpenArbJudgementItem`·`OpenArbJudgement`, Envelope 슬롯 106(`set_open_arb`)·108(`open_arb_judgement`) 가 append 됐다 — **클라(WinForms) 전용**이다. relay 는 받을 필요가 없고, 모르는 메시지는 무시하면 된다.
- 주문로그 kind 범위 = **kind-defer(D-36)** — 개장차익 주문은 `OrderGroup`·주문로그 kind(StrategyEvent)에 아직 없다(성과 확인 뒤). 80 의 `strategy_events` 에는 새 kind 가 나오지 않는다.
- (2026-10-24 추가, D-40/D-41) `SetOpenArb` 테이블 **주석만** 바뀌었다 — `budget_krw`·`per_stock_cap_krw` 0 = 제한 없음, 입력 최소값 `min_profit_bp` ≥ 50 · `case1_fire_ms` ≥ 25000. 와이어(필드·슬롯·MsgType)는 그대로, gh-radar 할 일 없음.

판정기가 걸린 파일:

- server/docs/protocol.md
- server/src/protocol/StockDMA.fbs

## gh-radar 가 할 일

생성물 재동기화(`RELAY=<gh-radar>/relay server/scripts/sync-relay-schema.sh`) 필요 여부 · relay 파서 · DB 마이그레이션 · 웹 중 무엇이 필요한지 적는다.

- **보류 — 실운용 성과 확인 뒤 인계(Phase 38 D-06).** 그때 relay 스키마 동기화(`sync-relay-schema.sh`)·origin 표시(「개장차익」)·필요하면 주문로그 kind 를 함께 정한다.
- 지금은 아무것도 하지 않아도 된다 — 모르는 origin 문자열 `"OpenArb"` 가 저널에 보여도 기존 파서가 깨지지 않는지만 염두에 둔다(origin 은 문자열이라 미지 값은 그대로 저장·표시되는 것으로 안다).

## 배포 순서 제약

gh-trade 서버 먼저 배포가 안전한가: 예 — 새 MsgType 은 클라 전용이고, 새 origin 문자열은 기존 필드에 실리는 값일 뿐이다. 서버 배포는 교보 119 만(D-25), KB 120·121 은 코드만 들어가고 켜지 않는다.

gh-radar 쪽 순서는 항상 DB → relay → webapp 이고, push 가 곧 webapp 프로덕션 배포다.

## 확인 방법

처리 뒤 무엇을 보면 맞게 된 것인지(로그 줄·웹 화면·relay 응답) 적는다.

- 보류 중에는 확인할 것이 없다. 인계 시점에: 교보 119 저널에 `origin="OpenArb"` 주문이 relay 를 거쳐 DB 에 그대로 남는지, 웹 주문 화면이 그 행을 깨지지 않고 보여 주는지.

## 질문

gh-radar 쪽에 묻고 싶은 것, 결정이 필요한 것을 적는다(없으면 「없음」).

없음 (성과 확인 뒤 인계할 때 정한다).
