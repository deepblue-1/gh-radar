---
phase: 44-admin-settlement
reviewed: 2026-11-21T02:30:00Z
depth: standard
files_reviewed: 53
files_reviewed_list:
  - packages/shared/src/__tests__/settlement-reflect.test.ts
  - packages/shared/src/__tests__/settlement.test.ts
  - packages/shared/src/admin.ts
  - packages/shared/src/index.ts
  - packages/shared/src/settlement.ts
  - server/src/app.ts
  - server/src/routes/admin-accounts.ts
  - server/src/routes/admin-settlement.ts
  - server/src/routes/admin.ts
  - server/src/schemas/settlement.ts
  - server/src/services/settlement-budget.ts
  - server/tests/routes/admin-settlement-ledger.test.ts
  - server/tests/routes/admin-settlement-settle.test.ts
  - server/tests/routes/admin-settlement.test.ts
  - supabase/migrations/20261120100000_settlement.sql
  - supabase/migrations/20261120110000_settlement_ledger_rpc.sql
  - supabase/migrations/20261120120000_settlement_settle_rpc.sql
  - supabase/migrations/20261120130000_settlement_seed.sql
  - supabase/tests/settlement.test.sql
  - supabase/tests/settlement_seed.test.sql
  - webapp/e2e/fixtures/settlement.ts
  - webapp/e2e/specs/admin-settlement.spec.ts
  - webapp/src/app/admin/settlement/page.tsx
  - webapp/src/components/admin/__tests__/account-linked-summary.test.ts
  - webapp/src/components/layout/__tests__/app-sidebar.test.tsx
  - webapp/src/components/layout/app-sidebar.tsx
  - webapp/src/components/settlement/__tests__/activity-card.test.tsx
  - webapp/src/components/settlement/__tests__/ledger-sheet.test.tsx
  - webapp/src/components/settlement/__tests__/name-vs-transfer.test.tsx
  - webapp/src/components/settlement/__tests__/open-pools-card.test.tsx
  - webapp/src/components/settlement/__tests__/person-cards.test.tsx
  - webapp/src/components/settlement/__tests__/reflect-box.test.tsx
  - webapp/src/components/settlement/__tests__/settle-confirm.test.tsx
  - webapp/src/components/settlement/__tests__/settle-sheet.test.tsx
  - webapp/src/components/settlement/__tests__/settlement-client-ledger.test.tsx
  - webapp/src/components/settlement/__tests__/settlement-client-settle.test.tsx
  - webapp/src/components/settlement/__tests__/settlement-client.test.tsx
  - webapp/src/components/settlement/account-table.tsx
  - webapp/src/components/settlement/activity-card.tsx
  - webapp/src/components/settlement/ledger-row.tsx
  - webapp/src/components/settlement/ledger-sheet.tsx
  - webapp/src/components/settlement/name-vs-card.tsx
  - webapp/src/components/settlement/open-pools-card.tsx
  - webapp/src/components/settlement/person-cards.tsx
  - webapp/src/components/settlement/reflect-box.tsx
  - webapp/src/components/settlement/settle-confirm.tsx
  - webapp/src/components/settlement/settle-row.tsx
  - webapp/src/components/settlement/settle-sheet.tsx
  - webapp/src/components/settlement/settlement-client.tsx
  - webapp/src/components/settlement/settlement-format.ts
  - webapp/src/components/settlement/transfer-card.tsx
  - webapp/src/lib/admin-api.ts
  - webapp/src/styles/globals.css
findings:
  critical: 1
  warning: 2
  info: 8
  total: 11
  necessity: 1
status: issues_found
---

# Phase 44: 코드 리뷰 보고서

**리뷰 시각:** 2026-11-21T02:30:00Z
**깊이:** standard
**리뷰한 파일:** 53
**상태:** issues_found

## Summary

Phase 44 어드민 정산(`/admin/settlement`)의 shared 계산 · server 라우트 · 예수금 반영 서비스 · 마이그레이션 4개 · webapp 화면 · 테스트를 standard 깊이로 읽었다. 기존 파일 8개(`app.ts` · `admin.ts` · `admin-accounts.ts` · shared `admin.ts` · `index.ts` · `admin-api.ts` · `app-sidebar.tsx` · `globals.css`)는 `a459e845..HEAD` diff 만 봤다. diff 범위에 함께 걸린 `me-client.tsx` · `auth-context.tsx` · `router-transition.ts` · `launch-plan-editor.tsx` 는 리뷰 대상 목록 밖이라 보지 않았다. 테스트 파일은 신뢰성 문제(건너뛴 테스트 · 실제 시계 의존 단언)만 훑었고, 장중 줄 단언은 `marketHours` 를 직접 넘기거나 `vi.setSystemTime` 으로 시계를 고정해 흔들리지 않는다.

확인한 것 중 깨끗한 부분:
- 새 표 5개와 함수 9개 모두 `REVOKE … FROM PUBLIC` + `FROM anon, authenticated` + `GRANT service_role` 이고, RLS 는 켜져 있고 정책은 없다(메모리 규칙과 같다). 라우터 관문 `use("/settlement", requireAuth(), requireAdmin())` 은 `adminRouter` 앞에 붙어 있어 비관리자 접근 길이 없다.
- D-29(심쥬니 × 현중 · 근형 묶음 출자 · 원금 회수)는 zod · RPC · 표 CHECK 세 곳에서 모두 막힌다.
- 정산 확정 · 취소는 묶음 advisory lock 안에서 `STALE_SETTLE` · `NOT_LATEST` 를 다시 본다.
- shared 계산(`ledgerFlows` · `principalCaps` 의 반반 · `personSummary` 손실 · `nameVs` · `hgSum`)으로 CONTEXT 검산값(+10억 4,900만 · −2,800만 · 「김현중 → 정근형 5,950만」 · 4억 1건 / 7억 4건 / 법인 용역 3억)을 다시 계산해 보면 그대로 나온다.
- 고치기 반영 모델(`pend.deltaKrw` 에 차이를 남기고 `appliedEffect = 효과 − pend`)을 계좌 옮김의 받는 계좌를 바꾸는 경우까지 따라가 봤는데 맞다.

핵심 문제는 하나다. 「보냈는데 응답만 못 받은(timeout) 반영」 을 걸러내는 Pitfall 2 장치가 「다시 반영」 경로에만 있다. 거래 고치기 · 지우기 · 정산 취소는 `pend` 가 남은 계좌를 무조건 「안 들어감」 으로 보고 계산한다. 그래서 매매 서버 예수금에 같은 금액이 두 번 들어가거나 되돌려지지 않을 수 있다(CR-01).

`necessity-review.md` 는 읽었고 기준대로 분류했다(necessity 1건). 보안 위협 모델링은 프로젝트 방침(보안검사 안 함)에 따라 하지 않았다. 권한 · grant 는 위처럼 직접 확인했다.

## Critical Issues

### CR-01: 「다시 반영」 을 거치지 않은 고치기 · 지우기 · 정산 취소에서 예수금이 두 번 들어가거나 되돌려지지 않는다

**File:** `packages/shared/src/settlement.ts:843-854` · `server/src/routes/admin-settlement.ts:258-262`(고치기) · `:347-352`(지우기) · `:528-532`(정산 취소) · `server/src/services/settlement-budget.ts:216-225`(유일한 가드) · `webapp/src/components/settlement/ledger-row.tsx:175`
**Issue:** op 6 는 「예수금을 얼마로 정해라」 뿐이다. 그래서 timeout 은 「들어갔는지 모름」 이고(Pitfall 2), 설계는 `pend[acc].targetKrw` 를 남겨 「지금 값 = 목표값이면 실제로 들어간 것」 으로 판정하기로 했다. 그런데 이 대조는 `retryPend` 에만 있다. `appliedEffect` 는 `pend` 에 있는 증감을 조건 없이 「안 들어감」 으로 뺀다. 같은 상태가 생기는 길은 둘이다.
1. relay 가 `outcome: "timeout"` 으로 답했지만 op 6 는 실제로 적용된 경우. `AdminOutcome` 에 `timeout` 이 있어서 실제로 일어날 수 있다.
2. 저장 RPC 가 「보낼 모든 계좌」 를 `reason: "failed"` 로 먼저 적은 뒤(`planPend` · `settlement-budget.ts:137-141`) relay 반영은 성공했는데, 뒤이은 `settlement_set_pend` 만 실패한 경우. `recordPend` 는 경고 로그만 남기고 넘어간다(`admin-settlement.ts:139-158`).

두 경우 모두 줄에는 「예수금 미반영」 이 붙어 있고, 줄 펼침에는 「고치기」 · 「지우기」 가 그대로 나온다(`canEdit` 가 `hasPend` 를 보지 않는다).
- **고치기(반영 켬):** `effectDiff(appliedEffect(old), reflectEffect(new))` 가 이미 들어간 증감을 다시 보낸다. 메모만 고쳐도 그렇다. 예: +4억 출자가 두 번 들어간다.
- **지우기 · 정산 취소(반영 켬):** `appliedEffect` 가 그 계좌를 빼므로 되돌리지 않는다. 그 계좌만 걸린 거래면 확인 창에 ⑩ 상자조차 나오지 않는다(`settlement-client.tsx:438`). 그러면 거래 줄은 사라지고 예수금에는 그 거래 금액이 그대로 남는다.

매매 서버의 예수금은 주문 가능 금액의 기준이다. 그래서 정산 화면 숫자만 어긋나는 데서 끝나지 않고, 실제 계좌에 없는 돈을 있는 것으로 보고 주문할 수 있다.
**Fix:** `retryPend` 의 목표값 대조를 한 함수로 빼서, 고치기 · 지우기 · 취소가 `appliedEffect` 를 부르기 전에 쓴다. 이번 요청에서 읽은 값과 목표값이 같은 계좌는 「들어감」 으로 보고 `pend` 에서 뺀다.

```ts
// settlement-budget.ts
export function settlePendByTarget(read: SettlementRead, row: SettlementLedgerRow): SettlementLedgerRow {
  const pend: SettlementPend = {};
  for (const acc of pendAccKeys(row.pend)) {
    const e = row.pend[acc]!;
    const now = read.reads.find((r) => r.accKey === acc)?.budgetKrw;
    if (now !== undefined && e.targetKrw !== null && now === e.targetKrw) continue; // 실제로 들어감
    pend[acc] = e;
  }
  return { ...row, pend };
}
// admin-settlement.ts — 고치기 · 지우기 · 취소에서 appliedEffect(old) 대신 appliedEffect(settlePendByTarget(read, old))
```

더 단순한 대안도 있다. `pend` 가 남은 줄은 「다시 반영」 이 끝날 때까지 고치기 · 지우기(반영 켬)를 409 로 막고, 화면은 `hasPend` 일 때 두 단추 대신 「먼저 다시 반영해 주세요」 를 보인다. 반영 끔 고치기도 함께 막는다 — 반영 끔 저장은 `pend={}` 로 덮어 「들어갔을 수도 있다」 는 유일한 흔적을 지운다(IN-04 참조). 반영 끔 지우기는 예수금을 건드리지 않으니 그대로 둔다.

## Warnings

### WR-01: 거래 시트의 「오늘」 이 마지막으로 불러온 시각에 고정돼, 자정을 넘긴 탭에서는 오늘 날짜를 저장할 수 없다

**File:** `webapp/src/components/settlement/ledger-sheet.tsx:188` · `:144` · `:194` · `:416` · `webapp/src/components/settlement/settlement-client.tsx:340`
**Issue:** `today = kstDateIso(new Date(nowIso))` 이고, `nowIso` 는 마지막 `GET` 응답의 `now` 다. 「정산하기」 는 열 때 `reload()` 하지만(`settlement-client.tsx:258-261`) 「거래 기록」 은 다시 읽지 않는다(`:340`). 저녁에 열어 둔 탭에서 다음 날 아침 거래를 적으면 이렇게 된다.
- 날짜 칸의 처음 값이 어제다. 그런데 어제를 「오늘」 로 보므로 「예수금에도 반영」 이 켜진 채 열린다. 사용자가 못 보고 저장하면, 지난 날짜 거래를 반영한 기록이 남는다.
- 실제 오늘 날짜를 고르면 `max={today}` 에 막히고, 직접 입력해도 `validate` 가 「미래 날짜는 적을 수 없어요」 로 막는다. server 는 받아 줄 값이다.

같은 시트가 장중 판정에는 실제 시계(`isSettlementMarketHours(new Date())` · `:446`)를 쓴다. 시계가 둘이다.
**Fix:** 시트를 열 때 그 시각의 KST 날짜를 쓴다. 예: `const today = kstDateIso(new Date())` 를 `session` 이 바뀔 때만 다시 계산한다. 아니면 「정산하기」 처럼 `setLedgerSheet({ open: true, … })` 와 함께 `void reload()` 해서 `nowIso` 를 새로 받는다.

### WR-02: Generality without instantiation — `AccountTable` 의 `labels` prop 을 넘기는 곳이 없다

**File:** `webapp/src/components/settlement/account-table.tsx:36` · `:51-52`
**Category:** necessity
**Issue:** `labels?: Partial<Record<SettlementAccKey, string>>`(계좌 이름 바꿔 쓰기)를 넘기는 호출부가 하나도 없다. `rg "labels=" webapp/src/components/settlement` · 테스트 · e2e 모두 0건이다. 세 호출부(`open-pools-card.tsx:139` · `settle-sheet.tsx:270` · `settle-row.tsx:127`)는 모두 shared 라벨을 그대로 쓴다. 이 prop 은 쓰는 곳 없는 분기 하나만 만든다.
**Fix:** `labels` prop 과 `labelOf` 의 `labels?.[acc] ??` 분기를 지우고 `defaultLabel(acc)` 를 바로 쓴다.

## Info

### IN-01: 지우기 · 정산 취소는 되돌릴 증감을 보내기 전에 남기지 않는다(저장 경로와 다름)

**File:** `server/src/routes/admin-settlement.ts:355-358` · `:535-551`
**Issue:** 저장 · 고치기 · 확정은 RPC 에 목표값 `pend` 를 먼저 싣는다. server 가 보내기 전에 죽어도 흔적이 남게 하려는 것이다. 지우기 · 취소는 RPC 커밋 → relay 보내기 → (실패한 것만) `recordPend` 순서라, RPC 커밋과 보내기 사이에 인스턴스가 내려가면 되돌려야 할 증감이 어디에도 남지 않는다. 드문 경우이고, D-02 전제(예수금을 실계좌에 맞춰 고침)로 나중에 바로잡힌다.
**Fix:** 지우기 · 취소 RPC 에 `p_pend`(되돌릴 증감 · 목표값)를 받는 인자를 더해 지움 표시와 같은 트랜잭션에서 기록하고, 보낸 뒤 `settlement_set_pend` 로 남은 것만 덮는다.

### IN-02: 쥬니 묶음 「원금 4억까지 … 남음」 문구가 0 일 때와 지난 정산이 있을 때 사실과 다르다

**File:** `webapp/src/components/settlement/open-pools-card.tsx:155-158` · `server/src/routes/admin-settlement.ts:187-189` · `webapp/src/components/settlement/settle-sheet.tsx:189`
**Issue:**
- 정산 시트는 `carryKrw === 0` 이면 「나눌 수익이 없습니다.」 로 바꾸기로 했다(44-11 결정). 그런데 카드 l3 와 server `CANNOT_SETTLE` 문장은 그대로 「원금 4억까지 0만 남음」 이다.
- `−open` 은 「마지막 정산 뒤 수준」 까지 남은 금액이다(`open = cum − settledSum`). 쥬니 묶음을 한 번이라도 정산한 뒤 손실이 나면, 계좌가 원금보다 위에 있어도 「원금 4억까지 X 남음」 이 나온다.
- 심쥬니 원금 회수나 추가 출자로 원금이 4억이 아니게 되어도 `baseKrw` 고정값 「4억」 이 그대로 나온다.
**Fix:** 0 이면 세 곳 모두 「나눌 수익이 없습니다」 로 맞춘다. 이월 문장은 `prevKrw > 0` 이면 「지난 정산 수준까지 X 남음」 처럼 기준을 바꾸거나, 원금 표기를 `principalCaps(ledger).p2` 합으로 계산한다.

### IN-03: 음수 예수금 하나가 읽은 값 기록 전체를 실패시키고, 화면에는 「미설정」 으로 보인다

**File:** `supabase/migrations/20261120100000_settlement.sql:56` · `packages/shared/src/settlement.ts:374-376`
**Issue:** `settlement_budget_reads.budget_krw CHECK (>= 0)` 이다. `settlement_record_reads` 는 한 문장으로 upsert 하므로, 한 계좌라도 음수면 23514 가 나서 네 계좌 기록이 모두 버려진다. 실패는 경고 로그 한 줄로만 남는다. 또 `buildSettlementAccounts` 는 known 인 음수를 「미설정」(unset)으로 바꿔, 실제 손실 상태를 「설정 안 됨」 으로 보이게 한다. 매매 서버 예수금이 음수가 될 수 있는지는 저장소에서 증명되지 않는다(실현손익으로 조정된다는 D-28 기준이면 이론상 가능하다).
**Fix:** CHECK 를 없애거나, 기록 전에 음수를 걸러 그 계좌만 빼고 경고한다. 화면은 `pick.budgetKrw < 0` 을 unset 과 따로 다룬다.

### IN-04: 반영했던 거래를 「예수금에도 반영」 을 끄고 고치면, 예수금에 들어간 증감의 기록이 사라진다

**File:** `server/src/routes/admin-settlement.ts:245-250` · `supabase/migrations/20261120110000_settlement_ledger_rpc.sql:124-125`
**Issue:** 반영 끔 저장은 `reflect=false · pend={}` 로 덮는다. 옛 증감은 예수금에 그대로 남아 있는데, 줄은 「그대로 둠」 이 되고 나중에 지울 때 되돌릴 것이 없다. 목업 `a-real.html:676` 과 같은 동작이라 결함은 아니지만, 되돌릴 수 없는 정보 손실이다. 이력은 `settlement_ledger_history.before` 에만 남는다.
**Fix:** 그대로 두려면 고치기 시트에서 반영했던 거래의 스위치를 끌 때 「이전 반영분은 예수금에 그대로 남아요」 한 줄을 보인다.

### IN-05: 쓰기 요청에 멱등 키가 없고, 같은 계좌 동시 반영은 읽고-고치고-쓰기 경합이다

**File:** `server/src/services/settlement-budget.ts:118-127` · `webapp/src/lib/admin-api.ts:356-396`
**Issue:**
- server 가 커밋한 뒤 응답이 브라우저에 닿지 못하면(네트워크 끊김 · 40초 시간 초과) 화면은 「저장하지 못했어요」 를 보인다. 사용자가 다시 누르면 같은 거래가 한 줄 더 생기고 예수금도 한 번 더 바뀐다.
- 두 관리자(또는 두 탭)가 같은 계좌를 동시에 반영하면, 둘 다 같은 「지금 값」 을 읽고 각자의 절댓값을 보내 한쪽 증감이 사라진다. 관리자가 1명이면 생기기 어렵다.
**Fix:** 요청마다 클라이언트 생성 UUID 를 싣고 RPC 에서 유니크 제약으로 중복 저장을 거른다. 동시 반영은 계좌별 advisory lock(`settlement_budget:<acc>`)을 읽기 ~ 보내기 동안 잡거나, 관리자 1명 전제를 문서에 적는다.

### IN-06: `settlementBudgetOf` 의 `as unknown as` 캐스트가 계좌 메뉴 입력 모양 검사를 끈다

**File:** `packages/shared/src/settlement.ts:317-322`
**Issue:** `summarizeAccountCosts` 가 지금 읽는 필드는 `servers[].serverKey/state` · `orderServer` · `defaultOrderServer` · `costs` 뿐이라 동작은 맞다. 하지만 `AdminAccountView` 에 필드가 늘거나 `registeredServersOf` 가 다른 필드를 읽기 시작하면 컴파일러가 알려 주지 않는다. D-03 은 「계좌 메뉴와 같은 판정」 이 핵심이라 두 판정이 몰래 갈라질 수 있다.
**Fix:** `SummarizeAccountCostsInput["account"]` 를 `Pick` 으로 좁힌 타입(이미 `Pick<AdminAccountView, "servers" | "orderServer" | "defaultOrderServer" | "costs">`)에 맞는 값을 만든다. `servers` 원소 타입이 다르면 shared 쪽 입력 타입을 필요한 필드만 받도록 줄인다.

### IN-07: `SETTLEMENT_WRITE_TIMEOUT_MS` 주석이 실제 보내기 순서와 다르다

**File:** `webapp/src/lib/admin-api.ts:340`
**Issue:** 주석은 「계좌 옮김은 두 계좌를 차례로 보낸다」 인데, server 는 Pitfall 3 대로 **병렬**로 보낸다(`settlement-budget.ts:67` · `:144`). 40초 상한 근거가 틀린 전제에 기대고 있다(병렬이면 최악 약 20초).
**Fix:** 주석을 「두 계좌를 병렬로 — relay 쓰기 상한 15초 + 읽기 2초 + DB 여유」 로 고친다.

### IN-08: 미리 보기는 못 읽은(stale) 계좌도 바뀔 값으로 보이지만, server 는 그 계좌를 보내지 않는다

**File:** `webapp/src/components/settlement/reflect-box.tsx:57-59` · `server/src/services/settlement-budget.ts:118-123`
**Issue:** `reflectPreviewLines` 는 `accounts.budgetKrw`(stale 이면 마지막으로 읽은 값)로 「KB 정근형 예수금 8억 4,500만 → 7억 4,500만」 을 보인다. server `planReflect` 는 이번 요청에서 읽은 값(`read.reads`)만 쓰므로 그 계좌는 `unreachable` 미반영이 된다. 저장 · 확정은 끝난 뒤 「예수금 미반영」 칩으로 드러나지만, 저장 전 미리 보기는 보낼 것처럼 약속한다.
**Fix:** `state === "stale"` 인 계좌 줄은 「… — 매매 서버에서 못 읽어 지금은 보내지 못해요」(경고 색)로 바꾼다.

---

_리뷰 시각: 2026-11-21T02:30:00Z_
_리뷰어: Claude (gsd-code-reviewer)_
_깊이: standard_
