# Phase 35: 발사 경계 지도 어드민 (launch-gate) - Pattern Map

**Mapped:** 2026-10-27
**Files analyzed:** 28 (신규 24 · 수정 4)
**Analogs found:** 27 / 28

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `supabase/migrations/<ts>_launch_gate.sql` (표 2 · upsert 헬퍼 · 스텁 · apply 재정의 · reproject · backfill RPC · 어드민 RPC 2 · 가시성 3곳) | migration | event-driven + request-response | `20260929180100_dma_strategy_apply.sql` + `20261004090100_dma_journal_apply_skipped_rows.sql` + `20261020200100_accum_report_rpc.sql` + `20261020200000_limitup_accum_flow.sql` | exact (조합) |
| `supabase/migrations/<ts>_launch_project_mapping.sql` (Wave B · 정식 노트 뒤) | migration | transform | 위 apply · `20261018120000_dma_strategy_events_accum_signal.sql` | role-match |
| `supabase/tests/launch_gate.test.sql` | test (pgTAP) | — | `supabase/tests/dma_strategy_accum_signal.test.sql` | exact |
| `packages/shared/src/launch.ts` | model + utility (순수 계산) | transform | `packages/shared/src/accum-report.ts` · `admin.ts` | role-match |
| `packages/shared/src/__tests__/launch.test.ts` · `__fixtures__/launch-pieces.ts` | test | transform | `__tests__/admin.test.ts` · `__fixtures__/strategy-day.ts` | role-match |
| `packages/shared/src/index.ts` (재export) | config | — | 자기 자신 :243-258 | exact |
| `server/src/routes/admin-launch.ts` | route | request-response | `server/src/routes/admin-servers.ts` | exact |
| `server/src/services/admin-launch.ts` | service | request-response (RPC 1회) | `server/src/services/accum-report.ts` | exact |
| `server/src/schemas/admin-launch.ts` | schema | — | `server/src/schemas/accum-report.ts` | exact |
| `server/tests/routes/admin-launch.test.ts` | test | — | `server/tests/routes/admin-servers.test.ts` | exact |
| `server/src/app.ts` (마운트) | config | — | 자기 자신 :118-123 | exact |
| `webapp/src/app/admin/launch/page.tsx` | page | — | `webapp/src/app/analytics/accum/page.tsx` (Suspense) | exact |
| `webapp/src/components/admin/launch-client.tsx` (탭 · `?tab`) | component | request-response | `components/analytics/accum-report.tsx` | exact |
| `launch-orders-tab.tsx` (머리 카드 · 조각 표) | component | — | `accum-kpi-strip.tsx` · `accum-cycle-table.tsx` | role-match |
| `launch-map-tab.tsx` · `launch-gate-chart.tsx` (순수 SVG) | component | — | `accum-chart.tsx` + `hooks/use-chart-width.ts` | role-match |
| `webapp/src/lib/launch-api.ts` | utility (API client) | request-response | `webapp/src/lib/accum-api.ts` | exact |
| `webapp/src/lib/launch-map.ts` · `launch-format.ts` (+ tests) | utility | transform | `webapp/src/lib/limitup-report.ts` · `accum-report.ts` | role-match |
| `webapp/src/components/layout/app-sidebar.tsx` (+ test, `sidebar-tree.spec.ts`) | component | — | 자기 자신 :196-198 · :744-753 | exact |
| `webapp/src/styles/globals.css` (+ `tds-tokens.test.ts`) | config | — | 자기 자신 :76-93 (`--team` · `--accum-*`) | exact |
| `webapp/e2e/specs/admin-launch.spec.ts` · `e2e/fixtures/launch.ts` | test (E2E) | — | `e2e/specs/admin-servers.spec.ts` · `e2e/fixtures/admin.ts` | exact |
| `relay/src/tools/launch-backfill.ts` | utility (순수 + sb 주입) | batch / file-I/O | `relay/src/tools/accum-backfill.ts` | exact |
| `relay/tests/launch-backfill.test.ts` | test | — | `relay/tests/accum-backfill.test.ts` | exact |
| `scripts/launch-backfill.ts` · `.sh` | utility (CLI) | batch | `scripts/export-accum-backfill.ts/.sh` + `scripts/migrate-dma-users.ts` (`--apply`) | exact |
| gh-trade 핸드오프 노트 | doc | — | `scripts/trade-handoff.sh` + `docs/inbox/trade-handoff-template.md` | exact |
| 인박스 `## 회신` (`docs/inbox/from-gh-trade/261027-launch-gate-admin.md`) | doc | — | `docs/inbox/from-gh-trade/README.md` | exact |
| `strategy-event-labels.ts` kind 17·18 (노트 조건부) | model | — | `packages/shared/src/strategy-event-labels.ts:36-38` | exact |

---

## Pattern Assignments

### `supabase/migrations/<ts>_launch_gate.sql` (migration)

**① apply 재정의 — 원본** `supabase/migrations/20260929180100_dma_strategy_apply.sql`
시그니처·헤더 (:32-38) 그대로 복사, `CREATE OR REPLACE`:
```sql
CREATE OR REPLACE FUNCTION public.dma_strategy_apply(p_gateway text, p_epoch text, p_events jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public, pg_temp
```
변경 지점 3곳 — INSERT(:66-119)는 서브블록 **밖** 그대로, 그 뒤 rows 조립(:127-132)과 반환(:153-159):
```sql
    ON CONFLICT DO NOTHING
    RETURNING * INTO v_row;
    IF NOT FOUND THEN v_skipped := v_skipped + 1; CONTINUE; END IF;
    v_applied := v_applied + 1;
    -- [신규] kind 17·18 → 투영 서브블록 + rows 제외 (아래 ②)
    v_rows := v_rows || jsonb_build_array(
      to_jsonb(v_row) - 'dma_user_id' - 'applied_at'
        || jsonb_build_object('stock_code', (SELECT s.code FROM public.stocks s WHERE s.isin = v_row.isin LIMIT 1))
    );
  ...
  RETURN jsonb_build_object('applied', v_applied, 'skipped', v_skipped,
    'errors', '[]'::jsonb,   -- → v_errors
    'last_seq', coalesce(v_last, 0), 'rows', v_rows);
```
커서 전진 블록(:134-147)은 무변경 복사. 파일 끝 권한 3줄도 원문 그대로.

**② 포이즌 격리 — 원본** `20261004090100_dma_journal_apply_skipped_rows.sql:121-131`:
```sql
    BEGIN
      v_ids := v_ids || public.dma_journal_project(p_gateway, p_epoch, ev);
      v_applied := v_applied + 1;
    EXCEPTION WHEN OTHERS THEN
      v_err := SQLERRM;
      ...
      v_errors := v_errors || jsonb_build_array(jsonb_build_object('seq', v_seq, 'error', v_err));
    END;
```
→ `IF v_row.kind IN (17,18) THEN BEGIN PERFORM public.launch_project_event(v_row); EXCEPTION WHEN OTHERS THEN v_errors := ...; END; ELSE v_rows := v_rows || ...; END IF;` — `UPDATE … apply_error` 는 **복사하지 않는다**(`dma_strategy_events` 에 칸 없음 · 칸 추가 금지 — RESEARCH :235).

**③ 표 잠금 4줄 — 원본** `20261020200000_limitup_accum_flow.sql:117-121`:
```sql
-- 서비스롤 전용 잠금 — 접근 규칙을 추가하지 말 것 — 읽기는 서버 RPC 뿐(D-07).
ALTER TABLE public.limitup_accum_flow ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.limitup_accum_flow FROM PUBLIC;
REVOKE ALL ON TABLE public.limitup_accum_flow FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.limitup_accum_flow TO service_role;
```
`launch_pieces` · `launch_heads` 각각 적용. 같은 파일의 `COMMENT ON COLUMN` 열별 주석 관례(:110-115)도 따른다.

**④ 어드민 RPC — 원본** `20261020200100_accum_report_rpc.sql:39-85` (DMA 게이트 블록 `IF NOT EXISTS (… dma_visible_accounts …)` 와 `access` 키는 **삭제**, `p_user_id` 인자 없음):
```sql
CREATE FUNCTION public.accum_report_for_user(p_user_id uuid, p_date text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public, pg_temp
AS $$
DECLARE v_dates text[]; v_date text;
BEGIN
  v_dates := ARRAY(SELECT DISTINCT a.date FROM public.limitup_accum_flow a ORDER BY a.date DESC);
  IF cardinality(v_dates) = 0 THEN
    RETURN jsonb_build_object('access', true, 'dates', '[]'::jsonb, 'date', NULL, 'rows', '[]'::jsonb);
  END IF;
  v_date := coalesce(p_date, v_dates[1]);
  RETURN jsonb_build_object(..., 'rows', (SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY ...), '[]'::jsonb) FROM (...) s));
END; $$;

REVOKE EXECUTE ON FUNCTION public.accum_report_for_user(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.accum_report_for_user(uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accum_report_for_user(uuid, text) TO service_role;
```
`trade_date date` 열은 `to_char(…,'YYYYMMDD')` 로 내보내고 `to_date(p_date,'YYYYMMDD')` 로 받는다(Pitfall 8). 헤더 주석 블록(목적 · 권한 · 원격 적용 · 되돌리기)도 같은 꼴.

**⑤ 가시성 제외 지점**
- `20261018120000_dma_strategy_events_accum_signal.sql:72-90` `dma_strategy_events_for_user_json` 전체 복사 후 `WHERE` 에 추가:
  ```sql
   WHERE (p_include_limit_feature OR (t.ev->>'kind')::int <> 15)
     AND (t.ev->>'kind')::int <> 16
     AND (t.ev->>'kind')::int NOT IN (17, 18);
  ```
  REVOKE/GRANT 3줄(:88-90) 재명시. purge(:94-103 `kind IN (15, 16)`)는 **건드리지 않는다**(17·18 영구 보관) — 테스트로만 잠금.
- `20260929190000_dma_gateway_identities.sql:219~` `dma_order_events_for_user(uuid, uuid, text[])` 본문 그대로 재정의 + :269 를
  ```sql
     WHERE e.order_no <> '' AND e.order_no = ANY (k.nos) AND e.kind NOT IN (17, 18)
  ```
  권한 재명시(:281-283 시그니처 정확히).
- 마이그레이션 전체 `BEGIN; … COMMIT;` (accum_report_rpc :37, identities 끝).

---

### `supabase/tests/launch_gate.test.sql` (pgTAP)

**Analog:** `supabase/tests/dma_strategy_accum_signal.test.sql`
- 머리 주석 (:1-30) 꼴: 대상 마이그레이션 · 잠그는 것 목록 · 실행 줄 `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/launch_gate.test.sql` · 「KST 오늘 기준 상대값」 · 단언 튜플 규칙.
- 프리앰블 `BEGIN; CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions; SET LOCAL search_path = public, extensions;`, `pg_temp` 헬퍼 함수(:160-164 `pg_temp.accum_rows`), `SELECT plan(N);`(:166).
- 단언 예 (:167-174):
  ```sql
  SELECT is((SELECT count(*)::int FROM public.dma_strategy_events WHERE kind = 16), 26, '(픽스처, KB120+KYOBO119, kind 16, 적재) ...');
  ```
- purge 단언 (:290-297) — `dma_strategy_events_purge_limit_feature(30)` 뒤 kind 17·18 행 수 불변.
- 권한 단언 꼴 (`has_function_privilege` 3쌍 → `'(f,f,t)'`):
  ```sql
  SELECT is((has_function_privilege('anon', ..., 'EXECUTE'), has_function_privilege('authenticated', ...), has_function_privilege('service_role', 'public.dma_strategy_events_purge_limit_feature(integer)', 'EXECUTE'))::text,
    '(f,f,t)', '... EXECUTE (anon, authenticated, service_role) = (f, f, t)');
  ```
  + `pg_policies` 0개 (accum_report.test.sql 선례).
- 꼬리 (:355-356) `SELECT * FROM finish(); ROLLBACK;`
- 회귀: `dma_strategy_apply.test.sql`(:132-133 `(2,0,[],2)` · :172 45키) 는 무변경으로 통과해야 함.

---

### `packages/shared/src/launch.ts` (+ test · fixture · index)

**Analog:** `packages/shared/src/accum-report.ts:1-40`
- 파일 머리 JSDoc: 계약 정본(인박스 노트 경로) · 「행 키는 DB 열 이름 그대로(snake_case) · 봉투 키는 단어 하나」 · 단위 규칙 · 표시 변환은 웹 표시층만.
- import 꼴: `import type { LimitupDate } from "./limitup-report";` (날짜 = `YYYYMMDD` 문자열).
- 행 인터페이스 = 열별 JSDoc 한 줄 + `number | null` (backfill 빈 열 null — D-08).
- 응답 타입 `LaunchOrdersResponse { dates; date; heads; pieces }` · `LaunchMapResponse { days; heads; pieces }` — server `res.json` 과 webapp `authFetch<T>` 가 공유.
- 브로커: `packages/shared/src/admin.ts:28-34` `SERVER_KEY_RE` · `brokerOfServerKey` 재사용.
- `index.ts:243-258` 꼴로 주석 한 줄 + `export * from "./launch";`.
- 테스트: `__tests__/admin.test.ts` 꼴 vitest, 픽스처는 `__fixtures__/strategy-day.ts` 처럼 TS 상수(첨부 `pieces.json` 196행 사본) · 기대값 = RESEARCH「D-10 자동 대조 기대값」 표.

---

### `server/src/routes/admin-launch.ts` (route)

**Analog:** `server/src/routes/admin-servers.ts`
- import (:1-20):
  ```ts
  import { Router, type Request, type Router as RouterT } from "express";
  import type { SupabaseClient } from "@supabase/supabase-js";
  import { requireAuth } from "../middleware/require-auth.js";
  import { requireAdmin } from "../middleware/require-admin.js";
  ```
- 경로 한정 관문 (:48-50):
  ```ts
  export const adminServersRouter: RouterT = Router();
  adminServersRouter.use("/servers", requireAuth(), requireAdmin());
  ```
  → `adminLaunchRouter.use("/launch", requireAuth(), requireAdmin());` (★ 주석 「관문은 경로에만 — 왕복 +1 방지」 복사).
- 핸들러 본문 = `server/src/routes/accum-report.ts:26-50` 꼴 (zod parse → service → `res.json`). `parseOrThrow` 는 `./admin.js` 에서 export 됨(admin-servers.ts:20).

### `server/src/services/admin-launch.ts` (service)

**Analog:** `server/src/services/accum-report.ts:1-70` — `DbError` · `causeOf` · `shapeCause` · `isObject` **복제**(공용화 금지, :9). `access` 분기 제거:
```ts
const { data, error } = await supabase.rpc("accum_report_for_user", { p_user_id: userId, p_date: d ?? null });
if (error) throw DbError(FAIL, causeOf(error));
if (!isObject(data)) throw DbError(FAIL, shapeCause("accum_report_for_user", data));
if (!Array.isArray(data.dates)) throw DbError(FAIL, shapeCause("accum_report_for_user.dates", data.dates));
if (!Array.isArray(data.rows)) throw DbError(FAIL, shapeCause("accum_report_for_user.rows", data.rows));
return data as unknown as AccumReportResponse;
```
→ orders: `dates/heads/pieces`, map: `days/heads/pieces` 배열 검사.

### `server/src/schemas/admin-launch.ts`

**Analog:** `server/src/schemas/accum-report.ts` + `limitup-report.ts:10-20` (`Ymd`):
```ts
import { z } from "zod";
import { Ymd } from "./limitup-report.js";
export const AccumReportQuery = z.object({ d: Ymd.optional() });
export type AccumReportQueryT = z.infer<typeof AccumReportQuery>;
```
→ `LaunchOrdersQuery = z.object({ d: Ymd.optional() })` · `LaunchMapQuery = z.object({ fire: z.enum(['q16','n0930']).default('q16'), range: z.enum(['10d','20d','all']).default('10d') })`.

### `server/src/app.ts` (마운트)

현재 :118-123:
```ts
  // 서버 레지스트리(D-17)를 먼저 — 그 라우터는 관문을 `/servers` 경로에만 건다. adminRouter 는 라우터 전체에 관문을
  // 걸므로 순서가 반대면 /servers 요청이 역할 조회를 두 번 한다(Cloud Run → Supabase 왕복 +1).
  app.use("/api/admin", adminServersRouter);
  app.use("/api/admin", adminRouter);
```
→ `app.use("/api/admin", adminLaunchRouter);` 를 `adminServersRouter` 뒤 · `adminRouter` **앞**에 삽입, 주석에 Phase 35 한 줄.

### `server/tests/routes/admin-launch.test.ts`

**Analog:** `server/tests/routes/admin-servers.test.ts:1-16`:
```ts
import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app";
import { ADMIN_TOKEN, TRADER_TOKEN, makeAdminSupabase, type AdminSupabaseOpts } from "../fixtures/admin-supabase";
```
`makeAdminSupabase({ rpc: { launch_orders_for_admin: …, launch_map_for_admin: … } })` · TRADER_TOKEN 403 · 잘못된 `d`/`range` 400 + RPC 0회 · 모양 위반 500. relay 픽스처 불필요.

---

### `webapp/src/app/admin/launch/page.tsx`

**Analog:** `webapp/src/app/analytics/accum/page.tsx` (전체 24줄) — **`/admin/servers/page.tsx`('use client' · Suspense 없음)를 베끼지 말 것**(Pitfall 11):
```tsx
import { Suspense } from 'react';
import { AppShell } from '@/components/layout/app-shell';
import { AppSidebar } from '@/components/layout/app-sidebar';
export default function AccumReportPage() {
  return (
    <AppShell sidebar={<AppSidebar />}>
      <Suspense fallback={null}>
        <AccumReport />
      </Suspense>
    </AppShell>
  );
}
```
JSDoc 은 admin/servers 의 「middleware 가 admin 아닌 사용자를 `/` 로」 문구를 합친다.

### `webapp/src/components/admin/launch-client.tsx` (+ orders/map 탭)

**Analog:** `webapp/src/components/analytics/accum-report.tsx:1-100`
- import: `'use client'` · `useRouter, useSearchParams` · `PageHeader` · `CARD` (`@/components/layout/page-layout`) · `ApiClientError` · `dateNavOf, fmtYmdShort, parseYmdParam` (`@/lib/limitup-report`) · `LimitupDateNav`(`../analytics/limitup-date-nav`).
- 쿼리 진실 원본 + 정본화:
  ```tsx
  const raw = searchParams.get('d');
  const d = parseYmdParam(raw);
  const invalid = raw !== null && d === null;
  useEffect(() => { if (invalid) router.replace(BASE); }, [invalid, router]);
  ```
- 로딩 effect (`let alive = true` · `setPhase({kind:'loading'})` · then/err 분기 · cleanup `alive = false`). DmaGate/`access` 분기는 삭제(어드민은 401/403 만 오류 처리).
- 탭: `webapp/src/components/ui/tabs.tsx` (shadcn) · `?tab=orders|map` 은 다른 쿼리 보존하며 `router.replace`.
- 루트 `data-slot="admin-launch"` (servers-client 의 `data-slot="admin-servers"` 꼴 — E2E 선택자). 브로커 라벨 `SERVER_BROKER_LABEL` (`servers-client.tsx:62`) 재사용.

### `launch-gate-chart.tsx` (순수 SVG)

**Analog:** `webapp/src/components/analytics/accum-chart.tsx` + `webapp/src/hooks/use-chart-width.ts`
```tsx
import { useChartWidth } from '@/hooks/use-chart-width';
// 래퍼 div 폭 → viewBox="0 0 {W} H" 1:1 (11px 글자 고정)
const [ref, width] = useChartWidth<HTMLDivElement>();
```
치수 상수는 `ACCUM_CHART` 처럼 lib(`launch-map.ts`)에 두고 컴포넌트는 그리기만. 축/스태킹/리본 계산은 순수 함수(테스트 대상). 색은 CSS 토큰 `var(--…)`.

### `webapp/src/lib/launch-api.ts`

**Analog:** `webapp/src/lib/accum-api.ts:1-30`:
```ts
import type { AccumReportResponse } from '@gh-radar/shared';
import { authFetch } from './auth-fetch';
export function fetchAccumReport(d?: string): Promise<AccumReportResponse> {
  const query = d === undefined ? '' : `?d=${encodeURIComponent(d)}`;
  return authFetch<AccumReportResponse>(`/api/accum/report${query}`);
}
```
→ `fetchLaunchOrders(d?)` · `fetchLaunchMap(fire, range)`. 캐시(query-cache)는 불필요.

### `webapp/src/components/layout/app-sidebar.tsx`

현재 :196-198 / :744-753:
```tsx
const NAV_ADMIN_SERVERS = { href: "/admin/servers", label: "서버" } as const;
...
<li>
  <SubNavLink href={NAV_ADMIN_SERVERS.href} label={NAV_ADMIN_SERVERS.label}
    item="admin-servers" active={isActive(NAV_ADMIN_SERVERS.href)} rail={rail} />
</li>
```
→ `NAV_ADMIN_LAUNCH = { href: "/admin/launch", label: "발사" }` · 「서버」 `<li>` 다음 `item="admin-launch"`. 주석 「하위 = 사용자 · 서버」(:190) 갱신. 연동 수정: `__tests__/app-sidebar.test.tsx:1499-1513` 순서 배열 · `e2e/specs/sidebar-tree.spec.ts:88-101` `TREE_LINKS`.

### `webapp/src/styles/globals.css` 토큰

현재 :83-93 꼴 — 축 이름 주석 + 「서로 대체하지 마라」 + 대비 수치, `:root` 와 `.dark`(:237-251) 양쪽에 같은 이름:
```css
  /* 매집 상태 축(quick-261018-rfy …) — … 서로 대체하지 마라 … 라이트 글자/면 대비 4.77:1 … */
  --accum-sell: #c2410c;
  --accum-sell-bg: #fff4e6;
```
hex 만(oklch 금지). `styles/__tests__/tds-tokens.test.ts` 의 `parseBlock(':root')`/`parseBlock('.dark')` 토큰 집합 동치 단언에 새 토큰이 걸리므로 양쪽 블록 필수.

### `webapp/e2e/specs/admin-launch.spec.ts` · `e2e/fixtures/launch.ts`

**Analog:** `webapp/e2e/specs/admin-servers.spec.ts:1-50`
```ts
import { test, expect, type Locator, type Page } from '@playwright/test';
import { leavesOverflowing } from '../overflow';
const VIEWPORTS = [{ name: '390', width: 390, height: 844 }, { name: '1080', width: 1080, height: 800 }] as const;
for (const vp of VIEWPORTS) {
  test(`... (${vp.name})`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/admin/launch');
    await expect(root.getByRole('heading', { level: 1, name: '발사' })).toBeVisible({ timeout: 30_000 });
```
머리 JSDoc ①②③ (무엇을 증명 · 요청 수 · 폭) 꼴. **`mockAdminApi` 사용 금지** — `e2e/fixtures/admin.ts:376` 이 `**/api/admin/**` 미지 경로에 404 → `**/api/admin/launch/**` 전용 `page.route` 를 fixtures/launch.ts 에 (요청 기록 배열 반환 꼴은 admin.ts 의 `api.requests` 참조).

---

### `relay/src/tools/launch-backfill.ts` · `scripts/launch-backfill.ts` · `.sh`

**Analog:** `scripts/export-accum-backfill.ts:1-45`
```ts
#!/usr/bin/env tsx
/** … 매핑 · 쓰기는 relay/src/tools/launch-backfill.ts, 이 스크립트는 인자 · env · 출력만(migrate-dma-users.ts 패턴). … 출력 위생 … exit 규칙 */
import { exportAccumBackfillDay } from "../relay/src/tools/accum-backfill.js";
import { createRelaySupabase } from "../relay/src/store/supabase.js";
const USAGE = [ "사용법: pnpm --filter @gh-radar/relay exec tsx ../scripts/…", … ].join("\n");
function fail(message: string): never { console.error(`오류: ${message}`); process.exit(1); }
```
dry-run 기본 / `--apply`: `scripts/migrate-dma-users.ts:9-11` 주석 꼴.
**`.sh` 래퍼** = `scripts/export-accum-backfill.sh:29-70` 3섹션 그대로 (`ACCUM_` → `LAUNCH_`):
```bash
ACCUM_BACKFILL_CWD="$(pwd)"; export ACCUM_BACKFILL_CWD
cd "$(dirname "$0")/.."
ENV_FILE="${ACCUM_BACKFILL_ENV_FILE:-workers/master-sync/.env}"
set -a; source "$ENV_FILE"; set +a
MISSING=""; if [[ -z "${SUPABASE_URL:-}" ]]; then MISSING="$MISSING SUPABASE_URL"; fi …   # 이름만 출력
exec pnpm --filter @gh-radar/relay exec tsx ../scripts/export-accum-backfill.ts "$@"
```
쓰기는 직접 upsert 가 아니라 backfill RPC(service_role) 호출 — D-01 조건부 upsert 규칙(journal > backfill)을 DB 한 곳에.

### `relay/tests/launch-backfill.test.ts`

**Analog:** `relay/tests/accum-backfill.test.ts:1-25` — 머리 JSDoc(「실 DB 에 붙지 않는다 — 가짜 Supabase 클라이언트가 체인/rpc 호출을 기록」), import:
```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { … } from "../src/tools/launch-backfill.js";
```
임시 파일은 `mkdtempSync(join(tmpdir(), …))`.

### gh-trade 핸드오프

`scripts/trade-handoff.sh <slug>` (slug `^[a-z0-9-]{1,40}$`) → `/Users/alex/repos/gh-trade/docs/inbox/from-gh-radar/YYMMDD-<slug>.md` 생성(`docs/inbox/trade-handoff-template.md` 4토큰 치환). 기존 노트 예: `/Users/alex/repos/gh-trade/docs/inbox/from-gh-radar/261021-accum-avg-px-series.md`. 스크립트는 gh-radar 트리에 쓰지 않고 커밋도 안 함(Pitfall 13).

---

## Shared Patterns

### 표 접근 = RLS on · 정책 0 · service_role
**Source:** `20261020200000_limitup_accum_flow.sql:117-121` — 새 표 전부.

### RPC 권한 3줄 (시그니처 정확히)
**Source:** `20261020200100_accum_report_rpc.sql:81-83` — 새/재정의 함수 전부 (`feedback_supabase_rpc_revoke` — FROM PUBLIC 단독 금지).

### 어드민 인가
**Source:** `admin-servers.ts:50` 경로 관문 + `app.ts:118-123` 마운트 순서. 웹은 기존 `ADMIN_PREFIX` 미들웨어(`webapp/src/lib/supabase/access-gate.ts`) 그대로 — 수정 없음.

### 서버 오류 형식
**Source:** `services/accum-report.ts:23-41` — `ApiError(500,"DB_ERROR",msg,cause)` · 원문은 cause 로 warn 로그만 · 요청당 RPC 1회.

### 날짜
**Source:** `schemas/limitup-report.ts:10-20` `Ymd` · `webapp/src/lib/limitup-report.ts:355-385` `dateNavOf`/`parseYmdParam`/`fmtYmdShort` · `LimitupDateNav`.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `launch_project_event` 칸 매핑(Wave B) | migration | transform | kind 17·18 정식 인계 노트 미도착 — 스텁만 Wave A, 매핑은 노트 표 기준(RESEARCH Pattern 1b) |

## Metadata

**Analog search scope:** supabase/migrations · supabase/tests · packages/shared/src · server/src · server/tests · webapp/src · webapp/e2e · scripts · relay/tests
**Files scanned:** ~30
**Pattern extraction date:** 2026-10-27

## PATTERN MAPPING COMPLETE
