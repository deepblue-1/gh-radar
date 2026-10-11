---
phase: 18-gh-trade-ui-nxt-vi
plan: 16
subsystem: trading-manual-order
status: complete
tags: [gap-closure, WR-01, WR-06, CR-01, TRADE-07, webapp, manual-order]
gap_closure: true
requires:
  - 18-13
  - 18-14
provides:
  - "OFFHOURS_WINDOW_CLOSED_TEXT — 시간외종가 선택 · 세션 null(창 닫힘/비 KRX) 이면 주문을 만들지 않는 가드"
  - "offHoursSessionOf(w, exchange) — KRX 가 아니면 null (D-23)"
  - "확인 상세 orderType 은 요청을 만든 같은 session 값에서 파생 (다이얼로그 = 요청)"
  - "modifyQtyOverRemainingText · modifyQtyClampedText · MODIFY_REMAINING_CHANGED_TEXT · MODIFY_TARGET_GONE_TEXT — 정정 수량 ≤ 미체결 잔량 3겹(추종·제출 검증·확정 직전 재대조)"
  - "OFFHOURS_PRICE_LABEL (order-confirm-dialog 단일 정의) — 가격 0 원주문 표기"
affects:
  - 18-VERIFICATION advisory WR-01 · WR-06 재검증 근거
  - 18-14 CR-01 (가격 0 취소가 흐르게 된 뒤의 표시 정합)
tech-stack:
  added: []
  patterns:
    - "다이얼로그 = 요청 — 확인 상세의 주문유형·가격을 폼 상태가 아니라 요청 스냅샷을 만든 같은 값에서 파생"
    - "확정 직전 재대조 — 확인 후 원천이 바뀌면 고쳐 보내지 않고 보내지 않는다(다시 확인시킨다)"
    - "prevRef 로 같은 키의 값 변화만 보는 추종 효과 — 내리기만, 올리지 않는다"
key-files:
  created: []
  modified:
    - webapp/src/components/trading/card/manual-order-form.tsx
    - webapp/src/components/trading/__tests__/manual-order-form.test.tsx
    - webapp/src/components/orderbook/order-confirm-dialog.tsx
    - webapp/src/components/orderbook/__tests__/order-confirm-dialog.test.tsx
key-decisions:
  - "시간외종가 선택 + 세션 null 이면 validateNew 로 떨어지지 않고 OFFHOURS_WINDOW_CLOSED_TEXT 로 반환 — 지정가 폴백 경로 제거 (WR-01)"
  - "확인 상세 orderType = session !== null ? offhours : limit — 요청 스냅샷과 한 값에서 파생 (D-20)"
  - "다이얼로그가 열린 뒤 창이 닫혀도 시간외종가 확정은 스냅샷 그대로 송신 — 창 판정은 서버(D-22), 폼에 벽시계 없음"
  - "정정 확정 직전 원주문 소멸 · 잔량 < 확인 수량이면 보내지 않고 사유 인라인. 취소는 재대조하지 않는다(잔량 전부 · 급락 시 지연은 자산 위험)"
  - "가격 0 표기 판정은 가격 0 하나로 닫힌다(DB·zod 불변식상 G2/G3 에서만) — 칩은 board G2/G3 도 함께 본다"
requirements-completed: [TRADE-07]
metrics:
  duration: "4 min"
  started: "2026-09-22T06:54:26Z"
  completed: "2026-09-22T06:58:35Z"
  tasks: 3
  files: 4
estimate:
  tokens: 50000
  tasks: 3
actuals:
  tokens: 6350
  tasks: 3
  commits: 6
plan_head_before: abaab3d6f1ad22ccf036136fdedbdc4894e809d7
coverage:
  - deliverable: "WR-01 시간외종가 세션 가드 · 다이얼로그 = 요청"
    human_judgment: false
    verification:
      - kind: test
        ref: "webapp/src/components/trading/__tests__/manual-order-form.test.tsx#시간외종가 세션 가드 · 다이얼로그 = 요청 (4 cases)"
        status: pass
      - kind: command
        ref: "! grep -nE 'new Date|Date\\.now' manual-order-form.tsx"
        status: pass
  - deliverable: "WR-06 정정 수량 ≤ 미체결 잔량 (추종 · 제출 검증 · 확정 직전 재대조)"
    human_judgment: false
    verification:
      - kind: test
        ref: "webapp/src/components/trading/__tests__/manual-order-form.test.tsx#정정 수량 ≤ 미체결 잔량 (5 cases)"
        status: pass
  - deliverable: "가격 0 원주문 표기 「시간외종가」 (칩 · 취소 요약 · 옛 취소 요약)"
    human_judgment: false
    verification:
      - kind: test
        ref: "webapp/src/components/orderbook/__tests__/order-confirm-dialog.test.tsx#가격 0 원주문 표기 (2 cases)"
        status: pass
      - kind: test
        ref: "webapp/src/components/trading/__tests__/manual-order-form.test.tsx#가격 0 원주문 선택 칩 표기 (2 cases)"
        status: pass
---

# Phase 18 Plan 16: 수동주문 「확인한 것 = 나가는 것」 — WR-01 · WR-06 · 가격 0 표기 Summary

**시간외종가를 골랐는데 보낼 세션이 없으면 주문을 아예 만들지 않고(지정가 폴백 제거), 확인 다이얼로그의 주문유형을 요청을 만든 같은 `session` 에서 파생한다. 정정 수량은 미체결 잔량을 따라 내려가고, 제출 때 검증하며, 확정 직전에 다시 대조한다. 가격 0 원주문은 「0」 대신 「시간외종가」 로 표기한다.**

## Performance

- **Duration:** 4 min (측정 시작 06:54:26Z — 사전 읽기 제외)
- **Started:** 2026-09-22T06:54:26Z
- **Completed:** 2026-09-22T06:58:35Z
- **Tasks:** 3 (tracer 1 + auto 2, 전부 TDD)
- **Files modified:** 4

## Accomplishments

- **WR-01:** `offHoursSessionOf(w, exchange)` 가 KRX 가 아니면 `null`. 시간외종가 선택 + 세션 `null` 이면 `OFFHOURS_WINDOW_CLOSED_TEXT` 를 인라인 `role="status"` 로 띄우고 반환한다. 숨겨진 옛 가격으로 지정가가 나가는 경로가 없어졌다. 확인 상세 `orderType` 은 `session !== null ? 'offhours' : 'limit'` 으로, 요청 스냅샷과 같은 값에서 나온다.
- **WR-06:** ① 같은 주문번호에서 잔량이 줄면(부분체결 때 새 행) 입력이 더 클 때만 잔량으로 내리고 `modifyQtyClampedText` 를 띄운다. ② 제출 때 `qty > unfilledQty` 면 `modifyQtyOverRemainingText` 를 띄운다. ③ `handleConfirmed` 에서 정정 스냅샷을 지금의 선택 행과 대조한다. 행이 없거나 다른 주문번호면 `MODIFY_TARGET_GONE_TEXT`, 잔량이 확인한 수량보다 작으면 `MODIFY_REMAINING_CHANGED_TEXT` 를 띄우고 보내지 않는다. 취소는 재대조하지 않는다.
- **CR-01 표시 정합:** `OFFHOURS_PRICE_LABEL` 을 `order-confirm-dialog.tsx` 에 한 번만 정의했다. 가격 0 이면 `orgLine`(취소·정정 원주문 줄), 옛 취소 경로의 「주문가」, 폼 선택 칩(board G2/G3 또는 가격 0)이 이 상수를 쓴다. 주문유형 줄의 「시간외종가 · 가격 0 (KRX 세션)」 도 상수로 조립한다.

## Task Commits

1. **Task 1 (tracer): WR-01 세션 가드 · 다이얼로그 = 요청** — `ed54ecf` (test RED) → `1a01ace` (fix GREEN)
   - Tracer gate: 자동 `<verify>`(테스트 · 벽시계 grep · typecheck)를 다시 돌려 통과. end-of-phase 모드라 확장을 진행했다.
2. **Task 2: WR-06 정정 수량 추종·검증·재대조** — `3e294e3` (test RED) → `618305d` (fix GREEN)
3. **Task 3: 가격 0 원주문 표기** — `47b8862` (test RED) → `3f7ac29` (fix GREEN)

## TDD Gate Compliance

- Task 1 RED: 2건 실패(g2/g3 닫힘 렌더 · NXT 렌더). 수정 전 코드는 다이얼로그를 열거나 `manual-order-validation` 없이 진행했다. 두 「정상 경로」 케이스는 수정 전에도 green(회귀 고정용).
- Task 2 RED: 4건 실패, 전부 동작 실패다. **「잔량 초과 정정 → 전송 0」 은 수정 전 코드에서 `Unable to find [data-testid="manual-order-validation"]` 로 실패**했다(다이얼로그가 그냥 열렸다). 추종은 `expected '10' to be '6'`, 재대조 2건은 `sendOrder` 1회 호출로 실패했다. 「작은 입력은 그대로」 케이스는 수정 전에도 green(회귀 고정용).
- Task 3 RED: 2건 실패(칩 「매수 0 × 100」 · 요약 상수 undefined).

## Files Created/Modified

- `webapp/src/components/trading/card/manual-order-form.tsx` — 세션 가드, 다이얼로그 = 요청, 잔량 추종 효과, 제출 검증, 확정 직전 재대조, 칩 표기, export 문구 5종
- `webapp/src/components/trading/__tests__/manual-order-form.test.tsx` — `@/lib/queued-window` 모듈 모킹(`vi.hoisted` override, `beforeEach` 에서 초기화), WR-01 4건 · WR-06 5건 · 칩 2건
- `webapp/src/components/orderbook/order-confirm-dialog.tsx` — `OFFHOURS_PRICE_LABEL`, `orgLine` 가격 0 분기, 옛 취소 「주문가」, 주문유형 줄 상수화
- `webapp/src/components/orderbook/__tests__/order-confirm-dialog.test.tsx` — 가격 0 취소 요약(폼 경로 · 옛 경로) 2건

## Decisions Made

- 경합 창(복귀 효과가 돌기 전 한 렌더)은 `rerender` 로 재현되지 않는다. 그래서 `affordanceOf` 결과만 케이스 단위로 덮는 모듈 모킹으로 고정했다(계획 지시 그대로).
- 잔량 추종은 `prevSelRef`(주문번호·잔량)로 **같은 주문번호의 잔량 변화**만 본다. 주문번호가 바뀔 때의 채움은 기존 효과가 맡는다. 입력 변경에는 반응하지 않는다(내리기만 한다).
- 확정 직전 재대조에서 선택 행의 주문번호가 스냅샷과 다를 때도 「원주문이 더 이상 미체결이 아니에요」 로 막는다(보수적).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - 표시 정합] 옛 취소 경로(`LegacyCancelBody`)의 「주문가」 도 가격 0 이면 「시간외종가」**
- **Found during:** Task 3
- **Issue:** 계좌가 실리지 않는 옛 미체결 표 취소 요약이 `KRW.format(price)원` 으로 「0원」 을 그렸다. 같은 파일 안, 같은 결함이다.
- **Fix:** 가격 0 이면 `OFFHOURS_PRICE_LABEL`. 다이얼로그 테스트 1건을 추가했다.
- **Files modified:** order-confirm-dialog.tsx, order-confirm-dialog.test.tsx
- **Commit:** `3f7ac29`

**2. [Rule 2 - 단일 정의] 주문유형 줄 「시간외종가 · 가격 0 (KRX 세션)」 을 상수로 조립**
- **Found during:** Task 3
- **Issue:** acceptance 는 「시간외종가」 리터럴이 다이얼로그 파일의 상수 정의 한 곳에만 있기를 요구한다. 주문유형 줄에 리터럴이 하나 더 있었다.
- **Fix:** `${OFFHOURS_PRICE_LABEL} · 가격 0 (KRX 세션)` 으로 조립. 렌더 문자열은 바뀌지 않았고 기존 테스트도 수정 없이 green 이다.
- **Commit:** `3f7ac29`

**Total deviations:** 2 auto-fixed (Rule 2 ×2). **Impact:** 표기만 바뀌었다. 송신 경로는 변화 없음.

참고: 폼의 `<option>시간외종가</option>` 과 `OFFHOURS_DISABLED_TITLE` 에도 「시간외종가」 라는 단어가 있다. 둘은 주문유형 라벨·사유문이지 가격 표기가 아니어서 그대로 뒀다(acceptance 의 대상은 다이얼로그 파일의 리터럴이다).

## Verification

- `pnpm --filter @gh-radar/webapp test -- manual-order-form` → 41 passed (WR-01 4 · WR-06 5 · 칩 2 추가분 포함)
- `vitest run order-confirm-dialog manual-order-form` → 62 passed
- webapp 전체 `vitest run` → 92 files · 1349 passed · 1 skipped
- `! grep -nE "new Date|Date\.now" manual-order-form.tsx` → 매치 없음 (D-22)
- `pnpm --filter @gh-radar/webapp run typecheck` → clean
- `grep -c OFFHOURS_PRICE_LABEL` → dialog 4 · form 2 (둘 다 > 0)
- eslint 변경 4파일 → clean
- 기존 계약: 취소 「잔량 전부」 · 확인 문구 · timeout 잠금 · 4버튼 다이얼로그 케이스를 수정 없이 통과했다(D-22 · D-27).

## Issues Encountered

None.

## Known Stubs

None.

## Next Phase Readiness

18-16 완료. 18-VERIFICATION 의 WR-01 · WR-06 advisory 를 재검증할 수 있는 상태다.

## Self-Check: PASSED

- FOUND: 4 modified files
- FOUND: ed54ecf, 1a01ace, 3e294e3, 618305d, 47b8862, 3f7ac29
