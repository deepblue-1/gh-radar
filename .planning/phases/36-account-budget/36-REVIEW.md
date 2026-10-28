---
phase: 36-account-budget
reviewed: 2026-10-28T01:33:05Z
depth: standard
files_reviewed: 39
files_reviewed_list:
  - packages/shared/src/account-budget.ts
  - packages/shared/src/admin.ts
  - packages/shared/src/index.ts
  - packages/shared/src/order-endpoint.ts
  - packages/shared/src/pnl.ts
  - packages/shared/src/relay.ts
  - relay/src/admin/admin-api.ts
  - relay/src/admin/dispatcher.ts
  - relay/src/admin/types.ts
  - relay/src/dma/envelope.ts
  - relay/src/hub/subscription-hub.ts
  - relay/src/index.ts
  - relay/src/journal/types.ts
  - relay/src/journal/writer.ts
  - server/src/app.ts
  - server/src/routes/admin-pnl.ts
  - server/src/routes/admin.ts
  - server/src/routes/pnl.ts
  - server/src/schemas/admin.ts
  - server/src/schemas/pnl.ts
  - server/src/services/pnl.ts
  - server/src/services/relay-admin-client.ts
  - supabase/migrations/20261028210000_dma_journal_pnl.sql
  - supabase/migrations/20261028210100_dma_pnl_rpcs.sql
  - webapp/src/app/admin/pnl/page.tsx
  - webapp/src/components/admin/account-editor.tsx
  - webapp/src/components/layout/app-sidebar.tsx
  - webapp/src/components/orderbook/account-panel.tsx
  - webapp/src/components/pnl/pnl-admin-client.tsx
  - webapp/src/components/pnl/pnl-report.tsx
  - webapp/src/components/trading/card/manual-order-form.tsx
  - webapp/src/components/trading/lc/setting-group.tsx
  - webapp/src/components/trading/limit-chaser-form.tsx
  - webapp/src/components/trading/me-client.tsx
  - webapp/src/components/trading/workbench/trading-workbench.tsx
  - webapp/src/lib/admin-api.ts
  - webapp/src/lib/launch-format.ts
  - webapp/src/lib/pnl-api.ts
  - webapp/src/lib/use-available-krw.ts
findings:
  critical: 0
  warning: 5
  info: 6
  total: 11
status: issues_found
---

# Phase 36: Code Review Report

**Reviewed:** 2026-10-28T01:33:05Z
**Depth:** standard
**Files Reviewed:** 39
**Status:** issues_found

## Summary

diff_base `2f26aea4` 이후 Phase 36 변경분을 검토했다. 범위는 계좌 예수금 op 6 · 비용률 op 7 fan-out(relay dispatcher · admin-api · Express 프록시), 87 · 67 예수금 파싱과 hub live 캐시, 저널 손익 4필드(파서 · `toApplyEvent` · `dma_journal_apply` 재정의), 일자별 매매손익 RPC · 라우트 · 화면, 그리고 주문가능 경고(계좌 패널 · 수동주문 · 상따)다.

보안 경계는 단단하다. `/api/pnl` 은 `req.userId` 하나만 넘기고 가시성은 RPC 안의 `dma_visible_accounts` 가 거른다. `/api/admin/pnl` 은 `requireAuth → requireAdmin` 이고, 새 함수 3개와 재정의한 apply 는 모두 `REVOKE anon, authenticated` 를 명시했다. 매수/매도 금액은 `exec_qty::bigint` 로 먼저 올려 int4 overflow 를 피했다. `toNum` 는 음수 실현손익도 클램프만 하고 throw 하지 않는다.

배포를 막을 결함(BLOCKER)은 찾지 못했다. 경고 5건은 모두 예수금 쓰기 · 표시가 어긋나는 경로다.
- Enter 를 누르면 고치지 않은 칸도 op 6 를 보내 서버가 조정한 예수금을 만원 단위로 잘라 덮어쓴다.
- 67 live 를 87 보다 늘 우선하므로 저장 직후 옛 값이 보일 수 있다.
- op 3 되싣기가 같은 서버 계획의 다른 op 실패에 묶여 영구히 빠진다.
- 공유 계좌는 그 DMA 유저의 등록 서버에만 퍼진다.
- `/me` 계좌 패널만 시장가 매수 미체결을 0 으로 센다.

## Warnings

### WR-01: Enter 만 눌러도(고치지 않은 칸) op 6 가 나가 서버가 조정한 예수금을 만원 단위로 잘라 덮어쓴다

**File:** `webapp/src/components/admin/account-editor.tsx:784-800, 886` (`budgetFieldText` 572)
**Issue:** 예수금 칸은 `budgetFieldText` 로 원 값을 **만원 내림**해 보여 준다(예: 9,987,654원 → 「998」). 「변경 없음」 판정은 `parsed.krw === summary.budgetKrw` 인데, 여기서 `parsed.krw` 는 칸 글자 × 10,000(9,980,000)이고 `summary.budgetKrw` 는 원 단위 서버 값(9,987,654)이다. 그래서 서버 예수금이 1만원 배수가 아니면 이 비교는 늘 거짓이다. gh-trade 는 체결마다 실현손익 · 수수료 · 세금만큼 예수금을 스스로 조정하므로, 한 번이라도 거래한 계좌는 사실상 늘 이 상태다. 포커스 이탈은 `edited` 를 확인하지만 `onKeyDown={onEnter(saveBudget)}` 는 확인하지 않는다. 그 결과 어드민이 칸을 클릭하고 Enter 만 쳐도 등록 서버 전부에 op 6(9,980,000)이 나간다. 서버가 조정해 둔 값이 최대 9,999원 깎이고, 서버 간에 쌓인 차이도 조용히 덮인다. 「변경 없음」 경로도 1만원 배수가 아니면 영영 타지 않는다.
**Fix:** 저장 시도를 「칸을 실제로 고쳤을 때」로 한정하고, 비교도 표시 단위로 한다.
```tsx
const saveBudget = () => {
  if (budgetLocked) return;
  const parsed = parseBudgetManwon(budgetField.text);
  if (!parsed.ok) { budgetField.settle(true); return; }
  // 표시 단위(만원 내림)로 비교 — 고치지 않은 칸은 서버 원 값을 덮어쓰지 않는다
  const shownManwon = Math.floor(Math.max(0, summary.budgetKrw) / 10_000) * 10_000;
  if (known && parsed.krw === shownManwon && !budgetMismatched) { markUnchanged("budget"); budgetField.settle(false); return; }
  ...
};
// onEnter 도 edited 일 때만 저장(또는 불일치 맞추기 의도일 때만)
onKeyDown={(e) => { if (budgetField.edited || budgetMismatched) onEnter(saveBudget)(e); }}
```

### WR-02: 67 live 예수금을 87 보다 무조건 우선 — op 6 저장 직후 재조회에 옛 값이 보일 수 있고, 거짓 불일치 줄이 뜰 수 있다

**File:** `relay/src/hub/subscription-hub.ts:2242-2251`, `relay/src/admin/admin-api.ts:929`, `packages/shared/src/admin.ts:785`
**Issue:** `accountCostOf` 는 `liveBudgetKrw !== null` 이면 87 값을 보지 않는다. 그런데 op 6 가 성공하면 순서가 이렇게 된다.
1. AdminConn 은 86 → 87 짝을 기다려 87 캐시를 새 값으로 바꾼 뒤 응답한다.
2. live 값의 원천인 「한도 전용 67」 은 **다른 연결(사용자 세션)** 로 온다. 87 과의 도착 순서는 보장되지 않는다. hub 주석 스스로도 「1~2초 뒤 재전송」 을 적어 두었다.
3. 웹은 PUT 성공 직후 `onChanged()` 로 개요를 다시 받는다. 이때 hub 에 67 이 아직 안 왔으면 live 는 **옛 값**이다.

그러면 카드 표시값(출처 = 유효 주문 서버 = live)은 옛 값이 된다. 다른 등록 서버(live 없음 → 87 = 새 값)는 「KB121 은 N만 — 저장하면 등록 서버가 모두 같아져요」 라는 거짓 불일치 줄을 띄운다. `useFieldSave` 의 `releaseOn: account` 가 이 재조회에서 누른 값을 놓기 때문에, 칸도 옛 값으로 되돌아간다. 어드민은 저장이 실패한 것처럼 보고 다시 저장하게 된다.
**Fix:** 두 원천 중 **더 최근에 받은 값**을 쓴다. hub 가 예수금을 갱신할 때 수신 시각을 함께 두고(`budgetAtMs`), `AdminConn` 스냅샷의 `receivedAtMs` 와 비교한다.
```ts
// subscription-hub.ts
liveBudgetOf(serverKey, accountNo): { krw: number; atMs: number } | null
// admin-api.ts — 87 수신 시각보다 늦은 67 만 live 로
const live = deps.liveBudget?.(row.key, a.accountNo);
liveBudgetKrw: live !== null && live.atMs > snapshotReceivedAtMs ? live.krw : null,
```
더 간단한 대안도 있다. dispatcher `#applyCost` 가 op 6 ok 직후 hub 캐시의 그 (서버, 계좌) 예수금을 보낸 값으로 덮게 한다.

### WR-03: D-07 예수금 · 비용률 되싣기가 같은 서버 계획의 다른 op 실패에 묶여 영구히 빠진다

**File:** `relay/src/admin/dispatcher.ts:442, 454-456`
**Issue:** `firstSeen` 은 op 3 · op 1(계좌)이 **ok 일 때마다** 쌓인다. 하지만 되싣기는 `failure === null` 일 때만 돈다. 같은 서버 계획에서 계좌 추가는 성공했는데 뒤 op(예: 다른 계좌의 op 4 · BUSY 9)가 실패하면, 이미 서버에 생긴 계좌의 되싣기도 건너뛴다. 다음 「다시 반영」 때 그 계좌는 87 에 이미 있어(`known`) 다시 `firstSeen` 이 되지 않는다. 그래서 그 서버의 그 계좌 예수금 · 비용률은 0(미설정) 그대로 남고 자동으로는 복구되지 않는다. `#reloadCosts` 는 원래 비치명으로 설계돼 실패해도 결과를 바꾸지 않는다. 따라서 다른 op 실패에 묶을 이유가 없다.
**Fix:** 성공한 계좌 추가분은 실패 여부와 무관하게 되싣는다(연결이 끊긴 실패만 제외).
```ts
if (opts.reloadCostsFrom !== undefined && (failure === null || failure.outcome === "failed")) {
  for (const accountNo of firstSeen) await this.#reloadCosts(serverKey, admin, accountNo, opts.reloadCostsFrom);
}
```

### WR-04: 공유 계좌의 op 6/7 · 되싣기가 「그 DMA 유저의 등록 서버」에만 닿는다 — 다른 유저만 등록한 서버는 갈라진다

**File:** `relay/src/admin/dispatcher.ts:319-327, 488-490` (`costTargetRows` 798)
**Issue:** 예수금 · 비용률은 서버의 **계좌** 값이다(gh-trade: 같은 서버 그 account_no 의 모든 유저 행). 그런데 대상 서버 집합은 `store.intent(dmaUserId)` 곧 **그 DMA 유저**의 active 행에서만 고른다. 예를 들어 공유 계좌(`findSharedAccountHolders` 대상)를 유저 A 는 KB120 · KB121 에, 유저 B 는 KB120 에만 등록했다고 하자. B 카드에서 저장하면 KB120 만 바뀌고 KB121 은 옛 값으로 남는다. B 카드는 자기 등록 서버만 비교하므로 불일치 줄도 뜨지 않는다. `#reloadCosts` 의 출처 후보도 같은 유저 행으로 제한된다. 그래서 다른 유저가 이미 값을 맞춰 둔 서버를 출처로 쓰지 못한다. IP/MAC 편집에는 `sharedAccountNote` 경고가 있지만 비용 행에는 그런 안내가 없다.
**Fix:** 대상 서버를 「그 (증권사, 정규화 계좌)를 active 로 가진 **모든** DMA 유저의 등록 서버 합집합」으로 넓힌다. 의도 저장소에 계좌 기준 조회를 추가하면 된다. 넓히지 않을 거라면 비용 행에도 `sharedAccountNote` 와 같은 「함께 쓰는 사용자 … — 그 사용자 등록 서버에는 반영되지 않아요」 경고 줄을 띄운다.

### WR-05: `/me` 계좌 패널만 `priceOf` 가 없어 주문가능이 작업대 · 수동주문과 다른 값이 된다

**File:** `webapp/src/components/trading/me-client.tsx:519-527`, `webapp/src/components/orderbook/account-panel.tsx:1714-1726`
**Issue:** `BudgetSummaryLine` 은 `availableKrwOf(account, priceOf)` 를 부른다. 그런데 `/me` 잔고 탭의 `<AccountPanel>` 에는 `priceOf` 가 넘어오지 않는다. 그래서 시장가(price 0) 매수 미체결이 있으면 `/me` 는 그 금액을 **0** 으로 센다. 같은 계좌의 작업대 패널 · 수동주문 「주문가능」 은 `holdingQuotePrice`(KRX → NXT)로 센다. 결국 한 계좌에 「주문가능」 숫자가 두 개 보인다. D-11 「계산 한 벌」 계약 위반이다. 같은 이유로 `/me` 잔고 평가에서도 같은 종목 외 현재가가 빠진다.
**Fix:** `/me` 도 같은 규칙을 주입한다.
```tsx
const { quotes } = useRelayContext();
const priceOf = useCallback((isin: string) => holdingQuotePrice(quotes, isin), [quotes]);
<AccountPanel ... priceOf={priceOf} />
```

## Info

### IN-01: 계좌별 손익 묶음 키가 증권사를 무시한다

**File:** `supabase/migrations/20261028210100_dma_pnl_rpcs.sql:65, 147`
**Issue:** `'account'` 모드 `gkey = j.account_no` 다. KB 계좌와 교보 계좌의 번호가 같으면 두 계좌가 한 묶음으로 합쳐진다. 그 묶음은 KB 로 정렬되고 배지도 KB 다. `account_name` 조회(`ua.account_no = t.gkey`)도 증권사 구분 없이 `max(name)` 을 고른다. 가능성은 낮지만 생기면 손익이 섞인다.
**Fix:** 키를 `broker || ':' || account_no`(broker = gateway 접두 파생)로 두거나, 이름 조회에 broker 조건을 더한다.

### IN-02: 체결 뒤에는 다중 등록 계좌에 예수금 불일치 줄이 늘 뜬다

**File:** `packages/shared/src/order-endpoint.ts:488-497`(`summarizeAccountCosts`) · `webapp/src/components/admin/account-editor.tsx:518-522`
**Issue:** 체결 조정은 주문 서버에서만 일어난다. 그래서 같은 계좌를 등록한 다른 서버의 87 예수금은 첫 체결부터 어긋나고, 「저장하면 등록 서버가 모두 같아져요」 줄이 상시 뜬다. `budgetMismatched` 때문에 「변경 없음」 판정도 우회된다. D-03 의 의도된 결과일 수 있다. 다만 경고 피로로 이어질 수 있으니 의도인지 확인이 필요하다.
**Fix:** 의도라면 문구에 「비주문 서버는 체결 조정이 없어요」 같은 원인을 더하거나, 비교를 「주문 서버 vs 나머지」 가 아니라 87(설정값) 끼리만 하는 방안을 검토한다.

### IN-03: 「변경 없음」 칩을 값을 모르는 서버에도 붙인다

**File:** `webapp/src/components/admin/account-editor.tsx:322-325`(`markUnchanged`)
**Issue:** `markUnchanged` 는 `active` 전체에 「<키> · 변경 없음」 칩을 단다. 그런데 `account.costs[k] == null`(87 미수신 · 「확인 전」)인 서버도 확인 없이 「변경 없음」 으로 표시된다.
**Fix:** 값을 모르는 서버는 `idleChips` 의 「확인 전」 칩을 그대로 둔다.

### IN-04: 매수 미체결 정정 시 주문가능 초과 경고가 중복 차감으로 과하게 뜬다

**File:** `webapp/src/components/trading/card/manual-order-form.tsx:431-434` · `webapp/src/components/trading/limit-chaser-form.tsx:1963-1964`
**Issue:** 선택한 매수 미체결을 정정할 때 `orderKrw` 를 `availableKrw` 와 비교한다. 그런데 `availableKrw` 는 그 미체결을 이미 빼고 셈한 값이라 같은 금액이 두 번 잡힌다. 상따도 마찬가지다. 무장된 전략의 선매수 주문이 미체결(또는 체결 잔고)로 이미 빠졌는데 `lcSumKrw` 에 또 더한다. WinForms D-19 동형 스펙이라 의도일 수 있다(비차단 경고).
**Fix:** 정정이면 `availableKrw + 선택 미체결 금액` 과 비교한다. 상따는 스펙 확인 뒤 결정한다.

### IN-05: `setAccountCost` 의 쓰지 않는 인자 · 떨어진 JSDoc

**File:** `relay/src/admin/dispatcher.ts:319, 783-789`
**Issue:** `void opts.adminEmail;` 은 쓰이지 않는 인자를 억지로 소비하는 줄이다. 또 `costTargetRows` 의 JSDoc 이 `costCommand` 위에 붙어 있어, 한 함수 위에 JSDoc 두 개가 겹쳐 있다.
**Fix:** `adminEmail` 을 시그니처에서 빼거나 감사 로그에 쓴다. JSDoc 은 `costTargetRows` 바로 위로 옮긴다.

### IN-06: 되싣기 op 6/7 이 reconcile 마감(10초) 안에서 순차로 돈다

**File:** `relay/src/admin/dispatcher.ts:454-456, 515-528`
**Issue:** 새 계좌마다 op 6 · op 7 을 각각 최대 5초 타임아웃으로 차례로 기다린다. 계좌를 여러 개 추가하는 reconcile 은 계좌 추가 자체가 성공했어도 `timeout` 으로 접혀 응답될 수 있다. 실제 결과는 뒤에 다시 기록된다.
**Fix:** 되싣기를 서버 결과를 확정한 뒤 `void` 로 떼어 내거나(fire-and-forget + warn), 마감 잔여 시간이 짧으면 건너뛴다.

---

_Reviewed: 2026-10-28T01:33:05Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
