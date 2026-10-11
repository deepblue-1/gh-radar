---
phase: 16-trading-limit-chaser-vi-my-page
plan: 40
subsystem: relay
tags: [dma-orders, counters, audit-trail, 23505, concurrency, microtask, vitest]

requires:
  - phase: 16
    provides: "16-28 의 `23505` 수렴 경로 — 「이미 있다」를 「기록 불가」로 열화시키지 않는다"
  - phase: 16
    provides: "16-38 의 `safePgError` — 재조회 실패 로그가 지나는 마스킹 정본"
  - phase: 16
    provides: "16-39 의 `runUpdate` 헬퍼와 `23505` 재시도 구조 (같은 파일 직전 plan)"
provides:
  - "`OrderInsertResult{id, created}` — insert sink 가 「새로 만들었는가」를 말한다"
  - "`stats().inserted` 가 실제 insert 만 센다 · `insertConverged` 로 수렴 건수를 따로 노출"
  - "`23505` 수렴 재조회 예외 격리 — 재조회가 실패해도 호출자에게는 원래의 `23505` 가 올라간다"
  - "`flushNow` 의 라운드별 `#current` 재확인 — 「도는 배치는 언제나 1개」가 실제로 지켜진다"
  - "`OrderUpdateResult{applied}` — 16-39 가 남긴 `flushed` 잔여 오차 종결(`flushedNoop` 신설)"
  - "⓻-b · ⓻-c · ⑮-b — 카운터 정합 · 사유 보존 · 배치 중첩 부재를 각각 잠그는 3케이스"
affects: [relay 감사 기록 경로, 종료 절차, order-handler 통보 경로(무변경), 16-43(같은 테스트 파일 후속)]

tech-stack:
  added: []
  patterns:
    - "**카운터가 아니라 sink 가 참말을 하게 한다** — `created`·`applied` 한 비트씩. 16-39 가 `flushed` 를, 이 plan 이 `inserted` 를 같은 형태로 고쳤다"
    - "반환 타입 확장은 **예외를 말하는 쪽만** 명시한다 (`Promise<void | {applied}>`) — 다수파 sink 를 전부 고치는 비용이 그 한 비트의 값어치보다 크다"
    - "**setInterval 은 macrotask 라 마이크로태스크 경계에 끼어들 수 없다** — 리뷰가 지목한 경합의 재현 조건은 「tick 이 도는 것」이 아니라 「flushNow 가 이미 라운드 루프 안에 있는 것」이었다. 계획의 서술을 코드와 실측으로 검증해 재현 시나리오를 다시 세웠다"

key-files:
  created: []
  modified:
    - relay/src/store/orders.ts
    - relay/tests/order-store.test.ts

key-decisions:
  - "`OrderStore.insertRequest` 의 공개 반환 타입을 `Promise<string>` 으로 **유지** — `order-handler.ts` diff 0줄이 이 변경이 최소 침습임의 증거다"
  - "수렴 건수를 버리지 않고 `insertConverged` 로 노출 — `inserted` 에서 덜어낸 값을 지우면 마스킹이 사유까지 지우는 것이 된다 (S-5). `stats()` 는 relay/src 에 소비처가 없어 필드 추가가 `/healthz` 에 닿지 않음을 먼저 확인"
  - "`flushNow` 의 루프 밖 최초 대기를 **루프 안으로 흡수** — 대기 지점이 둘이면 언젠가 한쪽만 고쳐진다. 라운드 0 의 동작은 종전과 완전히 같다"
  - "`close()` 를 `flushNow()` 앞으로 옮기지 않았다 — `ORDER_FLUSH_MAX_ROUNDS` 의 세 번째 라운드 근거(16-24)가 흔들린다. 판단을 flushNow docstring 에 명시"
  - "**16-39 의 `flushed` 잔여 오차를 이 plan 에서 닫았다** — 같은 결함 클래스(계기판 오염)이고, 이 plan 이 세운 `created` 기법이 그대로 적용되며, 16-41~46 어느 plan 도 그것을 맡고 있지 않다"

patterns-established:
  - "회귀 잠금 실증 4라운드 — 수정 지점마다 되돌려 **정확히 그 케이스만** 빨개지는지 확인 (16-38·16-39 승계)"
  - "경합 케이스는 재현 시나리오를 **먼저 실측으로 확립**한 뒤 테스트로 옮긴다 — 임시 프로브로 이벤트 순서를 찍어 「누가 배치를 시작했는가」를 눈으로 확인했다"

requirements-completed: []

duration: 21min
completed: 2026-09-09
---

# Phase 16 Plan 40: 계기판 정합 + 배치 중첩 (R2-WR-07 · R2-WR-04) Summary

**세 카운터와 한 불변식이 각자 자기가 선언한 문장을 실제로 지키게 했다 — `inserted` 는 만들지 않은 행을 세지 않고, `23505` 는 재조회가 실패해도 「기록 불가」로 열화되지 않으며, 종료 절차가 남의 배치를 덮어써 배치를 둘로 만들던 경합을 `maxLive 2 → 1` 로 실측 확인해 닫았다. 덤으로 16-39 가 잔여로 남긴 `flushed` 오차도 같은 기법으로 종결했다.**

## Performance

- **Duration:** 약 21분
- **Tasks:** 3/3 (+ 범위 판단으로 추가한 1건)
- **Files modified:** 2 (신규 0)
- **신규 마이그레이션:** 0건 (DB 미변경)
- **실서버·실계좌 접속:** 0회 (D-27)

## Accomplishments

### Task 1 — 「새로 만든 행 누적 건수」가 실제로 그것만 센다 (R2-WR-07① / T-16-81) · commit `d8ade31`

**① sink 가 한 비트를 더 말한다.** `OrderInsertSink` 의 반환을 `Promise<string>` → `Promise<OrderInsertResult>` 로 넓혔다.

```ts
export type OrderInsertResult = { id: string; created: boolean };
export type OrderInsertSink = (row: OrderInsertRow) => Promise<OrderInsertResult>;
```

`created` 의 의미를 docstring 에 못박았다 — `true` = 새 행을 만들었고 테이블 행 수가 1 늘었다 / `false` = `23505` 로 **기존 행에 수렴**했고 행 수는 늘지 않았다.

**② 정상 insert 는 `created: true`, 수렴은 `created: false`.**

**③ `insertRequest` 의 공개 반환 타입은 `Promise<string>` 그대로다.**

```ts
async insertRequest(row: OrderInsertRow): Promise<string> {
  …
  const { id, created } = await this.#insert(row);
  if (created) this.#inserted += 1;
  else this.#insertConverged += 1;
  return id;
}
```

`git diff HEAD~4 --stat -- relay/src/ws/order-handler.ts` = **0줄**. 호출자가 한 글자도 바뀌지 않았다는 것이 이 변경이 최소 침습임의 증거다.

**④ 수렴 건수를 버리지 않았다.** `stats()` 에 `insertConverged` 를 더했다 — `inserted` 에서 덜어낸 값을 지우면 「이 경로가 얼마나 도는지 영원히 모른다」(16-28 이 warn 로그를 남긴 이유와 같다, S-5). `inserted + insertConverged` = 성공한 insert 호출 횟수다. 필드 추가 전에 소비처를 확인했다 — `grep -rn "\.stats()" relay/src` 결과 `OrderStore.stats()` 는 **relay/src 안에 소비처가 없다**(`/healthz` 가 보는 것은 `SessionManager.stats()` 다). 반환 타입 확장이 배포 표면에 닿지 않는다.

**⑤ sink 를 구현·주입하는 모든 자리** (`grep -rn "OrderInsertSink" relay/src relay/tests` + `OrderSinks` 로 추론되는 지점 전수):

| 지점 | 처분 |
|------|------|
| `relay/src/store/orders.ts:250` 타입 선언 | 변경 |
| `relay/src/store/orders.ts:419` `supabaseOrderInsertSink` | 변경 (`created` 두 갈래) |
| `relay/src/store/orders.ts:620` `insertRequest` 소비 | 변경 (구조분해) |
| `relay/src/store/orders.ts:263`·`:547`·`:568` (타입 참조·결선·필드) | 변경 없음 |
| `relay/tests/order-store.test.ts:79` `recordingSinks` 의 가짜 insert | 변경 (`{id, created:true}`) |
| `relay/tests/order-store.test.ts:831`·`896`·`916`·`1087` 호출부 | `831` 만 변경(`.id`/`.created`), 나머지는 `rejects` 라 무변경 |
| `relay/tests/ws-order.test.ts` | **변경 0줄** — 아래 참고 |

**`ws-order.test.ts` 는 손대지 않았다(계획의 `files_modified` 와 다르다).** 계획은 이 파일이 시그니처 변경의 영향을 받을 수 있다고 보아 전수 확인을 지시했고, 실제로 확인한 결과 그 파일의 `mkOrderStore` 는 `OrderInsertSink` 가 아니라 `order-handler` 의 `OrderRecorder.insertRequest(row): Promise<string>` 을 흉내 낸다. 그 시그니처는 이 plan 이 **의도적으로 유지**한 쪽이므로 영향이 없다. `typecheck:tests` 가 이 판단을 뒷받침한다(유일하게 잡힌 형 오류는 `order-store.test.ts:79` 한 곳이었다).

**⑥ 신규 ⓻-b.** 가짜 sink 가 아니라 **진짜 sink 세 벌 + 가짜 `SupabaseClient`** 로 세웠다 — 「sink 가 `created` 를 말하고 store 가 그것을 센다」는 사슬 전체를 봐야 이 갭이 잠긴다.

| 단언 | 잠그는 것 |
|------|-----------|
| `rows` 길이 `before → before+1` (두 번째 insert 후에도 그대로) | 수렴은 행을 만들지 않았다 |
| `stats() = {inserted:1, insertConverged:1}` | **만든 행은 하나뿐인데 예전엔 `inserted:2` 였다** |
| `converged === "row-a-today"` | 「기록 불가」 열화 없음 (16-28 유지) |
| `typeof converged === "string"` | 공개 반환 타입 무변경 |

기존 ⓻ 의 단언은 유지했다 — `expect(result.id).toBe("row-a-today")` + `expect(result.created).toBe(false)`.

### Task 2 — 「이미 있다」가 「기록 불가」로 열화되지 않는다 (R2-WR-07② / T-16-82) · commit `52cc1da`

**① 재조회를 `try`/`catch` 로 감쌌고, catch 는 재전파하지 않는다.**

```ts
let existing: string | null = null;
try {
  existing = await lookup(row.userId, row.orderNo);
} catch (lookupErr) {
  logger.error(
    { pgError: safePgError(lookupErr), origin: row.origin },
    "[orders] 23505 후 수렴 재조회 실패 — 원래 사유(23505)를 그대로 올린다",
  );
}
```

**예외 삼키기를 넓힌 것이 아니다.** 삼킨 사실은 로그로 남고(S-5), 흐름은 기존 throw 경로로 떨어져 **원래의 `23505`** 를 올린다. 왜 이것이 중요한가를 그 자리 주석에 적었다 — `ensureRow` 는 모든 insert 예외를 `{kind:"unavailable"}` 로 접고 그 통보를 드롭하므로, 조회 오류가 올라가면 「이미 있다」→「조회 불가」→**「기록 불가」** 로 열화된다. 16-28 이 닫은 문이 **재조회 실패라는 뒷문**으로 열려 있었다.

**② 「지어내지 않는다」 규율(16-28)은 그대로다.** 재조회가 못 찾았거나(행 없음) 실패했으면(catch) 둘 다 아래 기존 경로로 떨어진다.

**③ sink 조립 지점을 하나로 모았다.** `supabaseOrderLookupSink(supabase)` 를 **매 호출마다** 새로 만들던 것을 팩토리 본문으로 올려 `const lookup = supabaseOrderLookupSink(supabase);` 한 줄로 뒀다. 클로저 생성 비용이 아니라 **같은 파일 안에서 sink 조립 방식이 두 벌이 되는 것**이 문제다 — 16-39 가 update 셀렉터에서 겪은 것과 같은 종류다(T-16-14).

**④ 신규 ⓻-c.** `selectError` 로 재조회만 실패시키고(**insert 의 `23505` 는 `dupToday` 가 실계산한다**) 단언한다:

- `rejects.toMatchObject({ code: "23505" })` ← 이 한 줄이 갭의 종결이다
- `queries.verb === ["insert","select"]` — 재조회 실패를 재시도로 두드리지 않는다
- 로그 페이로드에 `"57014"` **존재** + 가짜 계좌번호·`"Failing row"`·`hint` **부재** ← 16-38 회귀 게이트 겸용

기존 ⓼(`23514` 는 여전히 throw · `queries === ["insert"]`)는 통과 유지.

### Task 3 — 「도는 배치는 언제나 1개」를 실제로 지킨다 (R2-WR-04 / T-16-83) · commit `a59d8f7`

**① 진행 중 배치 대기를 라운드 루프 **안으로** 흡수했다.**

```ts
async flushNow(): Promise<void> {
  for (let round = 0; round < ORDER_FLUSH_MAX_ROUNDS; round += 1) {
    // ★ 진행 중 배치 대기를 **루프 안으로** 넣었다 (16-40 / R2-WR-04 / T-16-83).
    while (this.#current !== null) await this.#current;
    if (this.#queue.length === 0) return;
    // 여기서 대입까지 `await` 이 없다 — 위 `while` 이 `null` 을 관측한 순간부터 대입까지
    // 마이크로태스크 경계가 없어야 이 방어가 성립한다. 사이에 `await` 을 넣지 말 것.
    this.#current = this.#runDrain();
    await this.#current;
  }
```

루프 밖의 최초 대기는 여기에 흡수했다 — 라운드 0 의 동작이 종전과 완전히 같고(대기 → 큐 확인 → 배치), 대기 지점이 둘이면 언젠가 한쪽만 고쳐진다. 그 판단을 주석에 적었다.

**② 왜 이 한 줄이 필요한가**를 주석에 남겼다: `await` 가 풀린 뒤 대입까지 마이크로태스크 경계가 있고, 이 시점은 아직 `close()` 전이라 200ms `#tick` 이 살아 있다. 덮어쓰면 남의 배치가 먼저 끝나며 `#current = null` 을 하므로 세 번째 drain 이 시작될 수 있다.

**③ 「큐 스왑은 2선 방어다」를 `#drain` docstring 에 박았다.** 「같은 항목이 두 번 쓰이지 않아 온 이유는 진입 즉시 큐를 스왑하기 때문이고, 그것이 이 결함을 오래 가려 왔다. 1선은 `#tick` 의 건너뛰기와 `flushNow` 의 라운드 재확인이다. 겹쳐 도는 배치는 항목 중복이 없어도 장애 중인 Supabase 를 여러 겹으로 두드린다.」

**④ `close()` 순서를 바꾸지 않았다** (`git diff HEAD~4 --stat -- relay/src/index.ts` = **0줄**). 근거를 `flushNow` docstring 에 명시했다 — tick 을 먼저 끊으면 `ORDER_FLUSH_MAX_ROUNDS` 의 세 번째 라운드 근거(「1·2 를 await 하는 동안 다른 경로가 새로 넣은 항목」, 16-24)가 흔들린다. 종료 중 유입은 tick 이 아니라 DMA 수신 콜백(D-32)에서 온다.

**⑤ 신규 ⑮-b — 관측 대상은 항목 중복이 아니라 `maxLive`(동시에 도는 배치 수)다.**

> **계획의 서술을 그대로 옮겼다면 이 케이스는 초록불로 거짓말을 했을 것이다.** 처음 작성한 시나리오(tick 이 `flushNow` 진입 대기 구간을 낚아채는 형태)는 **수정 전 구현에서도 통과**했다. 원인을 임시 프로브로 이벤트 순서를 찍어 확인했다 — ⓐ `setInterval` 은 macrotask 라 마이크로태스크 경계에 **끼어들 수 없고**(테스트에서 `vi.advanceTimersByTime` 이 마이크로태스크 안에서 동기 호출되기에 비로소 그 창이 열린다) ⓑ **종전 구현의 루프 밖 `while` 은 진입 구간을 이미 막고 있었다.** 실제로 열려 있던 창은 **라운드 N 종료와 라운드 N+1 대입 사이** 하나였다. 재현 시나리오를 그 창에 맞춰 다시 세웠다.

재현 3단계(순서가 곧 케이스의 내용이다):

| 단계 | 하는 일 |
|------|---------|
| P1 | tick 이 `row-a` 배치를 시작하고 sink 에서 멈춘다 |
| P2 | SIGTERM. **틱을 때리지 않고** 마이크로태스크만 돌려 `flushNow` 를 라운드 루프 안으로 들여보낸다(round 0 = `row-b`) |
| P3 | 이제 경계마다 틱을 때린다. round 0 종료로 `#current` 가 `null` 인 순간을 tick 이 낚아채 `row-c` 배치를 시작하고, 그 sink 가 `row-d` 를 큐에 넣는다(종료 중 유입, D-32/16-24). 여기서 round 1 이 재확인 없이 대입하면 **배치가 둘**이 된다 |

단언: `maxLive === 1` · `seen === ["row-a","row-b","row-c","row-d"]` · `stats() ⊇ {queued:0, flushed:4, dropped:0}`.

**무엇을 잠갔고 무엇을 못 잠갔는지 (과장하지 않는다):**

- **잠갔다:** 「`flushNow` 의 라운드 루프가 진행 중 배치를 재확인한다」. 이 케이스는 수정 전 구현에서 `AssertionError: expected 2 to be 1` 로 **실패**한다 — 즉 실제 중첩을 관측한다.
- **못 잠갔다:** **프로덕션의 실시간 경합 그대로는 아니다.** 이 재현은 `vi.advanceTimersByTime` 을 마이크로태스크 안에서 동기 호출해 창을 인위적으로 연다. 순수 Node 런타임에서 `setInterval` 콜백이 그 마이크로태스크 창에 들어갈 수 있는지는 이 케이스가 증명하지 않는다(위 ⓐ 의 분석대로라면 들어갈 수 없다). 그러나 **`flushNow` 가 동시에 두 번 호출되는 경우**(SIGTERM·SIGINT 중복 등)에는 같은 창이 마이크로태스크만으로 열리며, 이 수정은 그 경로도 함께 막는다. 「프로덕션에서 이 중첩이 일어난 적이 있다」는 주장은 하지 않는다 — 잠근 것은 **코드의 불변식**이다.
- 기존 `flushNow` 케이스(⑮ 대기 후 비움 · ⑯ 재큐잉분까지 · ⑰ 라운드 상한 반환)는 **전부 통과**한다. 계약이 바뀌지 않았다는 뜻이다.

### 범위 판단으로 추가한 것 — 16-39 의 `flushed` 잔여 오차 종결 · commit `e32ca65`

16-39 는 「`order_no` 만 담긴 갱신의 `23505`」 한 경우에 **반영된 것이 없는데 `flushed += 1`** 이 되는 오차를 ⓽-b 의 주석·단언으로 드러내 두고 범위 밖으로 남겼다. 이 plan 의 R2-WR-07① 과 **같은 결함 클래스**(계기판이 자기 선언을 지키지 않는다)이고, 16-41~16-46 어느 plan 도 그것을 맡고 있지 않아 여기서 닫았다.

**같은 기법을 그대로 적용했다 — 카운터 대입문이 아니라 sink 가 참말을 하게 한다.**

```ts
export type OrderUpdateResult = { applied: boolean };
export type OrderUpdateSink = (
  sel: OrderSelector, patch: OrderRowPatch,
) => Promise<void | OrderUpdateResult>;
```

- **반환 생략(`void`)은 `applied: true` 와 같다.** 압도적 다수의 sink 는 「보냈으면 반영됐다」이고 그것들을 전부 고치는 비용이 이 한 비트의 값어치보다 크다. **예외를 말하는 쪽만** 명시한다 — 기존 sink 구현(테스트 포함) **변경 0줄**이 그 설계의 결과다.
- `#drain`: `if (outcome !== undefined && !outcome.applied) this.#flushedNoop += 1; else this.#flushed += 1;`
- `stats().flushedNoop` 신설 — 실패가 아니므로 `dropped` 가 아니고, 반영도 아니므로 `flushed` 도 아니다. 버리지 않고 센다(S-5).
- **16-28 의 드롭 규율은 그대로다** — `#retried`·`#dropped` 대입문 diff **0줄**(`git diff HEAD~4 HEAD` 기준).
- ⓽-b 의 「잔여 오차로 드러내 둔다」 주석을 종결 근거로 교체하고 단언을 `flushed:0` · `flushedNoop:1` 로 고쳤다.

### 회귀 잠금 실증 — 4라운드, 수정 지점마다 따로

| 라운드 | 되돌린 것 | 실패 | 해석 |
|--------|-----------|------|------|
| A | `insertRequest` 가 `created` 를 무시(옛 무조건 `+= 1`) | **1건** — ⓻-b | 카운터 오염이 정확히 그 케이스로만 드러난다 |
| B | 수렴 재조회의 `try`/`catch` 제거 | **1건** — ⓻-c | 재조회 오류가 `23505` 를 덮는다 |
| C | `flushNow` 를 옛 형태로(대기를 루프 밖으로) | **1건** — ⑮-b, `expected 2 to be 1` | **배치가 실제로 둘이 된다** |
| D | `applied: false` → 그냥 `return` | **1건** — ⓽-b, `expected 1 to be +0` | `flushed` 가 반영되지 않은 1건을 센다 |

4라운드 모두 복원 후 전량 통과 확인. 되돌린 지점마다 **정확히 그 케이스 하나만** 빨개졌다.

## Verification Results

| 검증 | 결과 |
|------|------|
| `pnpm --filter @gh-radar/relay exec vitest run tests/order-store.test.ts` | **36 passed** (33 → +3) exit 0 |
| `pnpm --filter @gh-radar/relay test` | **17 files · 387 tests passed** (기준선 384 → +3) exit 0 |
| `pnpm --filter @gh-radar/relay run typecheck` | exit 0 |
| `pnpm --filter @gh-radar/relay run typecheck:tests` | exit 0 |
| `pnpm -r typecheck` | exit 0 |
| `pnpm -r test` | exit 0 · **2,026 passed** (기준선 2,023 → +3, relay 외 변동 없음) |
| `test -f relay/tests/order-store.test.ts` | 참 ✅ |
| `git diff HEAD~4 --stat -- relay/src/ws/order-handler.ts` | **0줄** — 호출자 무변경 ✅ |
| `git diff HEAD~4 --stat -- relay/src/index.ts` | **0줄** — `close()` 호출 순서 무변경 ✅ |
| `grep -n "async insertRequest" relay/src/store/orders.ts` | `Promise<string>` 그대로 ✅ |
| `grep -rn "OrderInsertSink" relay/src relay/tests` | 11지점 전수 확인, 전부 새 시그니처 ✅ |
| `#retried`·`#dropped` 대입문 diff | **0줄** — 16-28 드롭 규율 유지 ✅ |
| `grep -rn "\.stats()" relay/src` | `OrderStore.stats()` 소비처 0건 — 필드 추가가 `/healthz` 에 닿지 않음 ✅ |
| `git status --short supabase/migrations/` | 0건 — DB 미변경 ✅ |
| 포매터 | 미실행 (이 저장소에 prettier 설정 없음 — 16-30 사고) ✅ |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 계획이 서술한 R2-WR-04 재현 조건이 실제와 달랐다 — 시나리오를 다시 세웠다**

- **발견 시점:** Task 3 ⑤, 첫 작성 케이스가 **수정 전 구현에서도 통과**
- **문제:** 계획(과 R2 리뷰)은 「`flushNow` 진입부 `await` 가 풀린 뒤 대입까지의 경계에 200ms `#tick` 이 끼어든다」고 서술했다. 실측 결과 그 자리는 종전 구현의 **루프 밖 `while` 이 이미 막고 있었다** — `await this.#current` 가 풀린 뒤 조건을 재평가하므로 tick 이 시작한 배치를 다시 기다린다. 실제로 열려 있던 창은 **라운드 N 종료와 라운드 N+1 대입 사이** 하나였다. 그 창을 겨냥하지 않은 케이스는 「잠갔다」고 말하면서 아무것도 잠그지 않는다 — 이번 라운드에 이미 세 번 나온 「거짓을 진실로 잠그는 테스트」가 될 뻔했다.
- **조치:** 임시 프로브로 `sink-enter`/`tick>`/`<tick` 이벤트 순서를 찍어 「누가 배치를 시작했는가」를 눈으로 확인한 뒤(수정 전 `MAXLIVE 2` / 수정 후 `MAXLIVE 1` 실측), 3단계 시나리오로 케이스를 다시 썼다. 프로브 파일은 삭제했다. 무엇을 못 잠갔는지도 위 Task 3 ⑤ 에 명시했다.
- **파일:** `relay/tests/order-store.test.ts`
- **커밋:** `a59d8f7`

**2. [Rule 2 - 누락된 필수 조치] 16-39 의 `flushed` 잔여 오차를 함께 닫았다**

- **발견 시점:** Task 1~3 완료 후 인접 범위 판단
- **문제:** 16-39 가 남긴 「`order_no` 만 담긴 갱신의 `23505` 는 반영된 것이 없는데 `flushed += 1`」 은 이 plan 의 R2-WR-07①(계기판 오염)과 **같은 결함 클래스**다. 16-41~16-46 의 objective 를 전수 확인한 결과 어느 plan 도 그것을 맡고 있지 않아, 닫지 않으면 phase 종료까지 남는다.
- **조치:** `OrderUpdateSink` 반환을 `Promise<void | {applied}>` 로 넓혀(기존 구현 변경 0줄) `flushedNoop` 으로 분리. 16-39 가 우려한 「`#drain` 을 건드리면 16-28 의 드롭 규율과 얽힌다」는 `#retried`·`#dropped` 대입문 diff 0줄로 회피했다.
- **파일:** `relay/src/store/orders.ts`, `relay/tests/order-store.test.ts`
- **커밋:** `e32ca65`

### 계획대로 하지 않은 것 (의도적)

- **`relay/tests/ws-order.test.ts` 를 손대지 않았다.** 계획 frontmatter 의 `files_modified` 에 있으나 전수 확인 결과 그 파일에 `OrderInsertSink` 구현이 없다(있는 것은 `OrderRecorder.insertRequest` 흉내이고 그 시그니처는 이 plan 이 의도적으로 유지했다). **없는 변경을 지어내지 않는다.** 후속 16-43 이 이 파일을 이어받는 데도 영향이 없다.
- **수렴 횟수를 별도 카운터로 노출했다.** 계획 ④ 가 재량으로 열어 둔 항목이다. `stats()` 소비처 부재를 먼저 확인한 뒤 `insertConverged` 를 더했다.
- **`requirements.mark-complete` 미실행.** frontmatter 에 `requirements: [TRADE-03]` 이 있으나 돌리지 않았다. TRADE-03 의 Pending 근거는 프로덕션 실측(16-26)과 WinForms ↔ 웹 세션 공유 human-only 검증이고 이 plan 은 그것을 건드리지 않는다 — 16-28·16-36~16-39 와 같은 기준. **재판정은 16-46 몫이다.**

## Threat Model Coverage

| Threat ID | Disposition | 실제 조치 |
|-----------|-------------|-----------|
| T-16-81 (Repudiation — 계기판 오염 / `inserted`) | mitigate ✅ | sink 가 `created` 를 말하고 수렴은 세지 않는다. ⓻-b 가 `{inserted:1, insertConverged:1}` 로 잠근다 |
| T-16-82 (Repudiation — 사유 열화) | mitigate ✅ | 재조회 예외 격리. ⓻-c 가 `rejects.toMatchObject({code:"23505"})` 로 잠근다 |
| T-16-83 (DoS — 배치 중첩) | mitigate ✅ | 라운드마다 재확인. ⑮-b 가 `maxLive === 1` 로 잠근다(수정 전 2 실측). 큐 스왑이 2선임을 `#drain` docstring 에 명시 |
| T-16-40 (종료 지연 / 라운드 상한) | accept ✅ | 상한 계약 무변경. 기존 ⑮·⑯·⑰ 통과 유지가 회귀 게이트다 |
| T-16-45 (Information Disclosure) | mitigate ✅ | 재조회 실패 로그는 `safePgError`. ⓻-c 가 `details`·`hint`·계좌번호 부재를 단언 |
| T-16-14 (Tampering — 전역 쓰기) | mitigate ✅ | lookup sink 조립 지점을 하나로. update 셀렉터(`runUpdate`)는 16-39 그대로 |
| T-16-80 (Repudiation — `flushed` 거짓) | mitigate ✅ | 16-39 잔여 오차 종결. ⓽-b 가 `flushed:0 / flushedNoop:1` 로 잠근다 |
| T-16-13 (실서버·실계좌 접속) | accept ✅ | 가짜 `SupabaseClient` 하네스만. 접속 0회 |

## Threat Flags

없음 — 새 네트워크 엔드포인트·인증 경로·스키마 변경 없음. 왕복 횟수·쿼리 형태도 그대로다(바뀐 것은 반환 타입 두 개와 카운터 분기).

## Known Stubs

없음.

## 남은 것 (이 plan 이 닫지 않는 것)

- **⑮-b 가 잠근 것은 「코드의 불변식」이지 「프로덕션 실시간 경합의 재현」이 아니다.** 위 Task 3 ⑤ 에 무엇을 못 잠갔는지 명시했다. `setInterval` 이 마이크로태스크 창에 끼어들 수 없다는 분석이 맞다면 `#tick` 경유 발현은 이론상 불가능하고, 실제 위험 경로는 **`flushNow` 중복 호출**이다 — 그쪽도 이 수정이 함께 막는다.
- **`order-handler.ts` 통보 경로의 `orderNo` 원문 로그** — 16-38 이 남긴 항목 그대로.
- **⚠️ 배포 미실시 — 프로덕션에는 R2-WR-07·R2-WR-04 가 여전히 살아 있다.** 프로덕션이 실 게이트웨이에 결선돼 실주문이 흐르므로 계기판 오염은 실재한다. 재배포는 3라운드 종결 plan **16-46** 몫.
- **TRADE-03 은 계속 Pending.**

## Self-Check: PASSED

- `relay/src/store/orders.ts` FOUND (수정)
- `relay/tests/order-store.test.ts` FOUND (수정)
- `.planning/phases/16-trading-limit-chaser-vi-my-page/16-40-SUMMARY.md` FOUND
- commit `d8ade31` FOUND
- commit `52cc1da` FOUND
- commit `a59d8f7` FOUND
- commit `e32ca65` FOUND
