---
phase: 16-trading-limit-chaser-vi-my-page
plan: 28
subsystem: relay
tags: [dma, dma-orders, postgres, unique-index, sqlstate, vitest]

requires:
  - phase: 16
    provides: "16-18 이 넣은 부분 UNIQUE 인덱스 `idx_dma_orders_user_order_no_kst_day` (프로덕션 실재)"
  - phase: 16
    provides: "16-24 가 만든 `flushNow` 라운드 상한 `ORDER_FLUSH_MAX_ROUNDS`"
provides:
  - "`supabaseOrderInsertSink` 의 `23505` 수렴 경로 — 경주에서 진 insert 가 기존 행 id 로 수렴하고 warn 을 남긴다"
  - "`supabaseOrderSink` 의 `order_no` 채우기 갱신 `23505` 처리 — throw 대신 사유 있는 error 로그, 드롭 카운터 미오염"
  - "`fakeDmaOrders` 하네스의 insert 지원 + 부분 UNIQUE 인덱스 실동작 흉내"
  - "`ORDER_FLUSH_MAX_ROUNDS` 세 라운드의 정체를 적은 docstring (식과 근거가 같은 수)"
affects: [relay 감사 기록 경로, order-handler ensureRow · finish, 16-29 이후 갭 클로징]

tech-stack:
  added: []
  patterns:
    - "SQLSTATE 로 실패의 **의미**를 가른다 — `23505` 는 「쓸 수 없다」가 아니라 「이미 있다」"
    - "재시도로 풀리지 않는 실패는 재큐잉하지 않고 사유 있는 error 로 끝낸다 (드롭 카운터 오염 방지)"
    - "제약 흉내 테스트 하네스 — 「에러를 던지도록 설정」이 아니라 3축 충돌을 실제로 계산"

key-files:
  created: []
  modified:
    - relay/src/store/orders.ts
    - relay/tests/order-store.test.ts

key-decisions:
  - "update 의 `23505` 분기 조건을 **셀렉터 컬럼이 아니라 patch** 에 건다 — 계획이 지목한 `finish` 경로는 셀렉터가 `id` 다 (계획 문구대로였다면 그 경로를 비켜 갔다)"
  - "update 의 `23505` 는 throw 하지 않고 error 로그로 끝낸다 — 재시도해도 결과가 같고, `#dropped` 를 올리면 「이유를 아는 실패」가 「이유를 모르는 실패」와 섞인다"
  - "새 로그에 `error` 원문을 싣지 않는다 — Postgres UNIQUE 위반 detail 이 주문번호 원문을 담는다 (T-16-45)"
  - "`ORDER_FLUSH_MAX_ROUNDS` 는 (a)안 — 식 `+2` 유지, docstring 에 세 라운드의 정체를 명시"

patterns-established:
  - "회귀 잠금 실증: 새 분기를 `false` 로 무력화해 새 테스트가 실제로 실패하는지 확인 후 복원 (16-27 승계)"

requirements-completed: []

duration: 18min
completed: 2026-09-09
---

# Phase 16 Plan 28: `23505` 수렴 · 상한 상수 정합 Summary

**16-18 의 부분 UNIQUE 인덱스가 경주를 「두 벌 기록」에서 「기록 소실」로 바꿔 놓았던 것을 되돌렸다 — `23505` 를 「이미 있다」로 읽어 그 행으로 수렴시키고(GC-WR-08), `ORDER_FLUSH_MAX_ROUNDS` 의 `+2` 가 주석과 다른 수를 말하던 상태를 없앴다(GC-IN-04).**

## Performance

- **Duration:** 약 18분
- **Tasks:** 2/2
- **Files modified:** 2
- **신규 마이그레이션:** 0건 (이 plan 은 DB 를 바꾸지 않는다)

## Accomplishments

### Task 1 — `23505` 수렴 (GC-WR-08 / T-16-52 · T-16-53) · commit `f7435e9`

**① insert 경로 (`supabaseOrderInsertSink`, `relay/src/store/orders.ts`).**

`23505` **이면서** `row.orderNo` 가 비어 있지 않을 때만 `supabaseOrderLookupSink(supabase)(row.userId, row.orderNo)` 로 같은 3축(`user_id` · `order_no` · KST 당일)을 재조회하고, 찾으면 그 `id` 를 돌려준다. 빈 `orderNo` 는 부분 인덱스(`WHERE order_no IS NOT NULL`)의 대상이 아니라 애초에 이 위반이 날 수 없으므로 재조회하지 않는다. 재조회가 `null` 이면 지어내지 않고 기존 경로로 떨어진다.

수렴 시 `logger.warn({ origin, code: "23505" }, "[orders] 같은 사용자·같은 날의 같은 주문번호 insert 경주 — 기존 행으로 수렴")`. 조용히 수렴하면 이 경로가 얼마나 도는지 영원히 모른다(S-5). 계좌번호·주문번호 원문은 싣지 않는다(T-16-45).

**다른 코드는 이 plan 전후로 완전히 동일하다** — `logger.error({ error, origin }, "[orders] dma_orders insert 실패")` + `throw`. 예외 삼키기를 넓히지 않았다.

**② update 경로 (`supabaseOrderSink`).**

`patch.order_no !== undefined` **이면서** `code === "23505"` 일 때만 `logger.error({ column, code: "23505" }, "[orders] order_no 갱신이 UNIQUE 위반 — 같은 주문번호 행이 이미 있다(감사 기록 분기). 재시도로 풀리지 않으므로 드롭 카운터를 올리지 않는다")` 를 남기고 **정상 반환**한다. throw 하지 않는 근거를 코드 주석에 적었다: 원인이 데이터 분기라 재시도 1회를 태워도 결과가 같고, `#dropped` 를 올리면 「이유를 아는 실패」가 「이유를 모르는 실패」와 뒤섞여 카운터가 오염된다.

**③ 테스트 3케이스** (`relay/tests/order-store.test.ts` — 새 describe `23505 수렴 (GC-WR-08)`).

`fakeDmaOrders` 하네스를 확장했다. 스텁이 아니라 **부분 UNIQUE 인덱스를 실제로 계산한다** — `dupToday(user_id, order_no)` 가 `(user_id, order_no, KST 당일)` 3축으로 충돌 행을 찾고, 있으면 실제 PostgREST 처럼 `{ code: "23505", message: 'duplicate key value violates unique constraint "idx_dma_orders_user_order_no_kst_day"' }` 를 돌려준다. 「23505 를 던지도록 설정했다」로 만들면 픽스처에 중복이 없어도 초록이 되어 정작 「같은 3축일 때만 충돌한다」가 검증되지 않는다. `insert()` 빌더(`.select().single()`)와 `insertError` 강제 옵션도 함께 넣었다.

- **⓻** insert 가 `23505` 를 받으면 `row-a-today` 로 수렴하고, 가짜 테이블 행 수가 늘지 않으며, 쿼리 순서가 `["insert", "select"]` 이고 재조회 필터에 `user_id`·`order_no` 가 모두 있다.
- **⓼** `23514` 는 여전히 `rejects` 다. 쿼리는 `["insert"]` 하나뿐 — 재조회로 새지 않는다.
- **⓽** `finish` 의 실제 모양(`{ orderRowId: "row-manual", orderNo, status }` → 셀렉터 `id` + patch `order_no`)으로 `23505` 를 받아도 `dropped: 0` · `retried: 0` · `queued: 0` 이고 쿼리는 1건이다(재큐잉 없음).

### Task 2 — `ORDER_FLUSH_MAX_ROUNDS` 근거 정합 (GC-IN-04 / T-16-54) · commit `a31f529`

**(a)안을 골랐다 — 식 `ORDER_MAX_RETRIES + 2` 를 유지하고 docstring 에 세 라운드의 정체를 적었다.**

선택 근거: `#drain` 은 실패 항목을 `attempts < ORDER_MAX_RETRIES(=1)` 일 때만 재큐잉하므로 **재시도만 놓고 보면 2라운드로 확정 종료**한다(테스트 ⑯ 이 `calls === 2` 로 그것을 잠근다). 그러나 `enqueueUpdate` 는 **동기**이고 DMA 수신 콜백(D-32)은 이 플러시를 기다리지 않는다 — SIGTERM 과 마지막 체결 통보가 겹치면 라운드 2 를 `await` 하는 사이에 큐로 항목이 들어온다. `+1`(=2)로 자르면 그 항목은 **손도 대 보지 못한 채** 「상한 도달 = 감사 기록 결손」 error 로 보고된다. 세 번째 라운드는 재시도가 아니라 **동시 유입 1회분**의 몫이고, 평시에는 루프 머리의 `if (this.#queue.length === 0) return;` 에서 곧바로 반환하므로 비용이 0 이다. 즉 (b)는 코드상 「도달 불가」가 아니라 「가장 지켜야 할 순간에만 도달하는」 라운드를 없애는 선택이었다.

인용 (식과 docstring 이 같은 수를 말한다):

- docstring: `* `flushNow()` 한 번이 도는 배치 **횟수 상한** = 3 (16-24 / WR-09 · T-16-40).`
- 식: `export const ORDER_FLUSH_MAX_ROUNDS = ORDER_MAX_RETRIES + 2;`

라운드별 정체(docstring 발췌): 「1. **첫 배치** … 2. **재시도분** … 3. **종료 확인 라운드** — 1·2 를 `await` 하는 **동안** 다른 경로가 새로 넣은 항목」. 상한에 걸렸을 때의 `logger.error`(남은 큐 길이 포함)는 그대로 유지했다.

## Verification Results

| 검증 | 결과 |
|------|------|
| `pnpm --filter @gh-radar/relay exec vitest run tests/order-store.test.ts` | **27 passed** (기존 24 → +3) exit 0 |
| `pnpm --filter @gh-radar/relay test` | **17 files · 355 tests passed** (16-27 시점 352 → +3) exit 0 |
| `pnpm --filter @gh-radar/relay run typecheck` | exit 0 |
| `pnpm --filter @gh-radar/relay run typecheck:tests` | exit 0 |
| `grep -c '"23505"' relay/src/store/orders.ts` | **4** (≥2) ✅ |
| `grep -c "23505" relay/tests/order-store.test.ts` | **10** (≥1) ✅ |
| `grep -c "수렴" relay/src/store/orders.ts` | **3** (≥1) ✅ |
| `grep -c "이론상 2회면 끝난다" relay/src/store/orders.ts` | **0** ✅ |
| `git status --short supabase/migrations/` | **0건** — DB 를 바꾸지 않았다 ✅ |

**회귀 잠금 실증(16-27 승계).** 두 `23505` 분기의 조건을 임시로 `false` 로 바꿔 실행한 결과 **⓻ 와 ⓽ 가 실제로 실패**했다(`⓽` 는 `AssertionError: expected 1 to be +0` — 드롭 카운터가 오른다). ⓼ 는 그대로 통과했다 — 그 케이스가 잠그는 것은 「분기가 있어도 다른 코드는 새지 않는다」이므로 옳은 결과다. 확인 후 즉시 복원했다. 통과만 보고 넘어가면 그 테스트가 무엇을 지키는지 모른 채 초록불만 얻는다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] update 의 `23505` 분기 조건을 셀렉터가 아니라 patch 에 걸었다**

- **발견 시점:** Task 1 (분기 작성 직후 `selectorOf` 확인 중)
- **문제:** 계획 ②는 「`supabaseOrderSink`(update) 의 **`order_no` 셀렉터 경로**에 같은 코드 해석을 넣는다」고 지시했다. 그런데 이 갭이 지목한 실제 경로 — `order-handler.ts` 의 `finish` 가 수동 행에 접수 주문번호를 채우는 `enqueueUpdate({ orderRowId, orderNo, status, … })` — 는 `selectorOf` 가 **`orderRowId` 를 우선**하므로 셀렉터 컬럼이 `id` 다. `order_no` 는 셀렉터가 아니라 **채울 컬럼**으로 patch 에 실린다. 계획 문구 그대로 `sel.column === "order_no"` 로 좁혔다면 **정작 GC-WR-08 이 이름을 대며 지목한 경로를 통째로 비켜 갔을 것**이고, 테스트도 실제로는 일어나지 않는 조합만 잠갔을 것이다.
- **조치:** 조건을 `patch.order_no !== undefined && code === "23505"` 로 바꿨다. 이 부분 인덱스의 유일한 컬럼이 `order_no` 이므로 그것을 싣지 않는 갱신은 애초에 이 위반을 낼 수 없다 — 조건을 넓히지 않으면서 두 셀렉터 경로를 모두 덮는다. 판단 근거를 코드 주석에 남겼다. 테스트 ⓽ 도 `finish` 의 실제 모양(id 셀렉터 + `order_no` patch)으로 작성했다.
- **파일:** `relay/src/store/orders.ts`, `relay/tests/order-store.test.ts`
- **커밋:** `f7435e9`

### 계획대로 하지 않은 것 (의도적)

- **`requirements.mark-complete` 미실행.** plan frontmatter 에 `requirements: [TRADE-03]` 이 있으나 **돌리지 않았다.** TRADE-03 의 Pending 근거는 프로덕션 `/healthz` 의 `everReadyCount: 0`(16-26 실측) 이고 이 plan 은 그것을 건드리지 않는다. 단위 검증만으로 Complete 로 올리지 않는다(RELAY-02 와 같은 기준).

## Threat Model Coverage

| Threat ID | Disposition | 실제 조치 |
|-----------|-------------|-----------|
| T-16-52 (Repudiation / insert 기록 소실) | mitigate ✅ | `23505` 만 3축 재조회로 수렴 + warn. 다른 코드는 그대로 throw. 회귀 잠금 ⓻·⓼ |
| T-16-53 (Repudiation / update 기록 소실) | mitigate ✅ | `order_no` 채우기 갱신의 `23505` 를 사유 있는 error 로 종결, `#dropped` 미오염. 회귀 잠금 ⓽ |
| T-16-54 (DoS / 라운드 상한) | accept ✅ | 상한 유지. 값(3)과 근거(첫 배치+재시도+동시 유입)를 정합시켰다 |
| T-16-45 (Information Disclosure) | mitigate ✅ | 새 warn/error 에 `error` 원문 미포함 — `origin`·셀렉터 컬럼·SQLSTATE 만. UNIQUE 위반 detail 이 주문번호 원문을 담기 때문 |
| T-16-13 (실서버 접속) | accept ✅ | 가짜 `SupabaseClient` 하네스만. 마이그레이션 재적용·실 DB 접속 0건 |

## Threat Flags

없음 — 새 네트워크 엔드포인트·인증 경로·스키마 변경 없음. 손댄 표면은 기존 쓰기 sink 의 에러 해석 한 갈래뿐이다.

## Known Stubs

없음.

## 남은 것 (이 plan 이 닫지 않는 것)

- **`flushed` 카운터의 의미.** update 의 `23505` 는 정상 반환이므로 `#flushed` 로 세어진다. 「쓰지 못했지만 이유를 아는」 결과를 성공 카운터가 흡수하는 셈이다. 별도 카운터 도입은 이 plan 의 스코프 밖이며, 그 사실 자체는 error 로그로 드러난다.
- **TRADE-03 은 계속 Pending.** 프로덕션 `everReadyCount: 0` 판정(16-26)이 그대로다.
- **배포 미실시.** relay 재배포는 갭 클로징 2라운드 종결 plan 에서 일괄 처리한다.

## Self-Check: PASSED

- `relay/src/store/orders.ts` FOUND (수정)
- `relay/tests/order-store.test.ts` FOUND (수정)
- `.planning/phases/16-trading-limit-chaser-vi-my-page/16-28-SUMMARY.md` FOUND
- commit `f7435e9` FOUND
- commit `a31f529` FOUND
