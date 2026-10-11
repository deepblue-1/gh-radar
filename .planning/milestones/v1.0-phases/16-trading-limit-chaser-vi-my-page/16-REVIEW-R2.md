---
phase: 16-trading-limit-chaser-vi-my-page
reviewed: 2026-09-09T07:40:07Z
depth: standard
files_reviewed: 23
files_reviewed_list:
  - relay/src/dma/session-manager.ts
  - relay/src/hub/subscription-hub.ts
  - relay/src/order/order-api.ts
  - relay/src/store/orders.ts
  - relay/src/ws/fanout.ts
  - relay/src/ws/order-handler.ts
  - relay/tests/fanout.test.ts
  - relay/tests/order-api.test.ts
  - relay/tests/order-store.test.ts
  - relay/tests/session-manager.test.ts
  - relay/tests/ws-order.test.ts
  - scripts/smoke-relay.sh
  - webapp/src/components/trading/limit-chaser-client.tsx
  - webapp/src/components/trading/limit-chaser-form.tsx
  - webapp/src/components/trading/me-client.tsx
  - webapp/src/components/trading/vi-order-list.tsx
  - webapp/src/components/trading/vi-settings-card.tsx
  - webapp/src/components/trading/__tests__/limit-chaser-client.test.tsx
  - webapp/src/components/trading/__tests__/limit-chaser-form.test.tsx
  - webapp/src/components/trading/__tests__/me-client.test.tsx
  - webapp/src/components/trading/__tests__/vi-order-list.test.tsx
  - webapp/src/components/trading/__tests__/vi-settings-card.test.tsx
findings:
  critical: 3
  warning: 7
  info: 5
  total: 15
status: issues_found
---

# Phase 16 갭 클로징 2라운드 — 코드 리뷰 보고 (R2)

**리뷰 시각:** 2026-09-09T07:40:07Z
**깊이:** standard
**대상 파일:** 23개 (diff base `f82bb49`)
**상태:** issues_found

## 요약

이번 라운드(16-27~16-35)가 실제로 바꾼 표면 — 하드 필터 · TOCTOU 가드 · 23505 수렴 · stalled 판정 ·
send 반환값 분기 · 매매구분 매칭 축 · 취소 dup 키 · 수동 통보 조회 경유 — 를 원문 대조로 훑었다.
1·2라운드에서 이미 닫힌 GC- 항목은 재발견 대상에서 제외했고, **이번 수정이 새로 만든 결함**만 `R2-` 로 적는다.

전반적으로 수정 자체의 방향은 맞다. 다만 **가드를 완화하는 쪽의 수정 3건이 완화 조건을 클라이언트 입력에
맡기거나(GC-WR-04), 판정 축을 사용자 원인까지 삼키도록 넓혔다(GC-WR-07).** 그리고 감사 기록 쪽에서는
「이유를 아는 실패」를 예외 처리하면서 그 옆 줄의 **동일한 정보 유출 경로를 그대로 두었다**(GC-WR-08).
아래 Critical 3건이 그 셋이다.

또한 이번 라운드가 손댄 파일 안에서 **이전 라운드가 짚지 않은 리스너 누수 1건**(`fanout.ts#register`)을
찾았다. 새 결함은 아니지만 리뷰 대상 표면 안이고 어떤 GC- 항목에도 잡혀 있지 않아 함께 보고한다.

`.planning/phases/16-trading-limit-chaser-vi-my-page/16-REVIEW.md`(정본)는 수정하지 않았다.

## Structural Findings (fallow)

구조 사전 스캔(`<structural_findings>`)이 제공되지 않았다. 다만 리뷰 중 확인한 **호출자 없는 export**
1건은 `R2-IN-02` 로 아래 Info 에 적는다.

## Narrative Findings (AI reviewer)

## Critical Issues

### R2-CR-01: `lc.set` 철거 판정이 **클라이언트가 보낸 `crud:"D"`** 를 그대로 믿어, 시장 해석 가드(T-16-42)와 무장 가드(T-16-43)를 둘 다 우회시킨다

**File:** `relay/src/ws/fanout.ts:793-798` (`#isTeardown`), `relay/src/ws/fanout.ts:605-611`, `relay/src/ws/fanout.ts:903`

**Issue:**
GC-WR-04 는 「전략을 내리는 요청은 시장 해석 실패로 막지 않는다」를 구현하면서 판정 함수를 이렇게 썼다.

```ts
#isTeardown(cfg: RelayLimitChaserInput): boolean {
  if (cfg.crud === "D") return true;                       // ← ① 클라이언트 입력을 그대로 믿는다
  return (!cfg.buyEnabled && !cfg.sellEnabled && !cfg.cancelQtyEnabled && !cfg.cancelTradeEnabled);
}
```

그런데 `crud` 는 **인바운드 필드**다. `relay/src/ws/protocol.ts:109` 가 `crud: z.enum(["C","D"])` 로
받아들이고, `RelayLimitChaserInput`(`packages/shared/src/relay.ts:235-243`)은 `crud` 를 `Omit` 하지 않는다.
즉 브라우저(또는 직접 wss 를 여는 임의의 클라이언트)가 값을 정한다.

그리고 **삭제의 정본은 `crud` 가 아니라 게이트다.** 계약 원문이 그렇게 못박고 있다
(`packages/shared/src/relay.ts:136-141`): *「매수·매도·취소 게이트가 전부 꺼지면 **서버가** `"D"` 로
정규화한다」*. 브라우저의 `crudOf()`(`webapp/src/lib/limit-chaser.ts:182`)도 `isDeleteIntent(gates)` 의
파생일 뿐이다.

따라서 다음 프레임 하나가 이 파일이 스스로 「마지막 관문」이라고 선언한 두 게이트를 **동시에** 지나간다.

```json
{"t":"lc.set","cfg":{"crud":"D","buyEnabled":true,"buyOrderPrice":0,"buyOrderQty":0,
                     "isin":"<마스터에 없는 ISIN>","accountNo":"<허용 계좌>", ...}}
```

- `#isTeardown` → `true` → `#strategyMarket`(못 풀면 **거부**, T-16-42)이 아니라 `#teardownMarket`
  (못 풀면 **폴백 `"K"`**)이 돈다. 코스닥 전략이 코스피 시장값으로 나간다.
- `#strategyArmable` 첫 줄(`fanout.ts:903`)이 `if (this.#isTeardown(cfg)) return true;` 라
  **무장 가드(T-16-43)도 통째로 건너뛴다.** 발주가·수량 0 인 게이트가 켜진 채 게이트웨이로 나간다.

게이트웨이가 게이트를 보고 CRUD 를 정규화한다면(계약이 그렇다고 적혀 있다) 이 요청은 **삭제가 아니라
등록**으로 처리되고, 그 결과가 「시장이 틀린 채 무장된 반복 발주 설정」이다. 전략은 1회 주문이 아니라
반복 발주라 오차가 계속 재생산된다 — 이 파일이 T-16-42 로 금지한 바로 그 상태다.

기존 테스트가 이 구멍을 덮지 못한다: `relay/tests/fanout.test.ts` 의 ⑰-e/⑰-e2 는 `crud:"D"` 를
**게이트 전부 꺼진** cfg 로만 보내고, ⑰-f 는 `crud:"C"` 로만 엄격성을 확인한다. `crud:"D"` + 게이트 ON
조합은 어디에도 없다.

**Fix:** 철거 판정을 `isDeleteIntent()` 와 **정확히 같은 네 항**으로 좁힌다. 클라이언트의 `crud` 는
신호로만 쓰고 단독 근거로 쓰지 않는다.

```ts
#isTeardown(cfg: RelayLimitChaserInput): boolean {
  // 삭제의 정본은 게이트다 (계약: 서버가 게이트로 crud 를 정규화한다).
  // 인바운드 `crud:"D"` 는 게이트와 **일치할 때만** 의미가 있다 — 단독으로는 근거가 아니다.
  const allGatesOff =
    !cfg.buyEnabled && !cfg.sellEnabled && !cfg.cancelQtyEnabled && !cfg.cancelTradeEnabled;
  if (cfg.crud === "D" && !allGatesOff) {
    logger.error(
      { userId, isin: cfg.isin },
      "[WS] crud:\"D\" 인데 게이트가 켜져 있다 — 철거로 보지 않는다 (등록 경로 가드 적용)",
    );
  }
  return allGatesOff;
}
```

회귀 잠금 테스트도 함께 넣을 것: 「`crud:"D"` + `buyEnabled:true` + 미해석 ISIN → **거부**」와
「`crud:"D"` + `buyEnabled:true` + `buyOrderQty:0` → **거부**」 두 건.

---

### R2-CR-02: 자격증명이 거부된 **한 사용자**의 세션이 `stalledCount` 에 잡혀 relay 전체를 영구 `degraded`(HTTP 503)로 만든다

**File:** `relay/src/dma/session-manager.ts:268`, `relay/src/order/order-api.ts:249-250`

**Issue:**
16-30 이 붙인 `stalledCount` 는 「생성 후 `STALE_SESSION_MS`(5분)가 지나도록 한 번도 Ready 가 아닌 세션」을
전부 센다. 세션이 왜 Ready 가 아닌지는 보지 않는다.

```ts
if (entry.session.hasBeenReady) everReadyCount += 1;
else if (now - entry.createdAt > STALE_SESSION_MS) stalledCount += 1;   // 사유 불문
```

그런데 이 매니저에는 **게이트웨이 장애가 아닌** 영구 미Ready 상태가 이미 존재한다.
`NO_RETRY_STATES`(`session-manager.ts:125`)의 `session_rejected` — DMA 로그인 거부 — 가 그것이다.
`session.ts:522-534` 가 「재시도해도 결과가 같은 실패」로 확정하는 터미널 상태이고,
`acquire` 는 그 세션을 **다시 세우지 않고 그대로 재사용**한다(`session-manager.ts:176-186`, T-15-10/D-16).
탭이 열려 있는 한 `refCount > 0` 이라 유예 타이머도 걸리지 않아 세션이 **무기한** 남는다.

결과: 사용자 한 명이 DMA 비밀번호를 잘못 등록해 두고 탭을 열어 두면
→ 5분 뒤 `stalledCount === 1`
→ `sessionsOk = (everReadyCount === 0 && stalledCount === 0) || readyCount > 0` 가 `false`
→ `/healthz` 가 **503 `degraded`** 를 무기한 반환.

게이트웨이도 VPN 도 멀쩡한데 서비스 전체가 적색이 된다. 16-30 이 스스로 적어 둔 근거
(`order-api.ts:211-212` — *「상시 적색은 곧 알림 무시다. 그러면 진짜 장애도 함께 놓친다」*)를
정확히 되돌리는 경로이고, uptime check 를 재시작 트리거로 쓰는 순간 실제 장애로 승격된다.

`relay/tests/session-manager.test.ts` ⑩/⑪ 은 「응답하지 않는 게이트웨이」와 「Ready 였던 세션」만 다루고
`session_rejected` 케이스가 없어 이 상태가 잠기지 않았다.

**Fix:** `stalledCount` 를 **게이트웨이가 원인일 수 있는 상태로만** 좁힌다. 사용자 자격증명 문제는
`/healthz` 의 판정축이 아니다.

```ts
// session-manager.ts
/** 사용자 원인(자격증명)의 미Ready 는 게이트웨이 장애 신호가 아니다 — stalled 로 세지 않는다. */
const USER_FAULT_STATES: ReadonlySet<string> = NO_RETRY_STATES;

// stats() 안
if (entry.session.hasBeenReady) everReadyCount += 1;
else if (
  !USER_FAULT_STATES.has(entry.session.state) &&
  now - entry.createdAt > STALE_SESSION_MS
) {
  stalledCount += 1;
}
```

테스트 추가: 「`session_rejected` 세션이 `STALE_SESSION_MS` 를 한참 넘겨도 `stalledCount === 0`」.

---

### R2-CR-03: `dma_orders` 오류 로깅이 PostgREST `error` 원문을 그대로 싣는다 — CHECK/FK 위반의 `details` 에 **계좌번호·주문번호가 통째로** 들어간다

**File:** `relay/src/store/orders.ts:294`, `relay/src/store/orders.ts:361`, `relay/src/store/orders.ts:395`

**Issue:**
16-28 은 `23505` 분기에서 **의도적으로** `error` 원문을 로그에서 뺐고, 그 이유까지 적어 두었다
(`orders.ts:285-287`): *「Postgres 의 UNIQUE 위반 detail 은 `Key (user_id, order_no, …)=(…)` 로
주문번호 원문을 그대로 담는다 (T-16-45)」*.

그런데 **바로 다음 줄부터의 일반 경로는 그 규율을 적용하지 않는다.**

```ts
logger.error({ error, column: sel.column }, "[orders] dma_orders update 실패");   // :294
logger.error({ error, origin: row.origin }, "[orders] dma_orders insert 실패");   // :361
logger.error({ error }, "[orders] dma_orders order_no 조회 실패");                // :395
```

PostgreSQL 은 CHECK 위반(`23514`)·NOT NULL 위반(`23502`)·FK 위반(`23503`)의 `DETAIL` 에
**`Failing row contains (<모든 컬럼 값>)`** 를 넣고, PostgREST 는 그것을 `error.details` 로 그대로
전달한다. `dma_orders` 의 컬럼에는 `account_no` · `order_no` · `user_id` 가 전부 있다.

즉 `qty <= 0` 같은 CHECK 위반이 한 번만 나도 **계좌번호 원문이 stdout(= Cloud Logging)에 남는다.**
이 파일과 `order-handler.ts` 는 계좌번호를 `maskAccountNo` 없이 로그에 싣지 않는다는 규율(T-16-09/
T-16-45/D-19)을 도처에서 지키고 있는데, 유일하게 이 세 줄이 그 규율 밖이다. `23505` 만 특수 처리한 것은
문제를 코드 하나로 좁힌 것이지 해결한 것이 아니다.

`relay/tests/order-store.test.ts` ⓼ 가 `23514` 를 흘려보내는 경로를 이미 테스트하고 있어
(그 테스트는 로깅 내용을 단언하지 않는다) 실제로 도달 가능한 경로임이 확인된다.

**Fix:** 에러 객체를 통째로 싣지 말고 **안전한 필드만 뽑아** 로그한다. 세 곳 모두 같은 헬퍼를 쓴다.

```ts
/** PostgREST 오류에서 식별자를 담지 않는 필드만 뽑는다 (T-16-45). `details`/`hint` 는 실지 않는다. */
function safeErr(error: unknown): { code?: string; message?: string } {
  const e = error as { code?: string; message?: string } | null;
  return { code: e?.code, message: e?.message?.slice(0, 200) };
}

logger.error({ error: safeErr(error), column: sel.column }, "[orders] dma_orders update 실패");
logger.error({ error: safeErr(error), origin: row.origin }, "[orders] dma_orders insert 실패");
logger.error({ error: safeErr(error) }, "[orders] dma_orders order_no 조회 실패");
```

(`message` 도 제약명까지만 담기므로 200자 절단으로 충분하다. 값이 들어가는 곳은 `details` 다.)

---

## Warnings

### R2-WR-01: `23505` 갱신 예외 처리가 **패치 전체를 버린다** — 주문번호뿐 아니라 상태·체결수량까지 함께 사라지고, 그 실패가 `flushed` 로 집계된다

**File:** `relay/src/store/orders.ts:284-291`, `relay/src/store/orders.ts:618`

**Issue:**
`finish`(`order-handler.ts:869-878`)가 내는 갱신은 `{orderRowId, orderNo, status, resultCode,
noticeType, message, filledQty, origin}` 한 덩어리다. 이 갱신이 `23505` 로 거부되면 지금 코드는
사유를 로그하고 **`return`** 한다 — 충돌한 컬럼(`order_no`)만이 아니라 **수명주기 필드 전부**가
반영되지 않는다.

결과: 수동 주문의 행이 `status:'requested'` · `filled_qty:0` 인 채 영구히 남는다. 「감사 기록 분기」는
주석이 인정한 대가지만, **자기 행의 상태가 갱신되지 않는 것**은 주석 어디에도 없는 추가 손실이다.

게다가 `#drain`(`orders.ts:616-618`)은 sink 가 throw 하지 않았으므로 `this.#flushed += 1` 을 올린다 —
「반영된 누적 건수」가 반영되지 않은 갱신을 세게 된다. 이 모듈이 S-5 로 지키는 카운터 규율의 반대다.
`relay/tests/order-store.test.ts` ⓽ 는 `dropped`/`retried`/`queued` 만 단언하고 `flushed` 와
「행 상태가 갱신됐는가」를 보지 않아, 이 손실을 「진실」로 잠근 상태다.

**Fix:** `order_no` 만 빼고 **한 번 더 시도**한다. 그 컬럼은 이미 다른 행이 갖고 있으므로 포기해도 되지만,
나머지는 포기할 이유가 없다.

```ts
if (patch.order_no !== undefined && (error as { code?: string }).code === "23505") {
  logger.error({ column: sel.column, code: "23505" }, "[orders] order_no 갱신이 UNIQUE 위반 — 주문번호를 빼고 재시도한다");
  const { order_no: _dropped, ...rest } = patch;
  if (Object.keys(rest).length <= 1) return; // `updated_at` 뿐이면 보낼 것이 없다
  const retry = sel.column === "id"
    ? await supabase.from("dma_orders").update(rest).eq("id", sel.value)
    : /* order_no 셀렉터의 3축 그대로 */ ...;
  if (retry.error) { logger.error({ error: safeErr(retry.error) }, "[orders] 23505 후 재시도도 실패"); throw retry.error; }
  return;
}
```

테스트 ⓽ 에 `expect(store.stats().flushed)` 와 「`status` 가 실제로 반영됐다」 단언을 추가할 것.

---

### R2-WR-02: 「수정」의 무장 가드에 **철거 면제가 없다** — relay 는 허용하는 삭제 요청을 UI 가 막는다 (T-16-44 위반)

**File:** `webapp/src/components/trading/limit-chaser-form.tsx:495-500`

**Issue:**
GC-WR-09 가 넣은 가드는 이렇다.

```ts
const blocked = GATE_KEYS.find((key) => values[key] && gateBlocked(key, true));
if (blocked !== undefined) { setSubmitError(armBlockedTextOf(blocked, values)); return; }
```

`GATE_KEYS = ['buyEnabled','sweepEnabled','sellEnabled']` 이고, **`sweepEnabled` 는 삭제 판정
4종(`isDeleteIntent`: buy/sell/cancelQty/cancelTrade)에 들어가지 않는다.**

그래서 다음 상태가 막힌다.

- `buyEnabled:false, sellEnabled:false, cancelQtyEnabled:false, cancelTradeEnabled:false`
  → `crudOf()` = `"D"` (삭제 의도)
- 그런데 `sweepEnabled:true` 이고 시세가 끊겨 `buyOrderPrice === 0`
  → `canArmSweep === false` → `gateBlocked('sweepEnabled', true) === true` → **「수정」 차단**

relay 는 이 요청을 받아 준다 — `#strategyArmable` 첫 줄이 `#isTeardown(cfg)` 로 면제하기 때문이다
(`fanout.ts:903`). 즉 **마지막 관문이 첫 관문보다 관대**하고, 방향이 GC-WR-05 가 선언한 것과 반대다.
그리고 이 파일 스스로 적어 둔 규율(*「끄는 방향은 여기서도 막지 않는다 — T-16-44」*)이 이 경우에
성립하지 않는다: 사용자는 전략을 내리려는데 화면이 막는다.

**Fix:** relay 의 `#isTeardown` 과 **같은 판정**을 붙여 면제한다. 이미 `isDeleteIntent` 가 있다.

```ts
import { crudOf, isDeleteIntent } from '@/lib/limit-chaser';

// 철거(삭제) 의도의 「수정」은 무장 조건과 무관하다 — relay `#strategyArmable` 과 동형이다.
const blocked = isDeleteIntent(values)
  ? undefined
  : GATE_KEYS.find((key) => values[key] && gateBlocked(key, true));
```

---

### R2-WR-03: `narrowPending` 의 하드 필터가 `orgOrderNo` **문자열 완전일치**를 정산 전제조건으로 만들었다 — 표기 차이 한 글자가 「실제로 체결된 주문 → `status:'timeout'`」이 된다

**File:** `relay/src/ws/order-handler.ts:1015-1026`

**Issue:**
GC-CR-01 이 ①·② 축을 `refine`(0건이면 축을 건너뜀)에서 **하드 필터**(0건이면 `null`)로 승격했다.

```ts
const hard = candidates.filter(
  (p) => (n.orgOrderNo === "" || (p.isCancel && p.orgOrderNo === n.orgOrderNo)) && (!isCancelNotice || p.isCancel),
);
if (hard.length === 0) return null;
```

의도(취소확인이 살아 있는 신규 주문을 정산하지 않게)는 옳다. 그러나 부수효과가 하나 생겼다:
**게이트웨이가 실어 보낸 `orgOrderNo` 가 요청에 담은 값과 한 글자라도 다르면 그 취소는 영영 정산되지
않는다.** 양쪽 어디에도 정규화가 없다 —
요청 쪽은 `msg.orgOrderNo` 원문(`order-handler.ts:754`), 통보 쪽은 `r.orgOrderNo() ?? ""` 원문
(`envelope.ts:1277`)이다. 브로커 주문번호는 자릿수 표기(선행 0 / 좌측 패딩 / 공백)가 단말마다
갈리는 값이고, 이 코드는 그 가능성에 대해 아무 방어가 없다.

이전 구현은 그런 경우 ① 축이 0건이 되어 **건너뛰고** ③④(수량·가격)로 여전히 정산할 수 있었다.
지금은 그 경로가 없다. 실패 결과가 나쁜 쪽이다: 5초 뒤 `finish(null)` 이 돌아
`enqueueUpdate({orderRowId, status:"timeout"})` — **실제로 접수·확인된 취소가 감사 기록에
`timeout` 으로 남고**, 화면에는 「결과를 확인하지 못했습니다」가 뜬다.

같은 논리가 취소성 `noticeType` 축에도 적용된다: 게이트웨이가 취소 접수를 `"A"` 로 보내면서
`orgOrderNo` 를 비워 보내는 구현이면, 하드 필터 2항이 아니라 **② refine** 이 신규 대기 쪽으로
좁혀 오귀속이 난다(② 는 `"A"` 를 「신규 통보」로 단정한다). 이 가정은 코드 어디에도 근거가 없다.

**Fix:**
1. 비교 전에 양쪽을 같은 규칙으로 정규화한다. 조립 지점을 하나로 둔다.
   ```ts
   /** 브로커 주문번호 비교 정규화 — 공백 제거 + 선행 0 제거. 조립 지점은 여기 하나다. */
   function normOrderNo(v: string): string { return v.trim().replace(/^0+/, ""); }
   ...
   (n.orgOrderNo === "" || (p.isCancel && normOrderNo(p.orgOrderNo) === normOrderNo(n.orgOrderNo)))
   ```
2. 하드 필터가 후보를 **전부** 지웠을 때는 지금의 일반 warn 과 구분되는 로그를 남긴다
   (`candidates.length > 0 && hard.length === 0` → 「강한 축이 후보를 전부 지웠다」).
   지금은 `narrowPending` 밖의 한 줄(`order-handler.ts:390`)로 뭉뚱그려져 원인 축을 알 수 없다.
3. 「취소 접수 통보의 `noticeType`·`orgOrderNo` 실제 값」을 게이트웨이 fbs/구현으로 확인해 ② 의
   `"A"` 단정 근거를 주석에 박거나, 근거가 없으면 ② 에서 `"A"` 를 제외한다.

---

### R2-WR-04: `OrderStore` 의 「중복 진입 방지」 불변식이 `flushNow` 와 `#tick` 사이에서 깨진다

**File:** `relay/src/store/orders.ts:589-596`, `relay/src/store/orders.ts:556-558`

**Issue:**
16-24 가 `#flushing: boolean` 을 `#current: Promise|null` 로 바꾸면서 그 목적을 *「tick 이 겹치면 같은
항목을 두 번 쓴다」* 로 적어 두었다. 그런데 `flushNow` 의 구현은 그 불변식을 지키지 못한다.

```ts
while (this.#current !== null) await this.#current;      // ← ①
for (let round = 0; round < ORDER_FLUSH_MAX_ROUNDS; round += 1) {
  if (this.#queue.length === 0) return;
  this.#current = this.#runDrain();                      // ← ② 확인 없이 덮어쓴다
  await this.#current;
}
```

① 의 `await` 가 풀린 뒤 ② 까지는 마이크로태스크 경계가 있고, 그 사이에 200ms 인터벌 `#tick`
(아직 `close()` 전이라 살아 있다)이 `this.#current = this.#runDrain()` 을 실행할 수 있다.
그러면 ② 가 그 핸들을 **덮어쓴다.** 이후:

- tick 의 drain 이 먼저 끝나면 그 `finally` 가 `#current = null` 을 하는데 **flushNow 의 drain 은
  아직 돌고 있다** → 다음 tick 이 `#current === null` 을 보고 세 번째 drain 을 시작한다.
- 즉 「도는 배치는 언제나 1개」가 성립하지 않는다.

지금은 `#drain` 이 진입 즉시 큐를 스왑하므로 같은 항목이 두 번 쓰이지는 않는다. 하지만 **그 스왑이
유일한 방어선**이 되었고, 그 사실이 코드 어디에도 적혀 있지 않다. 재시도 항목이 배치 밖으로 재큐잉되는
경로(`orders.ts:632`)와 겹치면 장애 중인 Supabase 를 의도보다 여러 겹으로 두드리게 된다.

**Fix:** 라운드마다 진행 중 배치를 다시 확인하고, 덮어쓰지 않는다.

```ts
for (let round = 0; round < ORDER_FLUSH_MAX_ROUNDS; round += 1) {
  while (this.#current !== null) await this.#current;   // 매 라운드 재확인 — 남의 배치를 덮지 않는다
  if (this.#queue.length === 0) return;
  this.#current = this.#runDrain();
  await this.#current;
}
```

(더 확실하게는 `close()` 를 `flushNow()` **앞**에서 부르도록 종료 절차 순서를 바꾸는 것이지만,
그러면 「종료 중 유입」 라운드의 근거가 흔들리므로 위 한 줄이 최소 수정이다.)

---

### R2-WR-05: `WsFanout#register` 가 세션 `"state"` 리스너를 **새로고침마다 하나씩 쌓는다** — 파일 주석이 선언한 「사용자당 1개」가 성립하지 않는다

**File:** `relay/src/ws/fanout.ts:1044-1059`, `relay/src/ws/fanout.ts:1022`

**Issue:**
`#register` 는 「같은 `UserEntry` 에 같은 세션이면 재사용, 아니면 새 entry + 새 리스너」 구조다.
그런데 `#onClose` 는 그 사용자의 마지막 소켓이 닫히면 `this.#users.delete(userId)` 를 한다
(`fanout.ts:1022`). **`DmaSession` 은 5분 유예 동안 살아 있다**(D-15).

그래서 탭 1개짜리 사용자가 새로고침하면:

1. close → `#users.delete(userId)` (세션 S 는 유예로 생존, 리스너 L1 은 S 에 그대로 붙어 있다)
2. 재접속 → `acquire` 가 **같은 S** 를 돌려줌 → `#register` 의 `existing === undefined`
   → 새 entry + **L2 를 S 에 추가**
3. `L1` 은 침묵하지 않는다 — 가드가 `current.session !== session` 인데 `current.session === S` 다

결과: 새로고침 k 번이면 상태 프레임이 브라우저로 **k 번** 나가고, `DmaSession`(EventEmitter,
`setMaxListeners` 미설정)에 리스너가 계속 쌓여 11회째부터 `MaxListenersExceededWarning` 이 뜬다.
`removeListener` 는 이 파일 어디에도 없다(`#onUpgrade` 하나뿐).

`SubscriptionHub.attach` 는 `prev === session` 조기 반환으로 같은 함정을 피했는데
(`subscription-hub.ts:295`) 여기만 빠졌다. 이번 라운드가 만든 결함은 아니지만 리뷰 대상 파일 안이고
어떤 GC- 항목에도 잡혀 있지 않다.

**Fix:** 리스너 핸들을 `UserEntry` 에 보관하고 entry 를 버릴 때 `off` 한다.

```ts
type UserEntry = { session: DmaSession; conns: Set<Conn>; onState: (f: RelayStateMsg) => void };

#register(conn, userId, session) {
  const existing = this.#users.get(userId);
  if (existing !== undefined && existing.session === session) { existing.conns.add(conn); return; }
  if (existing !== undefined) existing.session.off("state", existing.onState);   // ★ 반드시 뗀다
  const onState = (frame: RelayStateMsg): void => { ... };
  const entry: UserEntry = { session, conns: new Set([conn]), onState };
  ...
  session.on("state", onState);
}

// #onClose 안
if (entry.conns.size === 0) { entry.session.off("state", entry.onState); this.#users.delete(userId); }
```

---

### R2-WR-06: `sideOf()` 는 여전히 모르는 매매구분을 `"B"` 로 지어낸다 — 같은 파일이 방금 import 한 `fromWireSide` 의 규율과 반대다

**File:** `relay/src/ws/order-handler.ts:664-667`

**Issue:**
GC-WR-03 은 매칭 축에 `fromWireSide` 를 도입하면서 그 이유를 명시했다 —
*「모르는 값은 매수로 지어내지 않는다 (envelope.ts:1322-1333 의 규율을 그대로 쓴다)」*.
그런데 **감사 행의 `side` 를 정하는 함수는 고쳐지지 않았다.**

```ts
function sideOf(notice: ParsedOrderResp): OrderSide {
  if (!notice.sideTrusted) return "S";
  return notice.side.startsWith("S") ? "S" : "B";   // ← 빈 값·"X"·소문자 "b" 전부 "B"
}
```

`sideTrusted` 는 `noticeType !== "C" && noticeType !== "M"` 일 뿐이므로(`envelope.ts:1273`)
**구 게이트웨이의 빈 `side`("")도 `sideTrusted === true`** 다. 그러면 이 함수가 `""` 를 `"B"` 로 바꿔
`dma_orders.side = 'B'` 로 기록한다 — 매도 자동주문이 감사 기록에 매수로 남는다. 파일 전반의 규율
(「지어내지 않는다」)과 정면으로 어긋나고, 두 함수가 같은 필드를 서로 다르게 읽는다.

**Fix:** `fromWireSide` 로 통일하고, 못 푸는 값에 대한 처리를 명시한다.

```ts
function sideOf(notice: ParsedOrderResp): OrderSide {
  if (!notice.sideTrusted) return "S";                 // 취소·정정 표기 (Pitfall 8)
  const s = fromWireSide(notice.side);
  if (s !== null) return s;
  // 지어내지 않는다. CHECK 가 B/S 둘뿐이라 행을 남기려면 하나를 골라야 하므로, 취소 행과 같은
  // 규율("S" = 표기이지 방향의 정본이 아니다)로 적고 **사유를 남긴다** (S-5).
  logger.warn({ orderNo: notice.orderNo, noticeType: notice.noticeType },
    "[WS-order] 통보의 매매구분을 해석하지 못했다 — 표기용 'S' 로 기록 (방향의 정본 아님)");
  return "S";
}
```

---

### R2-WR-07: `23505` 수렴 경로가 `inserted` 카운터를 올리고, 수렴 재조회의 예외가 원래 사유를 덮는다

**File:** `relay/src/store/orders.ts:481`, `relay/src/store/orders.ts:345-358`

**Issue:**
두 가지가 겹쳐 있다.

1. `insertRequest`(`orders.ts:478-482`)는 sink 가 정상 반환하기만 하면 `this.#inserted += 1` 을 한다.
   `23505` 수렴 경로는 **행을 만들지 않고** 기존 행 id 를 돌려주므로, `stats().inserted`(「새로 만든 행
   누적 건수」)가 실제 insert 보다 커진다. 이 모듈은 카운터를 감사 지표로 쓰겠다고 선언한 곳이라
   (S-5) 이 오염은 사소하지 않다.

2. 수렴 재조회를 `supabaseOrderLookupSink(supabase)(row.userId, row.orderNo)` 로 **매 호출마다 새로
   만들어** 부른다. 그 sink 는 조회 실패 시 `throw` 하므로(`orders.ts:396`), 재조회가 실패하면
   **원래의 `23505` 대신 조회 오류가 호출자에게 올라간다** — 「이미 있다」였다는 정보가 사라지고
   `insertOnly` 의 catch 가 `unavailable`(= 통보 드롭)로 접는다. 16-28 이 없애려던 열화가 그대로 남는다.

**Fix:**

```ts
// 1) 수렴은 insert 가 아니다 — 카운터를 가른다.
async insertRequest(row: OrderInsertRow): Promise<string> {
  ...
  const id = await this.#insert(row);
  this.#inserted += 1;   // → sink 가 `{ id, created: boolean }` 을 돌려주게 바꾸고 created 일 때만 올린다
  return id;
}

// 2) 재조회 실패가 원래 사유를 덮지 않게 한다.
let existing: string | null = null;
try { existing = await supabaseOrderLookupSink(supabase)(row.userId, row.orderNo); }
catch (lookupErr) {
  logger.error({ error: safeErr(lookupErr), origin: row.origin },
    "[orders] 23505 후 수렴 재조회 실패 — 원래 사유(23505)를 그대로 올린다");
}
if (existing !== null) { ...; return existing; }
```

---

## Info

### R2-IN-01: 전송 실패·무장 차단 문구가 **원인을 고쳐도 사라지지 않는다**

**File:** `webapp/src/components/trading/limit-chaser-form.tsx:280,495-500,524-529`, `webapp/src/components/trading/vi-order-list.tsx:213,254`

`submitError`/`sendError` 는 (a) 다음 성공 전송, (b) `[server]` 이펙트에서만 지워진다. 사용자가
「주문금액이 매수가격보다 작아 주문수량이 0 주예요」를 보고 **금액을 올려도** `role="alert"` 문구가
그대로 남고, 소켓이 복구돼도(에코가 오지 않으면) 그대로다. 안전 문구가 상시 표시되면 다음번엔 읽히지 않는다.

**Fix:** 값이 바뀌면 접는다 — `useEffect(() => setSubmitError(''), [form])` (또는 `setField` 안에서
`setSubmitError('')`). `vi-order-list` 는 `items` 변경 시 접는다.

---

### R2-IN-02: `SubscriptionHub.detach()` · `SubscriptionHub.releaseAll()` 은 **호출자가 없다**

**File:** `relay/src/hub/subscription-hub.ts:316`, `relay/src/hub/subscription-hub.ts:383`

`relay/src` · `relay/tests` 어디에서도 부르지 않는다(`grep "detach(\|releaseAll("` → 정의부 외 0건).
둘 다 세션 상태를 파괴하는 공개 메서드라 남겨 두면 「호출하면 된다」는 오해를 만든다. 특히 `detach` 는
`session.on("frame"/"ready")` 리스너를 떼지 않으므로 호출되는 순간 R2-WR-05 와 같은 리스너 누적을
`SubscriptionHub` 에서도 만든다.

**Fix:** 삭제하거나, 남긴다면 「테스트/종료 전용, 리스너를 떼지 않는다」를 시그니처 주석이 아니라
`@internal` 로 명시하고 리스너 정리를 함께 넣는다.

---

### R2-IN-03: `narrowPending` ② 축이 **모르는 `noticeType` 을 「신규」로 단정**한다

**File:** `relay/src/ws/order-handler.ts:1043-1046`

```ts
if (n.noticeType !== "" && n.noticeType !== "R") refine((p) => p.isCancel === isCancelNotice);
```

`isCancelNotice` 는 `"C"|"M"` 만 true 다. 장래에 추가될 통보 종류(예: 부분취소 · 예약 확인)는
전부 `false` 로 떨어져 **신규 대기 쪽으로** 좁혀진다. 화이트리스트가 아니라 블랙리스트라 확장에 취약하다.

**Fix:** 아는 값만 축으로 쓴다 — `if (n.noticeType === "A" || n.noticeType === "E") refine((p) => !p.isCancel);`

---

### R2-IN-04: 테스트 ⓽ 가 `flushed` 를 단언하지 않아 R2-WR-01 의 손실을 「진실」로 잠근다

**File:** `relay/tests/order-store.test.ts` (「⓽ order_no 를 채우는 갱신의 23505 는 드롭 카운터를 올리지 않는다」)

`dropped === 0` · `retried === 0` · `queued === 0` · `queries.length === 1` 만 본다. 그 결과
「갱신이 통째로 사라졌는데 `flushed` 는 1 이 되는」 상태가 초록으로 통과한다. 16-33 이 짚은
「테스트가 옛 구현을 베껴 결함을 잠근다」와 같은 형태다.

**Fix:** `expect(store.stats().flushed).toBe(0)` 와 「가짜 테이블의 `row-manual` 상태가 실제로 갱신됐다」를
추가한다(R2-WR-01 수정과 함께).

---

### R2-IN-05: smoke 프로브가 `console.log` 직후 `process.exit(0)` 한다 — stdout 이 파이프일 때 판정 문자열이 잘릴 수 있다

**File:** `scripts/smoke-relay.sh` (`ws_order_probe` 내부 프로브의 `finish()`)

```js
console.log(verdict);
process.exit(0);
```

Node 의 `process.stdout` 은 POSIX 에서 **파이프일 때 비동기**이고, 이 프로브의 stdout 은
`verdict="$(SMOKE_TOKEN=... node ...)"` 로 항상 파이프다. `process.exit()` 는 대기 중인 쓰기를 버릴 수
있다는 것이 Node 문서의 명시 경고다. 잘리면 `verdict=""` → 호출부 `case` 의 `*` 갈래 → **FAIL 이 SKIP 으로
강등**되는데, 그것이 정확히 T-16-57 이 막겠다고 선언한 결과다(rc 는 0 이라 `inconclusive` 덮어쓰기도 안 걸린다).

**Fix:** 종료 코드로 판정을 넘기거나, 쓰기 완료를 기다린다.

```js
process.stdout.write(verdict + "\n", () => process.exit(0));
```

(또는 `process.exitCode = 0` 만 설정하고 자연 종료에 맡긴다 — 타이머는 이미 전부 `clearTimeout` 된다.)

---

## 확인했고 문제 없다고 판단한 것 (재확인 불필요)

- `me-client.tsx` `serverTimeKey`/`isNewerServerTime` — `formatServerTime` 과 자릿수 판정 기준
  (`>=14` / `===6` / 그 외 `null`)이 정확히 일치하고, 승자 원문에서 표시 문자열을 뽑아 「고르기와
  그리기가 같은 값을 본다」가 실제로 성립한다.
- `limit-chaser-client.tsx` `isPickable` 의 타입 서술자 — `StockDetailResponse.isin` 이
  `string | null`(`packages/shared/src/stock.ts:79`)이라 `row.isin !== null` 좁히기가 서술자와 일치한다.
  `as string` 제거가 안전하다.
- `dupKey` 의 취소 분기(`(accountNo, isin, "C", orgOrderNo)`) — 같은 `orgOrderNo` 재전송은 여전히
  거부되고, 서로 다른 미체결의 연속 취소만 열린다. 의도대로다.
- `handle` ③-3 의 `conns.get(conn) !== state` 가드와 `release` 의 `dupKeys.delete` 조기 반환 —
  `closeConn` 이 먼저 돌아도 사용자 스코프 dup 키가 이중 회수되지 않는다.
- `ensureRow` 의 빈 `orderNo` 우회(`insertOnly` 직행) — `findIdByOrderNo` 가 빈 값에서 항상 `null` 이므로
  in-flight 키에 dedup 의미가 없다는 근거가 맞다.
- `vi-settings-card` 의 `ViSubmitResult` 3갈래 — `failed` 에서만 다이얼로그를 열어 두는 분기가
  `submittingRef`/`ackTimer`/`onSent` 어느 것도 걸지 않고 빠져나가는 것을 확인했다.

---

_Reviewed: 2026-09-09T07:40:07Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
_Diff base: f82bb49_
