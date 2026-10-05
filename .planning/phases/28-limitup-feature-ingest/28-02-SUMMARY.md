---
phase: 28-limitup-feature-ingest
plan: 02
subsystem: database · server · shared · relay (주문로그 kind 15 가시성)
tags: [supabase, pgtap, rpc, jsonb, max-rows, express, zod, relay, websocket, limit-feature]
status: complete

requires:
  - phase: 27-auto-sell-integration
    provides: "dma_strategy_events 표 · dma_strategy_events_for_user(20261003120000 집합 1·2·10) · jsonb 래퍼 선례 20261004090000 · relay WsFanout 의 isMarketStrategyEvent 판정"
provides:
  - "마이그레이션 20261006090000: dma_strategy_events_for_user 시세 집합 (1, 2, 10, 15)"
  - "신규 RPC dma_strategy_events_for_user_json(uuid, date, boolean DEFAULT false) → jsonb 배열(max_rows 무관 · kind 15 기본 제외)"
  - "신규 RPC dma_strategy_events_purge_limit_feature(integer) → integer(지운 kind 15 행 수) — 28-06 워커가 30 으로 부른다"
  - "부분 인덱스 idx_dma_strategy_events_limit_feature_day (trade_date) WHERE kind = 15"
  - "server GET /api/strategy-events ?lf=0|1 · listStrategyEvents(supabase, userId, date?, includeLimitFeature = false)"
  - "shared STRATEGY_EVENT_KIND.LimitFeature = 15 · isMarketStrategyEvent(15) 참 · strategyKindLabel(15) = 「상한가특징」"
affects: [28-06, 28-09, 28-11, 28-14, 28-15]

plan_head_before: 0a6f77259427c7e53ca2c0e7bdcda91f13adafe9
actuals:
  tokens: 10000   # chars/4 over 28-02 두 커밋의 추가 줄(39,969자)
  tasks: 2
  commits: 4      # MEASURED rev-list 0a6f7725..HEAD — 그중 28-02 자기 커밋 2개(ae1fe66c · 52da41a5) · 나머지 2개는 동시 세션 Phase 27 커밋(66699be3 · 4e77d2e6)

tech-stack:
  added: []
  patterns:
    - "SETOF RPC 를 스칼라 jsonb 래퍼로 접어 PostgREST max_rows 침묵 절단을 피한다 — 가시성 정본은 SETOF 한 곳, 래퍼는 필터 인자만"
    - "시세 kind 집합 이중 정본(SQL RPC ↔ shared isMarketStrategyEvent) — 서로의 파일명을 주석에 적는다"
    - "pgTAP 날짜는 KST 오늘 상대값(pg_temp.kd) — now() 기준 purge 단언이 시간이 지나도 안 바뀐다"

key-files:
  created:
    - supabase/migrations/20261006090000_dma_strategy_events_limit_feature.sql
    - supabase/tests/dma_strategy_limit_feature.test.sql
  modified:
    - server/src/schemas/orders.ts
    - server/src/services/dma-orders.ts
    - server/src/routes/strategy-events.ts
    - server/tests/routes/strategy-events.test.ts
    - packages/shared/src/strategy-event.ts
    - packages/shared/src/strategy-event-labels.ts
    - packages/shared/src/__tests__/strategy-event-text.test.ts
    - packages/shared/src/__tests__/strategy-event-labels.test.ts
    - relay/tests/journal-push.test.ts

key-decisions:
  - "kind 15 는 RPC · shared · relay 푸시 세 곳에서 같은 판정(시세 집합 {1, 2, 10, 15})으로 그 게이트웨이 가시 계좌 보유자 전원에게 보인다(D-06)"
  - "기본 조회는 jsonb 래퍼로 kind 15 를 뺀다 — ?lf=1 일 때만 싣는다. lf 는 \"0\" | \"1\" 만, 응답이 배열이 아니면 500(D-18)"
  - "purge 는 kind 15 만 · trade_date < KST 오늘 − p_keep_days(경계일 오늘 − 30 은 남는다) · 주문 · 시세 1/2/10 은 감사 기록이라 손대지 않는다(D-08)"
  - "기존 SETOF 함수는 지우지 않는다 — 마이그레이션 → server 배포 순서에서 조회 무중단"

patterns-established:
  - "server 의 하루치 목록 RPC 는 모두 jsonb 래퍼 + Array.isArray 계약 검사(listTodayOrders · listStrategyEvents)"

requirements-completed: [D-06, D-08, D-18]

coverage:
  - id: D1
    description: "kind 15 시세 가시성 — KB 매핑 사용자 U1·U2 에게 보이고 매핑 없는 U3 · KYOBO 만 가진 U4 에게 안 보인다(SETOF)"
    requirement: D-06
    verification:
      - kind: integration
        ref: "supabase/tests/dma_strategy_limit_feature.test.sql#1-5 (bash scripts/verify-dma-orders-price-check.sh --test …)"
        status: pass
      - kind: integration
        ref: "supabase/tests/dma_strategy_read.test.sql (회귀 28건)"
        status: pass
    human_judgment: false
  - id: D2
    description: "jsonb 래퍼 dma_strategy_events_for_user_json — 기본 kind 15 제외 · true 면 포함 · SETOF 와 같은 순서 · 원소 바이트 동일 · 빈 날 []"
    requirement: D-18
    verification:
      - kind: integration
        ref: "supabase/tests/dma_strategy_limit_feature.test.sql#6-14"
        status: pass
    human_judgment: false
  - id: D3
    description: "purge RPC 와 부분 인덱스 — −31일 kind 15 만 1행 삭제 · 경계 −30 · 최근 · 비-15 유지 · 재실행 0 · 인덱스 술어 kind = 15"
    requirement: D-08
    verification:
      - kind: integration
        ref: "supabase/tests/dma_strategy_limit_feature.test.sql#15-21"
        status: pass
    human_judgment: false
  - id: D4
    description: "세 함수 service_role 전용 — anon · authenticated EXECUTE 불가"
    verification:
      - kind: integration
        ref: "supabase/tests/dma_strategy_limit_feature.test.sql#22-24"
        status: pass
    human_judgment: false
  - id: D5
    description: "server GET /api/strategy-events — _json 래퍼 1회 · ?lf=1 → true · 기본/lf=0 → false · lf 2/true/'' → 400 · 배열 아님 → 500"
    requirement: D-18
    verification:
      - kind: integration
        ref: "server/tests/routes/strategy-events.test.ts#①~⑧"
        status: pass
    human_judgment: false
  - id: D6
    description: "shared 시세 집합 15 · 라벨 「상한가특징」 · relay 라이브 푸시가 KB kind 15 를 KB 매핑 사용자 전원에게 · KYOBO 연결만 가진 사용자에게는 0"
    requirement: D-06
    verification:
      - kind: unit
        ref: "packages/shared/src/__tests__/strategy-event-text.test.ts#isMarketStrategyEvent 는 kind 1 · 2 · 10 · 15 만 참"
        status: pass
      - kind: unit
        ref: "packages/shared/src/__tests__/strategy-event-labels.test.ts#표시명 표 전수"
        status: pass
      - kind: integration
        ref: "relay/tests/journal-push.test.ts#Phase 28 kind 15 라이브 푸시"
        status: pass
    human_judgment: false
  - id: D7
    description: "원격 DB 에서 kind 15 가 실제로 보이는지(마이그레이션 원격 적용 후)"
    verification: []
    human_judgment: true
    rationale: "원격 적용은 28-14 [BLOCKING] supabase db push(메인 세션) — 이 플랜은 로컬 일회용 컨테이너 재생으로만 검증했다"

duration: 8min
completed: 2026-10-05
---

# Phase 28 Plan 02: kind 15 가시성 · jsonb 래퍼 · purge Summary

**kind 15(상한가 특징)를 시세 집합 {1, 2, 10, 15} 로 RPC · shared · relay 푸시 세 곳에서 같은 판정으로 열고, 기본 주문로그 조회는 jsonb 래퍼(max_rows 절단 없음)로 kind 15 를 빼며 `?lf=1` 일 때만 싣는다. 30일 보존용 purge RPC 와 부분 인덱스가 28-06 워커를 기다린다.**

## Performance

- **Duration:** 8 min (2026-10-05T08:32:12Z → 08:39:49Z)
- **Tasks:** 2/2
- **Files:** 11 (신규 2 · 수정 9) · +660 / −28

## Accomplishments

- 마이그레이션 `20261006090000`: SETOF 함수 본문은 20261003120000 그대로 두고 kind 조건 두 곳만 `(1, 2, 10, 15)` 로 바꿨다. 같은 파일에 jsonb 래퍼 · purge RPC · 부분 인덱스가 있고, 세 함수 모두 `REVOKE … FROM PUBLIC` · `FROM anon, authenticated` · `GRANT … TO service_role` 를 명시했다.
- pgTAP `dma_strategy_limit_feature.test.sql`: **plan(24) — 24/24 ok · `# RESULT: PASS`**. 회귀 `dma_strategy_read.test.sql`: **28/28 · PASS**(53개 마이그레이션 재생).
- server: `StrategyEventsQuery = OrderListQuery.extend({ lf })` · `listStrategyEvents(…, includeLimitFeature = false)` → `dma_strategy_events_for_user_json` · `Array.isArray` 계약 검사.
- shared: `LimitFeature: 15`(칸 재해석 JSDoc — 인박스 「(B)」 매핑) · `isMarketStrategyEvent` 15 참 · 라벨 `15: "상한가특징"`. relay 코드는 바꾸지 않았고, shared 판정 import 로 라이브 푸시가 따라온다(테스트로 증명).

### server 테스트 케이스 (`server/tests/routes/strategy-events.test.ts` 8건)

① 미인증 401 · RPC 0 / ② 형식 위반 · 날짜 아닌 date 400 / ③ date 생략 → `_json` 1회 `{p_user_id, p_trade_date: KST 오늘, p_include_limit_feature: false}` · 쿼리 user_id 무시 / ④ date 그대로 + `false` / ⑤ bare array · dma_user_id 비노출 / ⑥ RPC 오류 500 원문 비노출 / **⑦ lf=1 → true · lf=0 → false · lf 2/true/'' → 400 · RPC 0** / **⑧ data 객체 · null → 500 DB_ERROR**

## Task Commits

1. **Task 1: kind 15 가시성 세로 조각 — 마이그레이션 + pgTAP + server `?lf=1`** — `ae1fe66c` (feat)
2. **Task 2: shared 시세 집합 15 · 라벨 + relay 라이브 푸시 테스트** — `52da41a5` (feat)

## TDD

- Task 1 RED: 마이그레이션 없이 pgTAP 실행 → `function public.dma_strategy_events_for_user_json(uuid, date, boolean) does not exist` · `# RESULT: FAIL`. server 테스트 먼저 바꾼 뒤 4건 실패(③ ④ ⑤ ⑦) → 구현 후 8/8.
- Task 2: 테스트와 구현을 한 번에 고쳤다. 별도 RED 실행 기록은 없다. 첫 실행 실패는 테스트 파일의 `STRATEGY_EVENT_KIND` import 누락이었다. relay 신규 2건은 shared 판정이 15 를 빼면 계좌 '' 행이 아무에게도 가지 않으므로 판별력이 있다.

## Verification

| 명령 | 결과 |
|---|---|
| `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_strategy_limit_feature.test.sql` | 1..24 · `# RESULT: PASS` |
| `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_strategy_read.test.sql` | 1..28 · `# RESULT: PASS` |
| `pnpm --filter @gh-radar/server run typecheck` · server vitest 전체 | clean · 33 files / 292 passed |
| shared vitest 전체 | 15 files / 320 passed |
| relay typecheck · typecheck:tests · `run test` | clean · 36 files / 1000 passed |
| webapp typecheck · `run test` | clean · 141 files / 3334 passed (1 skipped) |

## Deviations from Plan

None - plan executed exactly as written. 계획에 없던 보강이 두 가지 있다(계획 범위 안):
- pgTAP 에 경계일(KST 오늘 − 30) kind 15 행과 purge 재실행 0 단언을 더했다. `<` 경계를 잠근다.
- relay 테스트에 KYOBO kind 15 → KYOBO 신원 연결 사용자만 받는 대칭 케이스를 더했다. 이를 위해 하네스에 KB 매핑 없는 사용자 `USER_K`(`dma-kyobo-only`)를 추가했다.

**Total deviations:** 0. **Impact:** 없음.

## Issues Encountered

- pgTAP plan 수를 처음에 23 으로 잘못 셌다(실제 24). 러너는 개수가 맞지 않아도 `not ok` 가 없으면 PASS 를 내므로 바로 24 로 고쳤다.

## Notes for Later Plans

- **배포 순서 주의(28-14/28-15):** relay 를 다시 배포하면 kind 15 가 `journal.events` 로 라이브 푸시된다. 웹 리듀서가 kind 15 를 별도 스토어로 나누기 전(RESEARCH C-2 · Pitfall 3, 웹 쪽 플랜)에 relay 가 먼저 나가면, 분당 kind 15 행이 `strategyEvents`(상한 5000)를 채워 주문 이벤트를 밀어낸다. relay 재배포는 웹 스토어 분리가 반영된 뒤에 해야 한다.
- `relay/src/ws/fanout.ts` `deliverStrategyEvents` JSDoc 에 「시세 이벤트(kind 1·2)」 가 아직 남아 있다(옛 문구). 플랜이 relay 코드 무변경을 지시해 이번에는 고치지 않았다. 다음에 relay 를 손볼 때 「1·2·10·15」 로 갱신하면 된다.
- server 기본 응답이 kind 15 를 빼는 것은 원격에 래퍼가 생긴 뒤의 일이다. 마이그레이션 → server 순서는 D-22 를 따른다.

## Known Stubs

None.

## Next

Ready for 28-03.

## Self-Check: PASSED
