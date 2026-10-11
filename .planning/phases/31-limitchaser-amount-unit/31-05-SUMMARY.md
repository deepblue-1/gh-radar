---
phase: 31-limitchaser-amount-unit
plan: 05
subsystem: trading
tags: [order-log, strategy-event, shared, amount-unit, tdd, winforms-parity]
status: complete

requires:
  - phase: 31-limitchaser-amount-unit
    provides: "31-01 lc-amount.ts §10 환산 한 벌(amountFromQty 반올림 역산 · 2^53 초과 BigInt)"
provides:
  - "shared lc-amount.ts 주문로그 서식 한 벌 — formatManwon(「3999만」/「10.5억」) · formatQtyAmt(「N만(M주)」/「X.Y억(M주)」 · 가격 0 「M주」 · 0 「0만(0주)」) · qtyAmt(주문로그 래퍼 · 0 「0주」)"
  - "shared strategy-event-text.ts ⑦ 수량 토큰 교체 — 주문 줄 「371만(300주) @12,350」 · 대기 · 즉시체결 · 앞 잔량 · 오차 · 남은 거래량 · 매수1 잔량 · 상한가 매수잔량 · 조건식 수량형 · 근거 체결 · 자동매도 6/12/13"
  - "kind 1·2 시세 수량 ev_price(상한가) 환산 — 0 이면 종전 천단위 숫자(캐시 폴백 없음) · kind 10 합계 ev_price 환산"
  - "C# ⑦ 예시 대조표 ①~⑨ 골든(P31 describe 17건) · 픽스처 골든 문장 새 표기"
affects: [31-07, 31-08]

actuals:
  tokens: 14144
  tasks: 3
  commits: 5
plan_head_before: 068d65fe8c0e8160edf184b7250e2165e5340e39
plan_head_after: eb6ae8f3fef7b606576f791b31d87f2ffc6fdbd6

tech-stack:
  added: []
  patterns:
    - "주문로그 수량 토큰은 shared lc-amount 서식 3함수 한 벌 — strategy-event-text 는 import 만 하고 서식을 다시 쓰지 않는다"
    - "웹 F-A 문법은 C# 두 줄 문장과 달라 같은 값의 토큰을 제자리 교체 — 주문 줄만 「{금액(주)} @{가격}」(가격×금액 곱셈 오독 방지)"
    - "kind 1·2 환산가는 서버가 실은 ev_price 뿐 — 0 이면 금액을 지어내지 않고 종전 숫자(AMT-04 투명성)"

key-files:
  created: []
  modified:
    - packages/shared/src/lc-amount.ts
    - packages/shared/src/__tests__/lc-amount.test.ts
    - packages/shared/src/strategy-event-text.ts
    - packages/shared/src/__tests__/strategy-event-text.test.ts
    - packages/shared/src/__fixtures__/strategy-day.ts
    - webapp/src/components/trading/order-log/__tests__/order-log-list.test.tsx

key-decisions:
  - "D-19 웹 문법 매핑 — 주문 줄(kind 3 · 6 · 자동매도 6 · 동시호가 회차 · 정정 12)만 「{qtyAmt} @{가격}」, 나머지는 제자리 토큰 교체(체결예상 괄호 안 A · 남은 거래량 R · 오차 E). 괄호 속 누적(E · B · C)은 숫자 그대로"
  - "첫 체결 오차 0 은 「오차 0」 그대로 — C# 「예상 지점에 체결」 문장은 웹 문법에 없다. 부호 있는 오차는 「+2억(16,000주)」 · 「−2억(16,000주)」(U+2212)"
  - "조건식 수량형(1 · 2 · 3 · 5)은 공용 formatQtyAmt(0 → 「0만(0주)」 · C# 340~356 동형), 주문로그 래퍼 qtyAmt 아님"
  - "kind 1·2 ev_price 0 폴백에 C# 의 시세 캐시(KRX 원장) 상한가를 두지 않는다 — 배포 전 기록은 종전 숫자(prohibition AMT-04)"
  - "formatSigned 는 exported API 라 남겨 둔다(제품 코드 사용처는 없어짐 · 테스트가 계약을 잠금)"

patterns-established:
  - "골든 문장 표(STRATEGY_DAY_GOLDEN · STRATEGY_AUTO_SELL_GOLDEN)는 픽스처 파일 안에 있어 서식 변경 때 문장만 갱신 · 행 데이터는 그대로"

requirements-completed: [AMT-04]

coverage:
  - id: D1
    description: "서식 3함수 formatManwon · formatQtyAmt · qtyAmt — C# FormatManwon · FormatQtyAmt · QtyAmt 바이트 동형(억 소수 한 자리 정수식 · .0 생략 · 0주 · BigInt 큰 값)"
    requirement: "AMT-04"
    verification:
      - kind: unit
        ref: "packages/shared/src/__tests__/lc-amount.test.ts#P31 주문로그 서식 (D-19 · gh-trade StrategyEventFormatter.cs 이식) (33 passed)"
        status: pass
    human_judgment: false
  - id: D2
    description: "⑦ 수량 토큰 교체 · kind 1·2 ev_price 환산(0 폴백) · kind 10 합계 · 근거 체결 · 조건식 수량형 · 자동매도 6/12/13 — C# 예시 ①~⑨ 골든"
    requirement: "AMT-04"
    verification:
      - kind: unit
        ref: "packages/shared/src/__tests__/strategy-event-text.test.ts#P31 ⑦ 금액 표기 (D-19 · C# 예시 ①~⑨) (17 passed)"
        status: pass
      - kind: unit
        ref: "pnpm --filter @gh-radar/shared exec vitest run (21 files · 617 passed)"
        status: pass
    human_judgment: false
  - id: D3
    description: "webapp 주문로그 탭 · 카드 탭 · 오늘 주문 펼침이 새 표기로 통과 · 소비자 소스 무변경"
    requirement: "AMT-04"
    verification:
      - kind: automated_ui
        ref: "webapp vitest 묶음(order-log · order-timeline · order-log-feed · card-tabs · shared-panels — 9 files · 189 passed)"
        status: pass
      - kind: unit
        ref: "pnpm --filter @gh-radar/webapp run test 상당(vitest --run --maxWorkers=2 · 165 files · 3944 passed · 1 skipped)"
        status: pass
    human_judgment: false
  - id: D4
    description: "실브라우저 주문로그 줄의 금액 표기(e2e P31-6) · 실서버 kind 1·2 ev_price 상한가 수신"
    requirement: "AMT-04"
    verification: []
    human_judgment: true
    rationale: "e2e 는 31-07(고정 포트 8090 · 3100 — 병렬 금지), 실서버 ev_price 관찰은 gh-trade 배포 뒤 장중 확인(31-08 노트 닫기)"

duration: 14min
completed: 2026-10-12
---

# Phase 31 Plan 05: 주문로그 ⑦ 금액 표기(N만(M주)/X.Y억(M주)) Summary

**shared `lc-amount.ts` 에 gh-trade `StrategyEventFormatter` 와 바이트 동형인 서식 3함수(`formatManwon` · `formatQtyAmt` · `qtyAmt`)를 두고, 주문로그 탭 · 카드 탭 · 오늘 주문 펼침이 공유하는 `strategy-event-text.ts` 의 수량 토큰을 「371만(300주) @12,350」 · 「3.7억(30,000주)」 꼴로 바꿨다 — kind 1·2 시세 수량은 서버가 싣는 `ev_price`(상한가)로 환산하고, 0 이면 종전 숫자 그대로.**

## Performance

- **Duration:** 14 min
- **Started:** 2026-10-11T15:00:50Z
- **Completed:** 2026-10-11T15:14:00Z
- **Tasks:** 3 (Task 1 · 2 TDD RED/GREEN · Task 3)
- **Files modified:** 6 (신규 0)

## Accomplishments

- **서식 3함수(lc-amount.ts)** — `formatManwon`: 1억 미만 「3999만」(천단위 없음), 이상은 십분위 = ⌊(만원+500)/1000⌋ 정수식으로 「10.5억」 · 「10억」. `formatQtyAmt`: 만원 = `amountFromQty`(반올림 역산 · 2^53 초과 BigInt) → 「N만(M주)」/「X.Y억(M주)」, 가격 ≤ 0 이면 「M주」. `qtyAmt`: 0 → 「0주」(C# DC-11). 폼 「1,000만」 표시와 다른 함수임을 섹션 주석으로 고정. `Math.round` 0.
- **⑦ 토큰 교체(strategy-event-text.ts)** — 주문 줄 「{qtyAmt} @{가격}」(kind 3 · 6 · 자동매도 6 · 동시호가 회차 · 정정 12), 상한가 매수잔량 · 매수1 잔량 · 대기 · 즉시체결 · 체결예상 괄호 안 앞 잔량 · 오차 · 남은 거래량 · 원주문 잔량 · 매도 누적은 `qtyAmt`. 조건식 수량형 1 · 2 · 3 · 5 와 근거 체결은 `formatQtyAmt`. 쓰이지 않게 된 `formatQty` 삭제.
- **kind 1·2 ev_price** — 지역 헬퍼 `limitQty(qty, evPrice)` = ev_price > 0 ? `qtyAmt` : 천단위 숫자(「주」 접미 없음 · 캐시 폴백 없음). kind 10 합계는 `qtyAmt(ev_trade_qty, ev_price)` — ev_price 0 이면 「합계 123,456주」 종전 글자.
- **골든** — `strategy-event-text.test.ts` 에 「P31 ⑦ 금액 표기」 17건(C# 예시 ①~⑨ · ev_price 0 폴백 · kind 10 · 조건식 · 근거 · 자동매도). 기존 골든 고정 문자열과 픽스처 골든 문장 표를 새 표기로 갱신.
- **relay 무작업 확인** — `ev_price` 는 `relay/src/dma/envelope.ts:3598`(`evPrice: w.evPrice()`) → `relay/src/journal/types.ts:90` · `strategy-stream.ts:141`(`ev_price: r.evPrice`) → shared `strategy-event.ts:285` 매퍼로 그대로 흐르고, 0 을 가정하거나 검증하는 곳이 없다(2026-10-12 grep). 31-08 인박스 노트 닫기가 인용할 수 있다.

## Task Commits

1. **Task 1: 서식 3함수(TDD)**
   - RED `bfa5a6b7` (test) — `lc-amount.test.ts` 「P31 주문로그 서식」 33건
   - GREEN `6f764b44` (feat)
2. **Task 2: ⑦ 수량 토큰 교체 · kind 1·2 ev_price(TDD)**
   - RED `e46d7d06` (test) — 「P31 ⑦ 금액 표기」 17건 중 16 실패(ev_price 0 폴백 1건은 종전 동작이라 통과)
   - GREEN `e90f7ed3` (feat) — 구현 + 기존 골든 · 픽스처 골든 문장 갱신
3. **Task 3: webapp 소비자 테스트 갱신** — `eb6ae8f3` (test)

## TDD Gate Compliance

- **Task 1 RED:** `pnpm --filter @gh-radar/shared exec vitest run src/__tests__/lc-amount.test.ts -t "formatManwon\(3999\)" --reporter=tap-flat` → exit 1 · `TypeError: formatManwon is not a function`. `gsd-tools check tdd-red-evidence` → **RED_EVIDENCE_OK**(`target_test_failed`, 「P31 주문로그 서식 … > formatManwon(3999) → '3999만'」).
  - semanticAssessment: 대상 테스트가 실행됐고 계획한 동작(함수 부재)에서 실패 — 구문 · import 경로 · 픽스처 오류 아님(같은 모듈의 기존 48건은 통과). 첫 기록은 vitest 가 이름에 붙이는 따옴표(`'3999만'`)를 빠뜨려 `no_target_test_failure` → 이름만 맞춰 재검증.
- **Task 2 RED:** `… vitest run src/__tests__/strategy-event-text.test.ts -t "⑨ kind 1 노출" --reporter=tap-flat` → exit 1 · `expected '매도잔량 5,000' to be '매도잔량 6500만(5,000주)'`. **RED_EVIDENCE_OK**(TAP 이스케이프 `C\#` 를 `C#` 로 맞춰 재검증).
  - semanticAssessment: 대상 테스트가 계획한 단언(ev_price 환산)에서 실패 — 종전 구현이 ev_price 를 무시한 결과 그대로다.
- **GREEN:** `6f764b44` · `e90f7ed3` — shared 617 passed · typecheck 통과.
- **REFACTOR:** 없음.
- RED 증거 기록 JSON 은 커밋하지 않았다(세션 scratchpad 보관).

## Files Created/Modified

- `packages/shared/src/lc-amount.ts` — 주문로그 ⑦ 서식 섹션 · `formatManwon` · `formatQtyAmt` · `qtyAmt`
- `packages/shared/src/__tests__/lc-amount.test.ts` — 「P31 주문로그 서식」 33건
- `packages/shared/src/strategy-event-text.ts` — 머리 주석 D-19 단락 · `limitQty` · `signedQtyAmt` · `qtyAtPrice` · `bid1Text` · `errorText` · `conditionValue(metric, v, price)` · 근거 체결 · `formatQty` 삭제
- `packages/shared/src/__tests__/strategy-event-text.test.ts` — 기존 고정 문자열 갱신 · 「P31 ⑦ 금액 표기」 17건
- `packages/shared/src/__fixtures__/strategy-day.ts` — `STRATEGY_DAY_GOLDEN` · `STRATEGY_AUTO_SELL_GOLDEN` 문장 50곳만 새 표기(행 데이터 · kind 1/2/15 골든 무변경)
- `webapp/src/components/trading/order-log/__tests__/order-log-list.test.tsx` — 수동 주문 줄 기대 「주문 · 수동 주문 · 371만(300주) @12,350」

## Decisions Made

- 웹 문법 매핑은 플랜 「Flagged assumptions」 그대로 — 주문 줄만 「{qtyAmt} @{가격}」, 나머지 제자리 교체 · 괄호 속 누적 숫자.
- 오차 0 은 「오차 0」(C# 문장 없음) · 조건식 0 은 「0만(0주)」(공용 서식).
- kind 1·2 ev_price 0 이면 시세 캐시로 메우지 않는다(prohibition AMT-04).
- `formatSigned` 는 exported API 라 남김(제품 사용처 없음).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] 픽스처 파일 안 골든 문장 표 갱신**
- **Found during:** Task 2 (GREEN)
- **Issue:** 플랜은 「픽스처 파일은 바꾸지 않는다」 고 했지만 기대 문장 표 `STRATEGY_DAY_GOLDEN` · `STRATEGY_AUTO_SELL_GOLDEN` 이 `__fixtures__/strategy-day.ts` 안에 있다(`strategy-event-text.test.ts` 골든 · webapp 테스트 · e2e `order-log.spec.ts` 607 이 같은 한 벌을 읽는다). 표를 고치지 않으면 골든 테스트가 실패한다.
- **Fix:** 행 데이터(`dbRow(...)`)는 그대로 두고 문장 문자열 50곳만 새 구현 출력으로 바꿨다. 갱신 전 old→new 를 전부 뽑아 수치(예: 150,000주 × 12,350 → 18.5억 · 47,800주 → 5.9억 · 5,000주 → 6175만)를 손으로 대조했다. kind 1 · 2 행은 ev_price 0 이라 문장 불변, kind 15 골든 불변.
- **Files modified:** `packages/shared/src/__fixtures__/strategy-day.ts`
- **Verification:** shared vitest 617 passed · webapp 전체 3944 passed
- **Committed in:** `e90f7ed3`

**2. [Rule 1 - Bug] P31 조건식 테스트 정규식의 라벨 가정**
- **Found during:** Task 2 (GREEN)
- **Issue:** RED 커밋의 정규식 `^조건 \S+ ?…` 가 공백 있는 라벨(「체결 누적」)을 못 받았다 — 구현이 아니라 테스트 결함.
- **Fix:** 라벨을 정확히 「체결 누적≤」 로, metric 4 는 `.+?` 로 고쳤다.
- **Committed in:** `e90f7ed3`

---

**Total deviations:** 2 auto-fixed (Rule 3 1 · Rule 1 1)
**Impact on plan:** 픽스처 행 · 소비자 소스 무변경 원칙은 지켰다. 범위 확장 없음.

## Issues Encountered

- 목록 밖 webapp 테스트 중 이 변경으로 깨진 것은 없다(전체 165 files 통과) — 목록 안 `order-log-list.test.tsx` 1건만 고쳤다. 버스트 · 상한가노출 줄은 픽스처 ev_price 0 이라 「합계 123,456주」 · 「매도잔량 185,400」 그대로(폴백 확인).

## 31-07 에서 갱신 필요 (e2e)

- `webapp/e2e/specs/order-log.spec.ts:151` — 정규식 `주문 · 조건 매도잔량≤50,000 \/ 실측 38,200 · ` → `주문 · 조건 매도잔량≤6\.2억\(50,000주\) \/ 실측 4\.7억\(38,200주\) · `.
- `webapp/e2e/specs/order-log.spec.ts:363` — `/^조건 매도잔량≤50,000/` → `/^조건 매도잔량≤6\.2억\(50,000주\)/`.
- `order-log.spec.ts:149` · `:358` 「매도잔량 185,400」 — 시드(픽스처 `exposed`) ev_price 0 이라 **그대로 유지**.
- `order-log.spec.ts:607` 자동매도 골든은 `STRATEGY_AUTO_SELL_GOLDEN` 을 읽어 자동으로 새 표기를 따른다.
- `me.spec.ts` 1186 · 1189 · 1316 은 저널(51) 줄이라 무관.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 31-07 e2e(P31-6 + 위 두 줄) · 31-08 인박스 노트 `261011-amount-eok-and-limit-evprice.md` 닫기 준비 완료(relay 무작업 근거는 위 Accomplishments).

## Self-Check: PASSED

- FOUND: packages/shared/src/lc-amount.ts · packages/shared/src/strategy-event-text.ts · packages/shared/src/__tests__/strategy-event-text.test.ts
- FOUND commits: bfa5a6b7 · 6f764b44 · e46d7d06 · e90f7ed3 · eb6ae8f3
- 수락 기준: `export function formatManwon(` · `formatQtyAmt(` · `qtyAmt(` 각 1줄 · `Math.round` 0 · `from "./lc-amount"` 1줄 · strategy-event-text 안 서식 함수 정의 0 · 「371만(300주) @12,350」 12줄 · 「매도잔량 6500만(5,000주)」 3줄 · 「매도잔량 5,000」 1줄 · 소비자 소스 5개 `git diff 068d65fe..HEAD` 무변경
