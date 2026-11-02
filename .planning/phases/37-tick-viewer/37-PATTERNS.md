# Phase 37: 틱 전문 뷰어 (tick-viewer) - Pattern Map

**Mapped:** 2026-11-02
**Files analyzed:** 약 30 (신규 디렉터리 단위 포함)
**Analogs found:** 26 / 30

모든 analog 경로는 `git ls-files` 로 추적 소스임을 확인했다(gitignore 미러 없음).

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `packages/shared/src/ticks/framing.ts` | utility (순수) | transform (binary) | `packages/shared/src/accum-signal.ts` (모듈 머리 주석 규약) + RESEARCH Pattern 1 | partial (바이너리 선례 없음) |
| `packages/shared/src/ticks/layouts.ts` · `decode.ts` | utility | transform | 동일 + gh-trade `packets.py` 원문 | no analog (코드) |
| `packages/shared/src/ticks/{index,orders-krx,orders-nxt,pnl,book,density}.ts` | utility (순수 함수) | transform | `packages/shared/src/accum-signal.ts` | role-match |
| `packages/shared/src/ticks/__fixtures__/*` · `__tests__/*.test.ts` | test | — | `packages/shared/src/__tests__/accum-signal.test.ts` · `packages/shared/src/__fixtures__/` | exact |
| `packages/shared/src/index.ts` (export 추가) | config | — | 기존 barrel | exact |
| `workers/tick-convert/src/{index,config,logger,purge,upload}.ts` | worker (Cloud Run Job) | batch / file-I/O | `workers/limitup-sync/src/{index,config,logger,purge,grid}.ts` | exact |
| `workers/tick-convert/vitest.config.ts` · `package.json` | config | — | `workers/limitup-sync/vitest.config.ts` · `package.json` | exact |
| `scripts/deploy-tick-convert.sh` | config (deploy) | batch | `scripts/deploy-limitup-sync.sh` | exact |
| `tickgw/` (radar-gw 컨테이너 · `/internal/ticks/*`) | service | request-response + polling cache | relay 내부 HTTP(`server/src/services/relay-admin-client.ts` 계약 쪽) | partial |
| `scripts/deploy-tickgw.sh` | config (deploy) | — | `scripts/deploy-relay.sh` | role-match |
| `infra/relay/tickpull/install.sh` (+ known_hosts) | config (host setup) | — | `infra/relay/limitup-pull/install.sh` | exact |
| `server/src/routes/ticks.ts` | route | request-response | `server/src/routes/accum-report.ts` | exact |
| `server/src/services/ticks.ts` | service | CRUD(RPC) + 서명 URL | `server/src/services/accum-report.ts` + `limitup-report.ts`(createSignedUrls) | exact |
| `server/src/services/tickgw-client.ts` (live 프록시) | service | request-response | `server/src/services/relay-admin-client.ts` | exact |
| `server/src/schemas/ticks.ts` | schema | validation | `server/src/schemas/accum-report.ts` | exact |
| `server/src/app.ts` (라우터 장착) | config | — | `server/src/app.ts:120` | exact |
| `supabase/migrations/2026110xxxxxxx_tick_viewer.sql` | migration | CRUD + RPC 게이트 + purge | `20261020200000_limitup_accum_flow.sql` + `20261020200100_accum_report_rpc.sql` | exact |
| `supabase/tests/tick_viewer.test.sql` | test (pgTAP) | — | 기존 `supabase/tests/*.test.sql` | exact |
| `webapp/src/app/analytics/ticks/page.tsx` | page | — | `webapp/src/app/analytics/accum/page.tsx` | exact |
| `webapp/src/components/ticks/tick-chart.tsx` | component | transform (SVG) | `webapp/src/components/analytics/accum-chart.tsx` | exact |
| `webapp/src/lib/ticks/tick-chart.ts` | utility | transform | `webapp/src/lib/accum-chart.ts` | exact |
| `webapp/src/hooks/use-chart-view.ts` (수정 · `minViewMs` 인자) | hook | — | 자기 자신 (`:5`, `:67`, `:85`, `:207`) | exact |
| `webapp/src/lib/ticks/use-tick-grid.ts` (서명 URL 다운로드 + fzstd 해제 + 4xx 재발급) | hook | streaming / file-I/O | `webapp/src/lib/use-limitup-grid.ts` | exact |
| `webapp/src/components/ticks/{tick-book,tick-msg-list,tick-team-panel,tick-slider}.tsx` | component | — | `components/orderbook/orderbook-ladder.tsx` · `trade-tape.tsx` · `analytics/teamflow-detail.tsx` | role-match |
| `webapp/src/components/ticks/tick-picker.tsx` (종목 검색) | component | request-response | `components/search/global-search.tsx` | role-match |
| `accum-detail.tsx` · `teamflow-detail.tsx` (「틱 보기」 링크) | component (수정) | — | 자기 자신 | exact |
| `webapp/src/components/layout/app-sidebar.tsx` + test + `e2e/specs/sidebar-tree.spec.ts` | component (수정) | — | `NAV_ACCUM` (`:186`, `:607`, `:701-708`) | exact |
| webapp vitest (`lib/__tests__/*.test.ts` · `components/ticks/__tests__/*.test.tsx`) | test | — | `lib/__tests__/accum-chart.test.ts` · `use-limitup-grid.test.tsx` · `analytics/__tests__/accum-detail.test.tsx` | exact |

## Pattern Assignments

### `server/src/routes/ticks.ts` (route) — Analog `server/src/routes/accum-report.ts`

**Imports (1-7):**
```typescript
import { Router, type Router as RouterT } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAuth } from "../middleware/require-auth.js";
import { AccumDetailParams, AccumReportQuery } from "../schemas/accum-report.js";
import { ValidationFailed } from "../errors.js";
import { getAccumDetail, getAccumReport } from "../services/accum-report.js";
```
**Core (28-40):** zod safeParse → `ValidationFailed` → `req.app.locals.supabase` → service(userId = `req.userId!`) → `next(e)`.
```typescript
accumReportRouter.get("/report", requireAuth(), async (req, res, next) => {
  try {
    const parsed = AccumReportQuery.safeParse(req.query);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw ValidationFailed(`${issue.path.join(".")}: ${issue.message}`);
    }
    const supabase = req.app.locals.supabase as SupabaseClient;
    res.json(await getAccumReport(supabase, req.userId!, parsed.data.d));
  } catch (e) { next(e); }
});
```
머리 주석의 「방어선」 블록(T-15-03 · T-19-01 · T-19-17 · D-06 · 입력 · T-15-07)을 그대로 복제해 `/day` `/today` `/open` `/convert` `/live` 별로 채운다. 장착은 `server/src/app.ts:120` `app.use("/api/accum", accumReportRouter);` 옆에 `/api/ticks`.

### `server/src/services/ticks.ts` — Analog `server/src/services/accum-report.ts`
- 헬퍼 복제(공용화 금지 — 파일 주석 규약): `DbError` · `causeOf` · `shapeCause` · `isObject` · `FAIL` 상수.
- RPC 1회 + 모양 검사 순서:
```typescript
const { data, error } = await supabase.rpc("accum_report_for_user", { p_user_id: userId, p_date: d ?? null });
if (error) throw DbError(FAIL, causeOf(error));
if (!isObject(data)) throw DbError(FAIL, shapeCause("accum_report_for_user", data));
if (data.access === false) throw DmaUnmapped();
if (data.access !== true) throw DbError(FAIL, shapeCause("accum_report_for_user.access", data.access));
```
- 서명 URL: `server/src/services/limitup-report.ts:84-100` (`createSignedUrls` 1회 · `signed.error` → DbError · `item.signedUrl` 수집). 틱 격자는 단건이면 `createSignedUrl`.

### `server/src/services/tickgw-client.ts` — Analog `server/src/services/relay-admin-client.ts`
머리 주석 1-40 의 계약 그대로: Direct VPC Egress → VM 내부 IP · 공유 비밀 헤더(`X-Relay-Secret` 동형) · `validateStatus: () => true` · 네트워크 실패는 `{status:0,data:null}` → 호출부 502 · 경로 접두 고정(`/internal/ticks/`) · 사설 대역 가드 · axios 오류 객체 통째 로그 금지. 응답은 zstd 바이트라 `responseType: 'stream'`/arraybuffer 로 바꾸는 점만 다름.

### `server/src/schemas/ticks.ts` — Analog `server/src/schemas/accum-report.ts`
```typescript
import { Ymd } from "./limitup-report.js";
export const AccumDetailParams = z.object({ date: Ymd, isin: z.string().regex(/^[A-Z0-9]{12}$/) });
```
`^KR` 로 좁히지 말 것(비 KR ISIN 실재). `ex` = `z.enum(["KRX","NXT"])`, `epoch`/`offset` 은 음이 아닌 정수.

### `supabase/migrations/2026110xxxxxxx_tick_viewer.sql` — Analog `20261020200000_limitup_accum_flow.sql` + `20261020200100_accum_report_rpc.sql`
표 권한 (`limitup_accum_flow.sql:118-121`):
```sql
ALTER TABLE public.limitup_accum_flow ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.limitup_accum_flow FROM PUBLIC;
REVOKE ALL ON TABLE public.limitup_accum_flow FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.limitup_accum_flow TO service_role;
```
게이트 RPC (`accum_report_rpc.sql:39-54, 83-85`):
```sql
CREATE FUNCTION public.accum_report_for_user(p_user_id uuid, p_date text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.dma_visible_accounts(p_user_id)) THEN
    RETURN jsonb_build_object('access', false);
  END IF; ...
REVOKE EXECUTE ON FUNCTION public.accum_report_for_user(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.accum_report_for_user(uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accum_report_for_user(uuid, text) TO service_role;
```
`tick_grids` · `tick_convert_requests` · `tick_grid_upsert` · 요청 큐 RPC · 90일 purge RPC 전부 이 형식. `CREATE OR REPLACE` 는 속성 재진술(Pitfall 2, `limitup_accum_flow.sql:273-276`). Storage 버킷은 `20261006090300_limitup_retention_storage.sql` 선례(비공개 · 정책 0).

### `workers/tick-convert/*` — Analog `workers/limitup-sync/src/*`
- `config.ts` (1-69): `positiveInt(name, fallback)` 로 잘못된 값 throw · `dryRun` 이면 Supabase env 생략 · `logLevel`/`appVersion`. 그대로 복제하고 env 이름만 `TICK_*`.
- `upload.ts` ← `grid.ts`: 버킷 상수 · `xxxObjectPath(date, ...)` · `bucket.upload(path, bytes, { contentType, upsert: true })` · 실패 시 경로 담아 throw. contentType 은 `application/zstd`(또는 octet-stream). 순서 계약 「업로드 → 메타 RPC upsert」(commit 앞 업로드) 유지.
- `purge.ts` (1-101): `kstYmdDaysAgo(now, days)` · `step()` 으로 단계 독립 실행 후 오류 모아 한 번 throw(WR-B05) · Storage 는 SQL 이 아니라 storage API 로 폴더 목록 1,000개씩 삭제.
- `index.ts`: `import "dotenv/config"` · 날짜 격리(한 대상 실패가 다른 대상을 막지 않음) · run 끝 purge 1회 · main 이 종료 코드 결정(실패 → 1 → 알림 정책).
- `logger.ts`(11줄) · `services/supabase.ts` 그대로 복제. `vitest.config.ts` 복제(maxWorkers 2).

### `scripts/deploy-tick-convert.sh` — Analog `scripts/deploy-limitup-sync.sh`
`set -euo pipefail` · 머리 주석 블록(선례 · 차이 · 필수 env `GCP_PROJECT_ID`/`SUPABASE_URL`) · SA 존재 확인 루프(:47) · `gcloud run jobs deploy`(:100) · `run.invoker` 바인딩(:117-121) · `create_or_update_scheduler()`(:130-, URI `.../jobs/${job}:run`, `--oauth-service-account-email`, OIDC 금지) · 실패 알림 정책. 요청 변환(D-03)은 server 가 Admin API `jobs:run` overrides 로 호출하므로 server SA 에 `run.jobs.runWithOverrides` 권한 단계를 추가.

### `infra/relay/tickpull/install.sh` — Analog `infra/relay/limitup-pull/install.sh`
`--host-fp` 필수 인자 → `ssh-keyscan` 결과 지문 대조(:62 `ssh-keygen -lf - | awk '{print $2}'`) → `useradd --system --user-group ... --shell /usr/sbin/nologin`(:81) → `install -d -m 0700 .ssh`(:84) → 키는 없을 때만 `runuser -u ... ssh-keygen -t ed25519 -N ''`(:90) → known_hosts 고정 0644(:95-98). 119 지문 `SHA256:7s4iOpsEMcJkjLHD9KpGv7TIDXxJj2ip5Na+hU4aiJY`. systemd 단위 필요 시 `limitup-pull.service`/`.timer` 형식.

### `webapp/src/app/analytics/ticks/page.tsx` — Analog `webapp/src/app/analytics/accum/page.tsx`
```tsx
export default function AccumReportPage() {
  return (
    <AppShell sidebar={<AppSidebar />}>
      <Suspense fallback={null}><AccumReport /></Suspense>
    </AppShell>
  );
}
```
`useSearchParams()` 때문에 Suspense 필수 · 본문 안 `<DmaGate surface="틱 전문 뷰어">`.

### `webapp/src/components/ticks/tick-chart.tsx` + `lib/ticks/tick-chart.ts` — Analog `accum-chart.tsx` · `lib/accum-chart.ts`
- 컴포넌트 imports (`accum-chart.tsx:1-30`): `'use client'` · `useChartGestures, type ChartViewControl` from `@/hooks/use-chart-view` · `useChartWidth` · `@/lib/accum-chart` 헬퍼 다수. 레이어 순서 복제 + 커서 선 · VI 띠 · 장전 음영 추가.
- 헬퍼 시그니처 재사용: `ACCUM_CHART`(:29 판 높이 상수) · `View`(:42) · `clampView`(:53) · `xOfView`(:60) · `priceAxisWidthOf`(:70) · `yOfPrice`(:167) · `posNetPointsOf`/`posNetPathOf`(:315/:350 — 키 없으면 [] 로 선 생략) · `posDayPathOf`(:414) · `orderRadiusOf`(:461) · `priceClipOf`(:471).
- `use-chart-view.ts` 수정: 현재 `MIN_VIEW_MS`(10분, `lib/accum-chart.ts:32`)를 `:67` `Math.max(MIN_VIEW_MS, span * k)` 에서 고정 사용 → `minViewMs` 선택 인자(기본 = `MIN_VIEW_MS`)로 `useChartView`(:85)·`useChartGestures`(:207)·`clampView` 에 전달. accum 회귀 0 확인은 `lib/__tests__/accum-chart.test.ts`.

### `webapp/src/lib/ticks/use-tick-grid.ts` — Analog `webapp/src/lib/use-limitup-grid.ts` (+ `lib/__tests__/use-limitup-grid.test.tsx`)
상태 `idle → loading → ready | error` · 같은 키 재요청 캐시 · 서명 URL 4xx(만료) → URL 1회 재발급 후 재시도 · `retry()`. 해제만 `DecompressionStream('gzip')` → fzstd 스트리밍으로 교체. 테스트는 `new Response(bytes, {status:200})` 픽스처 + `waitFor(status === 'ready')` 형식(:25-81).

### 사이드바 — Analog `app-sidebar.tsx`
```tsx
const NAV_ACCUM = { href: "/analytics/accum", label: "매집감지 보고서" } as const;   // :186
const accumActive = pathname.startsWith(NAV_ACCUM.href);                          // :607
<li><SubNavLink href={NAV_ACCUM.href} label={NAV_ACCUM.label} item="accum" active={accumActive} rail={rail} /></li> // :701-708
```
바로 뒤에 `NAV_TICKS = { href: "/analytics/ticks", label: "틱 전문 뷰어" }` · `item="ticks"`. 사이드바 단위 테스트와 `webapp/e2e/specs/sidebar-tree.spec.ts` 의 항목 목록을 같이 갱신.

### 호가 · 전문 목록 · 팀 패널 · 종목 검색
- 10단 호가: `webapp/src/components/orderbook/orderbook-ladder.tsx` 행 구조 · 색 토큰 재사용(입력만 B6 재구성 결과).
- 전문 목록(고정 높이 창 가상화): `components/orderbook/trade-tape.tsx` 행 마크업 + 자체 고정 행 가상화(RESEARCH — 라이브러리 미도입).
- 팀 패널: `components/analytics/teamflow-detail.tsx` · `accum-kpi-strip.tsx`.
- 종목 고르기: `components/search/global-search.tsx`.
- 날짜 이동: `components/analytics/limitup-date-nav.tsx`.

### shared 순수 함수 — Analog `packages/shared/src/accum-signal.ts`
긴 머리 주석에 정본(gh-trade 파일:줄 · 인박스 노트)을 적고, 타입 + 순수 함수만 export(부수효과 0 · 상대 import `./strategy-event`). 테스트는 `packages/shared/src/__tests__/<name>.test.ts`, 픽스처는 `__fixtures__/` 에 재생성 명령 머리 주석. 골든 = export `payload.pnl` 값(RESEARCH 지적 — 문서 예시 아님).

## Shared Patterns

### 인증 · DMA 게이트
**Source:** `server/src/routes/accum-report.ts`(requireAuth 하나) + RPC 안 `dma_visible_accounts`. **Apply to:** `/api/ticks/*` 전부. 게이트 미들웨어 중복 금지 · 왕복 1회.

### 에러 처리
**Source:** `server/src/services/accum-report.ts` `DbError`/`causeOf`/`shapeCause`, 라우트 `next(e)`. 403 은 RPC `access:false` 일 때만.

### 권한 REVOKE
**Source:** 위 마이그레이션 — 표 · RPC 모두 `PUBLIC` + `anon, authenticated` 명시 REVOKE 후 service_role GRANT(auto-grant 함정).

### 워커 실패 격리 · 종료 코드
**Source:** `workers/limitup-sync/src/index.ts` 머리 주석 · `purge.ts` `step()`. 실패는 모으고 종료 1 → 알림 정책.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `packages/shared/src/ticks/{framing,layouts,decode}.ts` | utility | binary transform | 저장소에 바이너리 전문 파서 없음 — gh-trade `packets.py`/`pcap2parquet.py` 와 RESEARCH Pattern 1·2 사용 |
| `tickgw/` 본체(ssh ControlMaster 폴러 · 리스 캐시) | service | polling | node 내장만 쓰는 radar-gw 컨테이너 선례 없음 — RESEARCH tickgw 절. 내부 HTTP 계약만 relay 동형 |
| fzstd 스트리밍 해제 | utility | streaming | 브라우저 zstd 선례 없음 — RESEARCH |
| 119 인덱서 강제 명령 | 외부(gh-trade) | — | gh-trade 소유 — 인박스 노트로 요청 |

## Metadata

**Analog search scope:** `server/src/{routes,services,schemas}`, `workers/limitup-sync`, `supabase/migrations`, `infra/relay/limitup-pull`, `scripts`, `webapp/src/{app,components,hooks,lib}`, `packages/shared/src`
**Files scanned:** 약 25
**Pattern extraction date:** 2026-11-02
