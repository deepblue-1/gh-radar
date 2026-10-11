---
phase: 18-gh-trade-ui-nxt-vi
plan: 33
subsystem: relay-order-audit
tags: [gap-closure, round-4, dma_orders, monotonic-status, tracer, R3-WR-01]
status: complete
gap_closure: true

requires:
  - phase: 18-gh-trade-ui-nxt-vi (18-25)
    provides: "GC-WR-01 — 체결 E(Modify)가 정정 대기를 먼저 정산하는 경로 (이 플랜이 막는 늦은 M 경로의 출발점)"
provides:
  - "replaceableStatusesOf (relay/src/order/notice-status.ts) — dma_orders 상태 순위·종결 집합 화이트리스트, 단조성 판정의 유일 지점"
  - "supabaseOrderSink runUpdate 조건부 status IN 필터 + select(id) + 막힘 warn 1줄 + {applied:false} (최초·23505 재시도 공통)"
  - "공용 가짜 PostgREST relay/tests/helpers/fake-dma-orders.ts (in 필터 · update select · insert status 기본값)"
  - "ws ㊹ ㊺ · order-store describe 「상태 단조성 (R3-WR-01)」 (49칸 전이표 포함 9케이스)"
affects: [18-36 배포 순서 기록 (relay 재배포 대상에 18-33 포함), gsd-verifier -R4]

actuals:
  tokens: 12850
  tasks: 2
  commits: 2
plan_head_before: f5aa92ae785a970265de8e037108aa4d7485165f

tech-stack:
  added: []
  patterns:
    - "감사 행 상태 단조성은 relay 쿼리 필터(조건부 UPDATE)로 — 판정은 Postgres 가 한 문장 안에서 원자적으로, 마이그레이션 없음"
    - "행 결과를 봐야 하는 ws 테스트는 진짜 OrderStore(supabaseOrderSinks(공용 가짜 PostgREST)) 로 하네스를 다시 띄운다"

key-files:
  created:
    - relay/tests/helpers/fake-dma-orders.ts
    - .planning/phases/18-gh-trade-ui-nxt-vi/18-33-SUMMARY.md
  modified:
    - relay/src/order/notice-status.ts
    - relay/src/store/orders.ts
    - relay/src/ws/order-handler.ts
    - relay/tests/ws-order.test.ts
    - relay/tests/order-store.test.ts

key-decisions:
  - "R3-WR-01 층 = relay supabaseOrderSink 조건부 UPDATE (status IN replaceableStatusesOf(목표)). 마이그레이션·트리거·RPC 없음, recordUnmatched 사전 읽기 없음"
  - "상태 순위: requested·timeout 0 < accepted 1 < partially_filled 2 < filled·cancelled·rejected 3. 종결은 같은 값으로만. timeout → accepted 허용(결과 모름을 늦은 접수가 푼다)"
  - "막힌 갱신은 통째로 반영하지 않는다(status 만 빼고 notice_type·message 를 싣지 않음) — warn 1줄 + flushedNoop, 드롭·재시도 아님"

requirements-completed: []

duration: 5min
completed: 2026-09-22
---

# Phase 18 Plan 33: 상태 단조성 — 늦은 정정확인이 체결 행을 되돌리지 못하게 (R3-WR-01) Summary

**`dma_orders` 갱신에 조건부 `status IN (replaceableStatusesOf(목표))` 필터를 걸어, 전량 체결 E 가 정정을 먼저 정산한 뒤 도착한 정정확인 M 이 정정 행(또는 부분체결 원주문 행)을 「접수」 로 되돌리지 못하게 했다 — 막힌 갱신은 warn 로그와 `flushedNoop` 으로 남는다.**

## Performance

- **Duration:** 약 5분
- **Completed:** 2026-09-22
- **Tasks:** 2/2
- **Files modified:** 6 (신규 1)

## Accomplishments

- `replaceableStatusesOf(next)` — 7종 `Record<DmaOrderStatus, number>` 순위표 + 종결 집합. 「이 상태로 갱신해도 되는 기존 상태」 = `next` ∪ (비종결 ∧ 순위 ≤ `next`).
- `supabaseOrderSink.runUpdate` 한 곳에서 `status` 가 있으면 `.in("status", …)` + `.select("id")`. 오류 없이 0행 → warn(`column`·`status`·`noticeType` 만) + `{applied:false}`. `23505` 재시도도 같은 필터, 재시도가 막히면 「나머지 반영」 로그 없이 `{applied:false}`. `status` 없는 갱신은 쿼리 모양 불변.
- 가짜 PostgREST 를 `tests/helpers/fake-dma-orders.ts` 로 한 벌 이관(기존 동작 무변경) + `in` 필터 · update `select` · insert `status` 기본값.
- `recordUnmatched` 머리 주석에 「늦은 확인 통보는 sink 상태 단조성이 막는다 · 이 함수는 행 상태를 읽지 않는다」 문단(동작 변경 0).

## RED → GREEN (Task 1 tracer)

| 케이스 | 수정 전 (RED 원문) | 수정 후 |
|---|---|---|
| ws ㊹ 늦은 M(주문번호 Y) → 정정 행 | `AssertionError: expected { status: 'accepted', …(2) } to deeply equal { status: 'filled', …(2) }` — `-"notice_type": "E", -"status": "filled", +"notice_type": "M", +"status": "accepted"` (`filled_qty` 10 동일) | GREEN — `filled` · `E` · 10 · `flushedNoop` ≥ 1 · `dropped` 0 |
| ws ㊺ 늦은 M(주문번호 X) → 원주문 행 | `AssertionError: expected { status: 'accepted', …(2) } to deeply equal { status: 'partially_filled', …(2) }` — `-"notice_type": "E", -"status": "partially_filled", +"notice_type": "M", +"status": "accepted"` (`filled_qty` 6 동일) | GREEN — 원주문 `partially_filled` · `E` · 6, 정정 행 `filled` |
| 같은 RED 실행의 나머지 | `Tests 2 failed | 63 passed (65)` — 가짜 이관 후 ws-order 기존 63건 무손상, order-store 36/36 | — |

## Task Commits

1. **Task 1 (tracer): 늦은 M → 조건부 UPDATE** — `8d8791e` (fix)
2. **Task 2: 전이표·로그·카운터·재시도 회귀 + 주석** — `52d6a21` (test)

## Verification

- `npx vitest run ws-order order-store` → **110 passed (110)** (ws-order 65 · order-store 45)
- `pnpm --filter @gh-radar/relay run test` → **20 files · 534 passed (534)** (18-32 기준선 523 + 신규 11: ws 2 · order-store 9)
- `typecheck` · `typecheck:tests` → `error TS` 0
- 뮤테이션 점검: `replaceableStatusesOf` 에서 종결 조건을 지우면 ⓾ · ⓾-b 가 실패(2 failed) — 49칸 표가 규칙을 실제로 잡는다. 확인 뒤 원복.
- 인수 기준: `export function replaceableStatusesOf` 1줄 · `orders.ts:373` `runUpdate` 안 사용 · `function fakeDmaOrders` helper 1 / order-store 0 · `supabase/` 변경 0 · ws-order 삭제 줄은 import 1줄뿐(기존 `it(` 본문 삭제 0) · order-handler 는 주석 줄만.
- 트레이서 게이트: Task 1 `<verify>` 재실행 통과 후 Task 2 진행.

## Decisions Made

key-decisions 참조. 추가로 `requested` ↔ `timeout` 은 같은 순위 0 이라 서로 이동 허용(규칙 문자 그대로 — 실사용에서 `requested` 로의 갱신은 나오지 않는다).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - 테스트 조정] order-store ⓸ · ⓽ 의 필터 배열 완전일치 단언을 셀렉터 축으로 좁힘**
- **Found during:** Task 1 GREEN 실행
- **Issue:** 플랜은 ⓵~⓽ 를 「무수정 green」 으로 적었지만, ⓸(`{status:"filled"}` id 갱신)와 ⓽(23505 재시도 `status:"accepted"`)는 `filters` 를 `toEqual([{eq id}])` 로 **완전일치** 단언한다. 플랜이 요구한 `status` `in` 필터가 붙으면 필연적으로 실패한다(플랜 내부 모순).
- **Fix:** 두 단언을 `filters.filter((f) => f.op !== "in")` 로 좁혀 원래 의도(PK 셀렉터 한 축 · 재시도가 셀렉터를 재조립하지 않음)를 그대로 지키고, 재시도 쿼리의 `in` 필터 동일성은 Task 2 ⓮ 가 별도로 단언한다. ws-order.test.ts 의 기존 케이스(인수 기준 대상)는 무수정.
- **Files modified:** relay/tests/order-store.test.ts
- **Commit:** 8d8791e

---

**Total deviations:** 1 (Rule 1). **Impact:** 테스트 의도 보존, 범위 확장 없음.

## Issues Encountered

없음.

## Threat Surface

신규 표면 없음 — 새 warn 로그는 T-18-137 대로 `column`·`status`·`noticeType` 만 싣는다(⓫ 가 키 목록과 주문번호·계좌·user_id 부재를 단언). 테넌트 경계 ⓷ 무수정 green(T-18-138).

## Next Phase Readiness

- relay 재배포 필요(배포하지 않음 — 순서는 18-36 이 기록, 사람이 실행).
- 18-34 ~ 18-36 진행 가능.

## Self-Check: PASSED

- FOUND: relay/tests/helpers/fake-dma-orders.ts · relay/src/order/notice-status.ts · relay/src/store/orders.ts
- FOUND: 8d8791e · 52d6a21
