---
phase: 27-auto-sell-integration
plan: 08
subsystem: webapp
tags: [order-log, filter, auto-sell, popup, popout, e2e, vitest]

requires:
  - phase: 27-03
    provides: "ORDER_GROUP.AutoSell 9 · strategyEventSide(9, *) = sell · STRATEGY_AUTO_SELL_ROWS · STRATEGY_AUTO_SELL_GOLDEN"
  - phase: 25-order-log-progress
    provides: "주문로그 피드 순수 함수(order-log-feed.ts) · 필터 칩 · 창 분리 쿼리 화이트리스트 · 카드 팝업(quick-260930-lq5)"
provides:
  - "OrderLogKindFilter 'auto' · ORDER_LOG_KIND_FILTERS 「자동매도」(매도 뒤) · KIND_GROUPS.auto = [9] · 창 분리 쿼리 kind=auto 허용"
  - "OrderLogSideFilter 'auto' · ORDER_LOG_SIDE_FILTERS 「자동매도」(매도 뒤) · matchesSide('auto') = group 9 · matchesSide('sell') group 9 제외 · sideFilterKind('auto') = 'auto'"
  - "e2e P27-O1 — 탭 칩 · 저널 푸시 · 카드 팝업 · 창 분리 kind=auto · 1280/390 칩 줄 한 줄"
affects: [27-09, order-log, card-log-popups, order-log-window]

actuals:
  tokens: 7569      # chars/4 over this plan's diff (webapp/ 만)
  tasks: 2
  commits: 2        # MEASURED rev-list 56d11073..HEAD
plan_head_before: 56d110737f7224c9f5ac43bccf2561ace589a292

tech-stack:
  added: []
  patterns:
    - "팝업 「자동매도」 는 색 축이 아니라 group 축 — matchesSide 가 matchesKind('auto') 를 재사용(판정 한 곳)"
    - "e2e 줄 텍스트는 골든 상수를 정규식으로 바꿔 비교(종목명 칸만 느슨) — 문자열 두 벌 금지"
    - "e2e 창 분리 URL 은 window.open 을 가로채 받고 같은 페이지로 이동해 필터 유지를 확인(팝업 페이지 목 경합 회피)"

key-files:
  created: []
  modified:
    - webapp/src/lib/order-log-feed.ts
    - webapp/src/lib/__tests__/order-log-feed.test.ts
    - webapp/src/components/trading/order-log/__tests__/order-log-filters.test.tsx
    - webapp/src/components/trading/__tests__/card-tabs.test.tsx
    - webapp/e2e/specs/order-log.spec.ts

key-decisions:
  - "카드 팝업 「매도」 = 매도 색 줄에서 group 9 를 뺀 것, 「자동매도」 = group 9(색과 무관 — 모르는 토큰 asUnknownToken 처럼 tone unknown 인 group 9 줄도 「자동매도」 에 보인다). 두 칩이 겹치지 않아 주문로그 탭의 매도/자동매도 분리와 뜻이 같다"
  - "「자동매도」 는 서버 group 9 그대로 — WR-05 로 group 5 로 온 AutoSellAsk1 줄은 「매도」, group 9 로 온 상따 사유 줄은 「자동매도」(배지와 같은 축)"
  - "칩 줄 레이아웃은 손대지 않음 — 탭 칩은 네이티브 select(가장 긴 옵션 폭이 「추가매수」 와 같은 4자), 팝업 세그먼트 5개도 390 에서 한 줄(실측 spread 0.0)"

patterns-established:
  - "필터 값 추가 시 판정은 group 축 한 함수(matchesKind)에 두고, 팝업 색 축은 그 함수를 불러 예외만 처리한다"

requirements-completed: []

coverage:
  - id: D1
    description: "필터 표 · 판정 — 탭 칩 순서 · matchesKind(auto) = group 9 · WR-05 · 쿼리 kind=auto 왕복 · 팝업 칩 · matchesSide 겹침 없음 · sideFilterKind"
    verification:
      - kind: unit
        ref: "webapp/src/lib/__tests__/order-log-feed.test.ts#Phase 27 자동매도 필터"
        status: pass
      - kind: unit
        ref: "webapp/src/components/trading/order-log/__tests__/order-log-filters.test.tsx#Phase 27 자동매도 필터"
        status: pass
    human_judgment: false
  - id: D2
    description: "브라우저 종단 — 탭 칩 group 9 줄만 · 골든 문장 · 저널 푸시 kind 13 · 카드 팝업 · 창 분리 kind=auto · 칩 줄 한 줄"
    verification:
      - kind: e2e
        ref: "webapp/e2e/specs/order-log.spec.ts#P27-O1"
        status: pass
    human_judgment: false

duration: 13min
completed: 2026-10-05
status: complete
---

# Phase 27 Plan 08: 주문로그 「자동매도」 구분 칩 Summary

**주문로그 탭 · 카드 주문로그 팝업 · 창 분리 페이지에 「자동매도」(서버 group 9) 구분 칩을 「매도」 뒤에 더했다. 팝업 「매도」 는 group 9 를 빼서 두 칩이 겹치지 않는다. 창 분리 쿼리 `kind=auto` 로 필터가 이어지고, e2e P27-O1 이 이 흐름을 끝까지 확인한다**

## Performance

- **Duration:** 13 min
- **Started:** 2026-10-05T06:26Z
- **Completed:** 2026-10-05T06:39Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- **주문로그 탭:** 구분 칩이 전체 · 선매수 · 추가매수 · 후매수 · 매도 · **자동매도** · 수동 · VI · 시세 순이 됐다. `KIND_GROUPS.auto = [9]` 이고 JSDoc 에 WR-05(토큰으로 넓히지 않음)를 적었다. `KINDS` 화이트리스트에 `auto` 를 넣었고, 모르는 값은 종전대로 거부한다.
- **카드 팝업:** 칩이 전체 · 매수 · 매도 · **자동매도** · 시세 순이 됐다.
  - `matchesSide('auto')` 는 `matchesKind(row,'auto')` 를 그대로 쓴다.
  - `matchesSide('sell')` 은 group 9 를 빼고 기존 색 축을 쓴다.
  - `sideFilterKind('auto') = 'auto'` 라서 창으로 분리해도 자동매도 줄이 사라지지 않는다.
- **e2e P27-O1:**
  - 복원 줄은 하루 흐름 + 자동매도 21행이다. 「자동매도」 칩을 켜면 group 9 줄 20개만 남고, 20줄 모두 `STRATEGY_AUTO_SELL_GOLDEN` 문장과 같다.
  - 칩이 켜진 채 저널(80)로 kind 13 이 오면 21줄이 되고, 새 줄은 시간순 제자리에 `data-new` 로 붙는다.
  - WR-05 group 5 줄은 「매도」 칩에서 보인다.
  - 카드 팝업에서 「자동매도」 를 고르면 18행이 모두 배지 「자동매도」 다. 「매도」 를 고르면 「자동매도」 배지는 없고 「체결매도」(WR-05) 가 보인다.
  - 창 분리 URL 에 `kind=auto · stock · ex=KRX` 가 실린다. 창 페이지는 select 값이 `auto` 이고 18줄 모두 `data-group=9` 다.
  - 탭 칩 줄 · 팝업 칩 줄의 세로 퍼짐(spread)을 1280 과 390 에서 쟀더니 모두 0.0 이었다.

## Task Commits

1. **Task 1: 「자동매도」 필터 값 — 탭 · 팝업 · 창 분리 쿼리** - `77b125d1` (feat)
2. **Task 2: e2e P27-O1 종단 · 칩 줄 한 줄** - `ac45ac48` (test)

## Files Created/Modified

- `webapp/src/lib/order-log-feed.ts` - 필터 타입 · 칩 표 · KIND_GROUPS.auto · KINDS · matchesSide/sideFilterKind 자동매도 분기 · 머리 주석 ③⑤ 갱신
- `webapp/src/lib/__tests__/order-log-feed.test.ts` - `Phase 27 자동매도 필터` describe 7건 + 기존 칩 라벨 단언 갱신
- `webapp/src/components/trading/order-log/__tests__/order-log-filters.test.tsx` - `Phase 27 자동매도 필터` 1건 + 기존 옵션 목록 단언 갱신
- `webapp/src/components/trading/__tests__/card-tabs.test.tsx` - 팝업 칩 라벨 단언에 「자동매도」 추가
- `webapp/e2e/specs/order-log.spec.ts` - P27-O1 + 헤더 ⑤

`order-log-filters.tsx` · `card-log-popups.tsx` 는 바꾸지 않았다. 둘 다 표를 읽어서 그리고, 칩 줄도 이미 한 줄이었다.

## Decisions Made

frontmatter `key-decisions` 참고. 핵심은 이렇다. 팝업 「자동매도」 는 배지 색이 아니라 서버 group 으로 거른다. 그래서 모르는 토큰처럼 tone 이 unknown 인 group 9 줄도 「자동매도」 에 보인다. 「매도」 는 group 9 를 빼므로 두 칩이 겹치지 않는다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 팝업 칩 라벨 전수 단언이 있던 card-tabs 테스트 갱신**
- **Found during:** Task 1 (webapp vitest 전체)
- **Issue:** `card-tabs.test.tsx:580` 이 팝업 칩을 `['전체','매수','매도','시세']` 로 전수 단언하고 있어서, 의도대로 「자동매도」 가 추가되자 깨졌다.
- **Fix:** 단언에 「자동매도」 를 추가했다. 플랜 files 목록 밖이지만 의도된 변경이 이 테스트까지 번진 것이다.
- **Files modified:** webapp/src/components/trading/__tests__/card-tabs.test.tsx
- **Commit:** 77b125d1

---

**Total deviations:** 1 auto-fixed (Rule 1). 스코프는 늘지 않았다.

## TDD Gate Compliance

- **Task 1:** `Phase 27 자동매도 필터` describe 를 먼저 쓰고 RED 를 확인했다. 11 failed 이고, 전부 칩 라벨 · auto 판정 · 쿼리 단언에서 실패했다. 그 뒤 GREEN 으로 39/39 통과했다.
- **Task 2:** e2e 는 Task 1 구현 위에서 쓴 종단 확인이라 별도 RED 를 남기지 않았다. Task 1 이 없으면 「자동매도」 옵션이 없어 `selectOption` 에서 실패하는 구조다.
- **커밋 방식:** 플랜 type 이 `execute` 라 27-03 처럼 태스크당 커밋 1개로 했다.

## Verification

| 확인 | 결과 |
|---|---|
| `pnpm --filter @gh-radar/shared build` | 성공 |
| `webapp typecheck`(tsc + e2e tsconfig) | `error TS` 0건 |
| 두 테스트 파일 `-t "Phase 27"` | 8 passed |
| `pnpm --filter @gh-radar/webapp run test` | 140 files · 3262 passed · 1 skipped |
| `playwright test e2e/specs/order-log.spec.ts` | 12 passed — P25-1~9 회귀 0, P27-O1 통과 |
| server · Supabase | 변경 0 |

## Issues Encountered

없음.

## User Setup Required

없음.

## Next Phase Readiness

- 주문로그 세 표면(탭 · 카드 팝업 · 창 분리)이 「자동매도」 필터를 같은 뜻(group 9)으로 쓴다.
- 문장 낱말의 실제 가독성(27-03 D4)은 배포 뒤 UAT 에서 사람이 본다.

## Self-Check: PASSED

- FOUND: webapp/src/lib/order-log-feed.ts · webapp/e2e/specs/order-log.spec.ts · 이 SUMMARY
- FOUND: 77b125d1 · ac45ac48
