---
phase: 27-auto-sell-integration
plan: 03
subsystem: shared
tags: [strategy-event, sentence-assembler, auto-sell, labels, vitest, golden]

requires:
  - phase: 27-01
    provides: "relay 생성물 동기화 — StrategyEventKind 11~14 · OrderGroup 9 · CancelReason 10/11 이 와이어에 실림"
  - phase: 25-order-log-progress
    provides: "shared 조립기 한 곳(D-09) · 모르는 enum 원문(D-10) · 골든 픽스처 규약"
provides:
  - "STRATEGY_EVENT_KIND 11~14 · ORDER_GROUP.AutoSell 9 상수"
  - "라벨 표: kind 11 발동 · 12 정정 · 13 상태 · group 9 자동매도 · cancel 10 매수 우선 취소 · 11 동시호가 감축"
  - "AUTO_SELL_STATE_LABELS(0 꺼짐) · AUTO_SELL_BASIS_LABELS · AUTO_SELL_METHOD_LABELS + AUTO_SELL_METHOD_ORDER [3,1,2] · AUTO_SELL_PAUSE_LABELS · AUTO_SELL_REASON_TOKENS(13)"
  - "reasonToken · isAutoSellReason · autoSellStateLabel · autoSellBasisLabel · strategyEventSide(9, *) = sell"
  - "strategyEventParts kind 6 자동매도 두 변종(주기 · 동시호가 회차) · kind 11 · 12 · 13 · 14"
  - "serverMsgBadge AutoSell · AutoSellCommand → [상따]"
  - "STRATEGY_AUTO_SELL_ROWS(seq 201~ 22행) · STRATEGY_AUTO_SELL_GOLDEN"
affects: [27-04, 27-05, 27-07, 27-08, order-log, strategy-log, today-orders-timeline]

actuals:
  tokens: 17711     # chars/4 over this plan's diff (packages/ · webapp/ only — 범위 안 동시 세션 커밋 c659caff 제외)
  tasks: 2
  commits: 3        # MEASURED rev-list f072d363..HEAD — 이 플랜 커밋 2 + 동시 세션 docs(28) c659caff 1
plan_head_before: f072d36339bde3d662dbcd8cb4dd39599dc1e3e3

tech-stack:
  added: []
  patterns:
    - "reason_code 첫 토큰 정확 일치(Object.hasOwn) — 원문 전체 일치 표(REASON_CODE_OPERATORS)와 별개 축"
    - "kind 6 본문은 토큰이 가르고 배지는 서버 group 그대로(WR-05 4/5/6↔9 뒤바뀜 내성)"
    - "자동매도 골든은 별도 상수(seq 201~) — 기존 개수 단언 무변경"

key-files:
  created: []
  modified:
    - packages/shared/src/strategy-event.ts
    - packages/shared/src/strategy-event-labels.ts
    - packages/shared/src/strategy-event-text.ts
    - packages/shared/src/strategy-display.ts
    - packages/shared/src/__fixtures__/strategy-day.ts
    - packages/shared/src/__tests__/strategy-event-labels.test.ts
    - packages/shared/src/__tests__/strategy-event-text.test.ts
    - packages/shared/src/__tests__/strategy-display.test.ts
    - webapp/src/lib/__tests__/queue-progress.test.ts
    - webapp/src/components/trading/order-log/__tests__/order-log-list.test.tsx

key-decisions:
  - "kind 6 group 9 자동매도 본문에 주문조건 꼬리(지정가) · 매수1 · 접수 지연 조각을 기존 매도 본문과 같은 규칙으로 싣는다(WinForms 문장 규칙 표 동형 — 값이 비면 생략)"
  - "kind 11 은 시작조건 0 이면 「{기준} 이탈」(발동가 생략), 기준가격(bid1_price) 0 이면 「기준」 조각 생략 — 0 을 측정값처럼 그리지 않는다"
  - "동시호가 회차 본문의 예상체결가는 ev_price 0 이면 생략, 「보관 a→b」 는 항상 — group 9 회차 본문 안에서만 ev_qty_before/after 를 보관 수량으로 읽는다"
  - "집합 13종 안이지만 Ask1/Bid1/AuctionOrder 가 아닌 토큰이 kind 6 으로 오면 주기 매도 본문에서 호가 몫 낱말만 생략(지어내지 않는다)"
  - "kind 14 의 모르는 cond_actual 은 행위 원문 숫자 · 본문 빈 값"
  - "모르는 group 대표값 테스트를 9 → 10 으로 옮김(9 가 알려진 값이 됨)"

patterns-established:
  - "자동매도 토큰 판정: reasonToken + Object.hasOwn(AUTO_SELL_REASON_TOKENS) — 꼬리 문구 파싱 금지"
  - "자동매도 본문 함수는 conditionText/evidenceText 를 부르지 않는다(칸 재해석 오독 방지)"

requirements-completed: []

coverage:
  - id: D1
    description: "자동매도 라벨 · 상수 · 상태/기준/방법/멈춤 표 · 첫 토큰 판정 · group 9 매도 색"
    verification:
      - kind: unit
        ref: "packages/shared/src/__tests__/strategy-event-labels.test.ts#Phase 27"
        status: pass
    human_judgment: false
  - id: D2
    description: "54 배지 — src AutoSell · AutoSellCommand → [상따], SetUserSettings → [서버], 정확 일치만"
    verification:
      - kind: unit
        ref: "packages/shared/src/__tests__/strategy-display.test.ts#Phase 27 serverMsgBadge"
        status: pass
    human_judgment: false
  - id: D3
    description: "조립기 kind 6 자동매도 두 변종 · WR-05 · 집합 밖 토큰 폴백 · kind 11~14 · cancel 10/11 · 빈 주문번호 [—] — 22행 골든 toBe"
    verification:
      - kind: unit
        ref: "packages/shared/src/__tests__/strategy-event-text.test.ts#Phase 27 자동매도 조립기"
        status: pass
      - kind: integration
        ref: "pnpm --filter @gh-radar/server exec vitest run tests/routes/strategy-events.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "실제 주문로그 탭 · 카드 탭 · 오늘 주문 타임라인 화면에서 자동매도 줄이 읽기 좋은 문장으로 보이는지(문장 낱말 취향)"
    verification: []
    human_judgment: true
    rationale: "조각 낱말은 WinForms 표를 옮긴 플래너 재량 — 실제 표면 가독성은 사람이 본다(27-08 필터 · 배포 뒤 UAT)"

duration: 8min
completed: 2026-10-05
status: complete
---

# Phase 27 Plan 03: 자동매도 문장 조립기 Summary

**shared 조립기 한 곳에 kind 11 발동 · 12 정정 · 13 상태 · 14 멈춤/재개와 kind 6 group 9 의 주기 매도 · 장전 동시호가 회차 본문, reason_code 첫 토큰 우선 판정(WR-05 내성), 취소 사유 10/11, 54 자동매도 줄 `[상따]` 배지를 더하고 22행 골든으로 잠갔다**

## Performance

- **Duration:** 8 min
- **Started:** 2026-10-05T05:45:53Z
- **Completed:** 2026-10-05T05:54:03Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments

- 라벨 · 상수: `STRATEGY_EVENT_KIND` 11~14 · `ORDER_GROUP.AutoSell = 9`, kind 11 「발동」 · 12 「정정」 · 13 「상태」(14 는 표 밖), group 9 「자동매도」, cancel 10 「매수 우선 취소」 · 11 「동시호가 감축」, 상태 표 0 **「꺼짐」** · 1 대기 · 2 감시 · 3 매도중 · 4 완료, 기준 · 방법(순서 3·1·2) · 멈춤 표, 토큰 13종.
- 판정: `reasonToken` · `isAutoSellReason`(첫 토큰 정확 일치 · `Object.hasOwn`) — `"toString"` · `"constructor"` · `"AutoSellFoo x"` · 빈 값은 거짓. `strategyEventSide(9, *) = "sell"`(D-14 매도 색).
- 54 배지: `serverMsgBadge("AutoSell")` = `serverMsgBadge("AutoSellCommand")` = `[상따]`(WinForms NotificationHub 28-08 동형), `SetUserSettings` 는 `[서버]`. `origin-tag.tsx` 는 건드리지 않았다.
- 조립기: kind 6 은 토큰이 본문을 가르고 배지는 서버 group 그대로. 자동매도 본문은 `conditionText`/`evidenceText` 를 부르지 않아 「단건 매도체결」 · 「근거 호가」 오독이 없다.

## 문장 결정 (조각 낱말)

| 줄 | 행위 | 본문 조각 |
|---|---|---|
| kind 6 · Ask1/Bid1 | 주문 | `매도 {qty}주 @{price}[ 지정가]` · `주기 거래량 {M} × {N}%` · `매도1호가`/`매수1호가` · (`매수1 p·q주`) · (`접수 +Nms`) |
| kind 6 · AuctionOrder | 주문 | `동시호가 {r}회차 매도 {qty}주 @{하한가}` · `예상체결량 {M} × {N}%` · (`예상체결가 {E}`) · `보관 {a}→{b}` |
| kind 6 · 집합 밖 AutoSell 토큰 | 원문 `6` | 없음(D-10 폴백 · tone unknown) |
| kind 6 · 그 밖 토큰(group 9 여도) | 주문 | 기존 상따 매도 본문 |
| kind 11 | 발동 | `{기준} {N}% 이탈 (발동가 {p})` 또는 N=0 `{기준} 이탈` · `실측 {체결가}` · (`기준 {기준} {기준가격}`) |
| kind 12 | 정정 | `{qty}주 @{새 가격}` · `원주문 @{원가격} 잔량 {잔량}주` · (`새 번호 {message}`) · (`접수 +Nms`) |
| kind 13 | 상태 | `자동매도 {이전} → {새}` · (`기준 {기준} {price}`) · (`매도 누적 {qty}주`) |
| kind 14 | VI 멈춤 / 동시호가 멈춤 / 재개 / 원문 | `VI 발동 · 신규·정정 멈춤(미체결 유지)` / `동시호가`(NXT `단일가`)` · 신규·정정 멈춤(미체결 유지)` / `새 T0 누적 {expected_cum}` / 빈 값 |
| kind 7 · group 9 | 취소 | `매수 우선 취소` · `동시호가 감축` |

괄호 조각은 값이 0 이거나 비면 생략된다. kind 11 · 13 · 14 의 빈 주문번호는 F-A 줄에서 `[—]` 로 그려진다(골든에 고정).

## 골든 행 (`STRATEGY_AUTO_SELL_ROWS` seq 201~222)

asAuctionOrder · asCancelAuctionTrim · asStateOn(0→1, 기준 0) · asTriggerN · asTrigger0 · asTriggerBuyPrice(NXT · 매수가) · asStateSelling(2→3) · asAsk1 · asBid1(지정가 · 매수1 · 접수) · asModify · asModifyNoNewNo · asCancelBuyFirst · asPauseVI · asPauseAuctionKrx · asPauseAuctionNxt · asResume · asStateDone(3→4 · 누적 6,000주) · asWr05LegacyInGroup9 · asWr05AutoSellInGroup5 · asUnknownToken · asPauseUnknown(7) · asStateUnknown(4→9). 모든 행이 F-A 줄과 펼침 `{action, text}` 를 `toBe`/`toEqual` 로 직접 비교한다.

## Task Commits

1. **Task 1: 라벨 · 상수 · 토큰 판정 · 방향 · 54 배지** - `27f624f1` (feat)
2. **Task 2: 조립기 본문 kind 6 g9 · 11~14 · 토큰 우선 · 골든** - `5a720f9d` (feat)

(범위 `f072d363..HEAD` 의 `c659caff docs(28)` 는 동시 세션 커밋 — 이 플랜과 무관.)

## Files Created/Modified

- `packages/shared/src/strategy-event.ts` - kind 11~14 · group 9 상수(JSDoc 칸 재해석)
- `packages/shared/src/strategy-event-labels.ts` - 라벨 확장 · 자동매도 표 5종 · 토큰 판정 · 상태/기준 함수 · group 9 방향
- `packages/shared/src/strategy-event-text.ts` - kind 6 토큰 분기 · 11~14 본문 함수 · `methodSuffix`/`unknownKindParts` 헬퍼
- `packages/shared/src/strategy-display.ts` - `serverMsgBadge` AutoSell · AutoSellCommand → `[상따]`
- `packages/shared/src/__fixtures__/strategy-day.ts` - `STRATEGY_AUTO_SELL_ROWS` · `STRATEGY_AUTO_SELL_GOLDEN`
- `packages/shared/src/__tests__/*.test.ts` - Phase 27 describe 3개 + 기존 표 전수 단언 갱신
- `webapp/src/lib/__tests__/queue-progress.test.ts` · `webapp/src/components/trading/order-log/__tests__/order-log-list.test.tsx` - 모르는 group 대표값 9 → 10

## Decisions Made

frontmatter `key-decisions` 참고. 요점은 WinForms 문장 규칙 표를 따랐다는 것이다. kind 6 자동매도 줄에 주문조건 · 매수1 · 접수 조각을 싣고, 0 인 값은 측정값처럼 그리지 않는다. 모르는 값은 원문으로 둔다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 「모르는 group = 9」 를 전제한 기존 테스트 3파일 갱신**
- **Found during:** Task 1 (shared 전체 vitest · webapp vitest)
- **Issue:** group 9 가 「자동매도」 로 알려지자, 9 를 모르는 group 대표값으로 쓰던 단언이 깨졌다(shared `strategy-event-text.test.ts` 1건 · webapp `queue-progress.test.ts` 3건 · `order-log-list.test.tsx` 1건). 표 전수 `toEqual` 단언(kind · group · cancel)도 새 키를 반영해야 했다.
- **Fix:** 모르는 대표값을 10 으로 옮기고 `progressGroupLabel(9) = "자동매도"` 단언을 추가했다. 표 전수 단언에는 새 키를 넣었다.
- **Files modified:** packages/shared/src/__tests__/strategy-event-text.test.ts, packages/shared/src/__tests__/strategy-event-labels.test.ts, webapp/src/lib/__tests__/queue-progress.test.ts, webapp/src/components/trading/order-log/__tests__/order-log-list.test.tsx
- **Verification:** shared 300/300 · webapp 3213 passed · relay 985/985
- **Committed in:** 27f624f1

---

**Total deviations:** 1 auto-fixed (Rule 1). 의도된 의미 변경(9 가 알려진 group 이 됨)이 기존 테스트에 번진 것만 고쳤고, 스코프는 늘지 않았다.

## TDD Gate Compliance

두 태스크 모두 Phase 27 describe 를 먼저 쓰고 RED 를 확인한 뒤 구현했다. Task 1 은 15 failed, Task 2 는 28 failed 를 확인한 뒤 GREEN 으로 넘어갔다. 플랜 type 이 `execute` 라 RED/GREEN 커밋을 나누지 않고 태스크당 커밋 1개로 했다.

## Verification

- `pnpm --filter @gh-radar/shared exec vitest run`: 14 files · 300 tests 통과
- `pnpm --filter @gh-radar/shared build`: 성공
- relay · relay tests · webapp · server typecheck: `error TS` 0건
- `server exec vitest run tests/routes/strategy-events.test.ts`: 6/6 통과
- webapp vitest 3213 passed · 1 skipped, relay test 985/985 통과
- `git diff f072d363..HEAD -- webapp/src/components/trading/origin-tag.tsx`: 0줄
- DB 변경 없음(`supabase db push` 불필요)

## Issues Encountered

없음.

## User Setup Required

없음.

## Next Phase Readiness

- 27-04 카드 칩 · 27-05 버튼/LED · 27-08 주문로그 필터가 `AUTO_SELL_STATE_LABELS` · `AUTO_SELL_METHOD_ORDER` · `ORDER_GROUP.AutoSell` 를 index 재수출(`export *`)로 바로 import 할 수 있다.
- 오늘 주문 타임라인은 kind 12 를 `order_no`(원주문 번호)로 묶는다. kind 11 · 13 · 14 는 주문번호가 없어 주문로그 탭 · 카드 탭에서만 보인다.

---
*Phase: 27-auto-sell-integration*
*Completed: 2026-10-05*

## Self-Check: PASSED
