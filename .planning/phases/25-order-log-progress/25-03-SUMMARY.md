---
phase: 25-order-log-progress
plan: 03
subsystem: database · shared · server
tags: [supabase, pgtap, rpc, express, zod, order-log, timeline]
status: complete

requires:
  - phase: 25-01
    provides: dma_strategy_events · dma_strategy_apply(공개 45키 투영) · shared toStrategyEventRow · 하루 흐름 픽스처
  - phase: 19 (관찰자 저널)
    provides: dma_journal_events · dma_account_orders · dma_account_access · dma_journal_orders_for_user 가시성 조인
provides:
  - "원격 미적용 마이그레이션 1 — dma_strategy_events_for_user(uuid, date) · dma_order_events_for_user(uuid, uuid, text[]) · EXECUTE 잠금 3줄씩"
  - "pgTAP dma_strategy_read.test.sql 24 단언 — 가시성 매트릭스 · 같은 ms 통보 먼저 · 원주문번호 일치 · 포이즌 제외 · 공개 컬럼 · 권한"
  - "shared order-timeline — JournalEventRow · JOURNAL_EVENT_PUBLIC_KEYS(24) · toJournalEventRow · OrderTimelineDbRow · OrderTimelineRow · toOrderTimelineRow · compareTimelineAsc · timelineRowKey"
  - "server GET /api/orders/:id/events (OrderEventsParams · OrderEventsQuery · listOrderEvents)"
  - "server GET /api/strategy-events (StrategyEventsQuery · listStrategyEvents · strategyEventsRouter)"
affects: [25-07, 25-08, 25-10, 25-11]

actuals:
  tokens: 15900
  tasks: 3
  commits: 6
plan_head_before: 8f16576c3e96fde143f3358d3ab14bd0023f73ba

tech-stack:
  added: []
  patterns:
    - "주문 1건 조회는 클라가 계좌를 싣지 않는다 — 행 id 하나로 게이트웨이 · 거래일 · 계좌를 DB 가 정한다(변조 · 멀티 게이트웨이 동시 차단)"
    - "두 소스 타임라인은 RPC 가 ms 정수로 통일하고 같은 ms 는 소스 순위(통보 0 · 전략 1) → seq — 서로 다른 seq 공간을 seq 만으로 섞지 않는다"
    - "pgTAP 순서 단언은 판별력이 있게 — 통보 seq(11)를 같은 ms 전략 seq(2)보다 크게 둬 소스 순위를 빼면 not ok 가 난다(변이 확인)"

key-files:
  created:
    - supabase/migrations/20260929180200_dma_strategy_read_rpcs.sql
    - supabase/tests/dma_strategy_read.test.sql
    - packages/shared/src/order-timeline.ts
    - packages/shared/src/__tests__/order-timeline.test.ts
    - server/src/routes/strategy-events.ts
    - server/tests/routes/strategy-events.test.ts
  modified:
    - packages/shared/src/index.ts
    - server/src/schemas/orders.ts
    - server/src/services/dma-orders.ts
    - server/src/routes/orders.ts
    - server/src/app.ts
    - server/tests/routes/orders.test.ts

key-decisions:
  - "dma_order_events_for_user 는 행 id 가 요청 사용자에게 보일 때만 그 행의 (gateway, trade_date, account_no) 로 두 소스를 거른다 — orderNos 에 남의 계좌 주문번호를 끼워도 행의 계좌 밖으로 나가지 않는다(T-25-13)"
  - "UNION 정렬은 서브쿼리로 감싼 뒤 ORDER BY gw_time_ms, CASE source WHEN 'journal' THEN 0 ELSE 1 END, seq — Postgres 는 UNION 결과 ORDER BY 에 식을 허용하지 않는다"
  - "통보 ev 의 gwTimeMs 는 RPC 바깥 칸 gw_time_ms 정수를 쓴다 — ev 안 ISO gw_time 을 다시 파싱하지 않는다(Pitfall 9)"
  - "timelineRowKey 에 source 를 넣는다 — 통보와 전략은 같은 epoch 의 별도 seq 공간이라 같은 seq 가 두 줄일 수 있다"
  - "orderNos= (빈 값)은 400 — 원소 1개가 빈 문자열이라 1~20자 규칙 위반. 생략만 [] 로 RPC 대체 경로를 탄다"
  - "StrategyEventsQuery 는 OrderListQuery 별칭 — 두 하루치 목록의 날짜 규칙을 한 정의로"

patterns-established:
  - "요청 1 = RPC 1 조회 라우트: zod(params · query) → 서비스(rpc 1회 · DbError) → shared 매퍼 → bare array"

requirements-completed: []

coverage:
  - id: D1
    description: "조회 RPC 2 — 하루치 평면 목록(계좌 조인 + 시세 kind 1·2 공개) · 주문 이벤트 UNION(통보 → 전략) · EXECUTE 잠금"
    verification:
      - kind: integration
        ref: "bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_strategy_read.test.sql (1..24 · not ok 0)"
        status: pass
      - kind: integration
        ref: "bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_strategy_apply.test.sql (1..30 회귀)"
        status: pass
      - kind: integration
        ref: "bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/dma_journal_apply.test.sql (1..79 회귀)"
        status: pass
    human_judgment: false
  - id: D2
    description: "shared 주문 타임라인 계약 — 매핑 · 24 공개 키 · 같은 ms 통보 먼저 정렬 · source 포함 키"
    verification:
      - kind: unit
        ref: "packages/shared/src/__tests__/order-timeline.test.ts (7 passed) · shared 전체 161 passed · shared build"
        status: pass
    human_judgment: false
  - id: D3
    description: "GET /api/orders/:id/events — 401 · uuid 400 · orderNos 상한/형식 400 · 사용자 id 고정 · RPC 1회 · 생략 = [] · bare array · 500"
    verification:
      - kind: integration
        ref: "server/tests/routes/orders.test.ts#GET /api/orders/:id/events (Phase 25 D-01 · D-02) (8 passed · 파일 21 passed)"
        status: pass
    human_judgment: false
  - id: D4
    description: "GET /api/strategy-events — 401 · date 형식/실재 400 · 생략 = KST 오늘 · 사용자 id 고정 · RPC 1회 · bare array · dmaUserId 방어 · 500"
    verification:
      - kind: integration
        ref: "server/tests/routes/strategy-events.test.ts (6 passed) · server 전체 275 passed · typecheck error TS 0"
        status: pass
    human_judgment: false

duration: 11min
completed: 2026-09-29
---

# Phase 25 Plan 03: 조회 RPC 2 · 주문 타임라인 계약 · server 라우트 2 Summary

**하루치 주문로그(계좌 조인 + 시세 kind 1·2 게이트웨이 공개)와 주문 1건 타임라인(통보 + 전략 UNION · 같은 ms 통보 먼저)을 service_role 전용 RPC 1회씩으로 세우고, shared 매퍼 한 벌로 `GET /api/strategy-events` · `GET /api/orders/:id/events` bare array 로 서빙한다.**

## Performance

- **Duration:** 11 min
- **Started:** 2026-09-29T10:08:43Z
- **Completed:** 2026-09-29T10:19:57Z
- **Tasks:** 3 (각 RED → GREEN 2커밋)
- **Files:** 12 (신규 6 · 수정 6)

## Accomplishments

### 함수 시그니처 2 (원격 미적용 마이그레이션 1개 — `20260929180200_dma_strategy_read_rpcs.sql`)

- `public.dma_strategy_events_for_user(p_user_id uuid, p_trade_date date) RETURNS SETOF jsonb` — 주문 이벤트(kind ∉ {1,2})는 `dma_account_access` 계좌 조인, 시세 이벤트(kind 1·2)는 그 게이트웨이 매핑 보유 사용자 전원 · 투영 = 25-01 적용 RPC rows 와 같은 공개 45키 · `ORDER BY gw_time_ms, gateway, seq`
- `public.dma_order_events_for_user(p_user_id uuid, p_order_id uuid, p_order_nos text[]) RETURNS TABLE (source text, gw_time_ms bigint, seq bigint, ev jsonb)` — `:id` 행이 보일 때만 그 행의 (gateway, trade_date, account_no) 로 통보(주문번호 또는 원주문번호 일치 · `apply_error IS NULL`)와 전략(주문번호 일치)을 UNION ALL · 빈 배열/NULL → 행 자신의 주문번호 · 정렬 gw_time_ms → 통보 먼저 → seq
- 두 함수 모두 `REVOKE … FROM PUBLIC` · `REVOKE … FROM anon, authenticated` · `GRANT … TO service_role` (시그니처 정확히). POLICY 0개.
- **원격 미적용** — 25-11 에서 사용자가 `supabase db push`.

### 라우트 2

- `GET /api/orders/:id/events?orderNos=a,b,c` → `OrderTimelineRow[]` (`:id` uuid · orderNos 1~100개 · 각 1~20자 영숫자 · 생략 = `[]`)
- `GET /api/strategy-events?date=YYYY-MM-DD` → `StrategyEventRow[]` (생략 = KST 오늘 · `2026-02-30` 400)

### pgTAP 단언 수

- `dma_strategy_read.test.sql` **24** (가시성 매트릭스 9 · 순서/포함/제외 4 · 공개 컬럼 3 · 남의 행 id/매핑 없음/빈 배열/NULL/없는 id 5 · 권한 2 · 픽스처 전제 1)

## Task Commits

1. **Task 1: 조회 RPC 2 + pgTAP**
   - RED `a092943f` (test) — `function public.dma_strategy_events_for_user(unknown, unknown) does not exist` (psql exit 3)
   - GREEN `c6bf5828` (feat) — 24/24 · 적용 회귀 30/30 · 저널 회귀 79/79
2. **Task 2: shared 타임라인 계약 + GET /api/orders/:id/events**
   - RED `1c4e674c` (test) — `Cannot find module '../order-timeline'` · 라우트 8건 실패
   - GREEN `2207ffcb` (feat) — shared 7/7 · orders 21/21 · typecheck 0
3. **Task 3: GET /api/strategy-events**
   - RED `ef1bef20` (test) — 6건 실패(라우트 없음)
   - GREEN `da92ae87` (feat) — 27/27 · server 전체 275/275

## 검증 결과

| 명령 | 결과 |
|---|---|
| pgTAP `dma_strategy_read.test.sql` | 1..24 · not ok 0 |
| pgTAP `dma_strategy_apply.test.sql` (회귀) | 1..30 · not ok 0 |
| pgTAP `dma_journal_apply.test.sql` (회귀) | 1..79 · not ok 0 |
| 변이 확인 — RPC ORDER BY 에서 소스 순위 제거 | not ok 11 (판별력 확인 후 원복) |
| shared `order-timeline.test.ts` / 전체 · build | 7 passed / 161 passed · tsup OK |
| server `orders.test.ts` + `strategy-events.test.ts` | 27 passed |
| server 전체 `vitest run` | 275 passed (연속 3회 + `--no-file-parallelism` 1회) |
| server · relay · webapp typecheck | error TS 0 |

## Decisions Made

frontmatter `key-decisions` 참조.

## Deviations from Plan

### 해석 · 보강

**1. [해석] 포이즌 픽스처를 정정(M) 통보로**
- **Found during:** Task 1 RED 첫 실행
- **Issue:** Behavior 의 「포이즌(isin 11자)」 을 12451 주문번호 통보로 넣으면 이미 있는 12451 투영 행을 갱신할 뿐 isin CHECK 에 걸리지 않아 `apply_error` 가 NULL 이었다(투영이 기존 행 isin 을 다시 쓰지 않음).
- **Fix:** 새 주문번호 12470 · 원주문번호 12451 · isin 11자 정정(M) 통보로 — 새 행 삽입이 CHECK 에 걸려 `apply_error` 가 남고, 원주문번호 일치 경로로 12451 펼침 후보가 되므로 「apply_error 제외」 가 실제로 판별된다. 픽스처 전제 단언(1번)으로 잠갔다.
- **Commit:** a092943f

**2. [보강] 같은 ms 순서 단언의 판별력**
- 처음 픽스처는 통보 A seq 1 · 전략 BuyOrder seq 2 라 seq 만으로 정렬해도 통과했다. 통보 seq 를 11~15 로 옮겨(전략 seq 2 보다 큼) 소스 순위가 빠지면 실패하도록 고쳤고 변이로 확인했다.
- **Commit:** c6bf5828

**3. [보강] 픽스처 추가** — 다른 계좌(…7802) 같은 주문번호 12451 통보 · 어제 날짜 전략 이벤트 · `orderNos` 에 남의 계좌 번호 끼우기 · 없는 행 id — T-25-13 · 날짜 필터를 직접 단언.

**4. [해석] `orderNos=`(빈 값) → 400** — 생략만 `[]`. 빈 값은 원소 1개가 빈 문자열이라 1~20자 규칙 위반으로 본다.

---

**Total deviations:** 0 auto-fixed (Rule 1~3 없음) + 해석 2 + 보강 2. **Impact:** 스코프 변화 없음 — 테스트 판별력 강화 · 픽스처 경로 조정.

## Issues Encountered

- server 전체 `vitest run` 첫 두 번에 서로 다른 파일에서 supertest `read ECONNRESET` 1건씩(첫 회 `orders.test.ts` ㉕-c2, 둘째 회 이 플랜과 무관한 `search.test.ts`). 이후 연속 3회 + 파일 직렬 1회 모두 275/275 — 로컬 병렬 소켓 간헐 오류로 판단(코드 결함 아님). 로그 없이 넘기지 않으려고 기록만 남긴다.

## Known Stubs

없음.

## User Setup Required

없음 — docker 이미지는 이미 있다. 원격 마이그레이션 적용은 25-11 결정 체크포인트.

## Next Phase Readiness

- 25-07/25-08(오늘 주문 펼침 · 주문로그 탭)이 `toOrderTimelineRow` · `compareTimelineAsc` · `timelineRowKey` 와 `GET /api/strategy-events` 를 바로 쓸 수 있다.
- **원격 DB 에는 두 RPC 가 아직 없다** — server 를 배포하면 두 라우트가 500 `DB_ERROR` 를 낸다. server 배포는 25-11 마이그레이션 적용 뒤여야 한다.
- 로컬 거부 행(`order_no` NULL)은 `p_order_nos` 대체값이 NULL 이라 펼침 이벤트가 0행이다 — UI 가 주문번호 없는 행에 펼침을 달지 않는다는 전제(필요하면 `journal_epoch · reject_seq` 매칭 추가).

## Self-Check: PASSED
