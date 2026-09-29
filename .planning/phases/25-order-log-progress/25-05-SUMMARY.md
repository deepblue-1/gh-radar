---
phase: 25-order-log-progress
plan: 05
subsystem: webapp
status: complete
tags: [today-orders, order-notices, orders-api, trading-alerts, tdd, a11y]

requires:
  - phase: 25-01
    provides: "JournalOrderRow.resultCode(shared journal 매퍼) · 오늘 주문 카드 · 작업대 알림 소비처"
provides:
  - "orderActionWord 방향 미상 폴백 \"\" → 「주문」 (orderActionSide 는 여전히 null — 방향색 없음)"
  - "OrderNoticeFacts.resultCode? · OrderNoticeLabel.sideRef · RECEIPT_UNKNOWN_RESULT_CODE(-2) · SIDE_REF_TITLE — order-notices.ts 한 곳"
  - "OrderDisplayStatus.title? · RECEIPT_UNKNOWN_TITLE · orderDisplayStatus 접수 불명 선판정(rejected ∧ -2 → muted · 투영 status 불변)"
  - "오늘 주문 SideTag — sideRef 이면 --muted-fg · data-side-ref · title + sr-only / StatusTag — shown.title 을 title 속성으로 (표 · 카드 행 공통)"
affects: [25-08]

actuals:
  tokens: 5368
  tasks: 2
  commits: 4
plan_head_before: a354ef5ba91ccc6fc0fcdaf95ff44b46bd434dff

tech-stack:
  added: []
  patterns:
    - "표시 판정은 순수 함수가 플래그(sideRef) · 문구 상수(SIDE_REF_TITLE · RECEIPT_UNKNOWN_TITLE)로 내고, 칩은 import 한 상수를 그리기만 한다 — 조립 금지(17-09 규율)"
    - "상태 선판정은 STATUS_LABELS 조회 앞 한 줄 — 투영 status 는 건드리지 않고 화면에서만 가른다"

key-files:
  created: []
  modified:
    - webapp/src/lib/order-notices.ts
    - webapp/src/lib/orders-api.ts
    - webapp/src/components/trading/today-orders-card.tsx
    - webapp/src/lib/__tests__/order-notices.test.ts
    - webapp/src/lib/__tests__/orders-api.test.ts
    - webapp/src/lib/__tests__/trading-alerts.test.ts
    - webapp/src/components/trading/__tests__/today-orders-card.test.tsx

key-decisions:
  - "RECEIPT_UNKNOWN_RESULT_CODE 는 order-notices.ts 에 두고 orders-api.ts 가 import 한다 — -2 의 정본 한 곳(order-notices 는 orders-api 를 import 하지 않아 순환 없음)"
  - "sideRef 는 resultCode 를 모르면(생략 · null) 참 — -2 로 확인된 것만 참고 표기에서 뺀다(모르는 값을 접수 불명으로 지어내지 않는다)"
  - "작업대 알림(trading-alerts)은 sideRef 를 쓰지 않는다 — 이 플랜 범위는 단어 통일(「주문」)까지. alertFromOrder facts 에 resultCode 를 싣지 않는다"
  - "색인 미스 알림 부제가 「주문 100주 · …」 로 바뀐 것은 UI-SPEC R18 의 의도된 통일 — 기존 기대값을 갱신했다"

patterns-established:
  - "칩 title 은 판정 결과 객체의 선택 필드(title?)로 흘린다 — 카드가 조건을 다시 따지지 않는다"

requirements-completed: []

coverage:
  - id: D1
    description: "방향 미상 「주문」 — orderActionWord · 알림 행위 단어 · 오늘 주문 구분 칸(muted · data-side none · 화살표 없음)"
    verification:
      - kind: unit
        ref: "webapp/src/lib/__tests__/order-notices.test.ts#①-7"
        status: pass
      - kind: unit
        ref: "webapp/src/lib/__tests__/trading-alerts.test.ts#방향 미상(색인 미스 · 취소·정정 아님)"
        status: pass
      - kind: component
        ref: "webapp/src/components/trading/__tests__/today-orders-card.test.tsx#⑬-1"
        status: pass
    human_judgment: false
  - id: D2
    description: "rejected ∧ result_code -2 → 「접수 불명」 muted + 확인 경로 title · 투영 status rejected 유지 · 표/카드 두 DOM"
    verification:
      - kind: unit
        ref: "webapp/src/lib/__tests__/orders-api.test.ts#rejected ∧ result_code -2"
        status: pass
      - kind: component
        ref: "webapp/src/components/trading/__tests__/today-orders-card.test.tsx#⑬-2"
        status: pass
    human_judgment: false
  - id: D3
    description: "KB 거부 R(New) 방향 참고 — 「▲ 매수」 유지 · --muted-fg · data-side-ref · title + sr-only · 상태 거부 danger · 비거부 행은 참고 표기 없음"
    verification:
      - kind: unit
        ref: "webapp/src/lib/__tests__/order-notices.test.ts#⑤-1~⑤-6"
        status: pass
      - kind: component
        ref: "webapp/src/components/trading/__tests__/today-orders-card.test.tsx#⑬-3 · ⑬-4"
        status: pass
    human_judgment: false
  - id: D4
    description: "실제 화면에서 회색 방향 칩 · 접수 불명 칩의 시각 인상과 툴팁 가독성"
    human_judgment: true
    rationale: "jsdom 은 계산 색 · 툴팁 표시를 검증하지 못한다 — 클래스 · 속성까지만 단언. 칩 폭은 기존 문법(whitespace-nowrap)이라 레이아웃 변화 없음"

duration: 6min
completed: 2026-09-29
---

# Phase 25 Plan 05: 오늘 주문 별건 3 Summary

**방향 미상 「주문」 · result_code −2 「접수 불명」(muted + 확인 경로 툴팁) · KB 거부 R(New) 회색 방향 참고 표기 — 판정은 `order-notices.ts` · `orders-api.ts` 순수 함수, 모양은 `SideTag` · `StatusTag`**

## Performance

- **Duration:** 약 6분
- **Started:** 2026-09-29T10:35:23Z
- **Completed:** 2026-09-29T10:41Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- `orderActionWord` 마지막 분기가 빈 문자열 대신 「주문」 을 낸다 — 오늘 주문 구분 칸과 작업대 알림이 같은 단어를 받는다(UI-SPEC R18). 방향색은 여전히 없다.
- `orderNoticeLabel` 이 `sideRef`(= notice R ∧ 방향 있음 ∧ result_code ≠ −2)를 싣고, 문구 정본 `SIDE_REF_TITLE` · `RECEIPT_UNKNOWN_RESULT_CODE` 가 같은 파일에 선다. 함수는 여전히 문구(`message`)를 인자로 받지 않는다(T-17-33 · T-25-23).
- `orderDisplayStatus` 가 `STATUS_LABELS` 조회 전에 rejected ∧ −2 를 「접수 불명」 muted + `RECEIPT_UNKNOWN_TITLE` 로 가른다 — 투영 status 는 rejected 그대로(WR-01 · T-25-22).
- 오늘 주문 표 · 모바일 카드 행에서 `data-side-ref="true"` · 회색 · title · sr-only(T-25-21)와 상태 칩 title 이 같은 속성으로 그려진다. 새 색 토큰 · 새 컴포넌트 0.

## Task Commits

1. **Task 1: 판정 순수 함수** — `956a15d4` (test, RED) → `df3bb016` (feat, GREEN)
2. **Task 2: 오늘 주문 칩** — `40b9c0bd` (test, RED) → `43db3d82` (feat, GREEN)

REFACTOR 커밋 없음(정리할 것 없음).

## Files Created/Modified

- `webapp/src/lib/order-notices.ts` — 「주문」 폴백 · `resultCode?` · `sideRef` · 상수 2개
- `webapp/src/lib/orders-api.ts` — `title?` · `RECEIPT_UNKNOWN_TITLE` · 접수 불명 선판정
- `webapp/src/components/trading/today-orders-card.tsx` — `noticeFactsOf` resultCode · `SideTag` 참고 표기 · `StatusTag` title
- `webapp/src/lib/__tests__/order-notices.test.ts` — ①-7 기대값 갱신 · ⑤ sideRef 6 케이스
- `webapp/src/lib/__tests__/orders-api.test.ts` — 접수 불명 · 거부 유지 · 비거부 −2 3 케이스
- `webapp/src/lib/__tests__/trading-alerts.test.ts` — 방향 미상 알림 「주문」 · 색인 미스 부제 기대값 갱신
- `webapp/src/components/trading/__tests__/today-orders-card.test.tsx` — describe 「별건 3 (Phase 25)」 ⑬-1~⑬-4 (표 · 카드 두 DOM)

## Decisions Made

key-decisions 참조. 요점: −2 상수 정본은 `order-notices.ts`, `sideRef` 는 resultCode 미상이면 참, 알림은 단어 통일까지만.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - 의도된 파급] 알림 부제 기존 기대값 갱신**
- **Found during:** Task 1 GREEN
- **Issue:** `trading-alerts.test.ts` 「체결 · 주문수량을 모르면 체결 수량만」 이 색인 미스 체결 부제를 `"100주 · 128,500원 · KRX"` 로 단언 — 「주문」 폴백으로 `"주문 100주 · …"` 가 됐다
- **Fix:** UI-SPEC R18(「trading-alerts 도 같은 단어 — 의도된 통일」)에 맞춰 기대값을 갱신하고 근거 주석을 달았다. 제품 코드 변경 없음
- **Files modified:** webapp/src/lib/__tests__/trading-alerts.test.ts
- **Commit:** df3bb016

**2. [TDD 메모] Task 2 RED 에서 ⑬-1 · ⑬-4 는 처음부터 green**
- ⑬-1(「주문」 칩)은 Task 1 판정이 이미 반영돼 있어서, ⑬-4(비거부 행 참고 표기 없음)는 기존 동작의 회귀 가드라서 통과했다. RED 대상 ⑬-2(title) · ⑬-3(data-side-ref)은 계획대로 단언에서 실패한 뒤 GREEN 에서 통과했다.

**Total deviations:** 1건 자동 수정(테스트 기대값만) + TDD 메모 1. **Impact:** 범위 변화 없음.

## TDD Gate Compliance

- RED: `956a15d4` · `40b9c0bd` (test(25-05)) — 대상 테스트가 단언 실패(Task 1: 9건 전부 대상 · Task 2: ⑬-2 · ⑬-3)
- GREEN: `df3bb016` · `43db3d82` (feat(25-05))
- `check tdd-red-evidence` 레코드는 만들지 않았다(`type: execute` 플랜의 tdd 태스크) — RED 증거는 위 실패 목록으로 갈음

## Verification

- `pnpm --filter @gh-radar/webapp exec vitest --run src/lib/__tests__/order-notices.test.ts src/lib/__tests__/orders-api.test.ts src/lib/__tests__/trading-alerts.test.ts` — 3 files · 97 passed
- `pnpm --filter @gh-radar/webapp exec vitest --run src/components/trading/__tests__/today-orders-card.test.tsx src/lib/__tests__/order-notices.test.ts` — 2 files · 91 passed
- `pnpm --filter @gh-radar/shared build && pnpm --filter @gh-radar/webapp run typecheck` — exit 0
- webapp 전체 `vitest --run` — 126 files · 2860 passed · 1 skipped
- acceptance grep 전부 PASS (`return "주문";` 1 · sideRef 3 · `RECEIPT_UNKNOWN_RESULT_CODE = -2` 1 · `"접수 불명"` 1 · orderActionWord 안 message 0 · data-side-ref 1 · SIDE_REF_TITLE 3 · 「별건 3 (Phase 25)」 1 · 새 색 토큰 MISSING 0줄)

## Issues Encountered

None.

## Next Phase Readiness

- 25-08 펼침의 「펼칠 수 없는 행」 규칙이 `orderDisplayStatus` 접수 불명 판정과 `sideRef` 를 그대로 쓸 수 있다.

## Self-Check: PASSED

- 수정 파일 7개 존재 확인 · 커밋 956a15d4 · df3bb016 · 40b9c0bd · 43db3d82 git log 확인
