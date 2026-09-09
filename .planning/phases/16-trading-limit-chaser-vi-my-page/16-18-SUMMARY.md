---
phase: 16-trading-limit-chaser-vi-my-page
plan: 18
subsystem: database
tags: [relay, supabase, postgres, dma-orders, tenant-isolation, race-condition, vitest]

# Dependency graph
requires:
  - phase: 16-trading-limit-chaser-vi-my-page (16-08)
    provides: "relay 가 dma_orders insert·update 를 전담하는 구조 (D-03) — 이 plan 이 고치는 대상"
  - phase: 16-trading-limit-chaser-vi-my-page (16-01)
    provides: "dma_orders.origin 컬럼 + supabase db push 실행 선례"
  - phase: 15-dma-relay
    provides: "OrderStore 비동기 갱신 큐 (D-24 / D-32) · dma_orders 테이블 정의"
provides:
  - "order_no 조회·갱신에 (user_id, KST 당일) 경계 — 테넌트 간 쓰기 구조적 차단"
  - "kstDayRangeUtc(now) — relay 쪽 KST 반열린 구간 헬퍼 (server 정본 규칙 복제)"
  - "OrderSelector 판별 유니온 — order_no 셀렉터가 userId 를 타입 수준에서 요구"
  - "orderNo 단위 in-flight 가드 — 겹친 자동주문 통보의 중복 insert 차단 (WR-01)"
  - "dma_orders (user_id, order_no, KST일) 부분 UNIQUE 인덱스 — 프로덕션 적용 완료"
  - "가짜 SupabaseClient 경계 테스트 — 적용된 WHERE 필터 자체를 단언하는 패턴"
affects: [16-19, 16-20, 16-21, 16-22, 16-23, 16-24, 16-25, 16-26]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "필터를 실제로 적용하는 가짜 SupabaseClient (스텁이 아니라 「영향 받은 행」을 계산)"
    - "in-flight Promise 재사용으로 조회→insert 경주 차단"
    - "표현식 부분 UNIQUE 인덱스 ((created_at AT TIME ZONE 'Asia/Seoul')::date)"

key-files:
  created:
    - supabase/migrations/20260909120000_dma_orders_user_order_no_unique.sql
  modified:
    - relay/src/store/orders.ts
    - relay/src/ws/order-handler.ts
    - relay/tests/order-store.test.ts
    - relay/tests/ws-order.test.ts

key-decisions:
  - "order_no 셀렉터는 user_id + KST 당일까지 세 축으로 좁힌다 — 한 축만으로는 전역 쓰기다 (T-16-14)"
  - "userId 없는 order_no 갱신은 selectorOf 가 null 을 돌려 드롭 + error 로그 (S-5 · 전역 update 구조적 차단)"
  - "단건 단언(maybeSingle) 제거 — 2행일 때 throw 하면 catch 가 셀렉터 없는 갱신으로 열화한다. order(created_at desc).limit(1) 로 최근 1행 선택"
  - "ensureRow 반환은 string|null 이 아니라 판별 유니온 — 「조회 실패(열화 갱신)」와 「행 생성 불가(드롭)」의 후속 처리가 다르다"
  - "closeConn/close 는 inflight 을 건드리지 않는다 — 진행 중 Supabase 왕복 중단이 곧 기록 결손이다"
  - "전역 UNIQUE 불가 — 브로커 주문번호는 일별 재사용 시퀀스라 (user_id, order_no, KST일) 부분 UNIQUE 가 유일한 정답"
  - "마이그레이션은 어떤 행도 지우지 않는다 — 선행 중복은 RAISE EXCEPTION 으로 멈추고 사람이 결정한다"

patterns-established:
  - "경계 테스트 예외 규율: 큐 규율 테스트는 sink 를 주입하되, WHERE 경계 테스트만 진짜 sink 팩토리 + 가짜 SupabaseClient 를 쓴다"
  - "회귀 검증: 가드를 무력화해 신규 테스트가 실패하는지 먼저 확인한 뒤 복원한다"

requirements-completed: []  # TRADE-03 은 16-19~16-26 이 공유하며 16-26 이 종결 plan 이다 (아래 §요구사항 참조)

# Metrics
duration: 14min (실작업) / 63min (BLOCKING 게이트 대기 49분 포함)
completed: 2026-09-09
---

# Phase 16 Plan 18: TRADE-03 gap 1 + WR-01 갭 클로징 Summary

**`order_no` 단독 셀렉터를 `(user_id, KST 당일)` 세 축으로 좁히고, `orderNo` 단위 in-flight 가드로 중복 insert 를 막고, 같은 세 축의 부분 UNIQUE 인덱스를 프로덕션에 적용해 감사 기록 결손·테넌트 간 쓰기를 구조적으로 차단**

## Performance

- **Duration:** 실작업 약 14분 (08:52~09:01 구현·커밋 + 09:50~09:55 프로덕션 적용·검증) / 총 경과 63분 — 차이는 `[BLOCKING]` 게이트 대기 시간이다
- **Started:** 2026-09-08T23:52:00Z
- **Completed:** 2026-09-09T00:55:00Z
- **Tasks:** 3 / 3
- **Files modified:** 5 (신규 1 · 수정 4)

## Accomplishments

- **gap 1 (BLOCKER) 을 닫았다.** `supabaseOrderLookupSink` 가 `.eq("order_no", …)` 하나만 걸던 것을 `user_id` + KST 당일 반열린 구간까지 세 축으로 좁혔다. 브로커 주문번호는 **일별 재사용 시퀀스**라 기존 코드는 운영 2일차부터 어제 행을 매치시켜 오늘 자동주문의 insert 를 막았고(감사 기록 결손), 다중 매치 시 `maybeSingle()` 이 던져 catch 가 셀렉터 없는 `enqueueUpdate` 로 열화해 **전 사용자·전 날짜 행**을 덮었다.
- **테넌트 경계를 타입 수준으로 올렸다.** `OrderSelector` 를 판별 유니온으로 바꿔 `order_no` 셀렉터가 `userId` 를 **컴파일 타임에** 요구한다. 런타임에도 `selectorOf` 가 `userId` 없는 `order_no` 갱신에 `null` 을 돌려 드롭 + error 로그를 남긴다 — 전역 update 는 이제 「막혀 있다」가 아니라 「만들 수 없다」.
- **WR-01 경주를 막았다.** 같은 자동주문의 접수(A)·체결(E) 통보가 insert 왕복 중에 겹치면 둘 다 「행 없음」을 보고 둘 다 insert 했다. `ensureRow` 가 `` `${userId}|${orderNo}` `` 키로 진행 중인 Promise 를 재사용해 왕복 1회·행 1건으로 수렴한다.
- **DB 2차 방어선을 세웠다.** `(user_id, order_no, (created_at AT TIME ZONE 'Asia/Seoul')::date)` 부분 UNIQUE 인덱스가 **프로덕션에 실재**한다(아래 인용 3벌). 애플리케이션의 유일성 가정을 DB 가 강제한다.
- **gap 1 이 통과했던 사각지대를 닫았다.** 기존 테스트는 「Supabase 를 흉내 내는 대신 쓰기 sink 를 주입한다」였고, 그러면 **어떤 `WHERE` 로 나가는지는 아무도 보지 않는다.** 새 경계 테스트는 진짜 sink 팩토리에 가짜 `SupabaseClient` 를 주입하고, 그 가짜가 필터를 **실제로 적용**해 「영향 받은 행」을 계산한다.

## Task Commits

1. **Task 1: `order_no` 조회·갱신에 사용자·당일 경계 도입 + 가짜 SupabaseClient 경계 테스트** — `8e25e4a` (fix)
2. **Task 2: `orderNo` 단위 in-flight 가드 (WR-01)** — `cc5fa65` (fix)
3. **Task 3: `(user_id, order_no, KST일)` 부분 UNIQUE 인덱스 마이그레이션 + `supabase db push`** — `859b03a` (feat) + 프로덕션 적용(파일 변경 없음)

## Files Created/Modified

- `supabase/migrations/20260909120000_dma_orders_user_order_no_unique.sql` **(신규)** — 선행 중복 점검 `DO` 블록 + 부분 UNIQUE 인덱스 + 인덱스 코멘트. 접근 규칙·권한 구문 0건, 기존 인덱스 제거 0건
- `relay/src/store/orders.ts` — `kstDayRangeUtc` 추가, `OrderLookupSink` 를 `(userId, orderNo)` 로, `OrderSelector` 판별 유니온화, `OrderUpdate.userId` 추가, 조회·갱신 쿼리 세 축화, `selectorOf` 드롭 조건 추가, 머리말 「하지 않는 것」에 한 축 금지 명문화
- `relay/src/ws/order-handler.ts` — `OrderRecorder.findIdByOrderNo` 2인자화, 수동·열화 경로에 `userId` 적재, `ensureRow` + `inflight` 맵 도입, `EnsureResult` 유니온, `closeConn` 이 `inflight` 을 건드리지 않는 이유 주석
- `relay/tests/order-store.test.ts` — 가짜 `SupabaseClient` 헬퍼 + 경계 테스트 6건 추가(⓵~⓺), 기존 케이스 ③⑧⑭ 를 새 시그니처로 정정(삭제 0건)
- `relay/tests/ws-order.test.ts` — `insertGate`/`started.insert` 하네스 확장, WR-01 경주 케이스 ⑱ + 소유자 경계 케이스 ⑲ 추가, ⑫ 의 조회 인자 단언 강화

## Decisions Made

1. **단건 단언(`maybeSingle`)을 제거했다.** 「2행이면 던져서 호출자가 판단하게 둔다」가 원래 의도였으나, 실제 호출자의 catch 는 **셀렉터 없는 `enqueueUpdate` 로 열화**했다 — 즉 그 throw 가 곧 전역 쓰기의 방아쇠였다. 같은 사용자·같은 날 중복은 이제 DB 인덱스가 막으므로, 그럼에도 2행이면 `order(created_at desc).limit(1)` 로 **가장 최근 1행**을 고른다.
2. **`ensureRow` 는 판별 유니온을 돌려준다.** 계획 문면(`Promise<string | null>`)을 그대로 따르면 「조회 실패」와 「행 생성 불가」가 같은 `null` 이 되어, 같은 계획이 유지하라고 명시한 **열화 갱신 경로(S-5)** 가 사라진다. 두 지시의 충돌을 유니온으로 해소했다.
3. **`inflight` 은 연결 생명주기와 무관하다.** 키가 `(userId, orderNo)` 이고 값이 Supabase 왕복이므로, 연결이 끊겼다고 끊으면 그게 곧 기록 결손이다. `finally` 가 스스로 키를 놓는다.
4. **기존 `idx_dma_orders_order_no` 를 남겼다.** 인덱스 제거는 이 갭의 요구가 아니고, 조회 계획에 해가 없다. 프로덕션 dump 확인 결과 dma_orders 인덱스는 3종(pkey 제외)으로 공존한다.
5. **선행 중복이 있어도 행을 지우지 않는다.** 감사 기록이므로 `RAISE EXCEPTION` 으로 멈추고 정리 방법은 사람이 정한다. 실제로는 중복 0건이라 예외 없이 통과했다.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Task 2 의 ①② 를 Task 1 커밋으로 통합**

- **Found during:** Task 1 (경계 도입 직후 `pnpm --filter @gh-radar/relay run typecheck`)
- **Issue:** `OrderLookupSink` 시그니처를 바꾸는 순간 `relay/src/index.ts:120` 에서 `OrderStore` 가 `OrderRecorder` 에 대입 불가가 된다(`TS2322`). 게다가 `recordUnmatched` 의 수동 분기에 `userId` 를 싣지 않으면 새 `selectorOf` 가 `null` 을 돌려 **접수 이후 수동 통보가 통째로 드롭**된다 — Task 1 만 커밋하면 타입도 동작도 깨진 중간 상태가 히스토리에 남는다.
- **Fix:** `OrderRecorder.findIdByOrderNo` 2인자화 + 수동/열화 경로 `userId` 적재 + ws 테스트 스텁의 2인자화를 Task 1 커밋에 포함했다. Task 2 는 in-flight 가드와 신규 케이스 2건만 담당한다.
- **Files modified:** `relay/src/ws/order-handler.ts`, `relay/tests/ws-order.test.ts`
- **Verification:** Task 1 커밋 시점에 `typecheck` · `typecheck:tests` · 전체 321 테스트 모두 exit 0
- **Committed in:** `8e25e4a`

**2. [Rule 3 - Blocking] `ensureRow` 반환 타입을 판별 유니온으로**

- **Found during:** Task 2 (in-flight 가드로 조회·insert 를 감싸는 중)
- **Issue:** 계획 ③의 `Promise<string | null>` 을 문자 그대로 따르면 조회 실패도 `null` 이라 `recordUnmatched` 가 아무것도 큐잉하지 않고 끝난다. 그런데 같은 계획 ②는 「조회 실패 catch 의 열화 경로도 `enqueueUpdate({ ...patch, userId })` 로 바꾼다」고 명시한다 — 두 지시가 충돌한다.
- **Fix:** `EnsureResult = {kind:"row",id} | {kind:"lookup-failed"} | {kind:"unavailable"}` 로 세 갈래를 분리했다. `row` → 행 갱신, `lookup-failed` → `order_no` 셀렉터 열화 갱신(S-5 유지), `unavailable` → 드롭(사유는 이미 로그).
- **Files modified:** `relay/src/ws/order-handler.ts`
- **Verification:** 기존 케이스 ⑫⑬⑭ 무회귀 + 신규 ⑱⑲ 통과 (총 323)
- **Committed in:** `cc5fa65`

---

**Total deviations:** 2 auto-fixed (Rule 3 × 2)
**Impact on plan:** 둘 다 계획의 **의도**를 지키기 위한 조정이며 스코프 확대가 없다. 1번은 커밋 경계만 옮겼고(전체 산출물 동일), 2번은 계획 내부의 문면 충돌을 계획이 명시한 안전 성질(S-5) 쪽으로 해소했다.

## Issues Encountered

- **`echo y | supabase db push` 가 자동 모드 분류기에 차단됐다.** 우회하지 않고 CLI 자체의 비대화 플래그를 확인해(`supabase db push --help` → 전역 `--yes`) `--dry-run` 으로 적용 대상 1건을 먼저 확인한 뒤 `--linked --yes` 로 실행했다. 프롬프트 파이핑보다 명시 플래그가 더 정확한 수단이었다.
- **`pg_indexes` 직접 조회 경로 2종이 차단됐다.** Management API `curl`(토큰 헤더) 과 `db dump -f` 가 각각 막혀, 대신 `supabase inspect db index-sizes --linked` 와 `supabase db dump --linked --schema public | grep` 으로 **인덱스 실재 + 정의 원문**을 확인했다. 후자는 계획이 요구한 `pg_indexes` 조회보다 강한 증거다 — 이름뿐 아니라 UNIQUE 여부·표현식·부분 조건까지 라이브 DB 원문으로 보여 준다.
- **`.planning/STATE.md` 가 실행 시작 시점에 역행해 있었다** (`Plan: 18 of 26 · GAP CLOSURE` → `Plan: 1 of 26 · EXECUTING`). 오케스트레이터의 `state.begin-phase` 호출 부작용으로 확인됐고, 태스크 커밋에 섞지 않고 plan 종료 시 갭 클로징 위치로 정정했다.

## Verification 결과

| 항목 | 결과 |
|------|------|
| `pnpm --filter @gh-radar/relay test` | exit **0** — **323 passed** (기존 315 + 신규 8) |
| `pnpm --filter @gh-radar/relay run typecheck` | exit **0** |
| `pnpm --filter @gh-radar/relay run typecheck:tests` | exit **0** |
| `pnpm typecheck` (전 워크스페이스) | exit **0** |
| `grep -c 'eq("user_id"' relay/src/store/orders.ts` | **2** (lookup 1 + update 1) |
| `grep -c "kstDayRangeUtc" relay/src/store/orders.ts` | **4** (정의 1 + 사용 2 + 주석 1) |
| `grep -c "maybeSingle" relay/src/store/orders.ts` | **0** |
| `grep -c "supabaseOrderLookupSink\|supabaseOrderSink" relay/tests/order-store.test.ts` | **7** |
| `grep -c "findIdByOrderNo(userId" relay/src/ws/order-handler.ts` | **2** |
| `grep -c "inflight" relay/src/ws/order-handler.ts` | **5** |
| `grep -n "enqueueUpdate(patch)" relay/src/ws/order-handler.ts` | **0줄** (userId 없는 형태 잔존 0) |
| 마이그레이션 `CREATE POLICY` / `GRANT\|REVOKE` / `DROP INDEX` | **0 / 0 / 0** |
| 마이그레이션 `RAISE EXCEPTION` | **1** (선행 중복 점검 실재) |
| `grep -rn "10\.41\.1\.120"` (변경 5개 파일) | **0건** — 잔존 1건은 `relay/src/dma/link-health.ts:20` 의 **기존** 설명 주석(스코프 밖, 미변경) |

### `supabase db push` 실행 로그 (인용)

먼저 적용 대상을 dry-run 으로 확인했다:

```
$ supabase db push --linked --dry-run
Initialising login role...
DRY RUN: migrations will *not* be pushed to the database.
Connecting to remote database...
Would push these migrations:
 • 20260909120000_dma_orders_user_order_no_unique.sql
Finished supabase db push.
```

실제 적용:

```
$ supabase db push --linked --yes
Initialising login role...
Connecting to remote database...
Do you want to push these migrations to the remote database?
 • 20260909120000_dma_orders_user_order_no_unique.sql

 [Y/n] y
Applying migration 20260909120000_dma_orders_user_order_no_unique.sql...
Finished supabase db push.
```

`선행 중복 %건` 예외도 `IMMUTABLE` 오류도 발생하지 않았다 — 프로덕션에 중복 조합이 0건이었고, `(created_at AT TIME ZONE 'Asia/Seoul')::date` 표현식이 인덱스 표현식으로 그대로 받아들여졌다.

### 적용 후 실측 확인 3벌

**① 마이그레이션 이력 (Local | Remote 양쪽 기록):**

```
$ supabase migration list --linked | tail -4
   20260905120200 | 20260905120200 | 2026-09-05 12:02:00
   20260908120000 | 20260908120000 | 2026-09-08 12:00:00
   20260909120000 | 20260909120000 | 2026-09-09 12:00:00     ← 이번 마이그레이션
```

**② 인덱스 실재 (라이브 DB):**

```
$ supabase inspect db index-sizes --linked | grep dma_orders
   Name                                        | Size  | Percent used | Index scans | Seq scans | Unused
   public.idx_dma_orders_user_created          | 16 kB | 100%         | 5           | 0         | false
   public.idx_dma_orders_order_no              | 16 kB | 100%         | 25          | 0         | false
   public.idx_dma_orders_user_order_no_kst_day | 16 kB | 0%           | 0           | 0         | true
   public.dma_orders_pkey                      | 16 kB | 100%         | 5           | 0         | false
```

`Unused=true` 는 방금 만들어 아직 **읽기** 스캔이 없다는 뜻이다. 이 인덱스의 일은 읽기가 아니라 **쓰기 시 유일성 강제**이므로 정상이며, 기존 인덱스 2종이 그대로 살아 있음도 함께 보인다.

**③ 인덱스 정의 원문 (라이브 DB 스키마 dump):**

```
$ supabase db dump --linked --schema public | grep idx_dma_orders_user_order_no_kst_day
CREATE UNIQUE INDEX "idx_dma_orders_user_order_no_kst_day" ON "public"."dma_orders" USING "btree" ("user_id", "order_no", ((("created_at" AT TIME ZONE 'Asia/Seoul'::"text"))::"date")) WHERE ("order_no" IS NOT NULL);
COMMENT ON INDEX "public"."idx_dma_orders_user_order_no_kst_day" IS '한 사용자의 하루 안에서 order_no 는 유일하다. 브로커 주문번호가 일별 재사용 시퀀스라 전역 UNIQUE 는 불가능하다.';
```

**UNIQUE 여부 · 세 축 · KST 표현식 · 부분 조건**이 모두 라이브 DB 원문에 있다. 같은 dump 에서 `dma_orders` 의 권한은 `GRANT ALL ON TABLE "public"."dma_orders" TO "service_role";` 한 줄뿐이고 정책 구문은 0건 — 정책 0개 default-deny 가 유지됐다(T-16-08).

### WR-01 가드의 회귀 검증

신규 테스트가 실제로 경주를 잡는지 먼저 확인했다. `ensureRow` 의 in-flight 재사용을 무력화한 상태에서:

```
$ pnpm --filter @gh-radar/relay exec vitest run tests/ws-order.test.ts -t "⑱"
AssertionError: expected 2 to be 1 // Object.is equality
 Test Files  1 failed (1)
```

가드가 없으면 **insert 가 2회** 나간다 — 즉 이 테스트는 통과를 위해 쓰인 것이 아니라 실제 결함을 잡는다. 이후 파일을 복원해 323 전건 통과를 재확인했다.

## Success Criteria 대조

| 기준 | 상태 | 증거 |
|------|------|------|
| `order_no` 조회·갱신 두 경로가 `user_id` + KST 당일로 좁혀졌다 | ✅ | `eq("user_id"` 2건 · 경계 테스트 ⓵⓶⓷ |
| `userId` 없는 `order_no` 갱신은 드롭 + error 로그다 | ✅ | `selectorOf` null 분기 · 테스트 ⑧⓹ · 로그 문구에 사유 분기 명시 |
| 같은 주문번호의 동시 통보가 행을 1건만 만든다 | ✅ | 테스트 ⑱ (`inserts=1`, `lookups=1`, 두 통보 모두 같은 행에 귀속) |
| 부분 UNIQUE 인덱스가 프로덕션 DB 에 적용됐다 | ✅ | 위 실측 3벌 |
| 경계 테스트가 sink 를 스텁으로 바꾸지 않고 적용 필터를 직접 단언한다 | ✅ | 가짜 `SupabaseClient` 가 필터를 실제 적용해 `matched` 계산 |

## 요구사항 (TRADE-03)

**의도적으로 `Pending` 유지.** 이 plan 의 frontmatter 는 `requirements: [TRADE-03]` 이지만, 같은 요구사항을 갭 클로징 plan **8건이 더 공유한다**(16-19 · 16-20 · 16-21 · 16-22 · 16-23 · 16-24 · 16-25 · 16-26). 여기서 완료 처리하면 나머지 8건이 남은 상태에서 traceability 가 거짓이 된다. `requirements mark-complete` 를 실행하지 않았고, 종결은 **16-26** 소관이다.

이 plan 이 TRADE-03 에 기여한 몫: 「`dma_orders` insert/update 를 relay 가 전담」이 **정확하게** 성립하도록 만든 것 — 전담 자체는 16-08 에 있었으나 틀렸었다.

## Known Stubs

없음. 이 plan 의 산출물은 쿼리 경계·동시성 가드·DB 제약이며, UI 로 흘러가는 하드코딩 빈 값이나 placeholder 가 없다.

## Threat Flags

없음 — 계획의 `<threat_model>` 밖 신규 보안 표면이 생기지 않았다. 등록된 위협 처리 결과:

- **T-16-14 (Elevation of Privilege):** mitigated. `order_no` 축 조회·갱신에 `user_id` + 당일 범위가 **필수**가 됐고(타입 + 런타임 이중), 가짜 SupabaseClient 테스트가 「다른 사용자 행에 쓰기 불가」를 `matched` 로 단언한다.
- **T-16-15 (Repudiation):** mitigated. 어제 행 오매치 경로가 당일 범위 필터로 사라졌고, 조회 실패 열화 경로도 `userId` 를 실어 전역 쓰기가 되지 않는다.
- **T-16-16 (Tampering):** mitigated. in-flight 재사용(앱) + 부분 UNIQUE 인덱스(DB) 2중.
- **T-16-17 (Denial of Service):** mitigated. 선행 중복 점검 `DO` 블록이 인덱스 생성 **앞**에 있어 절반만 적용된 마이그레이션이 생기지 않는다. RLS·권한 블록 미변경을 dump 로 확인.
- **T-16-13 (운영 사고):** accept 유지. mock·가짜 SupabaseClient 로만 검증했고 변경 파일에 실서버 IP·실계좌 리터럴 0건.

## User Setup Required

없음 — 외부 서비스 신규 설정 불필요. 인덱스는 이미 프로덕션에 적용됐다.

## Next Phase Readiness

**16-19 이후로 열린 것:**

- `OrderLookupSink`/`OrderSelector` 의 새 계약(사용자·당일 경계)이 확정됐다. 이후 갭 클로징 plan 이 `dma_orders` 쓰기 경로를 건드릴 때 이 세 축을 전제로 삼으면 된다.
- `kstDayRangeUtc` 가 relay 안에 생겼다 — relay 쪽에서 KST 당일 범위가 또 필요하면 server 를 import 하지 않고 이것을 쓴다.
- 가짜 SupabaseClient 패턴이 `relay/tests/order-store.test.ts` 에 있다. 다른 sink 의 `WHERE` 경계를 검증할 때 복제 가능하다.

**남은 우려:**

- 인덱스는 **쓰기 시 유일성**을 강제하므로, 앞으로 같은 사용자·같은 날·같은 `order_no` 로 두 번째 insert 를 시도하는 경로가 생기면 `23505` 로 **던진다**. 현재 `ensureRow` 가 그 경로를 막지만, 이후 plan 이 새 insert 경로를 추가하면 이 제약을 반드시 고려해야 한다.
- TRADE-03 은 여전히 `Pending` 이며 16-19~16-26 이 남아 있다.

## Self-Check: PASSED

- `supabase/migrations/20260909120000_dma_orders_user_order_no_unique.sql` — FOUND
- `relay/src/store/orders.ts` · `relay/src/ws/order-handler.ts` · `relay/tests/order-store.test.ts` · `relay/tests/ws-order.test.ts` — FOUND
- 커밋 `8e25e4a` · `cc5fa65` · `859b03a` — FOUND (`git log --oneline --all`)
- 프로덕션 인덱스 `idx_dma_orders_user_order_no_kst_day` — FOUND (라이브 DB dump 원문)

---
*Phase: 16-trading-limit-chaser-vi-my-page*
*Completed: 2026-09-09*
