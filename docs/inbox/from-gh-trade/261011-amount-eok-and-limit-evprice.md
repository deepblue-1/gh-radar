---
status: done
from: gh-trade
from_commit: b0d7f763
from_branch: feature/limitchaser-amount-unit
date: 2026-10-11
fbs_sync_marker: e5b4fbca
done_commit: 9b0ccce1
---
<!-- radar-handoff.sh 가 이 파일을 복사해 이중 중괄호 토큰을 치환한다. 처리한 gh-radar 세션은 status 를 done 으로 바꾸고 done_commit 을 채워 커밋한다(경로 지정 add). -->

# gh-trade → gh-radar 인계 — 2026-10-11

## 바뀐 것

MsgType 번호·필드·슬롯·의미 수준에서 무엇이 바뀌었는지 적는다(와이어 무변경이면 그렇게 적는다).

**와이어 무변경**(.fbs 필드·슬롯·MsgType 그대로 — 판정기의 `.fbs` 는 이미 인계한 Phase 32 금액 8필드 분이다). 의미·문장 수준 변경 두 가지:

1. **수량 금액 표기 억 단위 (quick 261011-myr, db9abe52)** — Phase 32 의 「N만(M주)」 규칙에 1억 이상 갈래가 생겼다. 만원 m = round(주 × 가격 ÷ 10000) 이 10000 이상이면 `X.Y억(M주)`(소수 한 자리 반올림, `.0` 은 뺀다): `104975만` → `10.5억(85,000주)`, `100000만` → `10억(…)`. 1억 미만은 종전 `3999만(3,238주)`. 서버 54 `[상따]` 사유 문장과 RT spdlog `(만원)=` 꼬리가 이 규칙을 쓴다. 클라 주문로그(⑦ 문장 규칙)는 주문 수량·대기·즉시체결·「앞에 N주」·매수1 잔량·취소 잔량 등까지 금액 표기로 넓혔다(누적 거래량은 숫자 그대로). 정본: `docs/features/order-log-progress.md` ⑦, `docs/strategy/limit-chaser.md` 표시 표.
2. **StrategyEvent kind 1 `LimitExposed`·kind 2 `LimitEntered` 의 `ev_price` (quick 261011-oty, 88e25151)** — 종전 0 이던 칸에 그 종목 **상한가(원)** 를 싣는다. kind 1 은 노출 시점 상한가(`ask_qty_at_limit` 환산가), kind 2 는 진입 엣지 상한가(`snap_qty` 를 판정한 값, 회차 중 A4 로 바뀌어도 고정). `ev_kind` 는 0(None) 그대로라 근거(evidence) 표기 대상이 아니다. 81 백필·82 푸시·80 관찰자·저널 레코드 모두 같은 `AddStrategyEventTable` 경로라 함께 실린다. 배포 전에 기록된 이벤트는 0. 정본: `server/docs/protocol.md` 82 행, `order-log-progress.md` ②·③.

판정기가 걸린 파일:

- docs/features/order-log-progress.md
- server/docs/protocol.md
- server/src/protocol/StockDMA.fbs

## gh-radar 가 할 일

생성물 재동기화(`RELAY=<gh-radar>/relay server/scripts/sync-relay-schema.sh`) 필요 여부 · relay 파서 · DB 마이그레이션 · 웹 중 무엇이 필요한지 적는다.

- relay 생성물 재동기화: **불필요**(.fbs 무변경).
- relay 파서·DB 마이그레이션: 불필요(새 필드 없음). kind 1·2 의 `ev_price` 를 0 으로 가정해 버리거나 검증하는 곳이 있으면 값이 와도 되게만 확인.
- 웹: gh-trade 주문로그 문장을 웹이 같은 규칙으로 다시 만든다면 ① 1억 이상 `X.Y억(M주)` 갈래 ② 주문·대기·앞 잔량 금액 표기 ③ kind 1·2 수량을 `ev_price`(상한가)로 환산(0 이면 종전 숫자)을 따라가면 된다. 서버 54 사유 문장을 그대로 보여 주기만 한다면 할 일 없음.

**gh-radar 처리 (2026-10-12 · Phase 31 · 31-05):**

- relay 무변경 확인 — `ev_price` 는 relay `envelope.ts` 파싱 → 저널 → shared `strategy-event.ts` 로 그대로 흐르고, 0 을 가정하거나 검증하는 곳이 없다.
- 웹 ⑦ 확장 — shared `strategy-event-text.ts` 수량 토큰이 「N만(M주)」/「X.Y억(M주)」 이고, kind 1·2 수량은 `ev_price`(상한가)로 환산하며 0 이면 종전 숫자다(커밋 e90f7ed3 · 서식 함수 6f764b44). 누적 거래량은 숫자 그대로다.

## 배포 순서 제약

gh-trade 서버 먼저 배포가 안전한가: **예** — 와이어 무변경, 새 값은 기존 칸의 0 → 상한가 뿐이다. 교보 119 는 2026-10-11 에 이 브랜치(b0d7f763)로 올렸다.

gh-radar 쪽 순서는 항상 DB → relay → webapp 이고, push 가 곧 webapp 프로덕션 배포다.

## 확인 방법

처리 뒤 무엇을 보면 맞게 된 것인지(로그 줄·웹 화면·relay 응답) 적는다.

평일 장중 상한가 종목에서 relay 로 받은 kind 1·2 이벤트의 `ev_price` 가 그 종목 상한가(원)인지, 54 `[상따]` 사유 문장에 1억 이상 잔량이 `10.5억(85,000주)` 꼴로 오는지 본다.

## 질문

gh-radar 쪽에 묻고 싶은 것, 결정이 필요한 것을 적는다(없으면 「없음」).

없음.
