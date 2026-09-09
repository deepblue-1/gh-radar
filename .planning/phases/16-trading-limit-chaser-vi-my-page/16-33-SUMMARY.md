---
phase: 16-trading-limit-chaser-vi-my-page
plan: 33
subsystem: relay
tags: [dma, order-notice, audit-log, unhandled-rejection, inflight, vitest]

requires:
  - phase: 16
    provides: "16-27 이 세운 `narrowPending` 하드 필터 + `await insertRequest` TOCTOU 가드 (같은 파일)"
  - phase: 16
    provides: "16-18 이 만든 `ensureRow` in-flight 가드(WR-01) — 이 plan 이 그 키 공간을 좁힌다"
provides:
  - "`recordUnmatched` manual 분기의 조회 경유 — `findIdByOrderNo` 로 좁혀 `orderRowId` 로만 갱신"
  - "붙을 행이 없는 수동 통보의 stdout 원문 기록 — 0행 update 를 보내지 않는다"
  - "`SubscriptionHub#onOrderNotice` 의 D-24 두 번째 감사 사본 1줄"
  - "`void recordUnmatched(...).catch` — 통보 1건의 파손이 프로세스를 내리지 않는다"
  - "`insertOnly` 추출 — `autoInsertRow` 를 try 안으로, 빈 주문번호를 in-flight 밖으로"
  - "회귀 테스트 3종 신규(㉖·㉗·㉘) + 기존 3종 확장(⑨·⑭·㉑)"
affects: [16-34 (같은 파일의 narrowPending·dupKey), relay 감사 기록 경로, dma_orders 수동 통보 정합]

tech-stack:
  added: []
  patterns:
    - "「행이 있는가」는 조회해야만 안다 — 확인 없는 `order_no` 셀렉터 갱신은 0행이어도 성공처럼 보인다"
    - "예외 격리는 두 겹 — 호출부 `.catch`(증상) + 원인 함수의 try 범위(원인). 한 겹만 두면 증상만 가려진다"
    - "「없는 값」(`\"\"`)을 키로 쓰지 않는다 — 서로 다른 사건이 하나로 합쳐진다"
    - "waitFor 의 조건은 **결과가 아니라 입력 수신**에 건다 — 결과에 걸면 회귀가 타임아웃으로 죽어 뒤 단언이 실행되지 않는다"

key-files:
  created: []
  modified:
    - relay/src/ws/order-handler.ts
    - relay/src/hub/subscription-hub.ts
    - relay/tests/ws-order.test.ts

key-decisions:
  - "행이 없으면 **갱신을 큐에 넣지 않는다** — 0행 update 는 아무것도 하지 않으면서 성공으로 보인다. 대신 통보 원문을 error 로 남기는 것이 이 경로의 유일한 기록이다"
  - "조회 성공 + 행 있음일 때 `order_no` 셀렉터가 아니라 `orderRowId` 를 쓴다 — 이미 id 를 알고 있고 A10 의 1순위가 그것이다"
  - "insert 갈래를 `insertOnly` 헬퍼로 뽑았다 — `autoInsertRow` 를 try 안에 넣는 것과 빈 주문번호가 in-flight 을 우회하는 것을 **한 지점**으로 만든다 (계획이 명시 허용한 형태)"
  - "㉗ 의 `waitFor` 조건을 「error 로그」가 아니라 「Hub 감사 사본 info 로그」에 걸었다 — 결과에 걸면 회귀 시 단언 대신 타임아웃으로 죽는다"
  - "기존 테스트 ⑨·⑭ 의 옛 단언(「기록은 남는다」·「조회도 insert 도 하지 않는다」)은 **사실이 아니었다** — 프로덕션에서 그 update 는 0행이었다. 문구와 단언을 진실로 교체했다"

patterns-established:
  - "회귀 잠금 실증 4회 (16-27·16-28 승계) — 새 분기를 무력화해 정확히 어느 케이스가 실패하는지 확인 후 복원"

requirements-completed: []

duration: 8min
completed: 2026-09-09
---

# Phase 16 Plan 33: 수동 통보 침묵 · 통보 경로 예외 격리 Summary

**「PostgREST 의 update 는 0행이어도 에러가 아니다」가 이 파일 머리말의 선언(Pitfall 18)과 반대로 작동하던 자리를 닫았다 — 수동 통보도 조회를 거치고, 붙을 행이 없으면 통보 원문이 stdout 에 남으며(GC-CR-02 + D-24), 통보 1건의 예외가 relay 프로세스를 내리지 않고(GC-WR-01), 빈 주문번호 거부들이 서로를 덮어쓰지 않는다(GC-WR-02).**

## Performance

- **Duration:** 약 8분
- **Started:** 2026-09-09T05:59:44Z
- **Completed:** 2026-09-09T06:07:41Z
- **Tasks:** 2/2
- **Files modified:** 3
- **신규 마이그레이션:** 0건

## Accomplishments

### Task 1 — 수동 통보 조회 경유 + stdout 감사 사본 (GC-CR-02 / T-16-66 · T-16-67) · commit `0ce0e2d`

**① `recordUnmatched` 의 manual 분기가 세 갈래로 갈렸다** (`relay/src/ws/order-handler.ts:422-464`).

- **조회** — `relay/src/ws/order-handler.ts:427` `existingId = await deps.orderStore.findIdByOrderNo(userId, notice.orderNo);`
- **행 있음** → `:444` `deps.orderStore.enqueueUpdate({ ...patch, orderRowId: existingId });`. 「행이 있음이 **확인된**」 경우에만 갱신을 보낸다는 규율을 주석에 못박았다. 확인했으므로 `order_no` 셀렉터가 아니라 A10 1순위인 `orderRowId` 를 쓴다.
- **행 없음** → `:452-462` `logger.error({ orderNo, noticeType, resultCode, isin, quantity, price }, "[WS-order] 대기·행 어디에도 붙지 않는 수동 통보 — stdout 이 유일한 기록이다")`. **갱신을 큐에 넣지 않는다** — 0행 update 는 아무것도 하지 않으면서 성공으로 보이고, 그 침묵이 없애겠다고 선언한 Pitfall 18 이다. 계좌번호는 애초에 51 통보에 실려 오지 않는다(T-16-45).
- **조회 실패(throw)** → `:428-437` 기존 `lookup-failed` 규율과 동형으로 `enqueueUpdate({ ...patch, userId })` 열화 갱신 + error 로그. 「조회가 죽었다고 통보를 버리지 않는다」(S-5).

`enqueueUpdate({ ...patch, userId })` 형태의 **무조건** 갱신은 파일에서 사라졌다. 남은 두 곳은 둘 다 조건부다 — `:436`(manual 조회 실패)과 `:479`(자동 분기 `lookup-failed`).

**② docstring 정정.** 「수동 주문은 이 분기를 타지 않는다」는 전제를 지우고, 실제로 여기로 오는 **두 경로**(좁히기 실패 / 연결 종료 후 도착)와 「그 시점의 수동 행에는 `order_no` 가 아직 없다」(insert 는 접수 전, `finish` 가 나중에 채운다)는 근거를 이어 적었다.

**③ D-24 두 번째 감사 사본** — `relay/src/hub/subscription-hub.ts:708-716`. `#fanout` 직후 `logger.info({ userId, orderNo, noticeType, resultCode, origin }, "[HUB] 주문 통보 수신(감사 사본)")`. 계좌번호·비밀번호·DMA user_id 는 싣지 않는다(D-19 승계). `dma_orders` 에 붙지 못한 통보라도 이 한 줄로 브로커 주문번호와 대조할 수 있다.

**④ 테스트** — 신규 1 + 확장 3.

- **㉖ (신규, `relay/tests/ws-order.test.ts:1006`)** 「연결 종료 후 도착한 수동 통보 — 후보 0건이어도 사라지지 않는다, 0행 갱신 대신 error 다 (GC-CR-02)」. 탭 2개를 열어 주문을 낸 쪽만 닫는다(DMA 세션은 남은 탭 덕에 살아 있어야 통보를 밀어 넣을 수 있다). 잠그는 것: 좁히기 warn **없음** · 조회 1회(`{userId, orderNo}`) · `orderRowId` 없는 갱신 **0건** · insert 0건 추가(③-2 의 행 1건뿐) · error 에 「붙지 않는 수동 통보」+주문번호 · 계좌번호 없음 · **Hub 감사 사본 info 로그 존재**(D-24 잠금).
- **㉑ 확장** — 지금까지 관찰하지 않던 뒷부분을 새로 단언한다. 옛 단언 `updates` 에 `{userId, orderNo}` 가 있다(= `order_no` 셀렉터 갱신)를 **뒤집어**, 조회 1회 + `orderRowId` 없는 갱신 0건 + error 원문으로 바꿨다.
- **⑨ 확장** — 「다만 기록은 남는다」는 주석은 **사실이 아니었다**(그 행은 `order_no` 가 비어 있어 0행이다). 조회 1회 + 0행 갱신 없음 + error 로그로 교체.
- **⑭ 개명·확장** — 「조회도 insert 도 하지 않는다」 → 「**조회를 거쳐 `orderRowId` 로 갱신한다** — insert 는 하지 않는다」. `mkOrderStore({ existingId: "row-manual" })` 로 `finish` 가 이미 주문번호를 채워 둔 행을 재현한다.

### Task 2 — 예외 격리 + 빈 주문번호 in-flight 제외 (GC-WR-01 · GC-WR-02 / T-16-68 · T-16-69) · commit `49db808`

**① GC-WR-01 을 두 겹으로 막았다.**

- **증상 쪽(호출부)** — `relay/src/ws/order-handler.ts:374` `void recordUnmatched(userId, notice).catch((err: unknown) => { logger.error({ err, orderNo: notice.orderNo }, "[WS-order] 통보 기록 경로 예외 — …"); });`. 주석에 근거를 적었다: `index.ts:220` 의 `unhandledRejection` 은 `logger.fatal` + **프로세스 종료**이므로 통보 1건의 파손이 그 순간 접속한 모든 사용자의 DMA 세션을 끊는다.
- **원인 쪽** — `autoInsertRow` 호출이 try **안**으로 들어갔다. `insertOnly` 의 `try` 시작이 **`relay/src/ws/order-handler.ts:547`**, `autoInsertRow` 호출이 **`:548`** 이다. 실패 시 기존 insert 실패 경로와 같은 등급의 `logger.error`(「감사 기록 결손 (stdout 이 두 번째 사본이다)」)를 남기고 `{ kind: "unavailable" }` 을 돌려준다.

**② GC-WR-02 — 빈 주문번호는 in-flight 을 태우지 않는다.** `ensureRow` 진입부 **`relay/src/ws/order-handler.ts:500`** `if (notice.orderNo === "") return insertOnly(userId, notice);` 이고, `inflight.set` 은 **`:524`** 다 — 이 갈래는 그 줄을 지나지 않는다. 주석에 근거 두 가지를 적었다: 합치면 서로 다른 거부가 한 행에 겹친다는 것, 그리고 `findIdByOrderNo` 가 이 값에서 **항상 `null`** 이라 이 키에는 dedup 의 의미가 애초에 없다는 것.

**③ 유지한 것.** `inflight` 의 `finally` 키 해제(`:525-531`)와 「`closeConn` 은 `inflight` 을 건드리지 않는다」(WR-01 주석)는 그대로다. `narrowPending`·`dupKey` 구조는 손대지 않았다(16-34 몫).

**④ 테스트 2케이스 신규.**

- **㉗ (`relay/tests/ws-order.test.ts:1048`)** 「행 생성 경로의 예외가 프로세스를 내리지 않는다 — error 로그로 끝난다 (GC-WR-01)」. `vi.spyOn(hub, "getLimitChasers")` 가 throw 하게 만들고 상따 통보를 주입한다. `process.on("unhandledRejection", …)` 로 직접 관측해 **0건**을 단언하고, error 에 「감사 기록 결손」이 있음 + insert 0 + update 0 을 단언한다.
- **㉘ (`relay/tests/ws-order.test.ts:1092`)** 「빈 주문번호 거부 2건은 서로 다른 행으로 기록된다 — in-flight 으로 합치지 않는다 (GC-WR-02)」. `insertGate` 로 첫 왕복을 붙잡은 채 두 번째 거부를 주입해 `started.insert === 2`(합쳐지지 않았다)를 관측하고, insert 2건 · **서로 다른 row id 2건** · 조회 0건 · 두 거부의 사유(`증거금 부족` / `주문가능금액 초과`)가 각자의 행에 남는 것을 단언한다.
- 빈 주문번호가 **아닌** 통보의 in-flight 병합(16-18 의 ⑱)은 그대로 통과한다 — 재사용했다.

## Verification Results

| 검증 | 결과 |
|------|------|
| `pnpm --filter @gh-radar/relay exec vitest run tests/ws-order.test.ts` | **35 passed** (16-27 시점 32 → +3) exit 0 |
| `pnpm --filter @gh-radar/relay test` | **17 files · 368 tests passed** (16-30 시점 365 → +3) exit 0 |
| `pnpm --filter @gh-radar/relay run typecheck` | exit 0 |
| `pnpm --filter @gh-radar/relay run typecheck:tests` | exit 0 |
| `grep -c "findIdByOrderNo" relay/src/ws/order-handler.ts` (manual 분기 `:427`) | **3** (계약 `:119` + manual `:427` + 자동 `:502`) ✅ |
| `grep -c "대기·행 어디에도 붙지 않는 수동 통보" relay/src/ws/order-handler.ts` | **1** (≥1) ✅ |
| manual 분기의 **무조건** `enqueueUpdate({ ...patch, userId })` | **0건** — 남은 2곳(`:436` · `:479`)은 둘 다 조회 실패 갈래 ✅ |
| `grep -c "감사 사본" relay/src/hub/subscription-hub.ts` | **2** (≥1) ✅ |
| `grep -c "logger.info\|logger.error" relay/src/hub/subscription-hub.ts` | **19 → 20** (증가) ✅ |
| `grep -c "붙지 않는\|0행" relay/tests/ws-order.test.ts` | **8** (≥1) ✅ |
| `grep -c "recordUnmatched(userId, notice).catch" relay/src/ws/order-handler.ts` | **1** (≥1) ✅ |
| `grep -c "통보 기록 경로 예외" relay/src/ws/order-handler.ts` | **1** (≥1) ✅ |
| `autoInsertRow` 가 try 안 | try `:547` < 호출 `:548` ✅ |
| 빈 주문번호 갈래가 `inflight.set` 을 지나지 않음 | 분기 `:500` < `inflight.set` `:524`, 그 사이에서 `return` ✅ |
| `git status --short supabase/migrations/` | **0건** — DB 를 바꾸지 않았다 ✅ |

**회귀 잠금 실증 4회 (16-27·16-28 승계).** 통과만 보고 넘어가면 그 테스트가 무엇을 지키는지 모른 채 초록불만 얻는다.

| 무력화한 것 | 실제 실패 |
|---|---|
| manual 분기를 옛 형태(무조건 `order_no` 셀렉터 갱신)로 되돌림 | **4건** — ⑨ · ⑭ · ㉑ · ㉖ |
| Hub 감사 사본을 `logger.info` → `logger.debug` | **1건** — ㉖ (D-24 잠금이 실재함) |
| `autoInsertRow` 를 try **밖**으로 (원인 쪽만) | **1건** — ㉗ `expected '…' to contain '감사 기록 결손'` |
| 위 + 호출부 `.catch` 제거 (증상 쪽까지) | **1건** — ㉗ `expected [ Error: 전략 캐시 파손 ] to have a length of +0 but got 1` (**실제로 unhandledRejection 이 발생**) |
| 빈 주문번호 갈래 차단(`if (false)`) | **1건** — ㉘ `조건이 서지 않았습니다: 두 번째 insert 진입` (두 거부가 한 Promise 로 합쳐졌다) |

두 겹 방어가 **각각 독립적으로** 잠겨 있음을 확인했다 — 원인 쪽만 되돌리면 로그 등급이 달라지고, 증상 쪽까지 되돌리면 프로세스를 내릴 rejection 이 실제로 관측된다. 확인 후 전부 복원했다(`grep -c MUTATION` = 0).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 기존 테스트 ⑨ 가 계획에 없었는데 함께 깨졌다 — 그 옛 단언이 거짓이었기 때문이다**

- **발견 시점:** Task 1 (첫 실행)
- **문제:** 계획은 「㉑ 이 깨지면 확장하라」만 예고했지만 실제로는 **⑨ · ⑭ · ㉑ 세 건**이 깨졌다. ⑨ 의 옛 주석은 「다만 기록은 남는다 — `order_no` 로 좁힌 갱신이다」였는데, 그 행은 접수 전에 만들어져 `order_no` 가 비어 있으므로 프로덕션에서 그 update 는 **0행**이었다. 즉 이 테스트는 **일어나지 않는 일을 참이라고 잠그고 있었다** — 옛 구현을 그대로 베낀 단언이라 결함과 함께 초록이었다.
- **조치:** ⑨ 를 조회 1회 + `orderRowId` 없는 갱신 0건 + 「붙지 않는 수동 통보」 error 로 교체했다. ⑭ 도 제목(「조회도 insert 도 하지 않는다」)이 거짓이 되어 「조회를 거쳐 `orderRowId` 로 갱신한다 — insert 는 하지 않는다」로 개명하고 `existingId: "row-manual"` 로 세웠다.
- **파일:** `relay/tests/ws-order.test.ts`
- **커밋:** `0ce0e2d`

### 계획과 다르게 한 것 (의도적)

**1. `autoInsertRow` 의 try 가 `ensureRow` 본문이 아니라 `insertOnly` 헬퍼 안에 있다.**
계획 Task 2 ①은 「`autoInsertRow` 호출을 `ensureRow` 의 try 안으로 옮긴다」고 적었고, ②는 「별도 헬퍼(`insertOnly` 같은 이름)로 뽑아도 좋다」고 명시 허용했다. 두 지시를 동시에 만족시키는 형태가 **insert 갈래 전체를 `insertOnly` 로 뽑고 그 안에서 try 로 감싸는 것**이다 — 그러면 「빈 주문번호 갈래」와 「조회 후 insert 갈래」가 **같은 한 지점**을 공유해 한쪽만 방어가 빠지는 상태가 구조적으로 불가능해진다. 두 갈래에 try 를 각각 쓰면 그것이 바로 다음 회귀의 자리다. 인용한 줄번호는 `insertOnly` 의 try(`:547`)와 그 안의 호출(`:548`)이다.

**2. ㉗ 의 `waitFor` 조건을 결과가 아니라 입력 수신에 걸었다.**
처음에는 「error 로그에 『감사 기록 결손』이 나타날 때까지」 기다리게 썼는데, 변이 주입으로 검증하는 과정에서 **회귀가 생기면 그 조건이 서지 않아 타임아웃으로 죽고 `unhandled` 단언이 아예 실행되지 않는다**는 것을 실측했다. 조건을 Hub 감사 사본 info 로그(회귀와 무관하게 항상 뜬다)로 바꿔, 회귀 시 「타임아웃」이 아니라 **무엇이 틀렸는지 말하는 단언 실패**가 나오게 했다.

**3. `requirements.mark-complete` 미실행.**
plan frontmatter 에 `requirements: [TRADE-03]` 이 있으나 **돌리지 않았다.** TRADE-03 의 Pending 근거는 프로덕션 `/healthz` 의 `everReadyCount: 0`(16-26 실측)이고 이 plan 은 그것을 건드리지 않는다. 16-27·16-28·16-30 과 같은 기준이다.

### 검증 기준 중 충족하지 못한 1건 (스코프 밖 — 3라운드 연속 동일)

`<verification>` 의 `grep -rn "10\.41\.1\.120" relay/` **0건** 기준은 실측 **2건**으로 충족하지 못했다. 둘 다 이번 plan 이 손대지 않은 선행 커밋의 **산문**이다:

- `relay/README.md:17` — 「기본 `DMA_HOST` 는 `127.0.0.1`(로컬 mock)이다. 실서버 `10.41.1.120` 과 실계좌 접속은 …」 = **경고문**
- `relay/src/dma/link-health.ts:20` — 터널 판정 조건을 설명하는 주석

둘 다 접속에 쓰이는 리터럴이 아니라 **「실서버에 붙지 말라」는 경고 자체**다. 지우면 D-27 의 안전장치가 사라지므로 제거하지 않았다. D-27 의 실질(실서버·실계좌로 **접속하는 코드** 0건, FakeGateway·스텁만 사용)은 지켜졌다 — 이번 plan 의 신규 3케이스도 전부 FakeGateway 다. 기준 문구를 「접속 리터럴 0건」으로 좁히는 것은 문서 plan 의 몫이다(16-29·16-30·16-32 가 같은 사실을 남겼다).

## Threat Model Coverage

| Threat ID | Disposition | 실제 조치 |
|-----------|-------------|-----------|
| T-16-66 (Repudiation / 무로그 기록 소실) | mitigate ✅ | manual 분기 조회 경유 `:427`, 행 없음이면 원문 error `:452-462` 후 **갱신 미전송**. 0행·연결 종료 두 경로를 ㉑·㉖ 로 잠금 |
| T-16-67 (Repudiation / 감사 사본 부재) | mitigate ✅ | `subscription-hub.ts:708-716` stdout 1줄. 자격증명·계좌번호 미포함. ㉖ 이 로그 등급까지 잠금(변이로 실증) |
| T-16-68 (DoS / 전 사용자 세션 절단) | mitigate ✅ | 호출부 `.catch` `:374` + `autoInsertRow` 를 try 안(`:547`/`:548`). 두 겹이 **각각** 잠긴 것을 변이 2종으로 실증 |
| T-16-69 (Tampering / 기록 덮어쓰기) | mitigate ✅ | `ensureRow:500` 이 빈 주문번호를 in-flight(`:524`) 밖으로 뺀다. ㉘ 이 「서로 다른 행 2건」으로 잠금 |
| T-16-45 (Information Disclosure) | mitigate ✅ | 새 error 는 통보 원문 필드만(계좌번호는 51 통보에 필드 자체가 없다). 새 info 는 `userId`·주문번호·통보종류·결과코드·origin 뿐. ㉖·㉘ 이 `SAMPLE_ACCOUNT_NO` 부재를 단언 |
| T-16-13 (실서버 접속) | accept ✅ | FakeGateway·스텁만. 실계좌·실서버 접속 0건 (D-27) |

## Threat Flags

없음 — 새 네트워크 엔드포인트·인증 경로·스키마 변경 없음. 손댄 표면은 기존 통보 기록 경로와 그 앞의 로그 한 줄뿐이다.

## Known Stubs

없음.

## 남은 것 (이 plan 이 닫지 않는 것)

- **자동주문 통보의 「행 없음」은 여전히 insert 로 간다** — 그것이 T-16-07 의 설계다. 이 plan 이 바꾼 것은 **수동** 분기뿐이다.
- **`insertOnly` 는 빈 주문번호에서 중복 insert 를 막지 않는다** — 막을 수 없다. 상관 키가 없으므로 「같은 거부의 재전송」과 「다른 거부」를 가를 근거가 와이어에 없다. 합치는 쪽이 기록 소실이므로 나누는 쪽을 택했다(GC-WR-02 의 결론 그대로).
- **`narrowPending`·`dupKey` 는 손대지 않았다** — 16-34 몫이다.
- **TRADE-03 은 계속 Pending.** 프로덕션 `everReadyCount: 0` 판정(16-26)이 그대로다.
- **배포 미실시.** relay 재배포는 갭 클로징 2라운드 종결 plan(16-35)에서 일괄 처리한다.

## Self-Check: PASSED

- `relay/src/ws/order-handler.ts` FOUND (수정)
- `relay/src/hub/subscription-hub.ts` FOUND (수정)
- `relay/tests/ws-order.test.ts` FOUND (수정)
- `.planning/phases/16-trading-limit-chaser-vi-my-page/16-33-SUMMARY.md` FOUND
- commit `0ce0e2d` FOUND
- commit `49db808` FOUND
