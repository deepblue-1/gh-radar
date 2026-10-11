---
phase: 19-account-order-journal
plan: 04
subsystem: api
tags: [shared-contract, express, supabase-rpc, wss, journal, idor, T-19-17, T-19-08]
status: complete

requires:
  - phase: 19-account-order-journal
    provides: "19-01 조회 RPC dma_journal_orders_for_user(uuid, date) — 공개 컬럼 25종(dma_user_id 없음) · service_role 전용 EXECUTE"
provides:
  - "packages/shared/src/journal.ts — JournalOrderRow · JournalOrderDbRow · JournalOrderStatus · JournalOrderOrigin · toJournalOrderRow · JOURNAL_ORDER_PUBLIC_COLUMNS"
  - "wss 프레임 계약 RelayJournalRowsMsg({t:'journal.rows', rows}) · RelayJournalState · RelayJournalStateMsg({t:'journal.state', s, since?}) — RelayOutbound 유니온 편입"
  - "server GET /api/orders → dma_journal_orders_for_user RPC 왕복 1회 · 응답 JournalOrderRow[] bare array"
  - "server resolveTradeDate(date?) — 가짜 날짜(2026-13-45 · 2026-02-30) 400"
affects: [19-05, 19-06, 19-12]

actuals:
  tokens: 11250
  tasks: 2
  commits: 2
plan_head_before: be196149b7e86f64f19b33db4f6e8df98c92be7f

tech-stack:
  added: []
  patterns:
    - "REST(server)와 wss 푸시(relay)가 같은 shared 매퍼(toJournalOrderRow)를 쓴다 — 두 벌 금지"
    - "가시성 필터는 RPC 조인이 정본, server 는 인증된 userId 하나만 넘긴다(p_user_id = req.userId)"
    - "공개 컬럼 목록 상수에 `satisfies readonly (keyof DbRow)[]` 로 원문 타입과 묶음"

key-files:
  created:
    - packages/shared/src/journal.ts
    - packages/shared/src/__tests__/journal.test.ts
  modified:
    - packages/shared/src/index.ts
    - packages/shared/src/relay.ts
    - server/src/services/dma-orders.ts
    - server/src/routes/orders.ts
    - server/tests/routes/orders.test.ts

key-decisions:
  - "resolveTradeDate 는 NaN 검사에 더해 KST 로 다시 내린 날짜가 입력과 같은지 본다 — JS Date 가 2026-02-30 을 조용히 3월로 넘기므로 NaN 검사만으로는 Postgres date 캐스트 오류(500)가 남는다"
  - "relay.ts → journal.ts, journal.ts → relay.ts 양방향 모두 `import type` 이라 런타임 순환이 없다 — journal.ts 는 OrderSide·OrderType·RelayExchange 만 type import"
  - "DmaOrderRow·DmaOrderOrigin 은 유지(webapp 이 19-06 까지 참조) — 이 plan 은 새 타입만 더했다"

requirements-completed: [D-03, D-04, D-05, D-06, D-08]

coverage:
  - id: D1
    description: "GET /api/orders 가 dma_journal_orders_for_user RPC 1회로 응답하고 dma_orders 를 조회하지 않는다"
    requirement: D-05
    verification:
      - kind: unit
        ref: "server/tests/routes/orders.test.ts#⑯-b · ⑯-h"
        status: pass
    human_judgment: false
  - id: D2
    description: "p_user_id 는 requireAuth 가 확정한 req.userId 하나 — 쿼리 user_id/p_user_id 무시"
    requirement: D-06
    verification:
      - kind: unit
        ref: "server/tests/routes/orders.test.ts#⑯-c · ⑯-c2"
        status: pass
    human_judgment: false
  - id: D3
    description: "응답에 주문자 식별자(dma_user_id·dmaUserId) 없음 · origin null 보존 · lastSeq number"
    requirement: D-08
    verification:
      - kind: unit
        ref: "server/tests/routes/orders.test.ts#⑯-b · ⑯-b2"
        status: pass
      - kind: unit
        ref: "packages/shared/src/__tests__/journal.test.ts (7 cases)"
        status: pass
    human_judgment: false
  - id: D4
    description: "date 형식(zod)·실재(resolveTradeDate) 검증 400 · RPC 오류 500 DB_ERROR 원문 비노출"
    verification:
      - kind: unit
        ref: "server/tests/routes/orders.test.ts#⑯-e · ⑯-f · ⑯-g"
        status: pass
    human_judgment: false
  - id: D5
    description: "journal.rows · journal.state 프레임 타입이 shared 에 있고 RelayOutbound 유니온 확장이 relay·webapp·server 컴파일을 깨지 않는다"
    requirement: D-03
    verification:
      - kind: typecheck
        ref: "pnpm --filter @gh-radar/relay run typecheck && typecheck:tests && pnpm --filter @gh-radar/webapp run typecheck && pnpm --filter @gh-radar/server run typecheck"
        status: pass
    human_judgment: false

duration: 4min
completed: 2026-09-25
---

# Phase 19 Plan 04: 공유 저널 행 계약 + GET /api/orders RPC 전환 Summary

**`GET /api/orders` 가 이제 `dma_journal_orders_for_user` RPC 를 한 번만 부르고, shared `toJournalOrderRow` 로 camelCase `JournalOrderRow[]` 를 돌려준다(주문자 id 없음, origin null 은 그대로). relay 가 쓸 wss 프레임 `journal.rows`·`journal.state` 계약도 shared 에 정의했다.**

## Performance

- **Duration:** 약 4분
- **Started:** 2026-09-24T15:50:18Z
- **Completed:** 2026-09-24T15:54:12Z
- **Tasks:** 2
- **Files modified:** 7 (신규 2 · 수정 5)

## Accomplishments

- shared `journal.ts` 신설: 상태 6종(`requested`·`timeout` 없음), 출처 3종 + null, RPC 원문 25컬럼 타입(`last_seq: number | string`), camelCase 공개 행(`dmaUserId` 없음), 공개 컬럼 상수 25종, 순수 매퍼
- server 서비스를 RPC 1회로 전환: `p_user_id = userId`, `p_trade_date = resolveTradeDate(date)`, 옛 `DmaOrderDbRow`/`ORDER_COLS`/`mapOrder`/`kstDayRangeUtc` 제거
- 라우트 경로·쿼리·bare array 는 그대로, 타입과 방어선 주석만 T-19-01·T-19-17 로 교체
- 라우트 테스트 13건(⓪·⓪-b POST 404 · 401 2건 유지 + GET 9건 재작성), 매퍼 단위 테스트 7건
- `RelayJournalRowsMsg` · `RelayJournalState` · `RelayJournalStateMsg` 를 `RelayOutbound` 에 추가하고 index 에서 export

## Task Commits

1. **Task 1: [tracer] RPC 행 → 공유 매퍼 → GET /api/orders bare array** — `e2627dc` (feat)
2. **Task 2: wss 프레임 계약 journal.rows · journal.state + 매퍼 단위 테스트** — `c47829e` (feat)

## TDD 증거

- Task 1 RED: 새 테스트를 옛 서비스(HEAD 판 `dma-orders.ts`)에 돌려 **8/13 실패**를 확인한 뒤 새 서비스로 되돌려 13/13 통과. RED 와 GREEN 은 한 커밋(`e2627dc`)에 담겼다 — 테스트와 구현이 같은 계약 전환의 양면이라 분리 커밋 대신 실패 증거를 여기 남긴다.
- Task 2: 매퍼는 Task 1 에서 이미 구현돼 단위 테스트가 처음부터 통과한다(계약 잠금 목적).

## Verification

- `pnpm --filter @gh-radar/shared build` — 성공
- `pnpm --filter @gh-radar/server exec vitest run tests/routes/orders.test.ts` — 13 passed
- `pnpm --filter @gh-radar/shared exec vitest run src/__tests__/journal.test.ts` — 7 passed
- shared 전체 115 passed · server 전체 31 files / 261 passed
- typecheck: shared · relay · relay tests · webapp(+e2e) · server 전부 0 error. 유니온 확장으로 깨진 exhaustive switch 없음 → 무시 case 추가 불필요

## Decisions Made

- `resolveTradeDate` 는 NaN 검사에 더해 「KST 로 다시 내린 날짜 == 입력」 을 본다. `2026-02-30` 이 JS 에서 3월 2일(KST)로 넘어가므로 NaN 검사만으로는 Postgres 가 `date` 캐스트를 거부해 500 이 난다. 테스트 ⑯-e 가 두 값을 모두 잠근다.
- 공개 컬럼 상수에 `satisfies readonly (keyof JournalOrderDbRow)[]` 를 걸어 오타·누락을 컴파일 시점에 잡고, 단위 테스트가 목록 = 매퍼 원문 키 집합을 단언한다.

## Deviations from Plan

None - plan executed exactly as written. (`2026-02-30` 400 케이스와 `?date=abc` 케이스는 plan 의 `<behavior>`·판정 규칙 범위 안에서 테스트를 보강한 것이다.)

## Issues Encountered

None.

## Notes for Later Plans

- `webapp/src/lib/orders-api.ts:10-11` 주석이 지워진 `kstDayRangeUtc` 를 가리킨다. webapp 은 이 plan 의 범위 밖이라 두었다 — 19-06(webapp 이 `JournalOrderRow` 로 옮겨 가는 plan)에서 함께 고칠 것.
- server 는 **배포하지 않았다.** 응답 모양이 `DmaOrderRow` → `JournalOrderRow` 로 바뀌었으므로 19-12 에서 webapp push 직전에만 배포한다(Pitfall 12). 원격 DB 에 19-01 마이그레이션이 아직 없으므로 지금 배포하면 RPC 부재로 500 이다.

## Threat Flags

없음 — 새 경로·새 인증 경로 없음. T-19-17(p_user_id 출처) · T-19-08(주문자 부재) · T-19-24(오류 원문) · T-19-25(가짜 날짜) 모두 테스트로 잠갔다.

## Next Phase Readiness

- 19-05(relay 관찰자 기록기)는 적용 RPC 반환 `rows` 를 `toJournalOrderRow` 로 바꿔 `RelayJournalRowsMsg` 로 푸시하면 된다.
- 19-06(webapp)은 `JournalOrderRow` · `RelayJournalRowsMsg` · `RelayJournalStateMsg` 를 import 해 카드 병합(id · lastSeq)을 다시 짠다.

## Self-Check: PASSED

- FOUND: packages/shared/src/journal.ts
- FOUND: packages/shared/src/__tests__/journal.test.ts
- FOUND: e2627dc
- FOUND: c47829e
- acceptance: `from("dma_orders")` 0줄 · `dma_journal_orders_for_user` 존재 · `p_user_id: userId` 존재 · 라우트 `req.userId` 존재 · journal.ts 의 `dma_user_id`/`dmaUserId` 는 주석 줄만 · `"journal.rows"`·`"journal.state"` relay.ts 존재 · index.ts export 존재
