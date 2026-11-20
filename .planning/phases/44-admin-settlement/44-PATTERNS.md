# Phase 44: 어드민 정산 - Pattern Map

**Mapped:** 2026-11-20
**Files analyzed:** 27 (새 22 · 고침 5)
**Analogs found:** 26 / 27

## File Classification

| 새/고칠 파일 | 역할 | 데이터 흐름 | 가장 가까운 기존 파일 | 일치 |
|---|---|---|---|---|
| `packages/shared/src/settlement.ts` (새) | utility | transform | `packages/shared/src/account-budget.ts` | exact |
| `packages/shared/src/__tests__/settlement.test.ts` (새) | test | transform | `packages/shared/src/__tests__/account-budget.test.ts` | exact |
| `packages/shared/src/index.ts` (고침) | config | - | 같은 파일 끝 `export * from "./etp";` | exact |
| `packages/shared/src/admin.ts` (고침 · `accountCostOf` · `indexAccountCosts` export) | utility | transform | 자기 자신 :835 · :851-858 | exact |
| `server/src/routes/admin-settlement.ts` (새) | route | request-response (CRUD + relay 팬아웃) | `server/src/routes/admin-pnl.ts`(읽기) + `server/src/routes/admin-accounts.ts`(쓰기) | exact |
| `server/src/services/settlement-budget.ts` (새) | service | request-response (relay) | `server/src/routes/admin-accounts.ts` `fanoutOne` :123-147 · `server/src/routes/admin.ts` `fetchAccountCosts` :286 | role-match |
| `server/src/schemas/settlement.ts` (새) | schema | validation | `server/src/schemas/pnl.ts` (`AdminPnlQuery`) | exact |
| `server/src/routes/admin-accounts.ts` (고침 · `fanoutOne` · `fanoutAudit` export 또는 services 로 이동) | route | - | 자기 자신 | exact |
| `server/src/routes/admin.ts` (고침 · `fetchAccountCosts` 등 export) | route | - | 자기 자신 :286 · :301 · :327 | exact |
| `server/src/app.ts` (고침 · 마운트) | config | - | 같은 파일 :163-167 | exact |
| `server/tests/routes/admin-settlement.test.ts` (새) | test | request-response | `server/tests/routes/admin-pnl.test.ts` · `admin-accounts.test.ts` | exact |
| `supabase/migrations/2026112XXXXXXX_settlement.sql` (새 · 표 5 · RPC 7 · 시드) | migration | CRUD | `supabase/migrations/20261106300000_dma_accounts_master.sql` | exact |
| `supabase/tests/settlement.test.sql` (새) | test | CRUD | `supabase/tests/dart_alert.test.sql` | exact |
| `webapp/src/app/admin/settlement/page.tsx` (새) | page | - | `webapp/src/app/admin/pnl/page.tsx` | exact |
| `webapp/src/components/settlement/settlement-client.tsx` (새) | component | request-response | `webapp/src/components/pnl/pnl-admin-client.tsx` · `webapp/src/components/admin/accounts-client.tsx` | role-match |
| `components/settlement/person-cards.tsx` · `open-pools-card.tsx` · `account-table.tsx` · `name-vs-card.tsx` · `transfer-card.tsx` (새) | component | 표시 | `webapp/src/components/pnl/pnl-report.tsx` (`CARD_FACE`) | role-match |
| `components/settlement/activity-card.tsx` · `settle-row.tsx` · `ledger-row.tsx` (새) | component | 표시 + 펼침 | `webapp/src/components/admin/role-segment.tsx` (세그먼트) · `user-row.tsx` | role-match |
| `components/settlement/ledger-sheet.tsx` · `settle-sheet.tsx` (새) | component | 폼 쓰기 | `webapp/src/components/admin/account-master-sheet.tsx` + `admin-sheet.tsx` | exact |
| `components/settlement/settle-confirm.tsx` (새) | component | 확인 | `webapp/src/components/admin/user-sheet.tsx` `ConfirmDialog`(415 행부터) | exact |
| `components/settlement/reflect-box.tsx` (새) | component | 토글 + 미리보기 | `webapp/src/components/trading/.../setting-group.tsx` `GroupSwitch`(712 행부터) · `reflect-chip.tsx` | role-match |
| `components/settlement/__tests__/*.test.tsx` (새) | test | - | `webapp/src/components/admin/__tests__/` | exact |
| `webapp/src/lib/admin-api.ts` (고침 · `fetchSettlement` · `saveSettlementLedger` …) | api client | request-response | 같은 파일 `setAdminAccountBudget` :287-297 | exact |
| `webapp/src/components/layout/app-sidebar.tsx` + `__tests__/app-sidebar.test.tsx` (고침) | component | - | 같은 파일 `NAV_ADMIN_PNL` :200 · :768-771 | exact |
| `webapp/e2e/specs/admin-settlement.spec.ts` (새) | e2e | - | `webapp/e2e/specs/admin-pnl.spec.ts` | exact |
| `webapp/e2e/fixtures/settlement.ts` (새) | e2e fixture | - | `webapp/e2e/fixtures/pnl.ts`(`mockPnlApi`) · `fixtures/admin.ts` | exact |
| shared 「첫 known 사용자」 함수 (`settlementBudgetOf` 가칭) | utility | transform | `webapp/src/components/admin/account-linked-summary.ts` `summarizeLinkedCosts` :92-135 | exact(옮기기/재현) |

## Pattern Assignments

### `server/src/routes/admin-settlement.ts` (route, request-response)

**Analog:** `server/src/routes/admin-pnl.ts` (1 ~ 44)

임포트 · 경로 한정 관문 · 읽기 핸들러:
```ts
import { Router, type Router as RouterT } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAuth } from "../middleware/require-auth.js";
import { requireAdmin } from "../middleware/require-admin.js";
import { ValidationFailed } from "../errors.js";

export const adminPnlRouter: RouterT = Router();
// 관문은 /pnl 경로에만 — adminRouter 의 전역 관문과 겹치면 역할 조회 왕복 +1
adminPnlRouter.use("/pnl", requireAuth(), requireAdmin());

adminPnlRouter.get("/pnl", async (req, res, next) => {
  try {
    const parsed = AdminPnlQuery.safeParse(req.query);
    ...
    const supabase = req.app.locals.supabase as SupabaseClient;
    res.json(await getAdminPnl(supabase, parsed.data.group, parsed.data.range));
  } catch (e) {
    next(e);
  }
});
```
→ 정산은 `adminSettlementRouter.use("/settlement", requireAuth(), requireAdmin());`. 파일 머리 주석의 「방어선」 블록(T-15-03 · RPC service_role 전용 · `next(e)`)도 같은 꼴로 단다.

**쓰기 핸들러 Analog:** `server/src/routes/admin-accounts.ts` :243-263 (예수금 팬아웃)
```ts
import { DbError, audit, parseOrThrow, relayResults } from "./admin.js";
...
const { budgetKrw } = parseOrThrow(AdminAccountBudgetSchema, req.body ?? {});
const supabase = req.app.locals.supabase as SupabaseClient;
const users = await activeLinkUsers(supabase, broker, accountNo);
const relay = req.app.locals.relayAdmin as RelayAdminClient | undefined;
const fanout = await Promise.all(
  users.map((dma) =>
    fanoutOne(relay, dma, "account-budget", (r) =>
      r.setAccountBudget(dma, broker, accountNo, { budgetKrw }, req.adminEmail!),
    ),
  ),
);
audit(req, "account-budget", broker, { budgetKrw, users: users.length, fanout: fanoutAudit(fanout) });
res.json({ ok: true, fanout });
```
RESEARCH 지시대로 `activeLinkUsers` 대신 RPC 가 돌려준 링크 사용자를 쓴다(왕복 절약). RPC 오류는 `throw DbError("…에 실패했습니다.", error)`.

### `server/src/services/settlement-budget.ts` (service)

**Analog:** `admin-accounts.ts` `fanoutOne` :123-147 — relay 없음 → `RELAY_UNAVAILABLE`, `ApiError` → 그 code, 그 밖 → `RELAY_FAILED` 로 항목 `error` 에 접는다(전체 실패로 만들지 않음). 읽기는 `admin.ts:286` `fetchAccountCosts`(실패 → null, `relay.accountCosts(adminEmail)` 타임아웃 2,000ms) 를 export 해 재사용. 값 선택은 shared `accountCostOf`(live 우선 · snapshot 대체) + 「DMA id 오름차순 첫 known 사용자」 규칙(`account-linked-summary.ts:92-135`).

### `server/src/app.ts` (마운트)

**Analog:** 같은 파일 :163-167
```ts
// Phase 36 D-17 — 매매손익 어드민도 경로 한정 관문(/pnl)이라 adminRouter 앞.
app.use("/api/admin", adminPnlRouter);
app.use("/api/admin", adminAccountsRouter);
app.use("/api/admin", adminRouter);
```
→ `adminSettlementRouter` 를 `adminRouter` 앞에 추가(주석 꼴 동일).

### `server/tests/routes/admin-settlement.test.ts`

**Analog:** `server/tests/routes/admin-pnl.test.ts` :1-50
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app";
import { ADMIN_TOKEN, TRADER_TOKEN, baseAppUsers, baseUsers, makeAdminSupabase,
  type AdminSupabaseOpts } from "../fixtures/admin-supabase";
type RpcHandler = NonNullable<AdminSupabaseOpts["rpc"]>[string];
const roleLookups = (rec) => rec.ops.filter((o) => o.table === "app_users" && o.kind === "select").length;
```
단언: 관문이 요청당 역할 조회 1회 · 입력 오류는 RPC 0회 · 팬아웃 항목 오류 접기. 가짜 relay(`accountCosts` · `setAccountBudget`)는 `admin-accounts.test.ts` 의 `makeFakeRelay` 사용.

### `supabase/migrations/2026112XXXXXXX_settlement.sql`

**Analog:** `20261106300000_dma_accounts_master.sql`
- 머리 주석 :19 「새 표 RLS on · 정책 없음 · service_role 전용. RPC 는 REVOKE PUBLIC, anon, authenticated 명시」 · :27 멱등(`IF NOT EXISTS` · `ON CONFLICT DO NOTHING` · `CREATE OR REPLACE`).
- 표 권한 :57-60
```sql
ALTER TABLE public.dma_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dma_accounts FROM PUBLIC;
REVOKE ALL ON public.dma_accounts FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dma_accounts TO service_role;
```
- RPC :114-118 · :153-155
```sql
CREATE OR REPLACE FUNCTION public.admin_accounts_raw()
... SECURITY DEFINER
REVOKE EXECUTE ON FUNCTION public.admin_accounts_raw() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_accounts_raw() FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.admin_accounts_raw() TO service_role;
```
쓰기 RPC 는 `dma_admin_create_account(p_account jsonb)` :159-181 꼴(jsonb 인자). 시드 9건은 `ON CONFLICT DO NOTHING`.

### `supabase/tests/settlement.test.sql`

**Analog:** `supabase/tests/dart_alert.test.sql` — 머리 주석에 「대상 · 잠그는 것(S 모양 · … · P 권한)」 목록, `BEGIN;` (:40) → `SELECT plan(N);` (:45) → … → `SELECT * FROM finish();` `ROLLBACK;` (:496-497). 권한 절은 RPC 마다 anon · authenticated EXECUTE 불가 · service_role 가능.
실행: `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/settlement.test.sql` (스크립트 :16 용례).

### `packages/shared/src/settlement.ts` + 테스트

**Analog:** `packages/shared/src/account-budget.ts` + `__tests__/account-budget.test.ts` — 테스트 머리에 「출처 · 경우 | 입력 | 기대」 표 주석을 두고 순수 함수 단언. index 재수출은 확장자 없이:
```ts
// --- Phase 44 어드민 정산 — 상수 · 계산 · 표기 한 벌(server · webapp 공용) ---
export * from "./settlement";
```
`admin.ts` 는 `accountCostOf` · `indexAccountCosts` 에 `export` 만 붙인다(`deriveAdminUsersOverview` 동작 불변 · `admin-overview.test.ts` 회귀).

### `webapp/src/app/admin/settlement/page.tsx`

**Analog:** `webapp/src/app/admin/pnl/page.tsx` 전체 (30 행)
```tsx
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AppShell } from '@/components/layout/app-shell';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { PnlAdminClient } from '@/components/pnl/pnl-admin-client';

export const metadata: Metadata = { title: '매매손익 · Admin' };

export default function AdminPnlPage() {
  return (
    <AppShell sidebar={<AppSidebar />}>
      <Suspense fallback={null}>
        <PnlAdminClient />
      </Suspense>
    </AppShell>
  );
}
```
→ 제목 「정산 · Admin」 · `SettlementClient`.

### `webapp/src/lib/admin-api.ts` (추가 함수)

**Analog:** :287-297
```ts
export function setAdminAccountBudget(broker, accountNo, budgetKrw): Promise<AdminAccountSaveResponse> {
  const body: AdminAccountBudgetBody = { budgetKrw };
  return authFetch<AdminAccountSaveResponse>(
    `${accountPath(broker, accountNo)}/budget`,
    jsonInit("PUT", body, { timeoutMs: RELAY_TIMEOUT_MS }),
  );
}
```
relay 반영이 끼는 쓰기는 `RELAY_TIMEOUT_MS`(20,000 · :59), 순수 조회는 `fetchAdminAccounts` :261 꼴.

### 시트 · 확인 · 반영 상자

- `ledger-sheet.tsx` · `settle-sheet.tsx`: `AdminSheet` (`admin-sheet.tsx:63` — props `open · onOpenChange · title · titleAside · description · children · footer`, 데스크톱 오른쪽 비모달 / 폰 아래 시트). 저장 상태는 `use-field-save.ts` (`useFieldSave` · `defaultSaveErrorText` :68 · `ADMIN_FIELD_FLASH_MS`).
- 반영 결과 꼬리표: `reflect-chip.tsx` `ReflectChip` · `reflectChipText` · `ADMIN_CHIP_BASE` · `ADMIN_BUTTON_PRIMARY/SECONDARY`.
- `settle-confirm.tsx`: `user-sheet.tsx` `ConfirmDialog`(415 ~) 클래스 복사 + `dark:bg-[var(--card)]` (UI-SPEC).
- `reflect-box.tsx`: Radix `Switch` 직접 — `GroupSwitch`(setting-group.tsx 712 ~) 기하 40×24 · thumb 20.
- 오류 문구: `accounts-client.tsx` `ADMIN_ACCOUNTS_TEXT` 의 `loadFailed` · `retry` · `forbidden`.

### `app-sidebar.tsx`

**Analog:** :200 `const NAV_ADMIN_PNL = { href: "/admin/pnl", label: "매매손익" } as const;` · :768-771 `href={NAV_ADMIN_PNL.href} label=… active={isActive(NAV_ADMIN_PNL.href)}` → 바로 다음에 `NAV_ADMIN_SETTLEMENT = { href: "/admin/settlement", label: "정산" }`. 테스트는 `__tests__/app-sidebar.test.tsx` 1511 ~ Admin 하위 단언에 항목 추가.

### `webapp/e2e/specs/admin-settlement.spec.ts` + `fixtures/settlement.ts`

**Analog:** `admin-pnl.spec.ts` :1-30 — `import { mockPnlApi } from '../fixtures/pnl'`, 머리 주석 ① ~ ③(middleware 통과 · 데이터 · 폭), 헬퍼 `horizontalOverflow(page)` · `clipOf(locator)`, `data-slot` 로케이터(`[data-slot="admin-pnl"]`). fixture 는 `page.route('/api/admin/settlement…')` 모킹 + 목업 숫자 상수 export.

## Shared Patterns

### 관문 (server)
**Source:** `admin-pnl.ts:29` — `router.use("/<경로>", requireAuth(), requireAdmin())` 경로 한정, `app.ts` 에서 `adminRouter` 앞 마운트.

### 오류 처리 (server)
**Source:** `admin.ts` export — `DbError` · `parseOrThrow` · `audit` · `relayResults`; 모든 핸들러 `try { … } catch (e) { next(e); }`.

### relay 팬아웃 (server)
**Source:** `admin-accounts.ts:123-155` `fanoutOne` · `fanoutAudit` — 항목별 오류 접기, 감사 줄에 마스킹 DMA id.

### DB 권한 (supabase)
**Source:** `20261106300000_dma_accounts_master.sql:57-60 · 153-155` — RLS on · 정책 없음 · REVOKE PUBLIC + anon, authenticated · service_role GRANT.

### 카드 면 (webapp)
**Source:** `pnl-report.tsx` `CARD_FACE` (`ring-1 ring-inset ring-[var(--border-subtle)] dark:ring-0`) · `@/components/layout/page-layout` `CARD`.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| 정산 확정 · 끝전(4 : 3 : 3) 계산 로직 자체 | utility | transform | 같은 도메인 계산이 없음 — 꼴은 `account-budget.ts` 를 따르되 규칙은 CONTEXT D-22 ~ D-27 · RESEARCH R1 ~ R15 를 쓴다 |

## Metadata

**Analog search scope:** `server/src/routes` · `server/tests/routes` · `supabase/migrations` · `supabase/tests` · `packages/shared/src` · `webapp/src/app/admin` · `webapp/src/components/{admin,layout,pnl}` · `webapp/src/lib` · `webapp/e2e`
**Files scanned:** 약 20
**Pattern extraction date:** 2026-11-20
