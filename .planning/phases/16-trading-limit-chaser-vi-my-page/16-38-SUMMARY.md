---
phase: 16-trading-limit-chaser-vi-my-page
plan: 38
subsystem: relay
tags: [postgrest, logging, information-disclosure, masking, dma-orders, vitest]

requires:
  - phase: 16
    provides: "16-28 이 23505 분기에 남긴 마스킹 근거 — 「UNIQUE 위반 detail 은 주문번호 원문을 담는다 (T-16-45)」"
  - phase: 16
    provides: "16-08/16-18 의 세 sink 구조(update·insert·조회)와 `fakeDmaOrders` 하네스"
provides:
  - "`relay/src/store/pg-error.ts` — PostgREST 오류의 안전 필드 추출 **단일 정본** (`safePgError`)"
  - "PostgREST 오류가 로그로 나가는 relay 전 경로 13곳의 페이로드 축소 (`code` + 절단 `message` 만)"
  - "`details` 미유출을 세 sink + `#drain` 에서 각각 단언하는 4케이스 (⓼-b~⓼-e)"
  - "`fakeDmaOrders` 의 `FakePgError` 주입 훅 — `details`·`hint` 를 실을 수 있는 재현 하네스 + `updateError`·`selectError`"
affects: [relay 감사 기록 경로, 자격증명 조회 경로, 종목마스터 적재, 16-39·16-40·16-43 후속]

tech-stack:
  added: []
  patterns:
    - "마스킹 규율을 **경로가 아니라 타입**에 건다 — 좁은 반환 타입(`{code?, message?}`)이 곧 계약의 집행 수단"
    - "「한 자리를 고치면 옆 줄이 흘린다」를 회귀 잠금으로 증명한다 — sink 를 안전하게 둔 채 `#drain` 만 되돌려 실패를 확인"
    - "`vi.spyOn` 은 이미 감싼 메서드에 **같은 spy** 를 돌려준다 — 복원 없는 spy 는 `mock.calls` 가 케이스를 넘어 누적된다"

key-files:
  created:
    - relay/src/store/pg-error.ts
  modified:
    - relay/src/store/orders.ts
    - relay/src/ws/order-handler.ts
    - relay/src/store/credentials.ts
    - relay/src/store/symbols.ts
    - relay/src/ws/fanout.ts
    - relay/tests/order-store.test.ts

key-decisions:
  - "로그 키를 `pgError` 로 둔다 — GCP pino 설정의 `messageKey` 가 **`message`** 라, 안전 필드를 최상위로 펼치면 로그 메시지 자체와 충돌한다"
  - "리뷰·계획이 지목한 7곳이 아니라 **전수 조사 23곳 중 13곳**을 교체했다 — `order-handler` 4곳·`credentials`·`fanout`·`symbols` 는 계획 목록 밖이었지만 같은 PostgREST 원문을 받는다"
  - "`order-handler.ts:411`(최후 그물)은 **유지** — 안쪽 Supabase 왕복 세 곳이 각각 catch 로 종결되므로 PostgREST 가 닿지 않고, 여기 오는 것은 스택이 유일한 단서인 프로그래밍 예외다"
  - "`order-handler.ts:862`(조립 거부)은 **유지** — try 가 감싼 것이 `buildDirectOrderReq` 하나이고 그것은 `OrderBuildError` 만 던진다"
  - "비객체 throw 는 `{ message }` 로 남긴다 — PostgREST 는 비객체를 던지지 않으므로 그 갈래에는 행 내용 유출 경로가 없고, 버리면 S-5 를 어긴다"

patterns-established:
  - "회귀 잠금 실증 4라운드 — 되돌린 **한 지점마다** 정확히 그 케이스만 빨개지는지 확인 (16-27/16-28 승계, 지점 단위로 세분화)"

requirements-completed: []

duration: 16min
completed: 2026-09-09
---

# Phase 16 Plan 38: PostgREST 오류 원문 유출 차단 (R2-CR-03) Summary

**`qty <= 0` 같은 CHECK 위반 한 번이면 `Failing row contains (…, 계좌번호, 주문번호, user_id, …)` 가 Cloud Logging 에 영구히 남던 경로를 닫았다 — 규율을 경로마다 적는 대신 `safePgError` 한 모듈의 좁은 반환 타입에 걸었고, 계획이 지목한 7곳이 아니라 전수 조사로 찾은 13곳을 교체했다.**

## Performance

- **Duration:** 약 16분
- **Tasks:** 3/3
- **Files:** 신규 1 · 수정 6
- **신규 마이그레이션:** 0건 (DB 미변경)
- **실서버·실계좌 접속:** 0회 (D-27)

## Accomplishments

### Task 1 — 안전 필드 추출 단일 정본 · commit `dc19f09`

`relay/src/store/pg-error.ts` 신설. export 는 `safePgError` 하나뿐이다.

```ts
export type SafePgError = { code?: string; message?: string };
export function safePgError(err: unknown): SafePgError
```

- `code` 는 `string`/`number` 만 좁혀 받고, `message` 는 **200자 절단**한다. `details`·`hint` 는 **읽지도 않는다** — 없는 값은 샐 수 없다.
- `null`/`undefined` → `{}`. 빈 문자열을 지어내면 로그 판독자가 「사유가 있었는데 잘렸다」로 오해한다.
- 비객체(문자열 throw 등) → `{ message: String(err).slice(0,200) }`. 그 값 자체가 유일한 사유이고, PostgREST 는 비객체를 던지지 않으므로 이 갈래에는 행 내용이 실릴 경로가 없다.
- **반환 타입을 넓히지 않았다.** `Record<string, unknown>` 이면 다음 사람이 `details` 를 다시 얹을 수 있다 — 좁은 타입 자체가 이 계약의 집행 수단이다.
- docstring 이 16-28 의 근거를 승계해 SQLSTATE 별로 무엇이 새는지(`23514`/`23502` → `Failing row contains (…)`, `23503` → `Key (user_id)=(…)`, `23505` → `Key (…)=(…) already exists`)와 「사유를 지우는 것이 아니다」(S-5)를 함께 적었다.

**「안전한 필드」의 근거 (코드에서 확인한 것).** PostgreSQL 은 값을 **`DETAIL`** 에 넣고 `message` 에는 제약명까지만 담는다 — 16-28 이 실제로 관측해 하네스에 박아 둔 문자열이 그 증거다: `'duplicate key value violates unique constraint "idx_dma_orders_user_order_no_kst_day"'` (값 없음). supabase-js 는 그 `DETAIL` 을 `error.details` 로, `HINT` 를 `error.hint` 로 전달한다. 즉 **값이 들어가는 통로는 `details`/`hint` 두 곳**이고 그 둘을 읽지 않는 것이 마스킹의 전부다.

**잔여 위험(알고 받아들인 것).** 타입 캐스팅 실패 계열(`22P02` — `invalid input syntax for type uuid: "…"`)은 값을 `message` 에 담을 수 있다. 그 경로는 `dma_orders` 쓰기에서 나오지 않고(모든 값이 코드에서 타입 지어져 나간다) 200자 절단이 폭을 묶는다. `message` 까지 버리면 「무엇이 실패했는지」가 사라져 S-5 를 어기므로 절단으로 둔다. 이 판단을 파일 docstring 에 적었다.

### Task 2 — 유출 지점 전수 교체 · commit `84c23d7`

**전수 조사부터 했다.** 계획의 grep(`logger\.(error|warn|info)\(\s*\{\s*(err|error)\b`)은 **한 줄짜리만** 잡는다 — `#drain` 의 두 줄(`logger.warn(\n  { err, …`)과 `credentials.ts` 의 `{ userId, error }`(키 순서가 다르다)를 놓친다. perl 멀티라인 스캔으로 로그 인자 객체 안의 bare `err`/`error` 를 **23곳** 전부 뽑아 호출 사슬을 따라 판정했다.

| 지점 | 이 자리의 `err` 출처 | PostgREST? | 처분 |
|------|---------------------|-----------|------|
| `store/orders.ts` update 실패 | update sink 자신 | 예 | **교체** |
| `store/orders.ts` insert 실패 | insert sink 자신 | 예 | **교체** |
| `store/orders.ts` order_no 조회 실패 | 조회 sink 자신 | 예 | **교체** |
| `store/orders.ts` `#tick` catch | `#runDrain` → `#drain` | 예(방어적) | **교체** |
| `store/orders.ts` `#drain` 재큐잉 warn | sink 가 **던진** 그 객체 | 예 | **교체** |
| `store/orders.ts` `#drain` 드롭 error | 동상 | 예 | **교체** |
| `ws/order-handler.ts:472` 수동 통보 조회 실패 | `findIdByOrderNo` throw | 예 | **교체** (계획 목록 밖) |
| `ws/order-handler.ts:551` 자동 통보 조회 실패 | `findIdByOrderNo` throw | 예 | **교체** (계획 목록 밖) |
| `ws/order-handler.ts:603` 자동주문 행 생성 실패 | `insertRequest` throw | 예 | **교체** (계획 목록 밖) |
| `ws/order-handler.ts:809` 수동 insert 실패 | `insertRequest` throw | 예 | **교체** |
| `store/credentials.ts:136` `dma_credentials` 조회 실패 | PostgREST 원문 (throw 도 한다) | 예 | **교체** (계획 목록 밖) |
| `ws/fanout.ts:513` 자격증명 조회 실패 | 위가 던진 **같은 객체** | 예 | **교체** (계획 목록 밖) |
| `store/symbols.ts:181` 종목마스터 적재 실패 | `stocks` select 오류 | 예 | **교체** (계획 목록 밖) |
| `ws/order-handler.ts:411` `recordUnmatched` 최후 그물 | 안쪽 왕복 3곳이 **각각** catch 로 종결 | 아니오 | 유지 + 근거 주석 |
| `ws/order-handler.ts:862` 주문 조립 거부 | `buildDirectOrderReq` 의 `OrderBuildError` 뿐 | 아니오 | 유지 + 근거 주석 |
| `ws/fanout.ts:999` 전략 요청 조립 거부 | 동상(`OrderBuildError`) | 아니오 | 유지 |
| `ws/fanout.ts:454` ws 소켓 오류 | `ws` 이벤트 | 아니오 | 유지 |
| `ws/fanout.ts:1138` 아웃바운드 전송 실패 | `encode`/`ws.send` | 아니오 | 유지 |
| `dma/dma-client.ts:301·339` 송신·소켓 예외 | TCP 소켓 | 아니오 | 유지 |
| `order/order-api.ts:292` express 미처리 오류 | D-02 이후 라우트가 Supabase 를 타지 않는다 | 아니오 | 유지 |
| `index.ts:206` 종료 절차 실패 | `flushNow` 는 항목 단위로 catch 한다 | 아니오 | 유지 |
| `index.ts:226` unhandledRejection/uncaughtException | 프로세스 최후 관문 — 스택이 유일한 단서 | 아니오 | 유지 |

**교체 13곳 / 유지 10곳.** 유지 판정에는 그 줄 옆에 근거 주석을 남겼다(`order-handler.ts:411`·`:862`, `credentials.ts`·`fanout.ts`·`symbols.ts` 는 교체 근거 주석). 근거 문장 자체는 **`store/pg-error.ts` docstring 한 곳**에만 있고 각 파일에는 그 파일의 판정만 적었다 — 같은 문장을 열세 번 적으면 다음 사람이 그중 한 곳만 고친다.

**`:411` 유지 판정의 근거(코드로 확인).** `recordUnmatched` 안의 Supabase 왕복은 셋뿐이고(`findIdByOrderNo` ×2 · `insertRequest`) **전부 개별 catch 로 종결**된다(`:472`·`:551`·`:603`). 나머지는 동기 호출(`patchOf`·`enqueueUpdate`)이다. 그래서 이 최후 그물까지 오는 값은 조립·프로그래밍 예외뿐이고 그때는 스택이 유일한 단서다. 안쪽 catch 를 하나라도 걷어내면 이 판정이 무효가 된다는 사실을 그 줄 주석에 박았다.

**로그 키를 `pgError` 로 둔 이유(계획에 없던 판단).** GCP pino 설정(`createGcpLoggingPinoConfig`)은 `messageKey` 를 **`message`** 로 쓴다 — 실제 출력이 `"message":"[orders] …"` 다. 안전 필드를 최상위로 펼치면(`{ ...safePgError(e) }`) `message` 키가 로그 메시지 자체와 충돌한다. 중첩 키 하나로 두면 충돌이 없고 grep 도 쉽다. 실제 출력 예:

```
"pgError":{"code":"23514","message":"…violates check constraint \"dma_orders_qty_check\""},"column":"id"
```

**동작은 한 줄도 바꾸지 않았다.** `#dropped`/`#retried`/`#flushed`/`#inserted` 대입문 diff **0줄**, throw·재시도·수렴 분기 diff 0줄. 16-28 의 `23505` 수렴 경로(insert 재조회 + warn, update 정상 반환)는 그대로다. 함께 실리는 비식별 필드(`column`·`origin`·`orderNo`·`userId`·`cachedCount`)도 손대지 않았다 — 사유 추적에 필요하고 식별자가 아니다.

### Task 3 — 유출 부재를 단언하는 테스트 · commit `110bbb7`

**① 하네스를 재현 가능하게 넓혔다.** `fakeDmaOrders` 의 주입 훅 타입을 `FakePgError = { code?, message, details?, hint? }` 로 올리고 `updateError`·`selectError` 를 추가했다. `details` 가 없는 스텁으로는 **이 갭을 재현조차 할 수 없다** — 기존 ⓼ 가 `23514` 를 흘려보내면서도 초록이었던 이유가 그것이다. 「제약 위반을 실제로 계산하는」 `dupToday` 는 그대로 두고 강제 주입을 옆에 뒀다.

**② 신규 4케이스** (새 describe `PostgREST 오류 원문 유출 (R2-CR-03)`). 주입 오류는 실제 모양 그대로다:

```
{ code: "23514",
  message: 'new row for relation "dma_orders" violates check constraint "dma_orders_qty_check"',
  details: 'Failing row contains (a1b2, 9876543210, KR7005930003, 0, 70000, …).',
  hint: "계좌 담당자에게 문의하십시오" }
```

| 케이스 | 제목 | 잠그는 것 |
|--------|------|-----------|
| ⓼-b | `insert 실패 로그에 details 가 실리지 않는다 — code 는 남는다` | insert sink |
| ⓼-c | `update 실패 로그에 details 가 실리지 않는다 — code 는 남는다` | update sink |
| ⓼-d | `order_no 조회 실패 로그에 details 가 실리지 않는다 — code 는 남는다` | 조회 sink |
| ⓼-e | `#drain 의 재큐잉 warn·드롭 error 도 details 를 싣지 않는다 (sink 옆 줄)` | sink 밖 두 줄 |

각 케이스가 로그 페이로드(첫 인자)만 직렬화해 ① 가짜 계좌번호 `9876543210` 부재 ② `"Failing row"` 부재 ③ `hint` 문자열 부재 ④ **`"23514"` 존재**를 함께 단언한다. ④ 가 S-5 다 — 마스킹이 사유까지 지우면 그것대로 사고다. 기존 ⓼ 의 「`23505` 가 아닌 에러는 여전히 throw 된다」 단언은 ⓼-b 안에서도 유지했다(`rejects.toMatchObject({code:"23514"})` + 쿼리가 `["insert"]` 하나).

⓼-e 는 `retried: 1` · `dropped: 1` 도 함께 단언한다 — **동작이 그대로임**을 같은 케이스가 지킨다.

**③ 회귀 잠금 실증 — 지점마다 따로 확인했다.** 한 지점씩 `safePgError` 를 걷어내고 돌린 뒤 복원했다:

| 라운드 | 되돌린 지점 | 실패 |
|--------|------------|------|
| A | insert sink 로그 | **1건** — ⓼-b |
| B | update sink 로그 | **2건** — ⓼-c, ⓼-e |
| C | 조회 sink 로그 | **1건** — ⓼-d |
| D | `#drain` 두 줄만 (**sink 는 안전한 채로**) | **1건** — ⓼-e |

**라운드 D 가 이 plan 의 핵심 증거다.** sink 세 곳을 전부 안전하게 둔 상태에서도 `#drain` 두 줄만 되돌리면 계좌번호가 샌다 — 「한 자리만 고치면 옆 줄이 그대로 흘린다」가 관측으로 확인됐다. 라운드 B 에서 ⓼-e 가 함께 빨개지는 것도 옳다(그 케이스는 update sink 의 로그도 본다). 4라운드 모두 복원 후 `git diff` 출력 0줄.

## Verification Results

| 검증 | 결과 |
|------|------|
| `pnpm --filter @gh-radar/relay exec vitest run tests/order-store.test.ts` | **31 passed** (27 → +4) exit 0 |
| `pnpm --filter @gh-radar/relay test` | **17 files · 382 tests passed** (기준선 378 → +4) exit 0 |
| `pnpm --filter @gh-radar/relay run typecheck` | exit 0 |
| `pnpm --filter @gh-radar/relay run typecheck:tests` | exit 0 |
| `pnpm -r typecheck` | exit 0 |
| `pnpm -r test` | exit 0 · **2,021 passed** (기준선 2,017 → +4, relay 외 변동 없음) |
| `test -f relay/src/store/pg-error.ts` | 참 ✅ |
| `grep -vE '^\s*(\*\|//\|/\*)' relay/src/store/pg-error.ts \| grep -cE '\.(details\|hint)'` | **0** ✅ |
| `grep -vE '^\s*(\*\|//\|/\*)' relay/src/store/orders.ts \| grep -cE 'logger\.(error\|warn)\(\{ *(err\|error)[,}]'` | **0** ✅ |
| `grep -vE '^\s*(\*\|//\|/\*)' relay/src/ws/order-handler.ts \| grep -cE 'logger\.(error\|warn)\(\{ *err[,}]'` | **1** — `:862` 조립 거부(PostgREST 아님, 위 표에 근거) ✅ |
| `grep -c "safePgError" relay/src/store/orders.ts` | **8** (≥6) ✅ |
| `grep -rn "safePgError(" relay/src/` (pg-error.ts 제외) | **13** 지점 ✅ |
| `grep -c "Failing row" relay/tests/order-store.test.ts` | **7** (≥1) ✅ |
| `#dropped`·`#retried`·`#flushed` 대입문 diff | **0줄** ✅ |
| `git status --short supabase/migrations/` | 0건 — DB 미변경 ✅ |
| 포매터 | 미실행 (이 저장소에 prettier 설정 없음 — 16-30 사고) ✅ |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 새 describe 의 `vi.spyOn` 이 복원되지 않아 `mock.calls` 가 케이스를 넘어 누적됐다**

- **발견 시점:** Task 3, 회귀 잠금 실증 1차 시도
- **문제:** insert 로그 **한 곳만** 되돌렸는데 **4건**이 빨개졌다(⓼-b·⓼-c·⓼-d·⓼-e). 원인은 수정 대상이 아니라 테스트였다 — `vi.spyOn` 은 이미 감싼 메서드에 대해 **같은 spy 를 돌려주고**, 새 describe 에 `afterEach(restoreAllMocks)` 가 없어 앞 케이스의 페이로드가 뒤 케이스의 단언에 그대로 걸렸다. 그 상태로 두면 「어느 줄이 새는가」를 이 파일이 영원히 말하지 못하고, 앞으로 유출이 한 곳에서만 나도 네 케이스가 빨개져 원인 지목이 불가능해진다.
- **조치:** 새 describe 에 `afterEach(() => { vi.restoreAllMocks(); })` 추가 + 그 이유를 주석에 박았다. 이후 4라운드가 **되돌린 지점마다 정확히 그 케이스만** 빨개지는 것으로 확인됐다.
- **파일:** `relay/tests/order-store.test.ts`
- **커밋:** `110bbb7`

**2. [Rule 2 - 누락된 필수 조치] 계획 목록 밖의 유출 지점 6곳을 함께 닫았다**

- **발견 시점:** Task 2 ①(전수 조사)
- **문제:** 계획의 `<interfaces>` 는 7곳을 지목했고 R2 리뷰는 3곳만 말했다. 그러나 같은 PostgREST 원문을 받는 자리가 **6곳 더** 있었다: `order-handler.ts` 의 통보 경로 3곳(`:472`·`:551`·`:603` — `findIdByOrderNo`/`insertRequest` 가 던진 원문), `credentials.ts:136` + `fanout.ts:513`(같은 `dma_credentials` 조회 오류를 **두 번** 로그한다), `symbols.ts:181`. `dma_credentials` 행에는 `dma_password_enc` 가 있어 `dma_orders` 못지않다. 계획의 grep 이 한 줄짜리만 잡는 것도 함께 드러났다(`#drain` 두 줄·`{ userId, error }` 순서를 놓친다).
- **조치:** 멀티라인 스캔으로 23곳 전수 판정 후 13곳 교체. must_have 「`details`·`hint` 는 **어떤 경로에서도** 실리지 않는다」를 문자 그대로 만족시킨다.
- **파일:** `relay/src/ws/order-handler.ts`, `relay/src/store/credentials.ts`, `relay/src/ws/fanout.ts`, `relay/src/store/symbols.ts`
- **커밋:** `84c23d7`

### 계획대로 하지 않은 것 (의도적)

- **로그 키를 `pgError` 로 뒀다.** 계획은 `safePgError(error)` 로 「교체」하라고만 했고 키 이름을 정하지 않았다. 최상위 전개는 GCP pino 의 `messageKey: "message"` 와 충돌하므로 중첩 키를 골랐다(근거는 Task 2 절).
- **`requirements.mark-complete` 미실행.** frontmatter 에 `requirements: [TRADE-03]` 이 있으나 돌리지 않았다. TRADE-03 의 Pending 근거는 프로덕션 `/healthz` 의 `everReadyCount` 실측(16-26)이고 이 plan 은 그것을 건드리지 않는다. 단위 검증만으로 Complete 로 올리지 않는다(16-28·16-36·16-37 과 같은 기준).
- **`order-handler.ts:411`·`:862` 를 교체하지 않았다.** 계획 ④ 가 `:846`(현 `:862`) 을 「판정 후 결정」으로 열어 뒀고, `:411` 은 계획에 없던 지점이다. 둘 다 호출 사슬을 따라 PostgREST 부재를 확인했고 근거를 코드 주석과 위 표에 남겼다.

## Threat Model Coverage

| Threat ID | Disposition | 실제 조치 |
|-----------|-------------|-----------|
| T-16-45 (Information Disclosure) | mitigate ✅ | 13곳이 `safePgError` 를 지난다. `details`·`hint` 는 어느 경로에서도 나가지 않는다. 회귀 잠금 ⓼-b~⓼-e 4케이스 |
| T-16-77 (재발 — 장래의 로그 지점) | mitigate ✅ | 규율을 `pg-error.ts` 의 **좁은 반환 타입**에 고정. 주석 제외 grep 게이트가 승인 기준에 있다 |
| T-16-78 (Repudiation — 조용한 실패) | mitigate ✅ | `code`(SQLSTATE)와 절단 `message` 를 남긴다. 「code 가 로그에 있다」를 4케이스가 모두 단언 |
| T-16-13 (실서버·실계좌 접속) | accept ✅ | 가짜 `SupabaseClient` 하네스만. 실 DB·실 게이트웨이 접속 0회 |

## Threat Flags

없음 — 새 네트워크 엔드포인트·인증 경로·스키마 변경 없음. 손댄 것은 기존 로그 페이로드의 폭뿐이고, 신뢰 경계를 **좁히는** 방향이다.

## Known Stubs

없음.

## 남은 것 (이 plan 이 닫지 않는 것)

- **`22P02` 계열의 `message` 잔여 위험.** 타입 캐스팅 실패는 값을 `message` 에 담을 수 있다. `dma_orders` 쓰기 경로에서는 나오지 않고 200자 절단이 폭을 묶는다 — 판단 근거를 `pg-error.ts` docstring 에 적었다.
- **`orderNo` 원문은 여전히 로그에 남는다.** `order-handler.ts` 의 통보 경로 로그들이 `orderNo: notice.orderNo` 를 그대로 싣는다(이 plan 이전부터). 16-28 이 「UNIQUE 위반 detail 은 주문번호 원문을 담는다」며 뺐던 것과 규율이 어긋나 보이지만, 그 필드는 이 plan 의 대상(오류 페이로드)이 아니고 통보 상관 추적의 핵심 키다. 판단이 필요하면 별도 항목으로 다뤄야 한다 — 여기서 조용히 바꾸지 않았다.
- **⚠️ 배포 미실시 — 프로덕션에는 R2-CR-03 이 여전히 살아 있다.** 프로덕션이 실 게이트웨이(`10.41.1.120:9100`)에 결선돼 실주문이 흐르는 상태이므로, 3라운드 종결 plan **16-46** 의 재배포 전까지 이 사실이 정본이다.
- **TRADE-03 은 계속 Pending.**

## Self-Check: PASSED

- `relay/src/store/pg-error.ts` FOUND (신규)
- `relay/src/store/orders.ts` FOUND (수정)
- `relay/src/ws/order-handler.ts` FOUND (수정)
- `relay/src/store/credentials.ts` FOUND (수정)
- `relay/src/store/symbols.ts` FOUND (수정)
- `relay/src/ws/fanout.ts` FOUND (수정)
- `relay/tests/order-store.test.ts` FOUND (수정)
- `.planning/phases/16-trading-limit-chaser-vi-my-page/16-38-SUMMARY.md` FOUND
- commit `dc19f09` FOUND
- commit `84c23d7` FOUND
- commit `110bbb7` FOUND
