---
phase: 18-gh-trade-ui-nxt-vi
plan: 27
subsystem: webapp
tags: [webapp, manual-order, cancel, modify, offhours, gap-closure, tdd, GC-WR-02, GC-IN-06, GC-IN-03]
status: complete
gap_closure: true

requires:
  - phase: 18-gh-trade-ui-nxt-vi (18-16 · 18-23)
    provides: "WR-06 정정 재대조(확정 직전) · OFFHOURS_PRICE_LABEL 단일 정의 · 칩 가격 0 표기"
provides:
  - "cancelQtyAtConfirm(confirmedQty, orgOrderNo, live) — 취소 확정 수량을 현재 잔량으로 내리기만 하는 순수 함수(폼 · 계좌 패널 공용)"
  - "MODIFY_TARGET_CHANGED_TEXT — 정정 재대조 3갈래 문구(선택 없음 / 다른 주문번호 / 잔량 감소)"
  - "isOffhoursOrder({board, price}) — 시간외종가 원주문 판정의 유일 지점(order-confirm-dialog.tsx)"
  - "취소·정정 확인 상세의 선택 필드 board"
affects: [18-32 (R3 최종 게이트 — TRADE-07 검증), 계좌 패널 옛 취소 경로, 수동주문 폼 정정 잠금]

actuals:
  tokens: 7100
  tasks: 2
  commits: 4
plan_head_before: e0ad086c4d690af103f67c101bf60b5f76bf256a

tech-stack:
  added: []
  patterns:
    - "취소는 확정 순간 「막지 않고 내리기만」 — 정정은 「다르면 보내지 않음」(WR-06 유지). 두 규율을 섞지 않는다"
    - "표시 판정과 잠금 판정은 같은 함수 하나 — 순환 의존을 피해 하위 모듈(다이얼로그)에 둔다"

key-files:
  created: []
  modified:
    - webapp/src/components/trading/card/manual-order-form.tsx
    - webapp/src/components/trading/__tests__/manual-order-form.test.tsx
    - webapp/src/components/orderbook/account-panel.tsx
    - webapp/src/components/orderbook/__tests__/account-panel.test.tsx
    - webapp/src/components/orderbook/order-confirm-dialog.tsx
    - webapp/src/components/orderbook/__tests__/order-confirm-dialog.test.tsx

key-decisions:
  - "취소 확정 수량 = 같은 주문번호 현재 행의 0 < 잔량 < 확인 수량일 때만 그 잔량, 그 밖(원주문 소멸 · 다른 행 · 잔량 0 · 잔량 증가)은 확인한 수량 그대로 보낸다 — 막지도 올리지도 않는다 (GC-WR-02)"
  - "다이얼로그에 보인 수량과 나간 수량이 (작아지는 쪽으로) 다를 수 있다는 사실은 새 화면 문구가 아니라 cancelQtyAtConfirm · handleCancelConfirmed JSDoc 이 말한다"
  - "정정 재대조: selected === null → 「원주문이 더 이상 미체결이 아니에요」, 주문번호 다름 → 「선택한 원주문이 바뀌었어요 — 다시 확인해 주세요」, 잔량 감소 → 기존 문구. 세 경우 모두 전송 0 (GC-IN-06)"
  - "isOffhoursOrder 는 order-confirm-dialog.tsx 에 둔다(폼 → 다이얼로그 단방향 import 유지) · board 부재는 빈 값과 같아 가격 규칙만 남는다 (GC-IN-03)"

patterns-established:
  - "확정 직전 재판정은 「지금 렌더의 같은 주문번호 행」 을 live 로 넘긴다 — 폼은 selected, 계좌 패널은 account.unf 에서 찾는다"

requirements-completed: []

duration: 5min
completed: 2026-09-22
---

# Phase 18 Plan 27: 취소 확정 수량 · 재대조 문구 · 시간외종가 한 판정 Summary

**수동주문 폼과 계좌 패널의 취소가 확정 순간의 잔량으로 수량을 내려 보낸다(`cancelQtyAtConfirm`). 정정 재대조는 무엇이 바뀌었는지 세 갈래로 말한다. 시간외종가 원주문 판정은 `isOffhoursOrder` 하나로 합쳐 칩 표기, 확인 다이얼로그, 정정 잠금이 모두 이 함수를 쓴다.**

## Performance

- **Duration:** 약 5분 (2026-09-22T09:51:52Z → 09:56:22Z)
- **Tasks:** 2 (tracer 1 + auto 1, 둘 다 TDD RED → GREEN)
- **Files modified:** 6

## Accomplishments

- **GC-WR-02 해결.** 취소 다이얼로그가 열린 사이 부분체결로 잔량이 10에서 4로 줄면 확정 때 qty 4가 나갑니다. 폼과 계좌 패널 모두 같습니다. 잔량이 늘면 확인한 수량 그대로 나가고, 선택이 해제되거나 원주문이 사라져도 막지 않고 확인한 수량으로 보냅니다.
- **GC-IN-06 해결.** 정정 확정 직전 재대조에서 다른 주문번호 행이 선택된 경우 「선택한 원주문이 바뀌었어요 — 다시 확인해 주세요」가 뜹니다. 선택이 사라진 경우의 문구와 따로 갑니다. 어느 경우든 전송은 0건입니다.
- **GC-IN-03 해결.** `isOffhoursOrder`(board G2/G3 또는 가격 0)를 칩 표기, 정정 확인 원주문 줄, 옛 취소 요약 주문가, `modifyLockReason`/`canModify`가 함께 부릅니다. 구 서버가 보내는 `board ''` · 가격 0 행에서는 칩이 「시간외종가」로 표기되고 정정 버튼도 잠깁니다.

## Task Commits

1. **Task 1 [tracer]: 취소 확정 = 현재 잔량으로 내림 + 정정 재대조 문구 둘**
   - RED `c1dd08c` test(18-27): 취소 확정 수량 현재 잔량 내림 · 정정 재대조 선택 변경 문구 회귀 (RED)
   - GREEN `d5440ee` fix(18-27): 취소 확정은 막지 않고 현재 잔량으로 내린다 · 정정 재대조가 선택 변경을 따로 말한다 (GREEN)
   - 트레이서 게이트: `<verify>` 재실행 결과 green(99/99), typecheck exit 0 → 확장 진행
2. **Task 2: `isOffhoursOrder` 한 판정**
   - RED `065a5a7` test(18-27): isOffhoursOrder 한 판정 — 빈 board · 가격 0 정정 잠금 · G2/G3 가격 > 0 표기 회귀 (RED)
   - GREEN `3e5122c` fix(18-27): 시간외종가 원주문 판정을 isOffhoursOrder 하나로 — 칩 · 확인 다이얼로그 · 정정 잠금 (GREEN)

## TDD Gate Compliance

### Task 1: 수정 전 코드의 RED 원문 (`npx vitest run manual-order-form account-panel`, 4 failed | 95 passed)

```
× AccountPanel — 미체결 표 > ⑤-a 다이얼로그가 열린 사이 같은 주문번호 잔량이 30 → 4 로 줄면 확정 수량은 현재 잔량 4 다 (GC-WR-02)
  → expected "spy" to be called with arguments: [ { kind: 'cancel', …(6) } ]
  -     "qty": 4,
  +     "qty": 30,
× ManualOrderForm — 취소 확정 수량 = 현재 잔량으로 내림 > 잔량 10 · 「취소」 다이얼로그 → 같은 주문번호 잔량 4 로 갱신 → 확정 → qty 4 로 1회 전송
  -     "qty": 4,
  +     "qty": 10,
× ManualOrderForm — 정정 수량 ≤ 미체결 잔량 > 다이얼로그를 연 뒤 다른 주문번호 행이 선택됨 → … 「선택한 원주문이 바뀌었어요」 (GC-IN-06)
  → expect(element).toHaveTextContent()  Received: 원주문이 더 이상 미체결이 아니에요
× ManualOrderForm — cancelQtyAtConfirm — 같은 주문번호의 0 < 잔량 < 확인 수량일 때만 내린다
  → cancelQtyAtConfirm is not a function
```

「잔량 12로 늘어남 → 10」과 「선택 해제 → 10으로 보냄」 두 케이스는 수정 전에도 green이었습니다. 옛 코드도 스냅샷을 그대로 보냈기 때문입니다. 수정 뒤에도 같은 결과가 나오므로, 이 두 케이스는 금지 규칙(수량을 올리지 않음, 막지 않음)을 지키는지 보는 보호 회귀로 둡니다.

### Task 2: 수정 전 코드의 RED 원문 (`npx vitest run order-confirm-dialog manual-order-form account-panel`, 4 failed | 120 passed)

```
× OrderConfirmDialog — isOffhoursOrder 한 판정 > board G2/G3 이거나 가격 0 이면 시간외종가 원주문이다
  → isOffhoursOrder is not a function
× OrderConfirmDialog — isOffhoursOrder 한 판정 > 정정 확인 — board G2 · 가격 > 0 원주문 … 「원주문」 줄은 「시간외종가」 다
  → expected '3407000077 · 매수 128,700 × 100' to be '3407000077 · 매수 시간외종가 × 100'
× AccountPanel — 미체결 표 > ⑤-b 옛 취소 경로 — board G3 · 가격 > 0 행의 요약 「주문가」 는 「시간외종가」 다
  → expected '98,000원' to be '시간외종가'
× ManualOrderForm — 가격 0 원주문 선택 칩 표기 > board 빈 값(구 서버) · price 0 행 → … 정정 disabled + 사유 title …
  → expected true to be false      (canModify(board '' · price 0) — 수정 전 정정 활성)
```

### GREEN

- `npx vitest run order-confirm-dialog manual-order-form account-panel` → **3 files · 124 passed**
- `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp run typecheck` → exit 0 (error TS 0)
- `pnpm --filter @gh-radar/webapp run test` → **92 files · 1399 passed | 1 skipped** (기준선 1383 이상)

## Acceptance Criteria

| 기준 | 결과 |
|------|------|
| `cancelQtyAtConfirm` 가 폼(선언 · 호출)과 계좌 패널(import · 호출)에 있음 | PASS: form:133 선언 · :552 호출 / panel:142 import · :375 호출 |
| `MODIFY_TARGET_CHANGED_TEXT` 선언·사용 2줄 이상 | PASS: :112 선언 · :535 사용 |
| 기존 WR-06 describe · 취소 확정 · 계좌 패널 ⑤⑦ 무수정 green | PASS |
| `isOffhoursOrder` 선언 1(다이얼로그) + 호출(다이얼로그 2 · 폼 2) | PASS: dialog:87 선언 · :193 · :469 / form:180 · :612 |
| 폼에 `=== 'G2'` 없음 | PASS (출력 없음) |
| 다이얼로그 파일에 `manual-order-form` 문자열 없음(역방향 import 0) | PASS (출력 없음) |
| webapp 전체 ≥ 1383 green | PASS (1399) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `RelayOrderRequest.orgOrderNo` 가 optional이라 타입 오류**
- **Found during:** Task 1 GREEN typecheck
- **Issue:** `cancelQtyAtConfirm(snap.qty, snap.orgOrderNo, selected)` 호출에서 TS2345 오류(`string | undefined`)가 났습니다.
- **Fix:** `snap.orgOrderNo ?? ''`로 넘겼습니다. 선택 차단 행(`orderNo ''`)은 `selected`에 들어오지 않으므로 빈 값은 어떤 행과도 맞지 않고, 그대로 확인한 수량이 나갑니다. 막지 않는 규칙과 같습니다.
- **Commit:** `d5440ee`

**2. [범위 보강] 계좌 패널 옛 취소 경로 회귀 1건 추가**
- 플랜 `<behavior>`에는 「계좌 패널 옛 취소 경로의 board G3 · 가격 > 0 행 → 요약 주문가 『시간외종가』」가 있습니다. 그런데 테스트 목록에는 이 케이스가 없어 `account-panel.test.tsx`에 ⑤-b를 더했습니다(RED 확인).
- `cancelQtyAtConfirm`의 `live` 파라미터 타입을 `RelayUnfilled | null` 대신 `Pick<RelayUnfilled, 'orderNo' | 'unfilledQty'> | null`로 좁혔습니다. `RelayUnfilled`를 그대로 넘겨도 호환됩니다.

**Total deviations:** 2건(모두 자동 처리). **Impact:** 없음. 동작 계약은 플랜과 같습니다.

## Issues Encountered

- 플랜 `<verify>`의 `pnpm --filter @gh-radar/webapp test -- manual-order-form account-panel`은 `--` 때문에 필터가 걸리지 않고 전체 스위트가 돕니다. 이 명령으로도 검증은 통과하지만, 결과를 좁혀 보려고 `webapp/`에서 `npx vitest run <필터>`를 따로 돌렸습니다.
- 수정한 파일 네 개에 prettier 경고가 있습니다. 수정 전 HEAD의 `manual-order-form.tsx`에도 같은 경고가 있었고, 저장소가 이를 강제하지 않아 범위 밖으로 두었습니다.

## Known Stubs

없음.

## Threat Flags

없음. 새 네트워크, 인증, 스키마 표면은 없습니다. T-18-113~116 완화는 위 회귀로 잠갔습니다.

## Next Phase Readiness

- webapp 코드만 바뀌었습니다. relay와 shared 스키마는 그대로입니다. push와 배포는 하지 않았습니다.
- TRADE-07은 R3 최종 게이트(18-32) 전까지 Pending으로 둡니다.

## Self-Check: PASSED

- 수정한 파일 6개 존재 확인
- 커밋 c1dd08c · d5440ee · 065a5a7 · 3e5122c 존재 확인 (`git rev-list --count e0ad086..HEAD` = 4)
