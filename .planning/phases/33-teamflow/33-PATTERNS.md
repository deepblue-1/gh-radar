# Phase 33: 팀 매집(teamflow) 보고서 - Pattern Map

**Mapped:** 2026-10-16
**Files analyzed:** 38 (신규 27 · 수정 11)
**Analogs found:** 36 / 38

> 정본은 33-RESEARCH.md 다. 이 문서는 그 결정을 뒤집지 않는다. 각 신규 파일이 **어느 기존 파일의 몇 행을 복제하는지**만 못 박는다.
> analog 경로는 모두 git 추적 소스다(`git ls-files` 확인 — mirror 경로 없음).

## File Classification

| 신규/수정 파일 | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `supabase/migrations/20261016200000_limitup_team_flow.sql` (신규) | migration | batch (적재) | `20261006090100_limitup_tables.sql` · `20261006090200_limitup_load_rpcs.sql` · `20261006090300_limitup_retention_storage.sql` · `20261006090500_limitup_commit_day_timeout.sql` | exact |
| `supabase/migrations/20261016200100_teamflow_report_rpc.sql` (신규) | migration (RPC) | request-response | `20261006090400_limitup_report_rpcs.sql` | exact |
| `supabase/tests/limitup_load.test.sql` (수정) | test (pgTAP) | batch | 자기 자신 확장 | exact |
| `supabase/tests/teamflow_report.test.sql` (신규) | test (pgTAP) | request-response | `supabase/tests/limitup_report.test.sql` (7-60행 픽스처 사용자) | exact |
| `workers/limitup-sync/src/load.ts` (수정) | service | batch | 자기 자신 (`EXPORT_TABLES` 13행 · `StageTbl` 16행) | exact |
| `workers/limitup-sync/src/index.ts` (수정) | service (dispatch) | batch | 자기 자신 125-136 · 198-272행 | exact |
| `workers/limitup-sync/tests/helpers/fake-supabase.ts` (수정) | test helper | — | 자기 자신 43행 `LoadRow` | exact |
| `workers/limitup-sync/tests/{load,dispatch}.test.ts` (수정) | test | batch | 자기 자신 (load 78·103행, dispatch 44-58·436·479-481행) | exact |
| `workers/limitup-sync/tests/fixtures/team_flow/20261014/team_flow.ndjson.gz` (신규) | fixture | file-I/O | 맥 샘플 바이트 복사 | — |
| `server/src/routes/teamflow-report.ts` (신규) | route | request-response | `server/src/routes/limitup-report.ts` | exact |
| `server/src/services/teamflow-report.ts` (신규) | service | request-response | `server/src/services/limitup-report.ts` | exact |
| `server/src/schemas/teamflow-report.ts` (신규) 또는 `limitup-report.ts` 에서 `Ymd` export | schema | validation | `server/src/schemas/limitup-report.ts` | exact |
| `server/src/app.ts` (수정) | config | — | 자기 자신 22행 import · 108행 `app.use` | exact |
| `server/tests/routes/teamflow-report.test.ts` (신규) | test | request-response | `server/tests/routes/limitup-report.test.ts` | exact |
| `packages/shared/src/teamflow-report.ts` (신규) | model (types) | — | `packages/shared/src/limitup-report.ts` | exact |
| `packages/shared/src/index.ts` (수정) | barrel | — | 자기 자신 204-220행 | exact |
| `packages/shared/src/limitup-report.ts` (수정) | model | — | 165-170행 `LimitupLoadRows` 에 `"team_flow"` | exact |
| `webapp/src/app/analytics/teamflow/page.tsx` (신규) | page | request-response | `webapp/src/app/analytics/limitup/page.tsx` | exact |
| `webapp/src/components/analytics/teamflow-report.tsx` (신규) | component (shell/상태기계) | request-response | `webapp/src/components/analytics/limitup-report.tsx` 53-130행 | exact |
| `webapp/src/components/analytics/teamflow-kpi-strip.tsx` (신규 — 복제) | component | transform | `limitup-kpi-strip.tsx` 전체(32행) | exact |
| `webapp/src/components/analytics/teamflow-day-grid.tsx` (신규 — 복제) | component (아코디언) | event-driven | `limitup-day-grid.tsx` 115-200행 | role-match |
| `webapp/src/components/analytics/teamflow-band-strip.tsx` (9칸 미니막대) | component (SVG) | transform | `limitup-sparkline.tsx` · 스케치 014 `strip()` | role-match |
| `webapp/src/components/analytics/teamflow-detail.tsx` · `teamflow-band-chart.tsx` · `teamflow-bucket-chart.tsx` · `teamflow-members.tsx` · `teamflow-band-table.tsx` · `teamflow-bucket-table.tsx` · `teamflow-toggle.tsx` (정정: 초안의 `teamflow-tables.tsx` 한 파일을 플랜에서 구간표 33-05 · 10분 표 33-06 두 파일로 나눔 · 접힌 표 토글 33-05 별도 — analog 동일) | component (SVG/표) | transform | `limitup-lane.tsx` 62·136-142행(폭 측정) · 스케치 015 | role-match |
| `webapp/src/lib/teamflow-report.ts` (신규) | utility | transform | `webapp/src/lib/limitup-report.ts` (`dateNavOf` 355 · `parseYmdParam` 371 · `fmtYmd*` 383-392 · `kstSecOf` 394) · `limitup-lanes.ts` 616-620 `StoryPart` | role-match |
| `webapp/src/lib/teamflow-api.ts` (신규) | service (client) | request-response | `webapp/src/lib/limitup-api.ts` | exact |
| `webapp/src/components/trading/dma-gate.tsx` (수정) | component | — | 31-39행 `DmaGateSurface` 에 `"팀 매집"` | exact |
| `webapp/src/components/layout/app-sidebar.tsx` (수정) | component (nav) | — | 124-125 · 470 · 548-570행 | exact |
| `webapp/src/styles/globals.css` + `styles/__tests__/tds-tokens.test.ts` (수정) | config/test | — | `--up`/`--up-bg` 정의(76-79 · 224-227행) · 토큰 배열 | exact |
| `webapp/src/test-fixtures/teamflow-export.ts` (신규) | fixture | file-I/O | `webapp/src/test-fixtures/limitup-export.ts` 20-45행 | exact |
| `webapp/e2e/fixtures/teamflow-report.ts` (신규) | fixture | — | `webapp/e2e/fixtures/limitup-report.ts` | exact |
| `webapp/e2e/specs/teamflow-report.spec.ts` (신규) | test (E2E) | request-response | `webapp/e2e/specs/limitup-report.spec.ts` | exact |
| `webapp/e2e/specs/sidebar-tree.spec.ts` (수정) | test | — | 82-93 `TREE_LINKS` · 307-312 게이트 루프 | exact |
| `webapp/src/lib/__tests__/teamflow-report.test.ts` (신규) | test (unit) | transform | `webapp/src/lib/__tests__/limitup-report.test.ts` | role-match |
| `webapp/src/components/analytics/__tests__/teamflow-report.test.tsx` · `teamflow-detail.test.tsx` (신규) | test (RTL) | — | `__tests__/limitup-report.test.tsx` · `limitup-day-grid.test.tsx` | exact |
| `webapp/src/components/layout/__tests__/app-sidebar.test.tsx` (수정) | test | — | 자기 자신 874-903행 | exact |
| `docs/inbox/from-gh-trade/261016-teamflow-export.md` (수정) | doc | — | `261004-auto-sell-wire.md` 프런트매터 | exact |

---

## Pattern Assignments

### `supabase/migrations/20261016200000_limitup_team_flow.sql` (migration, batch)

**Analogs:** `20261006090100_limitup_tables.sql` · `20261006090200_limitup_load_rpcs.sql` · `20261006090300_limitup_retention_storage.sql` · `20261006090500_limitup_commit_day_timeout.sql`

**표 잠금 블록** (`20261006090100_limitup_tables.sql:251-255` — 표마다 4줄, 그대로 복제):
```sql
-- ── 서비스롤 전용 잠금: RLS 활성 + 접근 규칙 0개 + 명시 REVOKE ──
ALTER TABLE public.limitup_entries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.limitup_entries FROM PUBLIC;
REVOKE ALL ON TABLE public.limitup_entries FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.limitup_entries TO service_role;
```
→ `limitup_team_flow` 로 치환. POLICY 추가 금지(D-06). 열 정의는 RESEARCH 「권장 마이그레이션 골격」(PK 2열만 NOT NULL · `*_rate`/`*_share` = `double precision` · `payload jsonb`).

**stage CHECK 교체** — 원문 `20261006090100_limitup_tables.sql:188-189` 은 이름 없는 인라인 CHECK. `DROP CONSTRAINT limitup_stage_tbl_check`(IF EXISTS 금지 — Pitfall 3) → 9개 값으로 ADD.

**commit_day 대조 루프** (`20261006090200_limitup_load_rpcs.sql:84-96` — 본문 그대로 유지, `v_tbls` 65-66행에 `'team_flow'` 추가):
```sql
  FOREACH v_t IN ARRAY v_tbls LOOP
    SELECT count(*), count(*) FILTER (WHERE s.payload->>'date' IS DISTINCT FROM p_date)
      INTO v_n, v_bad FROM public.limitup_stage s WHERE s.date = p_date AND s.tbl = v_t;
    v_e := coalesce((p_expected->>v_t)::integer, 0);   -- 옛 워커(키 없음) = 0 → 호환
    IF v_n <> v_e THEN RAISE EXCEPTION 'limitup_commit_day: % % stage % expected %', p_date, v_t, v_n, v_e; END IF;
    ...
```
**DELETE→INSERT 쌍** (같은 파일 98-104행 — 9번째 쌍으로 복제):
```sql
  DELETE FROM public.limitup_entries WHERE date = p_date;
  INSERT INTO public.limitup_entries
    SELECT (jsonb_populate_record(NULL::public.limitup_entries, s.payload)).*
      FROM public.limitup_stage s WHERE s.date = p_date AND s.tbl = 'entries' ORDER BY s.seq;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_rows := v_rows || jsonb_build_object('entries', v_n);
```
→ team_flow 쌍은 `v_rows` 기록만 `IF p_expected ? 'team_flow' THEN … END IF;` 로 감싼다(Pitfall 1). DELETE 는 무조건.

**권한 3줄** (`20261006090200_limitup_load_rpcs.sql:200-202`):
```sql
REVOKE ALL ON FUNCTION public.limitup_commit_day(text, text, text, integer, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.limitup_commit_day(text, text, text, integer, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.limitup_commit_day(text, text, text, integer, jsonb) TO service_role;
```
**타임아웃 재진술 (필수 — Pitfall 2)** (`20261006090500_limitup_commit_day_timeout.sql:20-31`):
```sql
BEGIN;
ALTER FUNCTION public.limitup_commit_day(text, text, text, integer, jsonb) SET statement_timeout = '120s';
-- 권한 3줄 재진술
COMMIT;
-- PostgREST 스키마 캐시가 함수 속성을 다시 읽게 한다.
NOTIFY pgrst, 'reload schema';
```
**purge** — `20261006090300_limitup_retention_storage.sql:28-76` 의 `DELETE FROM public.limitup_<t> WHERE date < v_cutoff; GET DIAGNOSTICS v_n = ROW_COUNT; v_out := v_out || jsonb_build_object('<t>', v_n);` 를 한 쌍 추가(CREATE OR REPLACE 전체 본문 재진술 + `REVOKE EXECUTE … FROM PUBLIC` / `FROM anon, authenticated` / `GRANT EXECUTE … TO service_role`).

**머리말 선례:** `20261006120000_limitup_locks_lock_risk.sql:21-22`(모르는 키 버림 경고) — 이번 파일 머리말에 D-03 자동 감지로 대체됨을 적는다.

---

### `supabase/migrations/20261016200100_teamflow_report_rpc.sql` (RPC, request-response)

**Analog:** `20261006090400_limitup_report_rpcs.sql`

**시그니처 + 게이트** (40-59행):
```sql
CREATE FUNCTION public.limitup_report_for_user(p_user_id uuid, p_date text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_dates  text[];
  v_date   text;
BEGIN
  -- 게이트 — 가시 계좌 없으면 access 하나만
  IF NOT EXISTS (SELECT 1 FROM public.dma_visible_accounts(p_user_id)) THEN
    RETURN jsonb_build_object('access', false);
  END IF;
```
→ `v_dates` 원천만 `limitup_loads` 대신 `SELECT DISTINCT t.date FROM public.limitup_team_flow t ORDER BY t.date DESC`(D-07). 본문 나머지는 RESEARCH 「보고서 RPC 골격」. `rows` = `jsonb_agg(to_jsonb(t) ORDER BY t.team_net_val DESC NULLS LAST, t.isin)`(`to_jsonb` 로 payload 중첩 그대로 — 같은 파일 77-78행 facts 선례).

**권한** (153-155행):
```sql
REVOKE EXECUTE ON FUNCTION public.limitup_report_for_user(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.limitup_report_for_user(uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.limitup_report_for_user(uuid, text) TO service_role;
```

---

### `supabase/tests/teamflow_report.test.sql` · `limitup_load.test.sql`

- 신규 파일 = `supabase/tests/limitup_report.test.sql` 7-60행의 픽스처 사용자/DMA 매핑 문법 복제 → `{access:false}` · 이력 0 · dates(0행 commit 날짜 제외) · 정렬 · payload 포함 · anon/authenticated EXECUTE 불가.
- 확장 = `limitup_load.test.sql` 의 jsonb 열 확인 문법(45 · 65-66행 `"values"->>'krw'`)을 `payload->'bands'` 로. 추가 단언: 옛 호출(키 없음) → rows 에 `team_flow` 키 없음 · `proconfig` 에 `statement_timeout=120s` · stage `'team_flow'` insert `lives_ok`.
- 실행: `bash scripts/verify-dma-orders-price-check.sh --test supabase/tests/<file>.sql`(이미지 pull 필요 — RESEARCH Open Q3).

---

### `workers/limitup-sync/src/index.ts` (dispatch, batch)

**이력 select — 넓힐 자리** (`index.ts:128-135`):
```ts
  const prev = new Map<string, { sig: string | null; streak: number }>();
  if (!dryRun) {
    sb = createSupabaseClient(config);
    const { data, error } = await sb.from("limitup_loads").select("date, files_sig, skip_streak").gte("date", since);
    if (error) throw new Error(`limitup_loads select: ${error.message}`);
    for (const r of (data ?? []) as { date: string; files_sig: string | null; skip_streak: number | null }[]) {
      prev.set(r.date, { sig: r.files_sig, streak: r.skip_streak ?? 0 });
    }
  }
```
→ select 에 `, rows` · 맵 값에 `rows: Record<string, number> | null`.

**unchanged 판정** (`index.ts:200-214`) — `if (p?.sig === sig)` 를 `if (p?.sig === sig && !needTeamFlow)` 로. `needTeamFlow = tf !== undefined && p?.rows?.team_flow !== tf.rows`.

**필수 6표 루프 — 건드리지 말 것, 그 뒤에 선택 분기** (`index.ts:223-234`):
```ts
    for (const t of EXPORT_TABLES) {
      const name = `${t}.ndjson.gz`;
      const entry = m.files.find((f) => f.name === name);
      if (!entry) throw new Error(`${date}: manifest has no ${name}`);
      const rows = readNdjsonGz(join(config.exportDir, date, name));
      if (rows.length !== entry.rows) {
        throw new Error(`${date}: ${name} rows ${rows.length} != manifest ${entry.rows}`);
      }
      tables[t] = rows;
      counts[t] = rows.length;
    }
```
→ 같은 throw 문구 형식으로 team_flow 행 수 대조(파일 없으면 0행). `counts.team_flow` 항상 기록.

**stage/commit** (`index.ts:262-270`) — 기존 `stageDay(... config.stageChunk)` 다음 줄에 `stageDay(sb, date, { team_flow }, Math.min(config.stageChunk, TEAM_FLOW_STAGE_CHUNK))`. `commitDay({... expected: counts })` 그대로. 로그 reason `files_sig` vs `team_flow_backfill` 구분.

### `workers/limitup-sync/src/load.ts`
- 13행 `EXPORT_TABLES` **불변**(dryrun-totals 테스트가 순회). 16행 `StageTbl` 에 `| "team_flow"` · `TEAM_FLOW_FILE` · `TEAM_FLOW_STAGE_CHUNK = 20` 상수 추가. `STAGE_TABLES`(index.ts:102) 에 포함되어 `emptyCounts` 가 0 키를 만든다.

### 워커 테스트
- 깨지는 단언 표는 RESEARCH 「기존 테스트 중 깨지는 단언」 그대로(`load.test.ts:78,103` · `dispatch.test.ts:436,479-481` · `fake-supabase.ts:43`).
- 새 날짜 생성은 `dispatch.test.ts:44-58` `addDay(date, edit)` 문법 + `files.push({ name: "team_flow.ndjson.gz", rows: 34, sha256: "f6656ae2…" })`. `tests/fixtures/export/` 아래 manifest 새 날짜 금지(load.test 오염).

---

### `server/src/routes/teamflow-report.ts` (route, request-response)

**Analog:** `server/src/routes/limitup-report.ts`

**Imports** (1-7행):
```ts
import { Router, type Router as RouterT } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";

import { requireAuth } from "../middleware/require-auth.js";
import { LimitupGridUrlsQuery, LimitupReportQuery } from "../schemas/limitup-report.js";
import { ValidationFailed } from "../errors.js";
import { getLimitupGridUrls, getLimitupReport } from "../services/limitup-report.js";
```
**핸들러** (26-40행 — grid-urls 는 복제하지 않음):
```ts
export const limitupRouter: RouterT = Router();

limitupRouter.get("/report", requireAuth(), async (req, res, next) => {
  try {
    const parsed = LimitupReportQuery.safeParse(req.query);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw ValidationFailed(`${issue.path.join(".")}: ${issue.message}`);
    }
    const supabase = req.app.locals.supabase as SupabaseClient;
    res.json(await getLimitupReport(supabase, req.userId!, parsed.data.d));
  } catch (e) {
    next(e);
  }
});
```
머리 주석 방어선 블록(9-24행)도 동형으로. `requireDmaMapped` 미사용(D-05).

### `server/src/services/teamflow-report.ts`

**Analog:** `server/src/services/limitup-report.ts`

**Imports + 오류 헬퍼** (1-4 · 24-37 · 44-45행):
```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LimitupReportResponse } from "@gh-radar/shared";
import { ApiError, DmaUnmapped } from "../errors.js";

const DbError = (msg: string, cause: unknown) => new ApiError(500, "DB_ERROR", msg, cause);
const causeOf = (e: { message?: string; code?: string; details?: string | null; hint?: string | null }) => ({
  code: e.code, message: e.message, details: e.details ?? undefined, hint: e.hint ?? undefined,
});
const shapeCause = (what: string, v: unknown) => ({
  reason: `${what} 모양 위반`,
  type: Array.isArray(v) ? "array" : v === null ? "null" : typeof v,
});
const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
```
**핵심** (51-64행):
```ts
export async function getLimitupReport(supabase: SupabaseClient, userId: string, d?: string): Promise<LimitupReportResponse> {
  const { data, error } = await supabase.rpc("limitup_report_for_user", { p_user_id: userId, p_date: d ?? null });
  if (error) throw DbError("상한가 보고서 조회에 실패했습니다.", causeOf(error));
  if (!isObject(data)) throw DbError("상한가 보고서 조회에 실패했습니다.", shapeCause("limitup_report_for_user", data));
  if (data.access !== true) throw DmaUnmapped();
  return data as unknown as LimitupReportResponse;
}
```
→ RPC 이름 `teamflow_report_for_user` · 문구 「팀 매집 보고서 조회에 실패했습니다.」. 헬퍼 3개는 복제(공용화하지 않음 — limitup 무변경).

### `server/src/schemas/teamflow-report.ts`
**Analog:** `server/src/schemas/limitup-report.ts:10-22` — `Ymd` 가 현재 `const`(비 export). 권장: limitup 파일에서 `export const Ymd` 로 바꾸고 `export const TeamflowReportQuery = z.object({ d: Ymd.optional() });`(RESEARCH 「재사용 권장」).

### `server/src/app.ts`
- 22행 `import { limitupRouter } ...` 다음에 teamflow import · 108행 `app.use("/api/limitup", limitupRouter);` 다음 줄 `app.use("/api/teamflow", teamflowRouter);`. compression(81-87행)은 앞에 있어 자동 적용.

### `server/tests/routes/teamflow-report.test.ts`
**Analog:** `server/tests/routes/limitup-report.test.ts` — imports(1-5행 `supertest` · `createApp` · `ApiError`) · `nextUser()` 시퀀스(16-17행) · `makeSupabase({ user, rpcData, rpcError })` 최소 mock 이 `rpcCalls` 를 기록(19-30행~). 8케이스(401 · 400 형식/실재 · RPC 1회 `{p_user_id, p_date}` · 200 snake_case 통과 · 빈 날짜 · `{access:false}`→403 `DMA_UNMAPPED` · RPC error→500 원문 비노출 · 비객체→500) 복제. `signCalls`/`signError` 는 제거.

---

### `packages/shared/src/teamflow-report.ts` · `index.ts`

**Analog:** `packages/shared/src/limitup-report.ts` — 머리 규칙(4-6행 「행 키 = export 열 이름 snake_case · 봉투 키 camelCase」) · 응답 유니온(189행):
```ts
export type LimitupReportResponse =
  | { access: false }
  | { access: true; dates: LimitupDate[]; date: LimitupDate | null; loaded: false }
  | { access: true; ...; loaded: true; ... };
```
→ `TeamflowReportResponse = { access: false } | { access: true; dates: string[]; date: string | null; rows: TeamflowRow[] }` (`loaded` 없음). 타입 목록은 RESEARCH 「shared 타입」. `index.ts:204-220` 의 `export type { … } from "./limitup-report";` 블록을 같은 모양으로 추가. `LimitupLoadRows`(165-170행) 키에 `"team_flow"`. 검증 전 `pnpm --filter @gh-radar/shared build` 필수.

---

### `webapp/src/app/analytics/teamflow/page.tsx` (page)

**Analog:** `webapp/src/app/analytics/limitup/page.tsx` (전체):
```tsx
import { Suspense } from 'react';

import { LimitupReport } from '@/components/analytics/limitup-report';
import { AppShell } from '@/components/layout/app-shell';
import { AppSidebar } from '@/components/layout/app-sidebar';

export default function LimitupReportPage() {
  return (
    <AppShell sidebar={<AppSidebar />}>
      <Suspense fallback={null}>
        <LimitupReport />
      </Suspense>
    </AppShell>
  );
}
```
(Suspense 필수 — `useSearchParams`. 폴백 비움.)

### `webapp/src/components/analytics/teamflow-report.tsx` (상태기계)

**Analog:** `limitup-report.tsx:53-130`:
```tsx
type Ready = Exclude<LimitupReportResponse, { access: false }>;
type Phase = | { kind: 'loading' } | { kind: 'error' } | { kind: 'gate'; reason: DmaGateReason } | { kind: 'ready'; resp: Ready };
const BASE = '/analytics/limitup';

export function LimitupReport() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const raw = searchParams.get('d');
  const d = parseYmdParam(raw);
  const invalid = raw !== null && d === null;
  const gate = useDmaGateReason();
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [dates, setDates] = useState<readonly LimitupDate[]>([]);

  useEffect(() => { if (invalid) router.replace(BASE); }, [invalid, router]);

  useEffect(() => {
    if (gate !== null) return;
    let alive = true;
    setPhase({ kind: 'loading' });
    fetchLimitupReport(d ?? undefined).then(
      (resp) => {
        if (!alive) return;
        if (!resp.access) { setPhase({ kind: 'gate', reason: 'unmapped' }); return; }
        setDates(resp.dates);
        setPhase({ kind: 'ready', resp });
      },
      (err: unknown) => {
        if (!alive) return;
        if (err instanceof ApiClientError && (err.status === 401 || err.status === 403)) {
          setPhase({ kind: 'gate', reason: err.status === 401 ? 'unauthenticated' : 'unmapped' });
          return;
        }
        setPhase({ kind: 'error' });
      },
    );
    return () => { alive = false; };
  }, [d, attempt, gate]);

  const shown = d ?? resp?.date ?? null;
  useEffect(() => { document.title = shown === null ? '상한가 보고서' : `상한가 보고서 · ${fmtYmdShort(shown)}`; }, [shown]);
  const nav = dateNavOf(dates, shown);
  const go = (to: LimitupDate) => router.push(`${BASE}?d=${to}`);
  ...
  if (gateReason !== null) return (<div className="mx-auto flex w-full max-w-[1120px] flex-col gap-4">
      <DmaGate reason={gateReason} surface="상한가 보고서" /></div>);
```
→ `BASE='/analytics/teamflow'` · `fetchTeamflowReport` · title 「팀 매집」 · `surface="팀 매집"` · `loaded` 분기 대신 `dates.length`/`rows.length` 빈 상태. 재사용 import: `LimitupDateNav`, `dateNavOf`, `parseYmdParam`, `fmtYmdShort`, `DmaGate`/`useDmaGateReason`.

### `teamflow-kpi-strip.tsx` (복제)
**Analog:** `limitup-kpi-strip.tsx:11-31`(전체) — `<dl className="m-0 grid grid-cols-2 gap-2 md:grid-cols-4">` · 타일 `rounded-[var(--r-md)] bg-[var(--card)] p-3` · `flex-col-reverse` · 값 `mono m-0 truncate text-[20px] leading-[1.2] font-semibold`. 4번째 칸만 `text-[var(--fg)]` 대신 부호 색(`--up`/`--down`). `data-slot="teamflow-kpis"`.

### `teamflow-day-grid.tsx` (복제 — 일반화 금지)
**Analog:** `limitup-day-grid.tsx:115-200`. 복제할 문법 3가지:
```tsx
  const [openIsin, setOpenIsin] = useState<string | null>(() => rows[0]?.isin ?? null); // → useState<string | null>(null)  (D-08 기본 전부 접힘)
  const pendingScroll = useRef<string | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  useLayoutEffect(() => {
    const isin = pendingScroll.current; pendingScroll.current = null;
    if (isin === null || isin !== openIsin) return;
    const btn = listRef.current?.querySelector<HTMLElement>(`button[data-isin="${isin}"]`);
    if (!btn) return;
    const offset = Number.parseFloat(getComputedStyle(btn).scrollMarginTop) || 0;
    if (btn.getBoundingClientRect().top < offset) btn.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
  }, [openIsin]);
  const toggle = (isin: string) => { if (openIsin === isin) { setOpenIsin(null); return; } pendingScroll.current = isin; setOpenIsin(isin); };
```
버튼 aria(189-197행): `id={rowButtonId}` · `data-isin` · `aria-describedby` · `aria-expanded={open}` · `aria-controls={open ? … : undefined}` · 클래스 `grid min-h-11 w-full scroll-mt-[calc(4.5rem+var(--app-safe-top))] grid-cols-[minmax(0,1fr)_auto_16px] …`. 머리행 `hidden … xl:grid` + `COLS_XL`(38행 패턴 — 열 7개로 새로). id 접두 `teamflow-row-`. 날짜 바뀌면 접힘(키로 리마운트 또는 effect).

### 차트 컴포넌트 (band/bucket/strip/members/tables)
- 폭 측정: `limitup-lane.tsx:62` `const FALLBACK_W = 640;` + `136-142` `useLayoutEffect` 안 `const read = () => setWidth(el.clientWidth); … if (typeof ResizeObserver === 'undefined') return; const ro = new ResizeObserver(read);`. 단 차트 2종은 `viewBox="0 0 {W} {H}"` 1:1(글자 있음), 폭 ≤0 → 640(Pitfall 8). 미니막대만 `preserveAspectRatio="none"`(lane 22-25 · sparkline 결).
- 기하 상수 · 키 치환은 RESEARCH 「스케치 015」 표가 정본(실제 키 `net_val`/`start`/`lo`/`hi`/`share` — Pitfall 9).

### `webapp/src/lib/teamflow-report.ts`
- 재사용 import: `limitup-report.ts` 의 `kstSecOf`(394행 — HH:MM 태그).
- `<b>` 토큰화 = `limitup-lanes.ts:616-620` `StoryPart { text: string; strong?: boolean }` 조각 배열(`dangerouslySetInnerHTML` 금지).
- `fmtEok` · `fmtShare` · `BAND_SLOTS` · `BUCKET_KEY_FIRST/LAST` 는 RESEARCH 「Code Examples」 골든 그대로. `formatTradeAmount`(`lib/format.ts:11-22`) 재사용 금지.

### `webapp/src/lib/teamflow-api.ts`
**Analog:** `limitup-api.ts:12-23`:
```ts
import type { LimitupReportResponse } from '@gh-radar/shared';
import { authFetch } from './auth-fetch';

export function fetchLimitupReport(d?: string): Promise<LimitupReportResponse> {
  const query = d === undefined ? '' : `?d=${encodeURIComponent(d)}`;
  return authFetch<LimitupReportResponse>(`/api/limitup/report${query}`, { timeoutMs: 15_000 });
}
```
→ `/api/teamflow/report` · 15초 유지(응답 ≈487KB — Pitfall 6).

### `app-sidebar.tsx` (수정)
- 상수(124-125행 옆): `const NAV_TEAMFLOW = { href: "/analytics/teamflow", label: "팀 매집" } as const;`
- 활성(470행 `const limitupActive = pathname.startsWith(NAV_LIMITUP_REPORT.href);` 옆): `teamflowActive`.
- `SUB_LIST` (548-570행) — 「상한가 보고서」 li 와 「AI 애널리스트」 li 사이:
```tsx
                <li>
                  <SubNavLink
                    href={NAV_LIMITUP_REPORT.href}
                    label={NAV_LIMITUP_REPORT.label}
                    item="limitup-report"
                    active={limitupActive}
                    rail={rail}
                  />
                </li>
```
→ `item="teamflow"`. 레일 아이콘 추가 없음.

### 사이드바 테스트
- `app-sidebar.test.tsx:886-903` — `order` 배열에 `"상한가 보고서"` 다음 `"팀 매집"` · `subLinks` 배열 `["limitup-report", "teamflow", "chat"]` · `chat` 은 `subLinks[2]`. 테스트 제목 문자열(874행)도 갱신.
- `sidebar-tree.spec.ts:82-93` `TREE_LINKS` 에 `'팀 매집'` 삽입 · 307-312 게이트 루프에 `/analytics/teamflow` + `**/api/teamflow/report*` 403(권장).

### `webapp/src/test-fixtures/teamflow-export.ts`
**Analog:** `limitup-export.ts:23-37`:
```ts
const DIR = path.resolve(__dirname, '../../../workers/limitup-sync/tests/fixtures/export', EXPORT_DATE);
function ndjson<T>(name: string): T[] {
  return gunzipSync(readFileSync(path.join(DIR, `${name}.ndjson.gz`)))
    .toString('utf8').split('\n').filter((l) => l.trim() !== '').map((l) => JSON.parse(l) as T);
}
```
→ DIR = `…/workers/limitup-sync/tests/fixtures/team_flow/20261014` · isin 상수 4개(천일고속 KR7000650002 · 에스엠벡셀 KR7010580009 · 동양고속 KR7084670009 · 한선 KR7452280001).

### `webapp/e2e/fixtures/teamflow-report.ts`
**Analog:** `e2e/fixtures/limitup-report.ts:1-40` — 머리 주석(원천 · 합성 여부 · 실계좌 리터럴 없음) · `@/test-fixtures/…` import · `LATEST`/`DATES` 상수 export · 응답 봉투 빌더 `teamflowReportFixture(d)`.

### `webapp/e2e/specs/teamflow-report.spec.ts`
**Analog:** `e2e/specs/limitup-report.spec.ts:1-60`:
```ts
import { test, expect, type Page, type Route } from '@playwright/test';
import { mockStockApi } from '../fixtures/mock-api';
import { mockHomeApi, HOME_POPULATED } from '../fixtures/home';
import { withLocalRelay, type LocalRelay } from '../fixtures/relay';

test.describe.configure({ mode: 'serial' });
interface Recorder { reportDs: (string | null)[]; mode403: boolean; }
```
규약(주석 ②): 파일 내부 직렬 · beforeAll relay 1회(DMA 매핑 사용자) · afterAll stop · beforeEach reset · `page.route('**/api/teamflow/report*')` 목. 격자/서명 URL 부분은 복제하지 않음. 실행 `--workers=1`.

### RTL 테스트
- `__tests__/limitup-report.test.tsx` 의 `vi.mock('next/navigation')` · `vi.mock('@/lib/limitup-api')` 문법 → `@/lib/teamflow-api`. 아코디언 단언은 `limitup-day-grid.test.tsx` 문법(초기 전부 `aria-expanded=false` 로 바꿈).

### `dma-gate.tsx`
- 31-39행 유니온에 `| "팀 매집"`. `topicParticle`(55-62행)이 「은」 자동 선택 — 추가 코드 없음.

### 토큰
- `globals.css` 라이트(`--up-bg` 79행 근처) · 다크(`.dark` 224-227행 근처)에 `--team` · `--team-bg`(UI-SPEC 값). `tds-tokens.test.ts` `THEME_COLOR_TOKENS` · `LIGHT_EXPECTED`(35~) · `DARK_EXPECTED`(68~)에 추가.

### `docs/inbox/from-gh-trade/261016-teamflow-export.md`
**Analog:** `docs/inbox/from-gh-trade/261004-auto-sell-wire.md:1-8`:
```yaml
---
status: done
from: gh-trade
...
done_commit: aff21940
---
```
→ `status: open` → `done`, `done_commit` 채움. `git add docs/inbox/from-gh-trade/261016-teamflow-export.md` 경로 지정 커밋(Phase 32 파일 · STATE.md 금지). 본문에 「files_sig NULL 할 일 → D-03 자동 감지로 대체」 + 노트↔코드 차이 5건 한 줄씩.

---

## Shared Patterns

### 권한 3줄 (모든 새 함수 · 재정의 함수)
**Source:** `20261006090200_limitup_load_rpcs.sql:200-202` · `20261006090400_limitup_report_rpcs.sql:153-155`
`REVOKE … FROM PUBLIC` / `REVOKE … FROM anon, authenticated` / `GRANT EXECUTE … TO service_role`. CREATE OR REPLACE 뒤에도 재진술.

### 표 잠금 4줄
**Source:** `20261006090100_limitup_tables.sql:251-255` — RLS 활성 · 정책 0 · REVOKE 2줄 · service_role 4권한.

### DMA 게이트 (RPC 안 정본 → 서버 403 → 웹 DmaGate)
**Source:** RPC `20261006090400:57-59` → `services/limitup-report.ts:62` `if (data.access !== true) throw DmaUnmapped();` → 웹 `limitup-report.tsx` 401/403 → `DmaGate`. 라우트는 `requireAuth()` 만.

### 서버 오류 매핑
**Source:** `services/limitup-report.ts:24-37` — `DbError` + `causeOf` + `shapeCause`, 라우트는 `next(e)` 만.

### 날짜 형식
**Source:** server `schemas/limitup-report.ts:10-19` `Ymd` · web `lib/limitup-report.ts:371` `parseYmdParam`. 새 정규식 금지.

### 테스트 자원
vitest `--maxWorkers=2` · playwright `--workers=1` · shared build 선행.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `teamflow-bucket-chart.tsx` (39칸 고정 축 · 보라 선 · 등락률 띠) | component | transform | 저장소에 고정 칸 축 SVG 막대+선 복합 차트 없음 — 스케치 015 `bucketChart` + RESEARCH 표의 UI-SPEC 확정값 사용 (폭 측정만 `limitup-lane.tsx` 차용) |
| `teamflow-band-chart.tsx` (구간 가로 막대 · 중앙 0축) | component | transform | 동일 — 스케치 015 `bandChart` 이식 |

## Metadata

**Analog search scope:** `supabase/migrations` · `supabase/tests` · `workers/limitup-sync/{src,tests}` · `server/src/{routes,services,schemas}` · `server/tests/routes` · `packages/shared/src` · `webapp/src/{app/analytics,components/analytics,components/layout,components/trading,lib,test-fixtures,styles}` · `webapp/e2e/{specs,fixtures}` · `docs/inbox/from-gh-trade`
**Files scanned:** ~30 (RESEARCH.md 가 이미 줄 단위 확인한 범위 + 이번 세션 직접 발췌 14개)
**Pattern extraction date:** 2026-10-16
