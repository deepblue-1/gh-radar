# Phase 36: 계좌별 주문가능 금액 (account-budget) - Pattern Map

**Mapped:** 2026-10-27
**Files analyzed:** 32 (신규 9 · 수정 23)
**Analogs found:** 31 / 32

> 모든 analog 경로는 `git ls-files` 로 tracked 확인함. Phase 35 사이드바 변경은 이미 커밋돼 있다(`git status` 깨끗) — RESEARCH Pitfall 9 의 「사이드바 커밋 뒤」 조건은 충족된 상태.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `relay/src/admin/types.ts` (수정) | model/types | — | 자기 자신 `ADMIN_OP` 26-32 · `AdminAccount` 81-100 · `AdminCommandInput` 103-112 | exact |
| `relay/src/dma/envelope.ts` `buildAdminCommandReq` (수정) | codec | request (outbound 44) | 자기 자신 3338-3361 (password 조건부 싣기) | exact |
| `relay/src/dma/envelope.ts` `parseAdminUsersSnapshot` (수정) | codec | transform (87) | 자기 자신 3405-3437 (orderIp/orderMac) | exact |
| `relay/src/dma/envelope.ts` `parseAccountState` (수정) | codec | transform (66/67) | 자기 자신 2472-2481 반환 객체 + `toNum` 315-326 | exact |
| `relay/src/dma/envelope.ts` `parseJournalBatch` (수정) | codec | transform (80) | 자기 자신 3476-3500 `rec` 객체 | exact |
| `relay/src/journal/types.ts` · `writer.ts` `toApplyEvent` (수정) | model + transform | batch | `writer.ts` 175-201 | exact |
| `relay/src/hub/subscription-hub.ts` `#mergeAccountState` (수정) | service | event-driven | 자기 자신 3694-3730 · 웹 `mergeAccount` | exact |
| `relay/src/hub/subscription-hub.ts` 신규 `liveBudgetOf` | service | query | `#accountStates`(987) 키 `ownerKey`(739) | role-match |
| `relay/src/admin/dispatcher.ts` 신규 `setAccountCost` + op 3 뒤 되싣기 | service | request-response fan-out | `reconcileUser` 169-185 · `#applyServer` 300-370 · `#fanOut` 444-460 | exact |
| `relay/src/admin/admin-api.ts` PUT budget/fee · GET account-costs (수정) | route | request-response | PUT `.../order-server` 508-529 · GET `/order-endpoints` 672-691 | exact |
| `packages/shared/src/admin.ts` (수정) | model + utility | transform | `AdminAccountView.orderEndpoints` 219-223 · `interpretAdminResult` 523-528 | exact |
| `packages/shared/src/order-endpoint.ts` 신규 `summarizeAccountCost(s)` (수정 or 같은 위치) | utility | transform | `summarizeOrderEndpoint` 121-153 | exact |
| `packages/shared/src/relay.ts` `RelayAccountState` (수정) | model | — | 자기 자신 1177-1196 | exact |
| `packages/shared/src/account-budget.ts` (신규) | utility | transform (pure) | `packages/shared/src/lc-amount.ts` (`formatManwon` 201 · Phase 31 한 벌) | role-match |
| `packages/shared/src/__tests__/account-budget.test.ts` (신규) | test | — | `packages/shared/src/__tests__/lc-amount.test.ts` | exact |
| `packages/shared/src/index.ts` (수정) | config(barrel) | — | 262/264 줄 `export * from "./lc-amount"` | exact |
| `server/src/routes/admin.ts` PUT budget/fee · GET /users costs · GET /pnl (수정) | controller | request-response | PUT `/order-server` 512-536 · `fetchOrderEndpoints` 230-247 · GET `/users` 250-267 | exact |
| `server/src/services/relay-admin-client.ts` (수정) | service(HTTP client) | request-response | `relayAdminClientFrom` 306~ (`account()` 경로 헬퍼) · `RELAY_ORDER_ENDPOINTS_TIMEOUT_MS` 62 | exact |
| `server/src/routes/pnl.ts` (신규) | controller | request-response (RPC 1회) | `server/src/routes/orders.ts` (requireAuth · `req.userId` → RPC) | exact |
| `server/src/app.ts` (수정) | config | — | 108 `app.use("/api/orders", ordersRouter)` | exact |
| `server/tests/routes/pnl.test.ts` (신규) | test | — | `server/tests/routes/orders.test.ts` · `admin-launch.test.ts` | exact |
| `supabase/migrations/<ts>_dma_journal_pnl.sql` (신규) | migration | DDL + RPC 재정의 | `20261004090100_dma_journal_apply_skipped_rows.sql` (31-179) | exact |
| `supabase/migrations/<ts>_dma_pnl_rpcs.sql` (신규) | migration | aggregate RPC | `20260929190000_dma_gateway_identities.sql` 113-184 (`dma_visible_accounts` · `dma_journal_orders_for_user`) | role-match |
| `supabase/tests/dma_pnl_daily.test.sql` (신규) · `dma_journal_apply.test.sql` (수정) | test (pgTAP) | — | `supabase/tests/launch_gate_apply.test.sql` (머리 주석 · plan · 권한 단언 442-444) | exact |
| `relay/tests/helpers/frames.ts` (수정) | test helper | — | 자기 자신 490 `createAccountState` · 1618 `createJournalRecord` | exact |
| `webapp/src/components/admin/account-editor.tsx` 예수금·수수료·매도세 행 (수정) | component | request-response(즉시 저장) | 같은 파일 `order` useFieldSave 693-698 · `OrderEndpointLine/MismatchLines` 477-510 · `RESULT_CHIP` 196-206 | exact |
| `webapp/src/lib/admin-api.ts` (수정) | service(fetch) | request-response | `setAccountOrderServer` 170-182 | exact |
| `webapp/src/components/orderbook/account-panel.tsx` 요약 줄 (수정) | component | display | 같은 파일 잔고 섹션 995-1010 | exact |
| `webapp/src/components/trading/card/manual-order-form.tsx` 주문가능 행 (수정) | component | display + validate | 같은 파일 주문금액 행 987-996 · `priceIssue` 881-890 | exact |
| `webapp/src/components/trading/limit-chaser-form.tsx` 합산 경고 (수정) | component | validate | 같은 파일 `GROUP_AMOUNT_FIELD` · `groupQtyOf` 217-225 | exact |
| `webapp/src/components/trading/me-client.tsx` 손익 탭 (수정) | component | — | 같은 파일 `ME_TABS` 303-308 · 잔고 탭 510-525 | exact |
| `webapp/src/app/admin/pnl/page.tsx` + `webapp/src/components/pnl/*` (신규) · `app-sidebar.tsx` (수정) | page/component | request-response | `webapp/src/app/admin/launch/page.tsx` · `components/admin/launch-orders-tab.tsx` · `components/analytics/accum-day-grid.tsx` · sidebar `NAV_ADMIN_LAUNCH` 199 | exact |
| `webapp/src/lib/pnl-api.ts` (신규, 가칭) | service(fetch) | request-response | `webapp/src/lib/launch-api.ts` (`fetchLaunchOrders`) | role-match |

---

## Pattern Assignments

### relay — `relay/src/admin/types.ts`

**Analog:** 자기 자신 (lines 26-32)
```typescript
export const ADMIN_OP = {
  UpsertUser: 1,
  DeleteUser: 2,
  SetAccount: 3,
  RemoveAccount: 4,
  ListUsers: 5,
} as const;
```
→ `SetAccountBudget: 6, SetAccountFee: 7` 추가, 머리 주석(20-24 줄 op 목록)에도 6·7 한 줄씩. `AdminAccount` 에 `budgetKrw?/feePpm?/sellTaxPpm?`, `AdminCommandInput` 에 `budgetKrw?: bigint; feePpm?: number; sellTaxPpm?: number`.

### relay — `envelope.ts buildAdminCommandReq` (44 아웃바운드)

**Analog:** 3338-3361. password 를 op 조건으로 싣는 문법·RangeError 가드를 그대로 복제한다.
```typescript
if (typeof requestId !== "bigint" || requestId < 0n || requestId >= 1n << 64n) {
  throw new RangeError(`admin request_id 가 ulong 범위가 아니다: ${String(requestId)}`);
}
...
AdminCommandReq.addPassword(b, password);
if (account !== null) AdminCommandReq.addAccount(b, account);
// ← 여기 뒤에 op 6: addBudgetKrw(b, input.budgetKrw ?? 0n) · op 7: addFeePpm / addSellTaxPpm (RESEARCH Pattern 1)
const table = AdminCommandReq.endAdminCommandReq(b);
```
ppm 은 uint32 구조 검사만(0~10000 범위 검사 금지 — RESEARCH Anti-Pattern). op 6/7 `account` 는 op 4 꼴 `{accountNo, name:"", branchNo:"", traderId:"", priority:0}`.

### relay — `envelope.ts parseAdminUsersSnapshot` (87)

**Analog:** 3418-3427 의 `accounts.push`.
```typescript
accounts.push({
  accountNo: a.accountNo() ?? "",
  ...
  priority: a.priority(),
  ...(orderIp !== "" ? { orderIp } : {}),
  ...(orderMac !== "" ? { orderMac } : {}),
});
```
→ 숫자 3필드는 **항상** 싣는다(키 생략 규칙 아님): `budgetKrw: toNum(a.budgetKrw(), "admin_account.budget_krw"), feePpm: a.feePpm(), sellTaxPpm: a.sellTaxPpm()`.

### relay — `envelope.ts parseAccountState` / `parseJournalBatch`

**bigint 경계:** `toNum(v: bigint, label)` 315-326 — 유일한 long→number 경계(`JSON.stringify(bigint)` TypeError). 66/67 반환 객체(2472-2481 `{t,a,snap,hold,unf,rm,st}`)에 `budgetKrw: toNum(st.budgetKrw(), "account_state.budget_krw")`.
저널 `rec` (3476-3500) 끝에 `avgPrice/feeKrw/taxKrw/realizedPnlKrw: toNum(w.xxx(), "journal_record.xxx")` (음수 허용).

### relay — `journal/writer.ts toApplyEvent` (175-201)
```typescript
export function toApplyEvent(r: JournalRecord): JournalApplyEvent {
  return {
    seq: r.seq,
    ...
    local_reject: r.localReject,
    // ← avg_price / fee_krw / tax_krw / realized_pnl_krw (D-15 키 이름 one-way)
  };
}
```
`relay/tests/journal-codec.test.ts:150` 키 수 23 → 27 (Pitfall 3).

### relay — `subscription-hub.ts #mergeAccountState` (3694-3730)

**Analog:** 자기 자신 + 웹 `webapp/src/lib/use-relay-socket.ts` `mergeAccount` 1570-1605. 델타 분기만 필드별 재조립이라 새 필드 누락:
```typescript
return {
  t: "acct",
  a: next.a,
  snap: true,
  hold: [...holdings.values()],
  unf: [...unfilled.values()],
  rm: [],
  st: next.st,
  // ← budgetKrw: next.budgetKrw  (무조건 덮기 · 0 = 해제도 정당값)
};
```
웹 쪽은 `...next` 스프레드라 코드 변경 불필요 — 주석만 「budgetKrw 마지막 값」 보강, 「두 곳 동일」 주석 유지.
`liveBudgetOf(serverKey, accountNo)` 는 `#accountStates`(987) 를 키 `${userId}|${serverKey}|${accountNo}` 로 스캔.

### relay — `admin/dispatcher.ts setAccountCost` + 되싣기

**Public 메서드 골격 analog:** `reconcileUser` 169-185
```typescript
reconcileUser(dmaUserId, opts: { ...; deadlineAt?: number; ... }): Promise<AdminServerResult[]> {
  const progress = newProgress();
  const full = this.#serial(dmaUserId, async () => {
    const stored = await this.#deps.store.intent(dmaUserId);
    ...
    const results = await this.#fanOut(progress, this.#serverKeysOf(stored), (serverKey) => this.#applyServer(...));
    await this.#recordFinal(dmaUserId, progress, results);   // ← op 6/7 은 호출 금지 (Pitfall 5)
    return results;
  });
  return this.#answerBy(dmaUserId, opts.deadlineAt, progress, full, (results) => results);
}
```
**서버별 송신 analog:** `#applyServer` 300-370 — 꺼진 서버 `skipped`(302-306), 파이프라인/스냅샷 없음 `offline`(308-309), `admin.command(input)` → `outcome.kind !== "result"` 면 그 kind, `interpretAdminResult(op, r.code) === "failed"` 면 `{outcome:"failed", code, message, usersRev}` (342-350). op 5 재조회 fail-closed 패턴 315-328 은 되싣기 출처값 확보에 재사용.
**fan-out 대상:** `#serverKeysOf(intent)` 532-534 (요청 유저의 그 계좌 active 행으로 필터). 되싣기 위치는 `#applyServer` 루프(333~) 뒤 — op 3/op 1 ok 인 「이 서버에 처음」 계좌마다(RESEARCH Pattern 3). 실패는 비치명 warn(`maskAccountNo`).

### relay — `admin/admin-api.ts`

**PUT analog:** `/dma-users/:dma/accounts/:broker/:accountNo/order-server` 508-529 (`deadlineOf()` · `AccountParam.parse(req.params)` · zod body · `audit(...)` · `extra = { broker, account: maskAccountNo(accountNo) }`). 결과 응답은 DELETE 494-505 처럼 `respond(res, results)`.
**GET analog:** `/order-endpoints` 672-691
```typescript
router.get("/order-endpoints", (_req, res) => {
  const servers: AdminOrderEndpointsRaw["servers"] = {};
  for (const row of deps.registry.all()) {
    if (!row.enabled || row.broker !== "KB") continue;   // ← account-costs 는 KB+교보 모두
    const snapshot = deps.pipelines.get(row.key)?.admin.currentSnapshot();
    if (snapshot == null) continue;                      // 키 없음 = 「확인 전」
    servers[row.key] = snapshot.users.flatMap((u) => u.accounts.map((a) => ({ dmaUserId: u.userId, accountNo: a.accountNo, ... })));
  }
  res.status(200).json({ servers });
});
```
→ `/account-costs`: 같은 루프 + `liveBudgetKrw: hub.liveBudgetOf(row.key, a.accountNo)` + op 5 스로틀(서버별 마지막 시각 · in-flight 공유 · ~800ms 상한 — Pitfall 8). IP/MAC 노출 규칙 보존 위해 엔드포인트 분리.

### shared — `packages/shared/src/admin.ts`

**Analog:** `AdminAccountView.orderEndpoints?: Record<string, AdminOrderEndpoint | null>` (219-223, 선택 필드 · 파생은 늘 채움 주석까지 복제) → `costs?: Record<string, AdminAccountCost | null>`.
`interpretAdminResult` 523-528 → op 타입 `1|2|3|4|5|6|7` (RESEARCH Code Examples). JSDoc(518-522 류)에 op 6/7 code 1 줄 추가.
`deriveAdminUsersOverview`(819) 에 3번째 인자 — `endpoints` 와 같은 nullable raw 주입 방식.

### shared — `order-endpoint.ts summarizeOrderEndpoint` (121-153) → 비용 요약 동형

복제할 핵심: `registered`(레지스트리 순 active) → `resolveEffectiveOrderServer` 로 `preferred` → `known`(값 아는 서버) → `source` 폴백 → `mismatches` 루프. 값 비교만 `budgetKrw`·`feePpm`·`sellTaxPpm` 으로 교체. 유효 주문 서버 규칙 두 벌 금지(GC-06) — `resolveEffectiveOrderServer` 재사용 필수. D-07 되싣기 출처 선택(relay)도 같은 규칙.

### shared — `account-budget.ts` (신규) + 테스트

**Analog:** `packages/shared/src/lc-amount.ts` — 머리 주석에 gh-trade 원본 근거, `const QTY_NUM = new Intl.NumberFormat("ko-KR")` 모듈 상수, 순수 함수 export, 예시를 JSDoc 에 박기:
```typescript
/** 천단위 구분(C# `N0` · InvariantCulture 동형). */
const QTY_NUM = new Intl.NumberFormat("ko-KR");
/** ... 예: 9999 → 「9999만」 · 10000 → 「1억」 ... */
export function formatManwon(manwon: number): string { ... }
```
`formatManwon` 은 억 섞임이라 재사용 금지 → 새 `formatManwonFloor`(억 없음 · 콤마). 손익 포맷은 「절댓값 내림 후 부호」 U+2212(Pitfall 13). 본문은 RESEARCH Pattern 5 `availableKrwOf`. barrel: `packages/shared/src/index.ts` 262/264 줄 옆 `export * from "./account-budget";`.
**테스트 analog:** `packages/shared/src/__tests__/lc-amount.test.ts` 1-25 (머리 주석에 출처·수치표 · `import { describe, expect, it } from "vitest"` · `../relay` 타입 import). shared 수정 뒤 `pnpm --filter @gh-radar/shared build` 필수(Pitfall 11).

### server — `server/src/routes/admin.ts`

**PUT analog:** 512-536
```typescript
adminRouter.put("/dma-users/:dma/accounts/:broker/:accountNo/order-server", async (req, res, next) => {
  try {
    const { dma, broker, accountNo } = parseOrThrow(dmaAccountParam, req.params);
    const { serverKey } = parseOrThrow(AdminOrderServerSchema, req.body ?? {});
    const relay = requireRelayAdmin(req);
    const r = await relay.setAccountOrderServer(dma, broker, accountNo, serverKey, req.adminEmail!);
    ...
    audit(req, "dma-order-server", maskDmaUserId(dma), { broker, orderServer });
    res.json({ ok: true, orderServer });
  } catch (e) { next(e); }
});
```
결과 배열 응답은 DELETE 492-509 의 `relayResults(await relay.removeAccount(...), "dma-account-remove")` + `audit(... servers: results.map((x) => \`${x.server}:${x.outcome}\`))` + `res.json({ results })` 꼴.
**개요 병렬 analog:** GET `/users` 250-267 `Promise.all([supabase.rpc("admin_users_raw"), fetchOrderEndpoints(req)])` → 세 번째 `fetchAccountCosts(req)` 추가; `fetchOrderEndpoints` 230-247(실패 → null · status 만 warn 로그)을 그대로 복제.
**GET /pnl (admin):** adminRouter 안이면 전역 관문 자동. 또는 `admin-launch.ts` 29 `adminLaunchRouter.use("/launch", requireAuth(), requireAdmin())` 경로 한정 관문 꼴.

### server — `services/relay-admin-client.ts`

`relayAdminClientFrom` 306~ 의 `account(dma, broker, accountNo)` 경로 헬퍼 + `request<AdminCommandResponse>("PUT", \`${account(...)}/budget\`, adminEmail, body)`. GET account-costs 는 order-endpoints 처럼 `{ timeoutMs: RELAY_ORDER_ENDPOINTS_TIMEOUT_MS }`(62 · 2초).

### server — `routes/pnl.ts` (신규, /me)

**Analog:** `server/src/routes/orders.ts`
```typescript
import { Router, type Router as RouterT } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAuth } from "../middleware/require-auth.js";
import { ValidationFailed } from "../errors.js";

export const ordersRouter: RouterT = Router();
ordersRouter.get("/", requireAuth(), async (req, res, next) => {
  try {
    const parsed = OrderListQuery.safeParse(req.query);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw ValidationFailed(`${issue.path.join(".")}: ${issue.message}`);
    }
    const supabase = req.app.locals.supabase as SupabaseClient;
    // 사용자 id 는 인증이 확정한 값 하나만 넘긴다
    const data = await listTodayOrders(supabase, req.userId!, parsed.data.date);
    res.json(data);
  } catch (e) { next(e); }
});
```
기간→날짜는 `kstDateIso()`(shared krxCalendar.ts:53). 마운트: `server/src/app.ts` 108 `app.use("/api/orders", ordersRouter)` 옆 `app.use("/api/pnl", pnlRouter)` (import 는 20 줄 블록, `.js` 확장자).
**테스트 analog:** `server/tests/routes/orders.test.ts` · `admin-launch.test.ts`.

### DB — `<ts>_dma_journal_pnl.sql`

**Analog:** `supabase/migrations/20261004090100_dma_journal_apply_skipped_rows.sql` — 유일한 최신 `dma_journal_apply` 정의(다른 재정의 없음 확인). 본문 31-176 전체 복사 후 INSERT(67-96)에 열·값 4개만 추가:
```sql
INSERT INTO public.dma_journal_events (
  gateway, journal_epoch, seq, ..., exec_qty, result_code, message, local_reject
  -- , avg_price, fee_krw, tax_krw, realized_pnl_krw
) VALUES (
  ...,
  coalesce((ev->>'exec_qty')::integer, 0),
  ...
  -- , coalesce((ev->>'avg_price')::bigint, 0), ... (bigint)
)
ON CONFLICT DO NOTHING;
```
머리 주석 형식(무엇을 바꾸는가 · 결정 근거 · 되돌리기)과 권한 3줄(177-179) 재명시:
```sql
REVOKE EXECUTE ON FUNCTION public.dma_journal_apply(text, text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dma_journal_apply(text, text, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dma_journal_apply(text, text, jsonb) TO service_role;
```
타임스탬프는 최신 `20261027200100` 보다 크게, Phase 35 예정 `20261028200000` 과 순서 조율(Pitfall 10).

### DB — `<ts>_dma_pnl_rpcs.sql`

**Analog:** `20260929190000_dma_gateway_identities.sql` 113-129
```sql
CREATE OR REPLACE FUNCTION public.dma_visible_accounts(p_user_id uuid)
RETURNS TABLE (gateway text, account_no text)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$ ... $$;
REVOKE EXECUTE ON FUNCTION public.dma_visible_accounts(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dma_visible_accounts(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dma_visible_accounts(uuid) TO service_role;
```
`/me` RPC 는 `JOIN public.dma_visible_accounts(p_user_id) v ON v.gateway = j.gateway AND v.account_no = j.account_no`(같은 파일 136~ `dma_journal_orders_for_user` 조인 꼴). 반환 jsonb 1회(RESEARCH Pattern 7) · `exec_qty::bigint * exec_price`(Pitfall 4).

### DB 테스트 — pgTAP

**Analog:** `supabase/tests/launch_gate_apply.test.sql` — 머리 주석(대상 마이그레이션 · 잠그는 것 목록 · 실행 명령 `bash scripts/verify-dma-orders-price-check.sh --test ...` · 한 트랜잭션 ROLLBACK), `SELECT plan(N);`(200), 권한 단언 442-444:
```sql
row(has_function_privilege('anon', 'public.fn(...)', 'EXECUTE'),
    has_function_privilege('authenticated', ...),
    has_function_privilege('service_role', ...))::text  -- = (f,f,t)
```
기존 `supabase/tests/dma_journal_apply.test.sql` 에 4열 적재 케이스 추가.

### relay 테스트 헬퍼 — `relay/tests/helpers/frames.ts` (Wave 0)

490 `AccountState.createAccountState(b, accountNo, holdingsVec, unfilledVec, removedVec, snapshot, serverTime)` → 8번째 인자 `BigInt(input.budgetKrw ?? 0)`; 1618 `createJournalRecord` 에 4필드(기본 0n). typecheck:tests 깨짐 해소(Pitfall 1).

### webapp — `components/admin/account-editor.tsx` 예수금·비용률 행

**즉시 저장 analog:** 693-698
```typescript
const order = useFieldSave<string | null>(
  async (serverKey) => {
    await setAccountOrderServer(dmaUserId, account.broker, account.accountNo, serverKey);
  },
  { onSuccess: () => onChanged(), releaseOn: account },
);
```
→ `budget = useFieldSave<number>(...)`(op 6) · `cost = useFieldSave<{feePpm, sellTaxPpm}>(...)`(op 7) 두 벌. `useFieldSave` 계약은 `use-field-save.ts` 40-66 (`state/run/results/error/errorCode/value` · `releaseOn`). 편집 모드 `editSaveBodyOf`(563-588)는 건드리지 않는다.
**칩:** `RESULT_CHIP`/`chipOfResult` 196-206 — 예수금 행에서만 `r.outcome === "failed" && r.code === 1` → 「서버 미지원」 라벨(Pitfall 7).
**읽기/불일치 줄:** `OrderEndpointLine` 477-497(`data-slot` · `IPMAC_LINE` 상수) · `OrderEndpointMismatchLines` 499-510(`WARN_LINE` 421 · 서버마다 한 줄 · `ACCOUNT_EDITOR_TEXT.xxxMismatch(serverKey, m)`). 오류 줄은 `EDIT_ERROR_LINE`(423). 요약 계산은 703 `summarizeOrderEndpoint({ account, registry })` 꼴로 새 shared 함수 호출. 문구는 `ACCOUNT_EDITOR_TEXT` 에 키 추가(UI-SPEC Copywriting ①). 입력은 `@/components/ui/input` `size="sm"` + `aria-invalid`.

### webapp — `lib/admin-api.ts`

**Analog:** `setAccountOrderServer` 170-182
```typescript
return authFetch<AdminOrderServerResponse>(
  `${dmaPath(dmaUserId)}/accounts/${enc(broker)}/${enc(accountNo)}/order-server`,
  jsonInit("PUT", body, { timeoutMs: RELAY_TIMEOUT_MS }),
);
```
→ `/budget`·`/fee` 로 `Promise<AdminCommandResponse>`(putDmaAccount 147-152 반환형).

### webapp — `orderbook/account-panel.tsx` 요약 줄

**위치:** 잔고 `<section data-testid="account-holdings">` 995-1010 의 `<h4>` 뒤 · 보유 표 앞. `hideAccountHeader` 와 무관하게 렌더. 값은 `useMemo(() => availableKrwOf(account, priceOf), [account, priceOf])`. 토큰은 `--destructive`(초과 0) · `--muted-fg`(예수금). 현재가: `holdingQuotePrice` (`trading-workbench.tsx` 482-491, KRX→NXT `p > 0`).

### webapp — `trading/card/manual-order-form.tsx`

**행 analog:** 주문금액 987-996
```tsx
<div className="flex min-h-[44px] min-w-0 items-center justify-between gap-2">
  <span className="whitespace-nowrap text-[14px] text-[var(--muted-fg)]">주문금액</span>
  <b className="min-w-0 truncate text-[14px] font-medium text-[var(--fg-2)]">...</b>
</div>
```
**검증 줄 analog:** `priceIssue` 881-890 (`role="status"` · `aria-live="polite"` · `text-[12.5px] ... text-[var(--destructive)]` · `data-testid`). 매수/매도 상태 없음 — Pitfall 12 / Open Question 4 를 플랜에서 결정.

### webapp — `trading/limit-chaser-form.tsx`

**Analog:** `GROUP_AMOUNT_FIELD` 217-221 + `buyGroupOpenOf` 205-210 — 켜진 그룹의 금액 필드(만원)를 합산하는 순수 함수로 판정(shared `account-budget.ts` 에 두면 테스트 공유). 안내 줄 톤은 `--led-latent`(warn) · 비차단.

### webapp — `trading/me-client.tsx` 손익 탭

**Analog:** `ME_TABS` 303-308 (`{ v, label }` as const) → `{ v: "pnl", label: "손익" }` 추가. 탭 본문은 잔고 탭 510-525 처럼 `shownAccountNo`(MeAccountChips 가 고른 계좌) 하나만 넘겨 `<PnlReport ... />`. 잔고 탭의 `AccountPanel` 에 `priceOf` 전달 여부는 재량(D-11).

### webapp — `/admin/pnl` 페이지 · `components/pnl/*` · 사이드바

**페이지 analog:** `webapp/src/app/admin/launch/page.tsx`
```tsx
export default function AdminLaunchPage() {
  return (
    <AppShell sidebar={<AppSidebar />}>
      <Suspense fallback={null}>
        <LaunchClient />
      </Suspense>
    </AppShell>
  );
}
```
**데이터 로딩·스켈레톤·다시 시도 analog:** `components/admin/launch-orders-tab.tsx` (63-66 `useEffect` + `fetchLaunchOrders(...).then(...)` · 164 `CardsSkeleton` · 180 「다시 시도」 글자 버튼 · 465 `CardsSkeleton` 정의). fetch 헬퍼는 `webapp/src/lib/launch-api.ts` 꼴의 `pnl-api.ts`.
**행 펼침 analog:** `components/analytics/accum-day-grid.tsx` (246 `aria-expanded` · 461-466 `ChevronDown` `rotate-180`).
**사이드바:** `components/layout/app-sidebar.tsx` 196-199 `NAV_ADMIN_USERS/SERVERS/LAUNCH` 상수 → `const NAV_ADMIN_PNL = { href: "/admin/pnl", label: "매매손익" } as const;` 를 발사 뒤에, 189 줄 그룹 주석 갱신, `app-sidebar.test.tsx` · `sidebar-tree.spec.ts` 함께.

---

## Shared Patterns

### bigint ↔ JSON 경계
**Source:** `relay/src/dma/envelope.ts` 308-326 `toNum` — 87/66/67/80 의 모든 long/ulong 은 이 함수만 통과. 아웃바운드는 `BigInt(...)`(1787 `SetVITrigger.addOrderAmountKrw` 선례).

### 86 결과 해석 · 칩
**Source:** `packages/shared/src/admin.ts` `interpretAdminResult` · `account-editor.tsx` `chipOfResult`. code 테이블은 relay `ADMIN_CODE` 뿐 · message 원문 · 문장 대조 없음.

### 어드민 감사·마스킹
**Source:** server `audit(req, "<op>", maskDmaUserId(dma), {...})` · relay `audit(adminEmail, route, dma, ..., { broker, account: maskAccountNo(accountNo) })`. 예수금 값 자체는 로그 가능, 계좌번호는 마스킹.

### Supabase RPC 권한
**Source:** `20260929190000` 113-129 · `20261004090100` 177-179 — `SECURITY INVOKER` + `SET search_path = public, pg_temp` + REVOKE PUBLIC · REVOKE anon, authenticated · GRANT service_role. pgTAP 에 (f,f,t) 단언.

### shared 한 벌 + dist
계산·포맷·판정은 shared 에 두고 webapp·relay·server 테스트가 같은 것을 import. 수정 후 shared build 선행.

### 두 곳 동일 병합
relay `#mergeAccountState` ↔ 웹 `mergeAccount` 주석 계약 유지.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `<ts>_dma_pnl_rpcs.sql` 의 일자×묶음×종목 jsonb 집계 본문 | migration | aggregate | 권한·가시성 조인은 analog 있음. 다단 jsonb 집계(groups→days→stocks)는 직접 대응 없음 — RESEARCH Pattern 7 사용(accum 보고서 RPC 를 참고 가능하나 미검증) |

## Metadata

**Analog search scope:** relay/src/{admin,dma,hub,journal}, relay/tests/helpers, packages/shared/src, server/src/{routes,services,app.ts}, supabase/{migrations,tests}, webapp/src/{components,lib,app/admin}
**Files scanned:** ~30
**Pattern extraction date:** 2026-10-27
