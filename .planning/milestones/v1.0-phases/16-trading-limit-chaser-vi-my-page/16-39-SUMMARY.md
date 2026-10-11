---
phase: 16-trading-limit-chaser-vi-my-page
plan: 39
subsystem: relay
tags: [dma-orders, sqlstate, 23505, audit-trail, counters, vitest]

requires:
  - phase: 16
    provides: "16-28 의 `23505` 수렴 규율 3줄(재시도 무의미 / `dropped` 오염 방지 / 조건을 patch 에 건다)"
  - phase: 16
    provides: "16-38 의 `safePgError` — 재시도 실패 로그가 지나는 마스킹 정본"
provides:
  - "`supabaseOrderSink` 의 `23505` 재시도 — 충돌한 `order_no` 컬럼 **하나만** 빼고 같은 셀렉터로 1회 재전송"
  - "셀렉터 조립 지역 헬퍼 `runUpdate` — 최초 시도와 재시도가 **같은 3축**을 쓴다 (T-16-14)"
  - "`fakeDmaOrders` 의 성공한 update 가 `rows` 에 patch 를 **실제로 병합**한다 — 「행이 갱신됐는가」를 테스트가 볼 수 있다"
  - "⓽(재작성)·⓽-b·⓽-c — 행 반영 · `flushed` 정합 · 「보낼 것이 없다」 · 재시도 실패 throw"
affects: [relay 감사 기록 경로, order-handler finish, 16-40(같은 파일 후속)]

tech-stack:
  added: []
  patterns:
    - "카운터를 고치는 것이 아니라 **카운터가 참이 되게 동작을 고친다** — `#flushed` 대입문 diff 0줄로 `flushed` 를 참말로 만들었다"
    - "포기의 **단위**를 명시한다 — 「패치 전체」가 아니라 「충돌한 컬럼 하나」. 감사 결손의 폭이 곧 설계 결정이다"
    - "가짜 테이블이 스텁이면 결함이 초록불 아래 숨는다 — 성공한 쓰기를 **반영**하게 만들어야 「반영됐는가」를 물을 수 있다"

key-files:
  created: []
  modified:
    - relay/src/store/orders.ts
    - relay/tests/order-store.test.ts

key-decisions:
  - "「보낼 것이 없다」 판정을 `Object.keys(rest).length <= 1` 이 아니라 **`updated_at` 이라는 이름을 걸러** 센다 — 계획의 식은 sink 를 직접 부르는 호출자(`updated_at` 미포함 patch)에서 실필드 1개를 조용히 버린다"
  - "재시도 성공 로그를 `logger.error` 로 유지 — 감사 결손(주문번호 미기입)이 실재하므로 warn 으로 낮추지 않는다. 페이로드는 `{column, code, abandonedColumn, applied}` 로 **주문번호 원문 없음** (T-16-45)"
  - "「보낼 것이 없다」 케이스는 sink 직접 호출이 아니라 **실제 큐 경로**로 재현했다 — `rowPatchOf` 가 `updated_at` 을 항상 실어 patch 키가 2개라 `enqueueUpdate` 에 걸리지 않는다(계획이 우려한 상황이 아니었다)"
  - "`updateError` 주입 훅에 함수형(호출 순번)을 더했다 — 「최초는 실계산 23505, 재시도만 강제 실패」를 만들 다른 방법이 없다"

patterns-established:
  - "회귀 잠금 실증 2라운드 — 수정(재시도)과 하네스(병합)를 **각각** 되돌려 어느 케이스가 무엇을 지키는지 분리 확인"

requirements-completed: []

duration: 14min
completed: 2026-09-09
---

# Phase 16 Plan 39: `23505` 포기 단위 축소 · `flushed` 정합 Summary

**수동 주문의 접수 통보가 `23505` 를 만나면 `status`·`filled_qty` 까지 통째로 사라져 그 행이 `requested`·0 인 채 영구히 남던 것을 고쳤다 — 포기하는 것은 이제 충돌한 `order_no` 컬럼 하나뿐이고, `#flushed` 대입문은 한 줄도 바꾸지 않은 채 `flushed` 가 참말이 됐다.**

## Performance

- **Duration:** 약 14분
- **Tasks:** 2/2
- **Files modified:** 2 (신규 0)
- **신규 마이그레이션:** 0건 (DB 미변경)
- **실서버·실계좌 접속:** 0회 (D-27)

## Accomplishments

### Task 1 — 포기의 단위를 컬럼 하나로 (R2-WR-01 / T-16-79) · commit `f0dd2a0`

**① 셀렉터 조립을 한 곳으로 모았다.** 종전에는 두 갈래(`id` 한 축 / `order_no` 3축)가 인라인 삼항식 안에 있어, 재시도를 넣으려면 그 조립을 **복제**해야 했다. 복제는 곧 「언젠가 한쪽이 3축을 잃는다」이고 그것이 전역 쓰기다(T-16-14). 지역 헬퍼 하나로 뽑아 최초 시도와 재시도가 **같은 함수**를 부른다:

```ts
const runUpdate = async (values: OrderRowPatch): Promise<{ error: unknown }> => {
  const table = supabase.from("dma_orders");
  if (sel.column === "id") return await table.update(values).eq("id", sel.value);
  const { from, to } = kstDayRangeUtc();
  return await table
    .update(values)
    .eq("order_no", sel.value)
    .eq("user_id", sel.userId)
    .gte("created_at", from)
    .lt("created_at", to);
};

const { error } = await runUpdate(patch);
```

`grep -c 'eq("order_no"' relay/src/store/orders.ts` = **2 → 2** (update sink 1 + lookup sink 1). 늘지 않았다 = 복제하지 않았다. 테스트 ⓽ 가 재시도 쿼리의 필터를 `[{op:"eq",column:"id",value:"row-manual"}]` 로 **정확히** 단언해 이 사실을 잠근다.

**② `23505` 분기가 컬럼 하나만 포기한다.**

```ts
if (patch.order_no !== undefined && (error as { code?: string }).code === "23505") {
  const { order_no: _abandoned, ...rest } = patch;
  const meaningful = Object.keys(rest).filter((k) => k !== "updated_at");
  if (meaningful.length === 0) {
    logger.error({ column: sel.column, code: "23505" }, "[orders] order_no 만 채우는 갱신이 …");
    return;
  }
  const { error: retryError } = await runUpdate(rest);
  if (retryError) {
    logger.error({ pgError: safePgError(retryError), column: sel.column },
      "[orders] order_no 를 뺀 재시도도 실패 — 큐 재시도로 넘긴다");
    throw retryError;
  }
  logger.error(
    { column: sel.column, code: "23505", abandonedColumn: "order_no", applied: meaningful.length },
    "[orders] order_no 갱신이 UNIQUE 위반 — … order_no 만 포기하고 나머지 필드는 반영했다");
  return;
}
```

- **재시도 성공 → `return`.** 16-28 의 「`23505` 는 큐 재시도를 태우지 않는다」가 그대로다.
- **재시도 실패 → `throw`.** 이것은 「이유를 아는 실패」가 아니므로 `#drain` 의 재시도 1회 → 드롭 규율을 타야 한다. 여기서 삼키면 결손이 카운터에도 남지 않는다(S-5).
- **로그는 두 갈래로 갈렸다.** 종전 한 줄이 「주문번호를 못 채웠다」와 「갱신 전체를 버렸다」를 함께 뜻했다. 이제 ⓐ 나머지 반영함 ⓑ 반영할 나머지가 없음 ⓒ 재시도도 실패가 각각 다른 메시지다.
- **주문번호 원문을 싣지 않는다.** 실제 출력: `"column":"id","code":"23505","abandonedColumn":"order_no","applied":2`. `abandonedColumn` 은 **컬럼 이름**이지 값이 아니다(T-16-45, 16-28 승계).

**③ 주석이 16-28 의 근거를 인용하며 잇는다.** 재시도 무의미 / `dropped` 오염 방지 / 조건을 셀렉터가 아니라 patch 에 건다 — 세 줄을 그대로 두고, 그 아래에 「그러나 포기의 단위는 컬럼 하나여야 한다 — 수명주기 필드까지 버리면 행이 `requested` 로 영구히 남는다 (R2-WR-01)」와 `finish` 가 싣는 필드 목록을 붙였다.

**④ 카운터는 한 줄도 바꾸지 않았다.** `git diff | grep -cE '^[+-].*#(flushed|retried|dropped)'` = **0**. 이 수정의 형태가 그것이다 — **카운터를 고친 것이 아니라 카운터가 참이 되게 동작을 고쳤다.** 재시도가 성공하면 sink 가 정상 반환하고 `#drain` 이 세는 1건은 실제로 행에 남는다.

### Task 2 — 가짜 테이블이 반영을 하고, ⓽ 가 그것을 본다 (R2-IN-04 / T-16-80) · commit `f5fbc42`

**① 하네스가 진짜에 가까워졌다.** 종전 `self.then` 의 update 갈래는 `{ data: null, error: null }` 만 돌려주고 `rows` 를 건드리지 않았다 — 그래서 「패치가 통째로 사라진다」는 결함을 이 파일이 **볼 수 없었다**.

```ts
if (query.verb === "update" && query.patch !== undefined) {
  for (const row of query.matched) Object.assign(row, query.patch);
}
```

`matched` 는 `rows` 의 **같은 객체 참조**라 병합이 `rows` 에 그대로 남는다. `FakeRow` 에 인덱스 시그니처를 더해 `status`·`filled_qty` 같은 나머지 컬럼이 행에 실린다.

**기존 케이스가 이 변화로 깨졌는가 — 0건.** 하네스만 바꾼 상태로 전량 실행해 확인했다(31개 중 실패 1건은 ⓽ 의 `toHaveLength(1)` 하나로, Task 1 시점부터 이미 빨갛던 그 단언이다). 즉 **옛 스텁 동작을 베낀 단언은 ⓽ 하나뿐**이었고 나머지는 필터·매치·카운터만 보고 있었다.

**② ⓽ 를 다시 썼다.** 제목: `⓽ order_no 갱신의 23505 는 주문번호만 포기하고 나머지는 반영한다 (16-39 / R2-WR-01)`. `finish` 의 실제 모양(`{orderRowId, orderNo, status, filledQty}`)으로 큐를 태우고 단언한다:

| 단언 | 잠그는 것 |
|------|-----------|
| `row.status === "accepted"` · `row.filled_qty === 7` | **행이 실제로 갱신됐다** — 예전엔 `requested`·0 인 채 남았다 |
| `row.order_no === ""` | 포기한 컬럼은 여전히 비어 있다 (대가는 그대로) |
| `stats().flushed === 1` | 「반영된 누적 건수」가 참말이다 (S-5 / T-16-80) |
| `dropped === 0` · `retried === 0` · `queued === 0` | 16-28 의 규율 유지 |
| `queries.verb === ["update","update"]` · `queries[1].patch.order_no === undefined` | 최초 + `order_no` 를 뺀 재시도 |
| `queries[1].filters === [{eq id row-manual}]` | 재시도가 셀렉터를 다시 조립하지 않는다 (T-16-14) |

**기존 `expect(queries).toHaveLength(1)` 은 거짓이 됐으므로 고쳤다.** 그 단언이 정확히 「패치를 통째로 버린다」를 진실로 잠그고 있었다 — 케이스 주석에 무엇이 왜 바뀌었는지 남겼다.

**③ ⓽-b 「보낼 것이 없다」.** `enqueueUpdate({orderRowId, orderNo})` 로 **실제 큐 경로 그대로** 재현했다. 계획은 「`enqueueUpdate` 가 그런 요청을 큐에 넣지 않을 수 있으니 sink 직접 호출」을 열어 뒀지만, 코드에서 확인한 결과 그럴 필요가 없었다 — `rowPatchOf` 가 `updated_at` 을 **항상** 싣기 때문에 patch 키가 2개이고 「갱신할 필드가 없는 요청」 판정(`length === 1`)에 걸리지 않는다. `queries` 1건 · `order_no` 여전히 `""` · 카운터 무오염을 단언한다.

**④ ⓽-c 「재시도 실패 → throw」.** 주입 훅을 함수형으로 넓혀 **최초 시도는 `dupToday` 가 23505 를 실계산**하게 두고 재시도(짝수 번째)만 `23514` 로 실패시킨다. 결과: `retried === 1` · `dropped === 1` · `flushed === 0` · update **4건**(라운드 2회 × 2). 함께 16-38 의 마스킹 회귀 게이트도 건다 — 로그 페이로드에 가짜 계좌번호·`"Failing row"`·`hint` 부재 **와 `"23514"` 존재**.

**⑤ 회귀 잠금 실증 — 2라운드, 지점마다 따로.**

| 라운드 | 되돌린 것 | 실패 | 해석 |
|--------|-----------|------|------|
| A | 재시도 무력화(옛 `return`) | **2건** — ⓽, ⓽-c | 수정이 없으면 「행이 갱신됐다」와 「throw 된다」가 둘 다 무너진다 |
| B | 하네스의 patch 병합 제거(옛 스텁) | **1건** — ⓽ (`expected 'requested' to be 'accepted'`) | 하네스가 스텁이면 이 결함은 **재현조차 되지 않는다** |

⓽-b 는 두 라운드 모두 초록이다 — 그 케이스가 잠그는 것은 「보낼 것이 없으면 두 번째 왕복을 하지 않는다」이고 그것은 재시도 유무와 무관하게 참이므로 옳은 결과다. 두 라운드 모두 복원 후 `git diff` 0줄 확인.

## Verification Results

| 검증 | 결과 |
|------|------|
| `pnpm --filter @gh-radar/relay exec vitest run tests/order-store.test.ts` | **33 passed** (31 → +2) exit 0 |
| `pnpm --filter @gh-radar/relay test` | **17 files · 384 tests passed** (기준선 382 → +2) exit 0 |
| `pnpm --filter @gh-radar/relay run typecheck` | exit 0 |
| `pnpm --filter @gh-radar/relay run typecheck:tests` | exit 0 |
| `pnpm -r typecheck` | exit 0 |
| `pnpm -r test` | exit 0 · **2,023 passed** (기준선 2,021 → +2, relay 외 변동 없음) |
| `test -f relay/tests/order-store.test.ts` | 참 ✅ |
| `grep -c 'eq("order_no"' relay/src/store/orders.ts` | **2 → 2** (늘지 않았다 = 셀렉터 조립 미복제) ✅ |
| `grep -c "23505" relay/src/store/orders.ts` | **10** ✅ |
| `#flushed`·`#retried`·`#dropped` 대입문 diff | **0줄** ✅ |
| 23505 로그 페이로드에 주문번호 원문 | 없음 — `{column, code, abandonedColumn:"order_no", applied}` ✅ |
| `git status --short supabase/migrations/` | 0건 — DB 미변경 ✅ |
| 포매터 | 미실행 (prettier 설정 없음 — 16-30 사고) ✅ |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 「보낼 것이 없다」 판정식을 계획의 `Object.keys(rest).length <= 1` 에서 이름 기반으로 바꿨다**

- **발견 시점:** Task 1 ②
- **문제:** 계획의 식은 「남은 것이 `updated_at` 뿐」을 **키 개수**로 대신 센다. 그런데 `patch` 에 `updated_at` 이 항상 있는 것은 **큐 경로(`rowPatchOf`)를 지날 때뿐**이다. `supabaseOrderSink` 는 export 된 공개 sink 이고 실제로 이 파일의 테스트들이 `{ status: "filled" }` 처럼 `updated_at` 없는 patch 로 직접 부른다. 그런 호출자가 `{order_no, status}` 를 보내면 `rest = {status}` 로 길이 1 → 계획 식은 **실필드 하나를 조용히 버린다**. 그것이 정확히 이 plan 이 없애려는 결함이다.
- **조치:** `Object.keys(rest).filter((k) => k !== "updated_at").length === 0` 으로 **이름을 걸러** 센다. 판단 근거를 그 자리 주석에 남겼다.
- **파일:** `relay/src/store/orders.ts`
- **커밋:** `f0dd2a0`

### 계획대로 하지 않은 것 (의도적)

- **⓽-b 를 sink 직접 호출이 아니라 실제 큐 경로로 썼다.** 계획 ③은 「`enqueueUpdate` 가 그런 요청을 큐에 넣지 않을 수 있으니 그렇다면 sink 를 직접 호출하라」고 열어 뒀다. 코드를 확인한 결과 그 우려는 성립하지 않는다 — `rowPatchOf` 가 `updated_at` 을 항상 실어 키가 2개이므로 큐에 들어간다. 실제 경로로 재현하는 편이 언제나 낫다.
- **`updateError` 주입 훅을 함수형으로 넓혔다(계획에 없던 판단).** ⓽-c 는 「최초는 실계산 23505 · 재시도만 강제 실패」가 필요한데, 단일 오류 객체로는 최초 시도까지 덮어써 `dupToday` 의 실계산이 죽는다. 호출 순번을 받는 함수형을 더해 기존 객체형 사용처(⓼-b~⓼-e)는 그대로 뒀다.
- **`requirements.mark-complete` 미실행.** frontmatter 에 `requirements: [TRADE-03]` 이 있으나 돌리지 않았다. TRADE-03 의 Pending 근거는 프로덕션 `/healthz` 실측(16-26)이고 이 plan 은 그것을 건드리지 않는다 — 16-28·16-36·16-37·16-38 과 같은 기준.

## Threat Model Coverage

| Threat ID | Disposition | 실제 조치 |
|-----------|-------------|-----------|
| T-16-79 (Repudiation — 감사 결손) | mitigate ✅ | 포기 단위가 `order_no` 컬럼 하나다. ⓽ 가 「`status`·`filled_qty` 가 실제로 반영됐다」로 잠근다 |
| T-16-80 (Repudiation — 계기판 거짓) | mitigate ✅ | 동작을 고쳐 `flushed` 가 참이 됐다(대입문 diff 0줄). `flushed === 1` 단언 추가. 잔여 오차 1건은 아래에 명시 |
| T-16-14 (Tampering — 전역 쓰기) | mitigate ✅ | 조립이 `runUpdate` 한 곳뿐. `eq("order_no"` 등장 2 → 2, 재시도 필터를 ⓽ 가 정확히 단언 |
| T-16-45 (Information Disclosure) | mitigate ✅ | 23505 로그에 주문번호 원문 없음. 재시도 실패 로그는 `safePgError`, ⓽-c 가 `details` 부재를 단언 |
| T-16-13 (실서버·실계좌 접속) | accept ✅ | 가짜 `SupabaseClient` 하네스만. 접속 0회 |

## Threat Flags

없음 — 새 네트워크 엔드포인트·인증 경로·스키마 변경 없음. 왕복이 최대 1회 늘지만 같은 테이블·같은 3축이고 조건은 `23505` 를 실제로 받은 경우뿐이다.

## Known Stubs

없음.

## 남은 것 (이 plan 이 닫지 않는 것)

- **`flushed` 의 잔여 오차 1건 — 「`order_no` 만 담긴 갱신의 23505」.** 그 경우 반영된 것이 없는데도 sink 가 정상 반환하므로 `#drain` 이 `flushed += 1` 을 한다. 고치려면 `#drain` 을 건드려야 하고 그것은 16-28 의 드롭 규율과 얽혀 있어 이 plan 의 범위(계획 ⑤: 카운터 코드 불가침) 밖이다. 숨기지 않고 ⓽-b 에 주석과 단언으로 **드러내 뒀다**.
- **`order-handler.ts` 통보 경로의 `orderNo` 원문 로그** — 16-38 이 남긴 항목 그대로.
- **⚠️ 배포 미실시 — 프로덕션에는 R2-WR-01 이 여전히 살아 있다.** 프로덕션이 실 게이트웨이에 결선돼 실주문이 흐르므로 이 결손은 실재한다. 재배포는 3라운드 종결 plan **16-46** 몫.
- **TRADE-03 은 계속 Pending.**

## Self-Check: PASSED

- `relay/src/store/orders.ts` FOUND (수정)
- `relay/tests/order-store.test.ts` FOUND (수정)
- `.planning/phases/16-trading-limit-chaser-vi-my-page/16-39-SUMMARY.md` FOUND
- commit `f0dd2a0` FOUND
- commit `f5fbc42` FOUND
