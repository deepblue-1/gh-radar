# Phase 34: 매집감지(accum) 보고서 - Pattern Map

**Mapped:** 2026-10-20
**Files analyzed:** 32 (신규 24 · 수정 8)
**Analogs found:** 31 / 32 (차트 pan/zoom 훅만 코드 analog 없음 — 목업 C JS 가 원본)

모든 analog 경로는 `git ls-files` 로 추적 소스임을 확인했다. 원칙: **Phase 33 teamflow 를 층마다 복제**(일반화 안 함). 예외는 워커 선택 파일 목록화(D-02)뿐이다.

## File Classification

| 신규/수정 파일 | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `supabase/migrations/2026102xxxxxxx_limitup_accum_flow.sql` (신규) | migration | batch | `supabase/migrations/20261016200000_limitup_team_flow.sql` | exact |
| `supabase/migrations/2026102xxxxxxx_accum_report_rpc.sql` (신규) | migration(RPC) | request-response | `supabase/migrations/20261016200100_teamflow_report_rpc.sql` | exact(목록) / role-match(상세) |
| `supabase/tests/limitup_load.test.sql` (수정 · 섹션 K) | test | batch | 같은 파일 섹션 J(team_flow, :238~) | exact |
| `supabase/tests/accum_report.test.sql` (신규) | test | request-response | `supabase/tests/teamflow_report.test.sql` | exact |
| `workers/limitup-sync/src/load.ts` (수정) | service | file-I/O/batch | 자기 자신 `:16` `:23` `:28` | exact |
| `workers/limitup-sync/src/index.ts` (수정) | service | batch | 자기 자신 `:117` `:223-239` `:266-274` `:302-307` | exact |
| `workers/limitup-sync/tests/dispatch.test.ts` · `load.test.ts` (수정) | test | batch | 같은 파일 team_flow 블록(dispatch :512-545 · load :23-31 · :101) | exact |
| `workers/limitup-sync/tests/fixtures/accum_flow/<D>/accum_flow.ndjson.gz` + 탐지0 날짜 디렉터리 (신규) | fixture | file-I/O | `workers/limitup-sync/tests/fixtures/team_flow/20261014/team_flow.ndjson.gz` + `tests/fixtures/make-fixture.mjs` | exact |
| `server/src/routes/accum-report.ts` (신규) | route | request-response | `server/src/routes/teamflow-report.ts` | exact |
| `server/src/services/accum-report.ts` (신규) | service | request-response | `server/src/services/teamflow-report.ts` | exact |
| `server/src/schemas/accum-report.ts` (신규) | schema | request-response | `server/src/schemas/teamflow-report.ts` | exact |
| `server/src/app.ts` (수정 · 마운트 1줄) | config | — | `server/src/app.ts:23` `:112` | exact |
| `server/tests/routes/accum-report.test.ts` (신규) | test | request-response | `server/tests/routes/teamflow-report.test.ts` | exact |
| `packages/shared/src/accum-report.ts` (신규) + `index.ts` 재수출 | model(types) | — | `packages/shared/src/teamflow-report.ts` · `index.ts:225-242` | exact |
| `webapp/src/app/analytics/accum/page.tsx` (신규) | route(page) | — | `webapp/src/app/analytics/teamflow/page.tsx` | exact |
| `webapp/src/components/analytics/accum-report.tsx` (신규) | component | request-response | `webapp/src/components/analytics/teamflow-report.tsx` | exact |
| `webapp/src/components/analytics/accum-kpi-strip.tsx` (신규) | component | transform | `webapp/src/components/analytics/teamflow-kpi-strip.tsx` | exact |
| `webapp/src/components/analytics/accum-day-grid.tsx` (신규) | component | transform | `webapp/src/components/analytics/teamflow-day-grid.tsx` (+ 배지 `trading/workbench/accum-strip.tsx:324-341`) | exact |
| `webapp/src/components/analytics/accum-detail.tsx` (신규) | component | request-response(지연 로드) | `webapp/src/components/analytics/teamflow-detail.tsx` | role-match(지연 로드는 신규) |
| `webapp/src/components/analytics/accum-chart.tsx` (신규) | component | transform | `webapp/src/components/analytics/teamflow-bucket-chart.tsx` + 목업 C | role-match |
| `webapp/src/components/analytics/accum-cycle-table.tsx` (신규) | component | transform | `webapp/src/components/analytics/teamflow-bucket-table.tsx` | role-match |
| `webapp/src/hooks/use-chart-view.ts` (신규) | hook | event-driven | — (`webapp/src/hooks/use-chart-width.ts` 는 폭만) | **none** — 목업 C JS |
| `webapp/src/lib/accum-api.ts` (신규) | utility | request-response | `webapp/src/lib/teamflow-api.ts` | exact |
| `webapp/src/lib/accum-report.ts` (신규) | utility | transform | `webapp/src/lib/teamflow-report.ts` | exact |
| `webapp/src/lib/accum-chart.ts` (신규) | utility | transform | `webapp/src/lib/teamflow-chart.ts` | role-match(축이 ms) |
| `webapp/src/lib/__tests__/accum-report.test.ts` · `accum-chart.test.ts` (신규) | test | — | `webapp/src/lib/__tests__/teamflow-report.test.ts` · `teamflow-chart.test.ts` | exact |
| `webapp/src/components/analytics/__tests__/accum-report.test.tsx` · `accum-detail.test.tsx` (신규) | test | — | `__tests__/teamflow-report.test.tsx` · `teamflow-detail.test.tsx` | exact |
| `webapp/src/test-fixtures/accum-export.ts` (신규) | fixture | — | `webapp/src/test-fixtures/teamflow-export.ts` | exact |
| `webapp/src/components/layout/app-sidebar.tsx` (수정) + `__tests__/app-sidebar.test.tsx` | component | — | 자기 자신 `:184` `:600` `:686-692` | exact |
| `webapp/e2e/specs/accum-report.spec.ts` (신규) + `e2e/fixtures/accum-report.ts` · `sidebar-tree.spec.ts` (수정) | test(e2e) | — | `webapp/e2e/specs/teamflow-report.spec.ts` · `sidebar-tree.spec.ts:88-100` | exact |
| `scripts/export-accum-backfill.ts` (+ 비출력 래퍼 `.sh`) (신규) | utility(script) | batch/file-I/O | `scripts/migrate-dma-users.ts` + `scripts/dma-credentials.sh` | role-match(읽기 전용) |
| `docs/inbox/from-gh-trade/261020-accum-flow-export.md` (수정 · 회신) | doc | — | `docs/inbox/from-gh-trade/README.md` 형식 | — |

## Pattern Assignments

### 마이그레이션 — 표 · CHECK · commit_day · purge

**Analog:** `supabase/migrations/20261016200000_limitup_team_flow.sql`
- 표 정의 :48-82(`double precision` 이유 주석 :31-32) · 접근 잠금(RLS on · 정책 0) :100-104 · stage CHECK 교체 :105-109(`DROP CONSTRAINT limitup_stage_tbl_check` — IF EXISTS 없음) · `limitup_commit_day` :112-238(`v_tbls` :124-125) · `statement_timeout` 재진술 :235/:245 · purge :242-299(:275).
- 이 파일이 commit_day/purge/CHECK 의 **최신 정의**다(RESEARCH 확인) — 본문 전체를 복사해 accum_flow 를 덧붙인다.

commit_day 10번째 쌍(:215-223 team_flow 쌍 복제):
```sql
DELETE FROM public.limitup_accum_flow WHERE date = p_date;
INSERT INTO public.limitup_accum_flow
  SELECT (jsonb_populate_record(NULL::public.limitup_accum_flow, s.payload)).*
    FROM public.limitup_stage s WHERE s.date = p_date AND s.tbl = 'accum_flow' ORDER BY s.seq;
GET DIAGNOSTICS v_n = ROW_COUNT;
IF p_expected ? 'accum_flow' THEN   -- 키 조건 필수: 옛 워커 호출 rows 키 8개 단언(limitup_load.test.sql:315) 보존
  v_rows := v_rows || jsonb_build_object('accum_flow', v_n);
END IF;
```
열 형: `*_rate` double precision · state/end_reason/cycle/carry_days/schema_version integer(CHECK 없음) · since_date/name/market text · 나머지 bigint · payload jsonb. 열 순서 = gh-trade `teamflow_accum.py:34-38` FLAT_COLUMNS.

### 마이그레이션 — RPC 2개

**Analog:** `supabase/migrations/20261016200100_teamflow_report_rpc.sql` :28-67
```sql
CREATE FUNCTION public.teamflow_report_for_user(p_user_id uuid, p_date text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE v_dates text[]; v_date text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.dma_visible_accounts(p_user_id)) THEN
    RETURN jsonb_build_object('access', false);
  END IF;
  v_dates := ARRAY(SELECT DISTINCT t.date FROM public.limitup_team_flow t ORDER BY t.date DESC);
  IF cardinality(v_dates) = 0 THEN
    RETURN jsonb_build_object('access', true, 'dates', '[]'::jsonb, 'date', NULL, 'rows', '[]'::jsonb);
  END IF;
  v_date := coalesce(p_date, v_dates[1]);
  RETURN jsonb_build_object('access', true, 'dates', to_jsonb(v_dates), 'date', v_date,
    'rows', (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY ...), '[]'::jsonb) FROM ... WHERE t.date = v_date));
END; $$;
REVOKE EXECUTE ON FUNCTION public.teamflow_report_for_user(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.teamflow_report_for_user(uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.teamflow_report_for_user(uuid, text) TO service_role;
```
변경점: 목록은 `to_jsonb(t)` 대신 **37열 명시 서브쿼리**(payload 제외 — RESEARCH §RPC 2개의 SQL 그대로) · `ORDER BY s.state, s.pos_net_krw DESC NULLS LAST, s.isin`. 상세 `accum_detail_for_user(uuid, text, text)` 는 같은 게이트 + `'row', (SELECT to_jsonb(a) ... WHERE a.date=p_date AND a.isin=p_isin)`(없으면 null · 200). 권한 3줄을 두 함수 모두.

### pgTAP

- `supabase/tests/limitup_load.test.sql` — 섹션 J(:238~) 복제로 섹션 K · `plan(218)` 증가 · :315 「옛 워커 rows 키 8개」 단언 그대로 통과해야 함.
- `supabase/tests/accum_report.test.sql` — `supabase/tests/teamflow_report.test.sql` 동형 + 「목록 행에 payload 키 없음」 · 상세 row 있음/null 단언.

### 워커 `load.ts` / `index.ts`

**Analog:** 자기 자신. 현재 하드코딩(`workers/limitup-sync/src/load.ts:16-28`):
```ts
export type StageTbl = ExportTbl | "grid_summary" | "member_daily" | "team_flow";
export const TEAM_FLOW_FILE = "team_flow.ndjson.gz";
export const TEAM_FLOW_STAGE_CHUNK = 20;
```
→ `| "accum_flow"` 추가 · `OPTIONAL_FILES = [{ tbl: "team_flow", file: ..., chunk: 20 }, { tbl: "accum_flow", file: "accum_flow.ndjson.gz", chunk: 1 }]` 류 목록.

재적재 감지(`index.ts:222-239`) — 목록 순회로 일반화:
```ts
const tfEntry = m.files.find((f) => f.name === TEAM_FLOW_FILE);
const needTeamFlow = tfEntry !== undefined && p?.rows?.team_flow !== tfEntry.rows;
if (p?.sig === sig && !needTeamFlow) { ... unchanged ... return; }
const reason = p === undefined ? "new" : p.sig !== sig ? "files_sig" : "team_flow_backfill";
```
→ `needBackfill: tbl[]` · reason = `${tbls.join("+")}_backfill`(단일이면 `team_flow_backfill` 문자열 유지).

선택 파일 읽기(`index.ts:~266-274`):
```ts
let teamFlow: Row[] = [];
if (tfEntry) {
  teamFlow = readNdjsonGz(join(config.exportDir, date, TEAM_FLOW_FILE));
  if (teamFlow.length !== tfEntry.rows) throw new Error(`${date}: ${TEAM_FLOW_FILE} rows ${teamFlow.length} != manifest ${tfEntry.rows}`);
}
counts.team_flow = teamFlow.length;   // 0 포함 늘 기록
```
backfill/stage(`index.ts:302-307`): `const backfill = reason === "team_flow_backfill";` → `reason.endsWith("_backfill")` · `stageDay(sb, date, { team_flow: teamFlow }, Math.min(config.stageChunk, TEAM_FLOW_STAGE_CHUNK))` → 표마다 자기 청크. `STAGE_TABLES`(:117)에 `"accum_flow"` 추가.

**테스트:** `workers/limitup-sync/tests/dispatch.test.ts:512-545` 의 `TF_FIXTURE` · `addDay(..., files: [...m.files, {name, rows, sha256}])` · `cpSync` · `tfRowsOf` 패턴 복제. `EXPECTED9`(:441) → 10키. `load.test.ts:23-31` 기대 객체에 `accum_flow: 0`. 탐지 0 manifest 테스트 = 빈 ndjson.gz 6개(`make-fixture.mjs` 규칙 gzip 9 · mtime 0).

### 서버 라우트 / 서비스 / 스키마

**Analog route:** `server/src/routes/teamflow-report.ts` (전체 40줄)
```ts
teamflowRouter.get("/report", requireAuth(), async (req, res, next) => {
  try {
    const parsed = TeamflowReportQuery.safeParse(req.query);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw ValidationFailed(`${issue.path.join(".")}: ${issue.message}`);
    }
    const supabase = req.app.locals.supabase as SupabaseClient;
    res.json(await getTeamflowReport(supabase, req.userId!, parsed.data.d));
  } catch (e) { next(e); }
});
```
상세 라우트 `/report/:date/:isin` 은 `req.params` 를 같은 방식으로 safeParse.

**Analog service:** `server/src/services/teamflow-report.ts:47-67` — `supabase.rpc(...)` → `error` → `DbError` · `!isObject` → 500 · `access === false` → `DmaUnmapped()` · `access !== true` → 500 · `dates`/`rows` 배열 검사. 헬퍼 `DbError`·`causeOf`·`shapeCause`·`isObject`(:23-40)는 **복제**(공용화하지 않는 규약). 상세는 `row` 가 null 또는 객체인지 검사.

**Analog schema:** `server/src/schemas/teamflow-report.ts` — `import { Ymd } from "./limitup-report.js"; z.object({ d: Ymd.optional() })`. 상세: `z.object({ date: Ymd, isin: z.string().regex(/^[A-Z0-9]{12}$/) })`(비 KR ISIN 실재 — `KR7` 로 좁히지 말 것).

**app.ts:** `:23` import · `:112` `app.use("/api/teamflow", teamflowRouter);` 옆에 `app.use("/api/accum", accumReportRouter)`(`:114` `/api/accum-signals` 와 이름 혼동 주의 — 파일 · 심볼은 `accum-report`).

**테스트:** `server/tests/routes/teamflow-report.test.ts` 복제(401 · 400 · 403 · 500 모양 위반 · 200).

### shared 타입

**Analog:** `packages/shared/src/teamflow-report.ts`(pnl 13키 :128-143 — `TeamflowPnl` 재사용) · 재수출 블록 `packages/shared/src/index.ts:225-242` 옆에 accum 블록.

### 웹 페이지 · API

**page.tsx analog:** `webapp/src/app/analytics/teamflow/page.tsx`
```tsx
export default function TeamflowReportPage() {
  return (
    <AppShell sidebar={<AppSidebar />}>
      <Suspense fallback={null}><TeamflowReport /></Suspense>
    </AppShell>
  );
}
```
**accum-api.ts analog:** `webapp/src/lib/teamflow-api.ts`
```ts
export function fetchTeamflowReport(d?: string): Promise<TeamflowReportResponse> {
  const query = d === undefined ? '' : `?d=${encodeURIComponent(d)}`;
  return authFetch<TeamflowReportResponse>(`/api/teamflow/report${query}`, { timeoutMs: 15_000 });
}
```
→ 목록은 기본 타임아웃 · 상세 `fetchAccumDetail(date, isin)` 는 `timeoutMs: 15_000` + 모듈 `Map<`${date}:${isin}`, Promise>` 캐시(실패 시 캐시에서 삭제해 「다시 시도」 가능).

### 웹 컴포넌트

- `accum-report.tsx` ← `teamflow-report.tsx`: 상태 :41-46 · `?d` :63 · DmaGate :68-84 · 빈 상태 문구 :144-157(문구만 매집감지로).
- `accum-kpi-strip.tsx` ← `teamflow-kpi-strip.tsx`(4칸 · 라벨/집계만 교체).
- `accum-day-grid.tsx` ← `teamflow-day-grid.tsx`: `COLS_XL` :46 · 아코디언 규칙 :80-104(`pendingScroll` · `scroll-mt` · 행 버튼 aria · 폰 카드). 배지는 `webapp/src/components/trading/workbench/accum-strip.tsx:324` `BADGE` 상수 · `StateBadge` :327 · `CarryBadge` :341 치수/색 축 복제, 상태 3 라벨만 「종료」(shared `ACCUM_STATE_LABELS` 손대지 않음). 정렬은 `sortAccum` import 금지 — 상태 1→2→3, `pos_net_krw` desc, isin.
- `accum-detail.tsx` ← `teamflow-detail.tsx`(섹션 순서 · pnl 손익 줄). 지연 로드 · 스켈레톤 · 실패 재시도는 신규.
- `accum-chart.tsx` ← `teamflow-bucket-chart.tsx`(SVG · `useChartWidth` · 1:1 viewBox 규율) + 목업 C(`.planning/phases/34-accum/reference/mockup-accum-chart.html`) 렌더 구조.
- `accum-cycle-table.tsx` ← `teamflow-bucket-table.tsx`(표 · 폰 가로 스크롤).

### 웹 lib

- `lib/accum-report.ts` ← `lib/teamflow-report.ts`: import `fmtEok`(:60 `fmtEok(won, { signed?, digits?: 1|2 })`) · `fmtRate`(:87) · `kstHm`(:95) · 톤(:73/:80) — 재구현하지 말고 import. 날짜는 `lib/limitup-report.ts` `dateNavOf` :355 · `parseYmdParam` :371 · `fmtYmd*` :383.
- `lib/accum-chart.ts` ← `lib/teamflow-chart.ts`(`CHART_FALLBACK_W`/`chartWidthOf` :23-26 import · ms→x 아이디어 :167 · :229). 축은 09:00~20:00 ms 선형(39칸 고정 축은 재사용 불가). `clampView` · `ticks` · `preset` · `rOf` · 15분 공백 끊기는 목업 C JS 이식.

### 사이드바

`webapp/src/components/layout/app-sidebar.tsx`:
```tsx
const NAV_TEAMFLOW = { href: "/analytics/teamflow", label: "팀 매집 보고서" } as const;   // :184
const teamflowActive = pathname.startsWith(NAV_TEAMFLOW.href);                          // :600
<li><SubNavLink href={NAV_TEAMFLOW.href} label={NAV_TEAMFLOW.label} item="teamflow" active={teamflowActive} rail={rail} /></li>  // :686-692
```
→ `NAV_ACCUM = { href: "/analytics/accum", label: "매집감지 보고서" }` · 같은 `<li>` 를 teamflow 다음 · chat 앞에. 단언 갱신: `__tests__/app-sidebar.test.tsx:1268-1288`(순서) · `:1339-1362`(가시성) · `e2e/specs/sidebar-tree.spec.ts:88-100` `TREE_LINKS` · :346-349 모킹.

### E2E

`webapp/e2e/specs/teamflow-report.spec.ts` — 머리 주석 규약(파일 내부 직렬 · beforeAll `withLocalRelay` · `page.route` 목) · import 꼴(`mockStockApi` · `mockHomeApi` · `../fixtures/teamflow-report`). accum 은 목록 + 상세 두 경로를 모킹 · 상세 요청 횟수로 캐시 단언.

### 소급 스크립트

**Analog:** `scripts/migrate-dma-users.ts`(머리 주석 :1-27 실행법 · env · 출력 위생 · exit 규칙 · `fail()` · Supabase 오류 code 만) + `scripts/dma-credentials.sh:54-90`(env 누락은 이름만 출력 · `GOOGLE_APPLICATION_CREDENTIALS` · 마지막 `exec pnpm --filter @gh-radar/relay exec tsx ../scripts/<x>.ts "$@"`).
```ts
import { createRelaySupabase } from "../relay/src/store/supabase.js";
function fail(message: string): never { console.error(`오류: ${message}`); process.exit(1); }
```
쓰기 경로 없음(select 만) · `dma_strategy_events` kind 16 · gateway 'KYOBO119' · trade_date · 출력 `~/ticks/accum-backfill/<D>.jsonl` · 23키 매핑 함수는 export 해 단위 테스트(매핑 대조 원본 `packages/shared/src/accum-signal.ts:140-185`).

## Shared Patterns

### DMA 게이트 (RPC 안)
**Source:** `20261016200100_teamflow_report_rpc.sql` 게이트 3줄 + `server/src/services/teamflow-report.ts:61-62`
**Apply to:** RPC 2개 · 서비스 2개. 라우트에는 `requireAuth()` 하나만.

### RPC 권한 3줄
**Source:** `20261016200100_teamflow_report_rpc.sql:65-67` — REVOKE PUBLIC · REVOKE anon, authenticated · GRANT service_role. **Apply to:** 두 RPC + 재정의된 commit_day · purge.

### 에러 처리
**Source:** `server/src/services/teamflow-report.ts:23-40`(DbError · causeOf · shapeCause) · route `next(e)`. **Apply to:** 서버 신규 파일 전부.

### snake_case 통과 · 표시층 변환
서버 매퍼 없음 · 억/HH:MM 은 `lib/teamflow-report.ts` 포매터 import.

### 아코디언 · 빈 상태
**Source:** `teamflow-day-grid.tsx:80-104` · `teamflow-report.tsx:144-157`. `key=date` 리셋 · 한 번에 하나.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `webapp/src/hooks/use-chart-view.ts` | hook | event-driven | 휠(native `{passive:false}`) · Pointer Events 드래그/핀치 · rAF 합치기 — 기존 차트는 정적. 원본 = `.planning/phases/34-accum/reference/mockup-accum-chart.html` JS + RESEARCH §D-17 |

## Metadata

**Analog search scope:** supabase/migrations · supabase/tests · workers/limitup-sync · server/src · server/tests · packages/shared · webapp/src (app · components/analytics · components/layout · lib · hooks · test-fixtures) · webapp/e2e · scripts
**Files scanned:** ~60 (`git ls-files` 검증 포함)
**Pattern extraction date:** 2026-10-20
